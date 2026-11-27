// @description Adds a "Copy Mention" action to every message to quickly copy <@userId>
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

phoenix.ui.addMessageAction({
  label: "Copy Mention",
  onPress(ctx) {
    const id = ctx.message?.author?.id;
    if (!id) return;
    phoenix.ui.copy(`<@${id}>`);
    phoenix.ui.toast(`Copied mention for ${ctx.message?.author?.username ?? id}`);
  },
});
