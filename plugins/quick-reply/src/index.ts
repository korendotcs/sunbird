// @description Reply to a message by ID with /reply and copy messages as quote blocks
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

phoenix.commands.register({
  name: "reply",
  description: "Reply to a message: /reply <messageId> <text>",
  async execute(args, ctx) {
    const m = args.trim().match(/^(\d{15,25})\s+([\s\S]+)$/);
    if (!m || !ctx.channelId) return void ctx.reply("Usage: `/reply <messageId> <text>`");
    const res = await phoenix.discord.post(`/channels/${ctx.channelId}/messages`, {
      content: m[2],
      message_reference: { message_id: m[1], channel_id: ctx.channelId, fail_if_not_exists: false },
    });
    if (!res.ok) ctx.reply(`Reply failed (${res.status}): ${res.text().slice(0, 200)}`);
  },
});

phoenix.ui.addMessageAction({
  label: "Quick Quote",
  icon: "message.actions.copy",
  visible: (ctx) => !!ctx.message?.content,
  onPress(ctx) {
    const m = ctx.message;
    if (!m) return;
    const quote = m.content.split("\n").map((l) => `> ${l}`).join("\n") + `\n— <@${m.author.id}>\n`;
    phoenix.ui.copy(quote);
    phoenix.ui.toast("Quote copied");
  },
});
