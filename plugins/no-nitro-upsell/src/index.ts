// @description Hides the composer gift button and the DM sidebar Nitro & Shop rows; toggle with /nonitro
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const ui = phoenix.ui as Phoenix.Ui & { setNoNitroUpsell?: (b: boolean) => void };

let unhideGift: Phoenix.Remover | null = null;
const applyGift = (on: boolean) => {
  if (on && !unhideGift && typeof ui.hide === "function") unhideGift = ui.hide("composer.gift");
  if (!on && unhideGift) unhideGift(), (unhideGift = null);
};
const applySidebar = (on: boolean) => {
  if (typeof ui.setNoNitroUpsell !== "function") return false;
  ui.setNoNitroUpsell(on);
  return true;
};

const settings = phoenix.settings.define({
  hideGiftButton: { type: "switch", title: "Hide gift button", default: true, onChange: applyGift },
  hideSidebarNitroShop: {
    type: "switch",
    title: "Hide Nitro & Shop in DM sidebar",
    description: "Takes effect after restarting Discord (macOS desktop)",
    default: true,
    onChange: (v) => void applySidebar(v),
  },
});

const enabled = () => phoenix.storage.get<boolean>("enabled") ?? true;
const applyAll = (on: boolean) => {
  applyGift(on && settings.hideGiftButton);
  return applySidebar(on && settings.hideSidebarNitroShop);
};

applyAll(enabled());
phoenix.onUnload(() => applyGift(false));

phoenix.commands.register({
  name: "nonitro",
  description: "No Nitro upsell: on | off",
  execute(args, ctx) {
    const a = args.trim().toLowerCase();
    if (a && a !== "on" && a !== "off") return void ctx.reply("Usage: /nonitro [on|off]");
    const on = a ? a === "on" : !enabled();
    phoenix.storage.set("enabled", on);
    const native = applyAll(on);
    phoenix.ui.toast(`No Nitro upsell ${on ? "on" : "off"}${native ? " · sidebar change applies after restart" : ""}`);
  },
});
