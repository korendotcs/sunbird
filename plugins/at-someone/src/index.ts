// @description Replaces @someone in outgoing messages with a random recent user in the channel
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Fun

const recentByChannel = new Map<string, Set<string>>();

phoenix.on(phoenix.gateway.messageCreate, (msg) => {
  if (!msg?.channel_id || !msg?.author?.id || msg.author.bot) return;
  let set = recentByChannel.get(msg.channel_id);
  if (!set) {
    set = new Set();
    recentByChannel.set(msg.channel_id, set);
  }
  set.add(msg.author.id);
  if (set.size > 50) {
    const first = set.values().next().value;
    if (first) set.delete(first);
  }
});

phoenix.messages.onSend((text, ctx) => {
  if (!text.includes("@someone") || !ctx.channelId) return;
  const pool = [...(recentByChannel.get(ctx.channelId) ?? [])];
  if (!pool.length) return;
  return text.replace(/@someone/g, () => `<@${pool[Math.floor(Math.random() * pool.length)]}>`);
});
