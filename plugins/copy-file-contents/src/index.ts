// @description Adds a message action to fetch and copy text file attachments to your clipboard
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const TEXT_EXTS = /\.(txt|md|json|js|ts|tsx|jsx|rs|py|c|cpp|h|hpp|go|java|sh|yml|yaml|toml|xml|html|css|log|csv|ini|cfg|conf|sql|env)$/i;

function findTextAttachment(msg: Phoenix.Message | undefined) {
  return msg?.attachments?.find(
    (a) =>
      (a.content_type && (a.content_type.startsWith("text/") || a.content_type.includes("json") || a.content_type.includes("javascript"))) ||
      TEXT_EXTS.test(a.filename),
  );
}

phoenix.ui.addMessageAction({
  label: "Copy File Contents",
  visible(ctx) {
    return Boolean(findTextAttachment(ctx.message));
  },
  async onPress(ctx) {
    const att = findTextAttachment(ctx.message);
    if (!att) return;
    try {
      const res = await phoenix.fetch(att.url);
      if (!res.ok) {
        phoenix.ui.toast(`Failed to fetch ${att.filename} (${res.status})`);
        return;
      }
      const text = res.text();
      phoenix.ui.copy(text);
      phoenix.ui.toast(`Copied ${att.filename} (${text.length} chars)`);
    } catch (err) {
      phoenix.ui.toast(`Error: ${err}`);
    }
  },
});
