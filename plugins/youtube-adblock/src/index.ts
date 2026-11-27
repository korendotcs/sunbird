// @description Blocks YouTube ads in Watch Together and embedded YouTube webviews (macOS desktop); toggle with /ytadblock
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const ui = phoenix.ui as Phoenix.Ui & { setYoutubeAdblock?: (b: boolean) => void };

const apply = (on: boolean) => {
  if (typeof ui.setYoutubeAdblock !== "function") return false;
  ui.setYoutubeAdblock(on);
  return true;
};

const settings = phoenix.settings.define({
  enabled: { type: "switch", title: "Block YouTube ads", default: true, onChange: (v) => (phoenix.storage.delete("enabled"), void apply(v)) },
});

const enabled = () => phoenix.storage.get<boolean>("enabled") ?? settings.enabled;

if (!apply(enabled())) phoenix.log.warn("setYoutubeAdblock unavailable on this runtime");
phoenix.onUnload(() => void apply(false));

phoenix.commands.register({
  name: "ytadblock",
  description: "YouTube AdBlock: on | off",
  execute(args, ctx) {
    const a = args.trim().toLowerCase();
    if (a && a !== "on" && a !== "off") return void ctx.reply("Usage: /ytadblock [on|off]");
    const on = a ? a === "on" : !enabled();
    phoenix.storage.set("enabled", on);
    phoenix.ui.toast(apply(on) ? `YouTube AdBlock ${on ? "on" : "off"}` : "YouTube AdBlock needs the macOS desktop app");
  },
});
