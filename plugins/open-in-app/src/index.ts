// @description Adds an "Open Link in App" message action that turns Spotify, Apple Music, Steam and GitHub links into native app URIs
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const URL_RE = /https?:\/\/[^\s<>()]+/g;

// The runtime has no way to launch a URI, so the converted link is copied for pasting into a browser or launcher.
const toAppUri = (url: string): string | null => {
  let m = url.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show|user)\/([A-Za-z0-9]+)/);
  if (m) return `spotify:${m[1]}:${m[2]}`;
  if (/^https?:\/\/(?:geo\.)?music\.apple\.com\//.test(url)) return url.replace(/^https?:/, "music:");
  if (/^https?:\/\/(?:store\.steampowered\.com|steamcommunity\.com|help\.steampowered\.com)\//.test(url)) {
    return `steam://openurl/${url}`;
  }
  m = url.match(/^https?:\/\/github\.com\/([^/\s]+\/[^/\s#?]+)/);
  if (m) return `x-github-client://openRepo/https://github.com/${m[1]}`;
  return null;
};

const linksOf = (message?: Phoenix.Message) => {
  const out: { url: string; uri: string }[] = [];
  for (const url of message?.content.match(URL_RE) ?? []) {
    const uri = toAppUri(url);
    if (uri && !out.some((l) => l.uri === uri)) out.push({ url, uri });
  }
  return out;
};

phoenix.ui.addMessageAction({
  label: "Open Link in App",
  visible: (ctx) => linksOf(ctx.message).length > 0,
  async onPress(ctx) {
    const links = linksOf(ctx.message);
    if (!links.length) return phoenix.ui.toast("No supported links");
    const index = links.length === 1 ? 0 : await phoenix.ui.choose({
      title: "Copy app link",
      options: links.map((l) => l.uri),
    });
    const link = links[index];
    if (!link) return;
    if (typeof phoenix.ui.openUrl === "function") {
      try {
        phoenix.ui.openUrl(link.uri);
        phoenix.ui.toast(`Opened ${link.uri}`);
        return;
      } catch {
        // fall through to copy
      }
    }
    phoenix.ui.copy(link.uri);
    phoenix.ui.toast(`Copied ${link.uri}`);
  },
});
