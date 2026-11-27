// @description Shows a subtle 📌 Pinned marker next to pinned messages
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const accessory = phoenix.ui.addMessageAccessory({
  placement: "header",
  render: (ctx) => (ctx.message?.pinned ? { text: "📌 Pinned", color: 0xff949ba4 } : null),
});

// Pinning arrives as a MESSAGE_UPDATE carrying `pinned`, so redraw that row.
phoenix.on(phoenix.gateway.messageUpdate, (m) => {
  if (m?.id && typeof m.pinned === "boolean") accessory.update?.(m.id);
});
