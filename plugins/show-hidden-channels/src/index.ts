// @description Reveal hidden/locked channels in server sidebars using native macOS arm64 binary patch (restart required)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const settings = phoenix.settings.define({
  enabled: {
    type: "switch",
    title: "Enable ShowHiddenChannels",
    description: "Patch Discord Phoenix's channel visibility checks on next launch",
    default: true,
  },
});

function sync(enabled: boolean) {
  if (typeof phoenix.ui.setShowHiddenChannels !== "function") {
    phoenix.ui.toast("ShowHiddenChannels requires macOS arm64 Sunbird");
    return;
  }
  phoenix.ui.setShowHiddenChannels(enabled);
}

sync(Boolean(settings.enabled));

phoenix.commands.register({
  name: "hiddenchannels",
  description: "Toggle native ShowHiddenChannels (/hiddenchannels on|off) — takes effect after restart",
  execute(args) {
    const arg = args.trim().toLowerCase();
    const next = arg === "off" ? false : true;
    sync(next);
    phoenix.ui.toast(
      next
        ? "ShowHiddenChannels enabled — restart Discord Phoenix to apply"
        : "ShowHiddenChannels disabled — restart Discord Phoenix to restore"
    );
  },
});
