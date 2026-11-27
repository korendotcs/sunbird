// @description Pin Discord Phoenix above all other macOS windows (/ontop)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const settings = phoenix.settings.define({
  enabled: {
    type: "switch",
    title: "Keep Window Always on Top",
    description: "Float Discord Phoenix above other macOS windows",
    default: true,
  },
});

let pinned = Boolean(settings.enabled);

function apply(state: boolean) {
  pinned = state;
  if (typeof phoenix.ui.setAlwaysOnTop === "function") {
    phoenix.ui.setAlwaysOnTop(state);
    phoenix.ui.toast(state ? "Discord pinned Always on Top" : "Always on Top disabled");
  } else {
    phoenix.ui.toast("Always on Top requires macOS Sunbird");
  }
}

if (pinned && typeof phoenix.ui.setAlwaysOnTop === "function") {
  phoenix.ui.setAlwaysOnTop(true);
}

phoenix.commands.register({
  name: "ontop",
  description: "Toggle Always on Top for the Discord window (/ontop [on|off])",
  execute(args) {
    const arg = args.trim().toLowerCase();
    if (arg === "on") apply(true);
    else if (arg === "off") apply(false);
    else apply(!pinned);
  },
});
