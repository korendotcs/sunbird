//! macOS desktop backend. Clipboard, links, notifications and the file picker
//! go through the system's own command-line tools, and the tray is an
//! `NSStatusItem` made through the Objective-C runtime on Discord's main
//! thread, so the crate links nothing beyond libSystem.

use std::{
   collections::BTreeMap,
   ffi::{
      CStr,
      CString,
      c_char,
      c_void,
   },
   io::Write as _,
   path::PathBuf,
   process::{
      Command,
      Stdio,
   },
   ptr,
   sync::{
      LazyLock,
      Mutex,
      Once,
      PoisonError,
      atomic::{
         AtomicBool,
         AtomicUsize,
         Ordering,
      },
      mpsc,
   },
   thread,
};

use crate::{
   DesktopHost,
   Error,
   TrayAction,
};

/// Spawns `command` and waits for it on a background thread, so it never
/// lingers as a zombie.
fn spawn_reaped(command: &mut Command) -> Result<(), Error> {
   let mut child = command
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .map_err(|err| {
         Error::Platform {
            message: format!("{}: {err}", command.get_program().display()),
         }
      })?;
   let _ = thread::Builder::new()
      .name("sunbird-reap".to_owned())
      .spawn(move || child.wait());
   Ok(())
}

pub struct Host;

impl DesktopHost for Host {
   fn copy(text: &str) -> Result<(), Error> {
      if copy_pasteboard(text) {
         return Ok(());
      }
      let fail = |message: String| Error::Platform { message };
      let mut child = Command::new("/usr/bin/pbcopy")
         .stdin(Stdio::piped())
         .stdout(Stdio::null())
         .stderr(Stdio::null())
         .spawn()
         .map_err(|err| fail(format!("pbcopy: {err}")))?;
      let written = child
         .stdin
         .take()
         .is_some_and(|mut stdin| stdin.write_all(text.as_bytes()).is_ok());
      if child.wait().is_ok_and(|status| status.success()) && written {
         Ok(())
      } else {
         Err(fail("pbcopy failed".to_owned()))
      }
   }

   fn open(target: &str) -> Result<(), Error> {
      spawn_reaped(Command::new("/usr/bin/open").arg("--").arg(target))
   }

   fn speak(text: &str) -> Result<(), Error> {
      spawn_reaped(Command::new("/usr/bin/say").arg("--").arg(text))
   }

   fn set_always_on_top(enabled: bool) -> Result<(), Error> {
      const NS_NORMAL_WINDOW_LEVEL: isize = 0;
      const NS_FLOATING_WINDOW_LEVEL: isize = 3;
      let level = if enabled {
         NS_FLOATING_WINDOW_LEVEL
      } else {
         NS_NORMAL_WINDOW_LEVEL
      };
      on_main(move || {
         // SAFETY: on the main thread; every AppKit object is checked for nil.
         unsafe {
            let app = send(class(c"NSApplication"), sel(c"sharedApplication"));
            let windows = send(app, sel(c"windows"));
            if windows.is_null() {
               return;
            }
            let count = send_usize(windows, sel(c"count"));
            for at in 0..count {
               let window = send_index(windows, sel(c"objectAtIndex:"), at);
               if window.is_null() || !send_get_bool(window, sel(c"isVisible")) {
                  continue;
               }
               send_isize(window, sel(c"setLevel:"), level);
            }
         }
      });
      Ok(())
   }

   fn set_window_title(title: &str) -> Result<(), Error> {
      let title = title.to_owned();
      on_main(move || {
         // SAFETY: on the main thread; every AppKit object is checked for nil.
         unsafe {
            let app = send(class(c"NSApplication"), sel(c"sharedApplication"));
            let windows = send(app, sel(c"windows"));
            if windows.is_null() {
               return;
            }
            let count = send_usize(windows, sel(c"count"));
            for at in 0..count {
               let window = send_index(windows, sel(c"objectAtIndex:"), at);
               if window.is_null() || !send_get_bool(window, sel(c"isVisible")) {
                  continue;
               }
               send_id(window, sel(c"setTitle:"), ns_string(&title));
            }
         }
      });
      Ok(())
   }

   fn quick_look(url: &str) -> Result<(), Error> {
      let url = url.to_owned();
      let _ = thread::Builder::new()
         .name("sunbird-quicklook".to_owned())
         .spawn(move || {
            let Ok(home) = std::env::var("HOME") else {
               return;
            };
            let cache_dir = PathBuf::from(home).join("Library/Caches/sunbird/ql");
            let _ = std::fs::create_dir_all(&cache_dir);
            let path_part = url.split('?').next().unwrap_or(&url);
            let ext = path_part
               .rsplit('.')
               .next()
               .filter(|e| e.len() <= 5 && e.chars().all(|c| c.is_ascii_alphanumeric()))
               .unwrap_or("png");
            let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
            for b in url.as_bytes() {
               hash ^= u64::from(*b);
               hash = hash.wrapping_mul(0x0100_0000_01b3);
            }
            let dest = cache_dir.join(format!("{hash:016x}.{ext}"));
            let ok = Command::new("/usr/bin/curl")
               .args(["-fsSL", "--max-time", "15", "-o"])
               .arg(&dest)
               .arg(&url)
               .stdin(Stdio::null())
               .stdout(Stdio::null())
               .stderr(Stdio::null())
               .status()
               .is_ok_and(|s| s.success());
            if !ok {
               log::warn!("quicklook: failed to download {url}");
               return;
            }
            if let Err(err) = spawn_reaped(Command::new("/usr/bin/qlmanage").arg("-p").arg(&dest)) {
               log::warn!("quicklook: {err}");
            }
         });
      Ok(())
   }

   fn media_control(player: &str, cmd: &str) -> Result<String, Error> {
      let script = match (player, cmd) {
         ("spotify", "playpause") => "tell application \"Spotify\" to playpause",
         ("spotify", "next") => "tell application \"Spotify\" to next track",
         ("spotify", "previous") => "tell application \"Spotify\" to previous track",
         ("spotify", "state") => {
            "if application \"Spotify\" is running then\n\
             tell application \"Spotify\"\n\
             if player state is stopped then return \"stopped\"\n\
             return (player state as text) & \"\t\" & (name of current track) & \"\t\" & (artist of current track) & \"\t\" & (album of current track)\n\
             end tell\n\
             else\n\
             return \"not_running\"\n\
             end if"
         },
         ("music", "playpause") => "tell application \"Music\" to playpause",
         ("music", "next") => "tell application \"Music\" to next track",
         ("music", "previous") => "tell application \"Music\" to previous track",
         ("music", "state") => {
            "if application \"Music\" is running then\n\
             tell application \"Music\"\n\
             if player state is stopped then return \"stopped\"\n\
             return (player state as text) & \"\t\" & (name of current track) & \"\t\" & (artist of current track) & \"\t\" & (album of current track)\n\
             end tell\n\
             else\n\
             return \"not_running\"\n\
             end if"
         },
         _ => {
            return Err(Error::Platform {
               message: format!("unsupported media control: {player}/{cmd}"),
            });
         },
      };
      let out = Command::new("/usr/bin/osascript")
         .args(["-e", script])
         .stdin(Stdio::null())
         .output()
         .map_err(|err| {
            Error::Platform {
               message: format!("osascript: {err}"),
            }
         })?;
      if !out.status.success() {
         let err = String::from_utf8_lossy(&out.stderr).trim().to_owned();
         return Err(Error::Platform {
            message: if err.is_empty() {
               "media control failed".to_owned()
            } else {
               err
            },
         });
      }
      Ok(String::from_utf8_lossy(&out.stdout).trim().to_owned())
   }

   fn pick_js_path() -> Option<PathBuf> {
      let (tx, rx) = mpsc::channel();
      on_main(move || {
         // SAFETY: on the main thread inside its autorelease pool.
         let picked = unsafe { pick_js_open_panel() };
         let _ = tx.send(picked);
      });
      rx.recv().ok().flatten()
   }

   fn notify(title: &str, body: &str) {
      // The text travels as arguments, never inside the script, so a plugin's
      // quote can't change what runs.
      let mut script = Command::new("/usr/bin/osascript");
      script.args([
         "-e",
         "on run argv",
         "-e",
         "display notification (item 2 of argv) with title (item 1 of argv)",
         "-e",
         "end run",
         "--",
         title,
         body,
      ]);
      if let Err(err) = spawn_reaped(&mut script) {
         log::debug!("notify: {err}");
      }
   }

   fn set_youtube_adblock(enabled: bool) {
      YOUTUBE_ADBLOCK.store(enabled, Ordering::Relaxed);
      on_main(install_webkit_adblock);
   }

   fn register_webview_script(id: &str, js: &str) {
      WEBVIEW_SCRIPTS
         .lock()
         .unwrap_or_else(PoisonError::into_inner)
         .insert(id.to_owned(), js.to_owned());
      on_main(install_webkit_adblock);
   }

   fn unregister_webview_script(id: &str) {
      WEBVIEW_SCRIPTS
         .lock()
         .unwrap_or_else(PoisonError::into_inner)
         .remove(id);
   }

   fn start_tray() {
      static STARTED: Once = Once::new();
      STARTED.call_once(|| {
         on_main(start_status_item);
         on_main(start_shortcuts);
         on_main(install_webkit_adblock);
      });
   }
}

/// Re-renders every visible window, from any thread. A dirty layer alone only
/// presents GPUI's last frame, while a key status change makes GPUI refresh
/// the whole window.
pub fn redraw_windows() {
   on_main(|| {
      // SAFETY: on the main thread, where AppKit may be used; every object is
      // checked for nil before it is messaged.
      unsafe {
         let app = send(class(c"NSApplication"), sel(c"sharedApplication"));
         let windows = send(app, sel(c"windows"));
         if windows.is_null() {
            return;
         }
         let count = send_usize(windows, sel(c"count"));
         for at in 0..count {
            let window = send_index(windows, sel(c"objectAtIndex:"), at);
            if window.is_null() || !send_get_bool(window, sel(c"isVisible")) {
               continue;
            }
            let delegate = send(window, sel(c"delegate"));
            let key_status = sel(c"windowDidBecomeKey:");
            if !delegate.is_null()
               && send_responds(delegate, sel(c"respondsToSelector:"), key_status)
            {
               send_id_unit(delegate, key_status, ptr::null_mut());
            }
         }
      }
   });
}

fn copy_pasteboard(text: &str) -> bool {
   // SAFETY: only reads the calling thread's identity.
   if unsafe { pthread_main_np() } != 0 {
      // SAFETY: on the main thread, inside its run loop's autorelease pool.
      return unsafe { write_pasteboard(text) };
   }
   let (tx, rx) = mpsc::channel();
   let text = text.to_owned();
   on_main(move || {
      // SAFETY: on the main thread inside its autorelease pool.
      let _ = tx.send(unsafe { write_pasteboard(&text) });
   });
   rx.recv().unwrap_or(false)
}

/// # Safety
///
/// Must run on the main thread inside an autorelease pool.
unsafe fn write_pasteboard(text: &str) -> bool {
   // SAFETY: forwarded from the caller.
   unsafe {
      let cls = class(c"NSPasteboard");
      if cls.is_null() {
         return false;
      }
      let pb = send(cls, sel(c"generalPasteboard"));
      if pb.is_null() {
         return false;
      }
      let _ = send_tag(pb, sel(c"clearContents"));
      let value = ns_string(text);
      if value.is_null() {
         return false;
      }
      send_id2_bool(
         pb,
         sel(c"setString:forType:"),
         value,
         ns_string("public.utf8-plain-text"),
      )
   }
}

/// # Safety
///
/// Must run on the main thread inside an autorelease pool.
unsafe fn pick_js_open_panel() -> Option<PathBuf> {
   const MODAL_OK: isize = 1;
   // SAFETY: on the main thread; every AppKit object is checked for nil.
   unsafe {
      let cls = class(c"NSOpenPanel");
      if cls.is_null() {
         return None;
      }
      let panel = send(cls, sel(c"openPanel"));
      if panel.is_null() {
         return None;
      }
      send_id(
         panel,
         sel(c"setTitle:"),
         ns_string("Install Sunbird Plugin (.js)"),
      );
      send_bool(panel, sel(c"setCanChooseFiles:"), true);
      send_bool(panel, sel(c"setCanChooseDirectories:"), false);
      send_bool(panel, sel(c"setAllowsMultipleSelection:"), false);
      let types = send_id(class(c"NSArray"), sel(c"arrayWithObject:"), ns_string("js"));
      if !types.is_null() {
         send_id(panel, sel(c"setAllowedFileTypes:"), types);
      }
      let app = send(class(c"NSApplication"), sel(c"sharedApplication"));
      if !app.is_null() {
         send_bool(app, sel(c"activateIgnoringOtherApps:"), true);
      }
      if send_tag(panel, sel(c"runModal")) != MODAL_OK {
         return None;
      }
      let url = send(panel, sel(c"URL"));
      if url.is_null() {
         return None;
      }
      let path = send(url, sel(c"path"));
      if path.is_null() {
         return None;
      }
      let utf8 = send_cstr(path, sel(c"UTF8String"));
      if utf8.is_null() {
         return None;
      }
      let text = CStr::from_ptr(utf8).to_str().ok()?;
      (!text.is_empty()).then(|| PathBuf::from(text))
   }
}

type Id = *mut c_void;
type Sel = *const c_void;

#[link(name = "objc")]
unsafe extern "C" {
   fn objc_getClass(name: *const c_char) -> Id;
   fn sel_registerName(name: *const c_char) -> Sel;
   fn objc_msgSend();
   fn objc_allocateClassPair(superclass: Id, name: *const c_char, extra: usize) -> Id;
   fn objc_registerClassPair(class: Id);
   fn class_addMethod(class: Id, name: Sel, imp: *const c_void, types: *const c_char) -> bool;
   fn class_getInstanceMethod(class: Id, name: Sel) -> *mut c_void;
   fn method_getImplementation(method: *mut c_void) -> *const c_void;
   fn method_setImplementation(method: *mut c_void, imp: *const c_void) -> *const c_void;
}

unsafe extern "C" {
   fn pthread_main_np() -> i32;
   static _dispatch_main_q: c_void;
   fn dispatch_async_f(
      queue: *const c_void,
      context: *mut c_void,
      work: extern "C" fn(*mut c_void),
   );
}

fn class(name: &CStr) -> Id {
   // SAFETY: a lookup by NUL-terminated name, nil when missing.
   unsafe { objc_getClass(name.as_ptr()) }
}

fn sel(name: &CStr) -> Sel {
   // SAFETY: registers or finds a selector by NUL-terminated name.
   unsafe { sel_registerName(name.as_ptr()) }
}

/// `objc_msgSend` cast to one method's exact signature, which arm64 needs
/// since it passes variadic arguments differently.
macro_rules! msg_send {
   ($name:ident ($($arg:ident: $ty:ty),*) -> $ret:ty) => {
      /// # Safety
      ///
      /// `object` is nil or responds to `selector` with this signature.
      unsafe fn $name(object: Id, selector: Sel $(, $arg: $ty)*) -> $ret {
         // SAFETY: the caller matches the method's signature.
         unsafe {
            let send: unsafe extern "C" fn(Id, Sel $(, $ty)*) -> $ret =
               std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
            send(object, selector $(, $arg)*)
         }
      }
   };
}

msg_send!(send() -> Id);
msg_send!(send_id(arg: Id) -> Id);
msg_send!(send_id_unit(arg: Id) -> ());
msg_send!(send_id2_bool(a: Id, b: Id) -> bool);
msg_send!(send_bool(arg: bool) -> ());
msg_send!(send_get_bool() -> bool);
msg_send!(send_responds(selector: Sel) -> bool);
msg_send!(send_usize() -> usize);
msg_send!(send_u16() -> u16);
msg_send!(send_index(at: usize) -> Id);
msg_send!(send_isize(arg: isize) -> ());
msg_send!(send_f64(arg: f64) -> Id);
msg_send!(send_str(arg: *const c_char) -> Id);
msg_send!(send_cstr() -> *const c_char);
msg_send!(send_monitor(mask: u64, handler: *const Block) -> Id);
msg_send!(send_symbol(name: Id, description: Id) -> Id);
msg_send!(send_item(title: Id, action: Sel, key: Id) -> Id);
msg_send!(send_tag() -> isize);
msg_send!(send_user_script(source: Id, injection_time: isize, main_frame_only: bool) -> Id);

static YOUTUBE_ADBLOCK: AtomicBool = AtomicBool::new(true);
static ORIG_WK_UCC_INIT: AtomicUsize = AtomicUsize::new(0);
static WEBVIEW_SCRIPTS: LazyLock<Mutex<BTreeMap<String, String>>> =
   LazyLock::new(|| Mutex::new(BTreeMap::new()));

const YT_ADBLOCK_JS: &str = r#"(() => {
  const h = (location && location.hostname) || "";
  if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(h)) return;
  if (window.__sunbirdYtAdblock) return;
  window.__sunbirdYtAdblock = true;
  const strip = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    for (const k of ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"]) {
      if (k in obj) obj[k] = Array.isArray(obj[k]) ? [] : undefined;
    }
    return obj;
  };
  const origParse = JSON.parse;
  JSON.parse = function (...args) {
    return strip(origParse.apply(this, args));
  };
  if (typeof Response !== "undefined" && Response.prototype && Response.prototype.json) {
    const origJson = Response.prototype.json;
    Response.prototype.json = function () {
      return origJson.call(this).then(strip);
    };
  }
  const injectCss = () => {
    if (!document.head || document.getElementById("sunbird-yt-adblock")) return;
    const s = document.createElement("style");
    s.id = "sunbird-yt-adblock";
    s.textContent = ".ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-player-overlay,ytd-ad-slot-renderer,ytd-in-feed-ad-layout-renderer,ytd-promoted-sparkles-web-renderer,#masthead-ad,.ytp-ad-action-interstitial{display:none!important;}";
    document.head.appendChild(s);
  };
  const skip = () => {
    injectCss();
    for (const sel of [".ytp-ad-skip-button", ".ytp-ad-skip-button-modern", ".ytp-skip-ad-button", ".ytp-ad-overlay-close-button"]) {
      const btn = document.querySelector(sel);
      if (btn) btn.click();
    }
    const player = document.querySelector(".html5-video-player.ad-showing");
    if (player) {
      const v = player.querySelector("video");
      if (v && Number.isFinite(v.duration) && v.duration > 0) {
        v.muted = true;
        v.currentTime = v.duration;
      }
    }
  };
  document.addEventListener("DOMContentLoaded", skip, { once: true });
  setInterval(skip, 400);
})();"#;

/// # Safety
///
/// `controller` must be a live `WKUserContentController` on a valid `WebKit` thread.
unsafe fn attach_user_script(controller: Id, source: &str) {
   // SAFETY: forwarded from caller; every ObjC object is checked for nil.
   unsafe {
      let script_cls = class(c"WKUserScript");
      if script_cls.is_null() {
         return;
      }
      let alloc = send(script_cls, sel(c"alloc"));
      if alloc.is_null() {
         return;
      }
      let script = send_user_script(
         alloc,
         sel(c"initWithSource:injectionTime:forMainFrameOnly:"),
         ns_string(source),
         0,
         false,
      );
      if !script.is_null() {
         send_id_unit(controller, sel(c"addUserScript:"), script);
         send_id_unit(script, sel(c"release"), ptr::null_mut());
      }
   }
}

extern "C" fn swizzled_wk_ucc_init(this: Id, selector: Sel) -> Id {
   let orig = ORIG_WK_UCC_INIT.load(Ordering::Acquire);
   if orig == 0 {
      return ptr::null_mut();
   }
   // SAFETY: `orig` is the original `-[WKUserContentController init]` IMP.
   let controller = unsafe {
      let f: unsafe extern "C" fn(Id, Sel) -> Id = std::mem::transmute(orig);
      f(this, selector)
   };
   if !controller.is_null() {
      if YOUTUBE_ADBLOCK.load(Ordering::Relaxed) {
         // SAFETY: `controller` is a live `WKUserContentController`.
         unsafe { attach_user_script(controller, YT_ADBLOCK_JS) };
      }
      let scripts: Vec<String> = WEBVIEW_SCRIPTS
         .lock()
         .unwrap_or_else(PoisonError::into_inner)
         .values()
         .cloned()
         .collect();
      for js in &scripts {
         // SAFETY: `controller` is a live `WKUserContentController`.
         unsafe { attach_user_script(controller, js) };
      }
   }
   controller
}

fn install_webkit_adblock() {
   static INSTALLED: Once = Once::new();
   INSTALLED.call_once(|| {
      // SAFETY: swizzles `-[WKUserContentController init]` once on the main thread.
      unsafe {
         let cls = class(c"WKUserContentController");
         if cls.is_null() {
            return;
         }
         let method = class_getInstanceMethod(cls, sel(c"init"));
         if method.is_null() {
            return;
         }
         let orig = method_getImplementation(method);
         if orig.is_null() {
            return;
         }
         ORIG_WK_UCC_INIT.store(orig as usize, Ordering::Release);
         let _ = method_setImplementation(method, swizzled_wk_ucc_init as *const c_void);
         log::info!("webview: YouTube AdBlock WKUserContentController hook installed");
      }
   });
}

mod panel;

pub use panel::{
   Action as PanelAction,
   PanelButton,
   PanelSection,
   close_panel,
   show_panel,
};

/// An autoreleased `NSString`, stripping interior NUL bytes so `AppKit` calls
/// that reject `nil` never throw `NSInvalidArgumentException`.
///
/// # Safety
///
/// On the main thread, inside its autorelease pool.
unsafe fn ns_string(text: &str) -> Id {
   let cstr = CString::new(text)
      .unwrap_or_else(|_| CString::new(text.replace('\0', "")).unwrap_or_default());
   // SAFETY: forwarded from the caller; `cstr` outlives the call, which copies
   // it.
   unsafe {
      send_str(
         class(c"NSString"),
         sel(c"stringWithUTF8String:"),
         cstr.as_ptr(),
      )
   }
}

/// Runs `work` on the main thread, where `AppKit` lives, through its dispatch
/// queue, which GPUI's `NSApplication` run loop drains.
fn on_main(work: impl FnOnce() + Send + 'static) {
   type Work = Box<dyn FnOnce() + Send>;
   extern "C" fn run(context: *mut c_void) {
      // SAFETY: `context` is the `Box<Work>` `on_main` leaked, read back
      // once.
      let work = unsafe { Box::from_raw(context.cast::<Work>()) };
      work();
   }
   let work: Box<Work> = Box::new(Box::new(work));
   // SAFETY: the main queue lives as long as the process, and `run` takes
   // back the box exactly once.
   unsafe {
      dispatch_async_f(&raw const _dispatch_main_q, Box::into_raw(work).cast(), run);
   }
}

/// The status item's menu calls this with the clicked item, whose tag is its
/// index in [`TrayAction::MENU`]. Actions may block, so they run elsewhere.
extern "C" fn tray_clicked(_this: Id, _selector: Sel, sender: Id) {
   // SAFETY: AppKit passes the `NSMenuItem` that was clicked.
   let tag = unsafe { send_tag(sender, sel(c"tag")) };
   let Some(action) = usize::try_from(tag)
      .ok()
      .and_then(|at| TrayAction::MENU.get(at).copied().flatten())
   else {
      return;
   };
   spawn("sunbird-tray", move || action.run());
}

/// Runs `work` on a thread of its own, since `AppKit`'s may not block.
fn spawn(name: &str, work: impl FnOnce() + Send + 'static) {
   let _ = thread::Builder::new().name(name.to_owned()).spawn(work);
}

/// One instance of a new `NSObject` subclass `name`, kept for the life of the
/// process, whose methods are `(selector, imp)` pairs of type `v@:@`.
///
/// # Safety
///
/// On the main thread, and each `imp` is an `extern "C" fn(Id, Sel, Id)`.
unsafe fn target_object(name: &CStr, methods: &[(&CStr, *const c_void)]) -> Id {
   let mut target = class(name);
   if target.is_null() {
      // SAFETY: registers a new subclass with the caller's `v@:@` methods.
      unsafe {
         target = objc_allocateClassPair(class(c"NSObject"), name.as_ptr(), 0);
         if target.is_null() {
            return ptr::null_mut();
         }
         for &(selector, imp) in methods {
            class_addMethod(target, sel(selector), imp, c"v@:@".as_ptr());
         }
         objc_registerClassPair(target);
      }
   }
   // SAFETY: a fresh instance of an `NSObject` subclass, owned forever.
   unsafe { send(send(target, sel(c"alloc")), sel(c"init")) }
}

fn start_status_item() {
   /// `NSVariableStatusItemLength`.
   const VARIABLE_LENGTH: f64 = -1.0;

   // SAFETY: on the main thread; every object is checked for nil before
   // anything depends on it, and the item, menu and target are kept for the
   // life of the process.
   unsafe {
      let bar = send(class(c"NSStatusBar"), sel(c"systemStatusBar"));
      let target = target_object(c"SunbirdTrayTarget", &[(
         c"sunbirdTray:",
         tray_clicked as *const c_void,
      )]);
      if bar.is_null() || target.is_null() {
         log::info!("tray: AppKit is not available");
         return;
      }
      let item = send(
         send_f64(bar, sel(c"statusItemWithLength:"), VARIABLE_LENGTH),
         sel(c"retain"),
      );
      let button = send(item, sel(c"button"));
      let image = send_symbol(
         class(c"NSImage"),
         sel(c"imageWithSystemSymbolName:accessibilityDescription:"),
         ns_string("bird"),
         ns_string("Sunbird"),
      );
      if image.is_null() {
         send_id(button, sel(c"setTitle:"), ns_string("Sunbird"));
      } else {
         send_id(button, sel(c"setImage:"), image);
      }
      send_id(button, sel(c"setToolTip:"), ns_string("Sunbird"));

      let menu = send_id(
         send(class(c"NSMenu"), sel(c"alloc")),
         sel(c"initWithTitle:"),
         ns_string("Sunbird"),
      );
      for (at, entry) in TrayAction::MENU.iter().enumerate() {
         let menu_item = entry.map_or_else(
            || send(class(c"NSMenuItem"), sel(c"separatorItem")),
            |action| {
               let menu_item = send_item(
                  send(class(c"NSMenuItem"), sel(c"alloc")),
                  sel(c"initWithTitle:action:keyEquivalent:"),
                  ns_string(action.label()),
                  sel(c"sunbirdTray:"),
                  // An uppercase key adds Shift to the default Command, so
                  // the menu shows the monitor's Shift-Command-I.
                  ns_string(if matches!(action, TrayAction::OpenDevtools) {
                     "I"
                  } else {
                     ""
                  }),
               );
               send_id(menu_item, sel(c"setTarget:"), target);
               send_isize(menu_item, sel(c"setTag:"), at.cast_signed());
               menu_item
            },
         );
         send_id(menu, sel(c"addItem:"), menu_item);
      }
      send_id(item, sel(c"setMenu:"), menu);
   }
}

struct Shortcut {
   modifiers: usize,
   code:      u16,
   label:     &'static str,
   run:       fn(),
}

/// Sunbird's shortcuts while Discord is focused: Command-Shift-I opens its
/// `DevTools`, which Discord leaves free. Matched by physical key code so
/// non-Latin layouts (Russian, Greek, etc.) trigger the same key.
const KVK_ANSI_I: u16 = 0x22;
const SHORTCUTS: [Shortcut; 1] = [Shortcut {
   modifiers: COMMAND_SHIFT,
   code:      KVK_ANSI_I,
   label:     "i",
   run:       crate::open_devtools,
}];

/// `NSEventModifierFlagShift | NSEventModifierFlagCommand`, and the mask of
/// Shift, Control, Option and Command (ignoring Caps Lock and Fn).
const COMMAND_SHIFT: usize = (1 << 17) | (1 << 20);
const MODIFIERS: usize = (1 << 17) | (1 << 18) | (1 << 19) | (1 << 20);

/// An Objective-C block, laid out as the runtime reads one.
#[repr(C)]
struct Block {
   isa:        *const c_void,
   flags:      i32,
   reserved:   i32,
   invoke:     extern "C" fn(*const Self, Id) -> Id,
   descriptor: *const BlockDescriptor,
}

#[repr(C)]
struct BlockDescriptor {
   reserved: usize,
   size:     usize,
}

unsafe extern "C" {
   static _NSConcreteGlobalBlock: c_void;
}

/// `NSEvent *(^)(NSEvent *)`: runs a shortcut and swallows its key, or hands
/// every other key on.
extern "C" fn key_down(_block: *const Block, event: Id) -> Id {
   // SAFETY: AppKit passes the `NSEvent` being dispatched.
   let (code, flags) = unsafe {
      (
         send_u16(event, sel(c"keyCode")),
         send_usize(event, sel(c"modifierFlags")),
      )
   };
   let pressed = flags & MODIFIERS;
   let Some(shortcut) = SHORTCUTS
      .iter()
      .find(|shortcut| shortcut.modifiers == pressed && code == shortcut.code)
   else {
      return event;
   };
   log::info!("shortcuts: key {}", shortcut.label);
   // Opening spawns a browser, which must not block the main thread.
   spawn("sunbird-shortcut", shortcut.run);
   ptr::null_mut()
}

fn start_shortcuts() {
   /// `NSEventMaskKeyDown`.
   const KEY_DOWN: u64 = 1 << 10;
   /// `BLOCK_IS_GLOBAL`: the runtime never copies or frees it.
   const IS_GLOBAL: i32 = 1 << 28;
   static DESCRIPTOR: BlockDescriptor = BlockDescriptor {
      reserved: 0,
      size:     size_of::<Block>(),
   };

   // Leaked, since the monitor keeps it for the life of the process.
   let block = Box::leak(Box::new(Block {
      isa:        &raw const _NSConcreteGlobalBlock,
      flags:      IS_GLOBAL,
      reserved:   0,
      invoke:     key_down,
      descriptor: &raw const DESCRIPTOR,
   }));
   // SAFETY: on the main thread; the block has the handler's signature and
   // outlives the monitor, which AppKit retains.
   let monitor = unsafe {
      send_monitor(
         class(c"NSEvent"),
         sel(c"addLocalMonitorForEventsMatchingMask:handler:"),
         KEY_DOWN,
         block,
      )
   };
   if monitor.is_null() {
      log::info!("shortcuts: AppKit refused the key monitor");
   } else {
      log::info!("shortcuts: Command-Shift-I opens DevTools");
   }
}
