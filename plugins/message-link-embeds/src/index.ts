// @description Shows the author and a preview of Discord message links posted in chat
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const LINK_RE = /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d+|@me)\/(\d+)\/(\d+)/g;
const MUTED = 0xff949ba4;

const settings = phoenix.settings.define({
  maxLength: { type: "number", title: "Preview length", description: "Characters of the linked message to show", default: 120 },
});

// ponytail: unbounded until reload, add LRU eviction if memory shows up.
const cache = new Map<string, Promise<Phoenix.Message | null>>();

const fetchMessage = (channelId: string, messageId: string) => {
  const key = `${channelId}/${messageId}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = phoenix.discord
      .get(`/channels/${channelId}/messages?limit=1&around=${messageId}`)
      .then((res) => (res.ok ? res.json<Phoenix.Message[]>().find((m) => m.id === messageId) ?? null : null))
      .catch(() => null);
    cache.set(key, pending);
  }
  return pending;
};

const preview = (m: Phoenix.Message) => {
  const text = m.content.replace(/\s+/g, " ").trim()
    || (m.attachments.length ? `[${m.attachments.length} attachment(s)]` : m.embeds.length ? "[embed]" : "[no text]");
  const max = Math.max(20, settings.maxLength);
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

phoenix.ui.addMessageAccessory({
  priority: 10,
  async render(ctx) {
    const links = [...(ctx.message?.content ?? "").matchAll(LINK_RE)];
    if (!links.length) return null;
    const [, , channelId, messageId] = links[0];
    const linked = await fetchMessage(channelId, messageId);
    const more = links.length > 1 ? ` (+${links.length - 1} more)` : "";
    if (!linked) return { text: `🔗 Linked message unavailable${more}`, color: MUTED };
    const author = linked.author.global_name || linked.author.username;
    return { text: `🔗 ${author}: ${preview(linked)}${more}`, color: MUTED };
  },
});
