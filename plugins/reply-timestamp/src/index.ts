// @description Shows when the replied-to message was sent, read from its snowflake ID
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const DISCORD_EPOCH = 1420070400000n;
const pad = (n: number) => String(n).padStart(2, "0");

function relative(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}mo ago`;
  return `${Math.floor(s / (86400 * 365))}y ago`;
}

phoenix.ui.addMessageAccessory({
  placement: "header",
  render({ message }) {
    const ref = message?.message_reference;
    // type 1 is a forward, not a reply.
    if (!ref?.message_id || ref.type === 1 || !/^\d+$/.test(ref.message_id)) return null;
    const ms = Number((BigInt(ref.message_id) >> 22n) + DISCORD_EPOCH);
    const d = new Date(ms);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { text: `↩ ${relative(ms)} (${date})`, color: 0xff949ba4 };
  },
});
