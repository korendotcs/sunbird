// @description Adds a "Forward Message" action to forward a message to a saved channel (or any channel via /forward) or copy it as a quote
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const settings = phoenix.settings.define({
  channels: {
    type: "text",
    multiline: true,
    title: "Forward targets",
    description: "One channel per line: `<channel id> <label>`, e.g. `123456789012345678 #general`",
    default: "",
  },
});

const targets = () =>
  settings.channels
    .split("\n")
    .map((line) => line.trim().match(/^(\d{15,22})\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ id: m[1], label: m[2] || m[1] }));

let armed: Phoenix.Message | null = null;

const quote = (m: Phoenix.Message) => {
  const author = m.author.global_name || m.author.username;
  const body = m.content ? m.content.split("\n").map((l) => `> ${l}`).join("\n") : "";
  const files = m.attachments.map((a) => a.url).join("\n");
  return [`**${author}** <t:${Math.floor(Date.parse(m.timestamp) / 1000)}:f>`, body, files].filter(Boolean).join("\n");
};

const forward = async (m: Phoenix.Message, channelId: string) => {
  const guildId = (m as Phoenix.GatewayMessage).guild_id;
  const res = await phoenix.discord.post(`/channels/${channelId}/messages`, {
    message_reference: { type: 1, message_id: m.id, channel_id: m.channel_id, ...(guildId ? { guild_id: guildId } : {}) },
  });
  phoenix.ui.toast(res.ok ? "Message forwarded" : `Forward failed (${res.status})`);
  return res.ok;
};

phoenix.ui.addMessageAction({
  label: "Forward Message",
  visible: (ctx) => !!ctx.message,
  async onPress(ctx) {
    const m = ctx.message;
    if (!m) return;
    const saved = targets();
    const options = ["Copy as quote", ...saved.map((t) => `Forward to ${t.label}`), "Forward with /forward <channel id>…"];
    const picked = await phoenix.ui.choose({ title: "Forward", options });
    if (picked < 0) return;
    if (picked === 0) {
      phoenix.ui.copy(quote(m));
      return phoenix.ui.toast("Copied quote");
    }
    const target = saved[picked - 1];
    if (target) return void forward(m, target.id).catch(() => phoenix.ui.toast("Forward failed"));
    armed = m;
    phoenix.ui.toast("Now type /forward <channel id>");
  },
});

phoenix.commands.register({
  name: "forward",
  description: "Forward the message picked with \"Forward Message\" to a channel id",
  async execute(args, ctx) {
    const channelId = args.match(/\d{15,22}/)?.[0];
    if (!armed) return void ctx.reply("Long-press a message → Forward Message → \"Forward with /forward\" first.");
    if (!channelId) return void ctx.reply("Usage: `/forward <channel id>`");
    if (await forward(armed, channelId).catch(() => false)) armed = null;
  },
});
