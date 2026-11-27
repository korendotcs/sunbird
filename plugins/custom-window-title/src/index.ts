// @description Customize the Discord Phoenix macOS window title (/title)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const settings = phoenix.settings.define({
  title: {
    type: "text",
    title: "Window Title",
    description: "Custom title applied to the Discord Phoenix window",
    default: "Discord Phoenix — Sunbird",
  },
});

function applyTitle(title: string) {
  if (typeof phoenix.ui.setWindowTitle === "function") {
    phoenix.ui.setWindowTitle(title);
  }
}

if (settings.title) {
  applyTitle(settings.title);
}

phoenix.commands.register({
  name: "title",
  description: "Set a custom macOS window title (/title <text>)",
  execute(args) {
    const next = args.trim() || settings.title || "Discord";
    applyTitle(next);
    phoenix.ui.toast(`Window title set to "${next}"`);
  },
});
