// @description Adds a message action to unsuppress hidden embeds on your messages
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const SUPPRESS_EMBEDS = 1 << 2;

phoenix.ui.addMessageAction({
  label: "Unsuppress Embeds",
  visible(ctx) {
    const flags = ctx.message?.flags ?? 0;
    return (flags & SUPPRESS_EMBEDS) !== 0;
  },
  async onPress(ctx) {
    if (!ctx.channelId || !ctx.messageId) return;
    const flags = (ctx.message?.flags ?? 0) & ~SUPPRESS_EMBEDS;
    try {
      await phoenix.discord.patch(`/channels/${ctx.channelId}/messages/${ctx.messageId}`, { flags });
      phoenix.ui.toast("Embeds unsuppressed");
    } catch (err) {
      phoenix.ui.toast(`Failed to unsuppress: ${err}`);
    }
  },
});
