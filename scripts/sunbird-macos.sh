#!/bin/sh
# Installs and launches Sunbird for Desktop Phoenix on macOS (arm64).
# Keeps the original Discord Phoenix.app untouched by working on an ad-hoc
# signed copy under ~/Library/Application Support/sunbird so dyld honors
# DYLD_INSERT_LIBRARIES.
#
#   sh scripts/sunbird-macos.sh [/path/to/Discord Phoenix.app]
#   sh scripts/sunbird-macos.sh --install [/path/to/Discord Phoenix.app]
#   sh scripts/sunbird-macos.sh --install --sandbox [/path/to/Discord Phoenix.app]
#   sh scripts/sunbird-macos.sh --no-runtime
#   sh scripts/sunbird-macos.sh --uninstall
#
# --install wraps Discord Phoenix.app in place with a native arm64 Mach-O
# launcher so launching from Finder, Spotlight, or the Dock always loads
# Sunbird and preserves login keychain access across restarts.
#
# --sandbox (with --install) runs Discord under the App Sandbox: network,
# microphone, camera and files picked in an open or save panel, nothing else
# of the home folder. Discord and Sunbird keep their data in
# ~/Library/Containers/com.discord.DesktopGpui, so the first launch is signed
# out. Discord's binary links libphoenix.dylib itself instead of starting
# through the launcher, and the CEF helpers keep Discord's signatures and
# inherit the sandbox.
#
# SUNBIRD_DYLIB points at a locally built libphoenix.dylib.
# SUNBIRD_SITE points at a custom download server (default: https://assets.sunbird.tools).
set -eu

site=${SUNBIRD_SITE:-https://assets.sunbird.tools}
home="$HOME/Library/Application Support/sunbird"
copy="$home/Discord Phoenix.app"

if [ "${1:-}" = --uninstall ]; then
   rm -rf "$home"
   echo "Sunbird is uninstalled. Your original Discord Phoenix.app was not changed."
   exit 0
fi

install_app=
no_runtime=
sandbox=
while [ $# -gt 0 ]; do
   case "$1" in
      --install) install_app=1; shift ;;
      --no-runtime|--gate-only) no_runtime=1; shift ;;
      --sandbox) sandbox=1; shift ;;
      *) break ;;
   esac
done

if [ -n "$sandbox" ] && [ -z "$install_app" ]; then
   echo "--sandbox only works with --install." >&2
   exit 1
fi

discord=${1:-}
if [ -z "$discord" ]; then
   for candidate in \
      "/Applications/Discord Phoenix.app" \
      "$HOME/Applications/Discord Phoenix.app"; do
      if [ -d "$candidate" ]; then
         discord=$candidate
         break
      fi
   done
fi

if [ -z "$discord" ] || [ ! -x "$discord/Contents/MacOS/Discord" ]; then
   echo "Couldn't find Discord Phoenix.app. Pass its path explicitly:" >&2
   echo "  sh $0 '/Applications/Discord Phoenix.app'" >&2
   exit 1
fi

mkdir -p "$home"

# Install libphoenix.dylib from a local build if provided, otherwise build from
# this checkout or download a prebuilt binary.
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
dylib="$home/libphoenix.dylib"
if [ -n "${SUNBIRD_DYLIB:-}" ] && [ -f "$SUNBIRD_DYLIB" ]; then
   cp "$SUNBIRD_DYLIB" "$dylib"
   codesign --force --sign - "$dylib" >/dev/null 2>&1 || true
elif [ -f "$repo_root/target/release/libphoenix.dylib" ]; then
   cp "$repo_root/target/release/libphoenix.dylib" "$dylib"
   codesign --force --sign - "$dylib" >/dev/null 2>&1 || true
elif [ -f "$repo_root/target/dev-fast/libphoenix.dylib" ]; then
   cp "$repo_root/target/dev-fast/libphoenix.dylib" "$dylib"
   codesign --force --sign - "$dylib" >/dev/null 2>&1 || true
elif [ -f "$repo_root/target/debug/libphoenix.dylib" ]; then
   cp "$repo_root/target/debug/libphoenix.dylib" "$dylib"
   codesign --force --sign - "$dylib" >/dev/null 2>&1 || true
elif [ -f "$repo_root/Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
   echo "Building libphoenix.dylib..."
   (cd "$repo_root" && cargo build --release -p phoenix-loader)
   cp "$repo_root/target/release/libphoenix.dylib" "$dylib"
   codesign --force --sign - "$dylib" >/dev/null 2>&1 || true
elif [ ! -f "$dylib" ]; then
   echo "Downloading Sunbird for macOS (arm64)..."
   tmp=$(mktemp "$home/libphoenix.dylib.XXXXXX")
   if curl -fsSL --max-time 60 -o "$tmp" "$site/plugins/libphoenix-macos-arm64.dylib"; then
      mv "$tmp" "$dylib"
      codesign --force --sign - "$dylib" >/dev/null 2>&1 || true
   else
      rm -f "$tmp"
      echo "Could not download libphoenix-macos-arm64.dylib. Build locally with:" >&2
      echo "  cargo build --release -p phoenix-loader" >&2
      exit 1
   fi
fi

if [ -n "$install_app" ]; then
   if ! command -v clang >/dev/null 2>&1; then
      echo "--install requires clang (Xcode Command Line Tools) to build the native Mach-O launcher." >&2
      exit 1
   fi
   pkill -f "$discord/Contents/MacOS/Discord" 2>/dev/null || true
   pkill -f "$copy/Contents/MacOS/Discord" 2>/dev/null || true
   sleep 1

   stage=$(mktemp -d "${TMPDIR:-/tmp}/sunbird-install.XXXXXX")
   trap 'rm -rf "$stage"' EXIT
   cp -R "$discord" "$stage/Discord Phoenix.app"
   app="$stage/Discord Phoenix.app"
   xattr -cr "$app"
   rm -rf "$app/Contents/_CodeSignature"

   mkdir -p "$app/Contents/Frameworks"
   cp "$dylib" "$app/Contents/Frameworks/libphoenix.dylib"

   if [ -n "$sandbox" ]; then
      # The App Sandbox only lets an app's main executable register with
      # LaunchServices, so a launcher that execs Discord cannot work here.
      # Discord's own binary links libphoenix.dylib instead.
      if [ -x "$app/Contents/MacOS/Discord.bin" ]; then
         mv -f "$app/Contents/MacOS/Discord.bin" "$app/Contents/MacOS/Discord"
      fi
      cat >"$stage/link.c" <<'EOF'
#include <mach-o/loader.h>
#include <stdio.h>
#include <string.h>

/* Adds LC_LOAD_DYLIB argv[2] to the thin arm64 Mach-O argv[1], in the free
   space after its load commands, keeping LC_CODE_SIGNATURE last. */
int main(int argc, char **argv) {
   static unsigned char buf[1 << 20];
   if (argc != 3) return 2;
   FILE *f = fopen(argv[1], "r+b");
   if (!f) { perror(argv[1]); return 1; }
   size_t n = fread(buf, 1, sizeof(buf), f);
   struct mach_header_64 *h = (void *)buf;
   if (n < sizeof(*h) || h->magic != MH_MAGIC_64 || sizeof(*h) + h->sizeofcmds > n) {
      fprintf(stderr, "%s: not a thin 64-bit Mach-O\n", argv[1]);
      return 1;
   }
   size_t end = sizeof(*h) + h->sizeofcmds, first = n, last = 0;
   unsigned char *p = buf + sizeof(*h);
   for (uint32_t i = 0; i < h->ncmds; i++) {
      struct load_command *lc = (void *)p;
      if (lc->cmd == LC_SEGMENT_64) {
         struct segment_command_64 *seg = (void *)p;
         struct section_64 *sect = (void *)(seg + 1);
         for (uint32_t j = 0; j < seg->nsects; j++)
            if (sect[j].offset && sect[j].offset < first) first = sect[j].offset;
      } else if (lc->cmd == LC_LOAD_DYLIB) {
         struct dylib_command *d = (void *)p;
         if (!strcmp((char *)p + d->dylib.name.offset, argv[2])) return 0;
      }
      last = (size_t)(p - buf);
      p += lc->cmdsize;
   }
   size_t len = strlen(argv[2]) + 1;
   uint32_t size = (uint32_t)((sizeof(struct dylib_command) + len + 7) & ~(size_t)7);
   if (end + size > first) {
      fprintf(stderr, "%s: no room for another load command\n", argv[1]);
      return 1;
   }
   for (size_t i = end; i < end + size; i++)
      if (buf[i]) {
         fprintf(stderr, "%s: the space after the load commands is not empty\n", argv[1]);
         return 1;
      }
   size_t at = end;
   struct load_command *tail = (void *)(buf + last);
   if (h->ncmds && tail->cmd == LC_CODE_SIGNATURE) {
      memmove(buf + last + size, buf + last, tail->cmdsize);
      at = last;
   }
   struct dylib_command *d = (void *)(buf + at);
   memset(d, 0, size);
   d->cmd = LC_LOAD_DYLIB;
   d->cmdsize = size;
   d->dylib.name.offset = sizeof(*d);
   d->dylib.timestamp = 2;
   d->dylib.current_version = 0x10000;
   d->dylib.compatibility_version = 0x10000;
   memcpy((char *)d + sizeof(*d), argv[2], len);
   h->ncmds++;
   h->sizeofcmds += size;
   rewind(f);
   if (fwrite(buf, 1, end + size, f) != end + size || fclose(f)) {
      perror(argv[1]);
      return 1;
   }
   return 0;
}
EOF
      clang -O2 -o "$stage/link" "$stage/link.c"
      "$stage/link" "$app/Contents/MacOS/Discord" "@executable_path/../Frameworks/libphoenix.dylib"
      cat >"$stage/sandbox.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
   <key>com.apple.security.app-sandbox</key><true/>
   <key>com.apple.security.network.client</key><true/>
   <key>com.apple.security.network.server</key><true/>
   <key>com.apple.security.device.audio-input</key><true/>
   <key>com.apple.security.device.camera</key><true/>
   <key>com.apple.security.files.user-selected.read-write</key><true/>
</dict>
</plist>
EOF
      codesign --force --sign - "$app/Contents/Frameworks/libphoenix.dylib"
      codesign --force --sign - --identifier com.discord.DesktopGpui \
         --entitlements "$stage/sandbox.plist" "$app"
   else
      if [ ! -x "$app/Contents/MacOS/Discord.bin" ]; then
         mv "$app/Contents/MacOS/Discord" "$app/Contents/MacOS/Discord.bin"
      fi

      cat >"$stage/launcher.c" <<'EOF'
#include <libgen.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
   (void)argc;
   char raw[PATH_MAX];
   uint32_t size = sizeof(raw);
   if (_NSGetExecutablePath(raw, &size) != 0) return 1;
   char resolved[PATH_MAX];
   if (!realpath(raw, resolved)) return 1;
   char *dir = dirname(resolved);
   char dylib[PATH_MAX];
   char target[PATH_MAX];
   snprintf(dylib, sizeof(dylib), "%s/../Frameworks/libphoenix.dylib", dir);
   snprintf(target, sizeof(target), "%s/Discord.bin", dir);
   const char *existing = getenv("DYLD_INSERT_LIBRARIES");
   if (existing && existing[0] != '\0') {
      if (!strstr(existing, dylib)) {
         char combined[PATH_MAX * 2];
         snprintf(combined, sizeof(combined), "%s:%s", dylib, existing);
         setenv("DYLD_INSERT_LIBRARIES", combined, 1);
      }
   } else {
      setenv("DYLD_INSERT_LIBRARIES", dylib, 1);
   }
   argv[0] = target;
   execv(target, argv);
   perror("execv");
   return 1;
}
EOF
      clang -arch arm64 -O2 -o "$app/Contents/MacOS/Discord" "$stage/launcher.c"
      chmod +x "$app/Contents/MacOS/Discord"

      codesign --force --sign - "$app/Contents/Frameworks/libphoenix.dylib"
      codesign --force --sign - --identifier com.discord.DesktopGpui "$app/Contents/MacOS/Discord.bin"
      codesign --force --sign - --identifier com.discord.DesktopGpui "$app"
   fi

   rm -rf "$discord" "$copy"
   mv "$app" "$discord"
   if [ -n "$sandbox" ]; then
      echo "Installed Sunbird into $discord, sandboxed."
   else
      echo "Installed Sunbird into $discord."
   fi
   open -a "$discord"
   exit 0
fi

# Refresh the ad-hoc signed copy when the source binary changed.
src_mtime=$(stat -f '%m' "$discord/Contents/MacOS/Discord")
copy_mtime=$(cat "$home/discord.mtime" 2>/dev/null || true)
if [ ! -x "$copy/Contents/MacOS/Discord" ] || [ "$src_mtime" != "$copy_mtime" ]; then
   echo "Preparing ad-hoc signed copy of Discord Phoenix..."
   rm -rf "$copy"
   cp -R "$discord" "$copy"
   xattr -cr "$copy"
   rm -rf "$copy/Contents/_CodeSignature"
   codesign --force --sign - --identifier com.discord.DesktopGpui "$copy/Contents/MacOS/Discord"
   codesign --force --sign - --identifier com.discord.DesktopGpui "$copy"
   echo "$src_mtime" >"$home/discord.mtime"
fi

# Stop any running Discord Phoenix instance so the new one owns the session.
pkill -f "$copy/Contents/MacOS/Discord" 2>/dev/null || true
pkill -f "$discord/Contents/MacOS/Discord" 2>/dev/null || true
sleep 1

if [ -n "$no_runtime" ]; then
   export SUNBIRD_GATE_ONLY=1
fi
export DYLD_INSERT_LIBRARIES="$dylib${DYLD_INSERT_LIBRARIES:+:$DYLD_INSERT_LIBRARIES}"
echo "Launching Discord Phoenix with Sunbird..."
exec "$copy/Contents/MacOS/Discord"
