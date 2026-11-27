// @description Automatically prepends @silent to outgoing messages so recipients are not pinged
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const settings = phoenix.settings.define({
  active: {
    type: "switch",
    title: "Send Messages Silently",
    description: "Prepend @silent to every outgoing message while enabled",
    default: true,
  },
});

phoenix.messages.onSend((text) => {
  if (!settings.active) return;
  if (!text.trim() || text.startsWith("@silent ") || text.startsWith("/")) return;
  return `@silent ${text}`;
});
