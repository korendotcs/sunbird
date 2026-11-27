// @description Adds actions to copy a user's Discord profile URL and avatar URL from any message
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

phoenix.ui.addMessageAction({
  label: "Copy User URL",
  onPress(ctx) {
    const id = ctx.message?.author?.id;
    if (!id) return;
    const url = `https://discord.com/users/${id}`;
    phoenix.ui.copy(url);
    phoenix.ui.toast(`Copied ${url}`);
  },
});

phoenix.ui.addMessageAction({
  label: "Copy Avatar URL",
  visible(ctx) {
    return Boolean(ctx.message?.author?.avatar);
  },
  onPress(ctx) {
    const a = ctx.message?.author;
    if (!a?.avatar) return;
    const ext = a.avatar.startsWith("a_") ? "gif" : "png";
    const url = `https://cdn.discordapp.com/avatars/${a.id}/${a.avatar}.${ext}?size=4096`;
    phoenix.ui.copy(url);
    phoenix.ui.toast("Copied full-resolution avatar URL");
  },
});
