// @description Reverses outgoing messages (toggle in settings or use /reverse)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Fun

const settings = phoenix.settings.define({
  auto: {
    type: "switch",
    title: "Reverse Every Message",
    description: "Automatically reverse all outgoing messages",
    default: false,
  },
});

const rev = (s: string) => Array.from(s).reverse().join("");

phoenix.messages.onSend((text) => {
  if (!settings.auto || !text.trim() || text.startsWith("/")) return;
  return rev(text);
});

phoenix.commands.register({
  name: "reverse",
  description: "Send your text reversed",
  execute(args) {
    return args.trim() ? rev(args) : undefined;
  },
});
