// @description Adds a "Repeat Message" action to resend any message's text in the current channel
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Fun

phoenix.ui.addMessageAction({
  label: "Repeat Message",
  visible(ctx) {
    return Boolean(ctx.message?.content?.trim());
  },
  async onPress(ctx) {
    const content = ctx.message?.content?.trim();
    if (!content || !ctx.channelId) return;
    try {
      await phoenix.discord.post(`/channels/${ctx.channelId}/messages`, { content });
    } catch (err) {
      phoenix.ui.toast(`Repeat failed: ${err}`);
    }
  },
});
