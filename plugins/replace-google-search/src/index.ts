// @description Rewrite Google search links or search message text with your preferred engine
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const ENGINES = {
  duckduckgo: "https://duckduckgo.com/?q=",
  kagi: "https://kagi.com/search?q=",
  startpage: "https://www.startpage.com/sp/search?query=",
  brave: "https://search.brave.com/search?q=",
  searxng: "",
} as const;

const settings = phoenix.settings.define({
  engine: {
    type: "select",
    title: "Search engine",
    options: [
      { value: "duckduckgo", label: "DuckDuckGo" },
      { value: "kagi", label: "Kagi" },
      { value: "searxng", label: "SearXNG" },
      { value: "startpage", label: "Startpage" },
      { value: "brave", label: "Brave" },
    ],
    default: "duckduckgo",
  },
  searxng: {
    type: "text",
    title: "SearXNG instance",
    description: "Base URL of your SearXNG instance",
    default: "https://searx.be",
  },
});

const GOOGLE = /https?:\/\/(?:www\.)?google\.[a-z.]{2,6}\/search\?[^\s<>]+/gi;

function searchUrl(q: string): string {
  const base = settings.engine === "searxng"
    ? settings.searxng.trim().replace(/\/+$/, "") + "/search?q="
    : ENGINES[settings.engine];
  return base + encodeURIComponent(q);
}

function googleQuery(url: string): string | null {
  const m = url.match(/[?&]q=([^&#]*)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, " "));
  } catch {
    return m[1];
  }
}

function open(url: string) {
  if (phoenix.ui.openUrl) phoenix.ui.openUrl(url);
  else {
    phoenix.ui.copy(url);
    phoenix.ui.toast("Search link copied");
  }
}

phoenix.ui.addMessageAction({
  label: "Search / Rewrite Link",
  icon: "message.actions.copy",
  visible: (ctx) => !!ctx.message?.content?.trim(),
  async onPress(ctx) {
    const content = ctx.message?.content ?? "";
    const googles = content.match(GOOGLE) ?? [];
    const queries = googles.map(googleQuery).filter((q): q is string => !!q);
    if (queries.length === 1) return open(searchUrl(queries[0]));
    if (queries.length > 1) {
      const i = await phoenix.ui.choose({ title: "Rewrite which search?", options: queries });
      if (i >= 0) open(searchUrl(queries[i]));
      return;
    }
    open(searchUrl(content.replace(/https?:\/\/\S+/g, "").trim().slice(0, 500) || content.slice(0, 500)));
  },
});
