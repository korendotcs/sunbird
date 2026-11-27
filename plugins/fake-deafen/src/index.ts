// @description Appear deafened to others while still hearing voice chat
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const settings = phoenix.settings.define({
  enabled: { type: "switch", title: "Fake deafen", default: false, onChange: (v) => phoenix.storage.set("on", v) },
  mute: { type: "switch", title: "Also appear muted", default: true },
});

// /fakedeafen and the switch both write storage; the switch value is only the first-run default.
const on = () => phoenix.storage.get<boolean>("on") ?? settings.enabled;

phoenix.gateway.onSend(4, (d) => {
  if (!on() || !d.channel_id) return;
  d.self_deaf = true;
  if (settings.mute) d.self_mute = true;
});

phoenix.commands.register({
  name: "fakedeafen",
  description: "Fake deafen: /fakedeafen on | off | toggle",
  execute(args, ctx) {
    const a = args.trim().toLowerCase() || "toggle";
    if (!["on", "off", "toggle"].includes(a)) return void ctx.reply("Usage: `/fakedeafen on|off|toggle`");
    const next = a === "toggle" ? !on() : a === "on";
    phoenix.storage.set("on", next);
    ctx.reply(`Fake deafen **${next ? "on" : "off"}**. Toggle mute or rejoin the voice channel to apply it.`);
  },
});
