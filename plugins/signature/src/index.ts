// @description Appends a custom signature to the end of every message you send
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const settings = phoenix.settings.define({
  signature: {
    type: "text",
    title: "Signature Text",
    description: "Appended to the end of outgoing messages",
    default: "",
  },
  newline: {
    type: "switch",
    title: "Put on New Line",
    description: "Add a line break before the signature",
    default: true,
  },
});

phoenix.messages.onSend((text) => {
  const sig = (settings.signature || "").trim();
  if (!sig || !text.trim() || text.startsWith("/")) return;
  const sep = settings.newline ? "\n" : " ";
  return `${text}${sep}${sig}`;
});
