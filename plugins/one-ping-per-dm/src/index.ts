// @description Suppresses repeated DM mention pings from the same user within a cooldown window
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const settings = phoenix.settings.define({
  cooldownSec: {
    type: "number",
    title: "Cooldown (seconds)",
    description: "Only allow one ping per DM channel within this many seconds",
    default: 30,
  },
});

const lastPing = new Map<string, number>();

phoenix.hook(phoenix.gateway.messageCreate, {
  before(msg) {
    if (!msg || msg.guild_id || !msg.channel_id) return;
    const now = Date.now();
    const cd = Math.max(5, Number(settings.cooldownSec) || 30) * 1000;
    const prev = lastPing.get(msg.channel_id) ?? 0;
    if (now - prev < cd) {
      msg.flags = (msg.flags ?? 0) | (1 << 12);
    } else {
      lastPing.set(msg.channel_id, now);
    }
  },
});
