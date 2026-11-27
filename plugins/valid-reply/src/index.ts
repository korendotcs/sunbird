// @description Fetches and shows replied-to messages that weren't loaded, instead of "Original message could not be loaded"
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const MUTED = 0xff949ba4;
const REPLY = 19;
const FORWARD = 1;

const cache = new Map<string, Promise<Phoenix.Message | null>>();

const fetchMessage = (channelId: string, messageId: string) => {
  let pending = cache.get(messageId);
  if (!pending) {
    pending = phoenix.discord
      .get(`/channels/${channelId}/messages?limit=1&around=${messageId}`)
      .then((res) => (res.ok ? res.json<Phoenix.Message[]>().find((m) => m.id === messageId) ?? null : null))
      .catch(() => null);
    cache.set(messageId, pending);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
  }
  return pending;
};

phoenix.ui.addMessageAccessory({
  priority: 20,
  async render(ctx) {
    const m = ctx.message;
    const ref = m?.message_reference;
    if (!m || m.type !== REPLY || !ref?.message_id || ref.type === FORWARD || m.referenced_message) return null;
    const original = await fetchMessage(ref.channel_id ?? m.channel_id, ref.message_id);
    if (!original) return { text: "↩ Original message was deleted", color: MUTED };
    const text = original.content.replace(/\s+/g, " ").trim() || "[attachment or embed]";
    const author = original.author.global_name || original.author.username;
    return { text: `↩ ${author}: ${text.length > 100 ? `${text.slice(0, 100)}…` : text}`, color: MUTED };
  },
});
