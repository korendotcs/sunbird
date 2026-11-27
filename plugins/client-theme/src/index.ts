// @description Custom GPUI client theme presets (AMOLED, Catppuccin Mocha, Nord, Dracula, Tokyo Night, Rose Pine) via native Mana palette hook
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const PRESETS: Record<string, Record<string, string>> = {
  default: {},
  amoled: {
    "app-frame-background": "#000000ff",
    "background-base-lowest": "#000000ff",
    "background-base-lower": "#050507ff",
    "background-base-low": "#0a0a0eff",
    "background-surface-high": "#101016ff",
    "background-surface-higher": "#16161eff",
    "background-surface-highest": "#1c1c26ff",
    "chat-background": "#000000ff",
    "chat-background-default": "#000000ff",
    "channel-textarea-background": "#0f0f14ff",
  },
  catppuccin: {
    "app-frame-background": "#11111bff",
    "background-base-lowest": "#11111bff",
    "background-base-lower": "#181825ff",
    "background-base-low": "#1e1e2eff",
    "background-surface-high": "#262637ff",
    "background-surface-higher": "#313244ff",
    "background-surface-highest": "#45475aff",
    "chat-background": "#1e1e2eff",
    "chat-background-default": "#1e1e2eff",
    "channel-textarea-background": "#262637ff",
    "background-accent": "#cba6f7ff",
    "text-default": "#cdd6f4ff",
  },
  nord: {
    "app-frame-background": "#242933ff",
    "background-base-lowest": "#242933ff",
    "background-base-lower": "#2e3440ff",
    "background-base-low": "#343b49ff",
    "background-surface-high": "#3b4252ff",
    "background-surface-higher": "#434c5eff",
    "background-surface-highest": "#4c566aff",
    "chat-background": "#2e3440ff",
    "chat-background-default": "#2e3440ff",
    "channel-textarea-background": "#3b4252ff",
    "background-accent": "#88c0d0ff",
    "text-default": "#eceff4ff",
  },
  dracula: {
    "app-frame-background": "#191a21ff",
    "background-base-lowest": "#191a21ff",
    "background-base-lower": "#21222cff",
    "background-base-low": "#282a36ff",
    "background-surface-high": "#343746ff",
    "background-surface-higher": "#44475aff",
    "background-surface-highest": "#52556aff",
    "chat-background": "#282a36ff",
    "chat-background-default": "#282a36ff",
    "channel-textarea-background": "#343746ff",
    "background-accent": "#bd93f9ff",
    "text-default": "#f8f8f2ff",
  },
  tokyonight: {
    "app-frame-background": "#13141cff",
    "background-base-lowest": "#13141cff",
    "background-base-lower": "#16161eff",
    "background-base-low": "#1a1b26ff",
    "background-surface-high": "#24283bff",
    "background-surface-higher": "#2f3549ff",
    "background-surface-highest": "#414868ff",
    "chat-background": "#1a1b26ff",
    "chat-background-default": "#1a1b26ff",
    "channel-textarea-background": "#24283bff",
    "background-accent": "#7aa2f7ff",
    "text-default": "#c0caf5ff",
  },
  rosepine: {
    "app-frame-background": "#12101eff",
    "background-base-lowest": "#12101eff",
    "background-base-lower": "#191724ff",
    "background-base-low": "#1f1d2eff",
    "background-surface-high": "#26233aff",
    "background-surface-higher": "#312e47ff",
    "background-surface-highest": "#403d52ff",
    "chat-background": "#191724ff",
    "chat-background-default": "#191724ff",
    "channel-textarea-background": "#26233aff",
    "background-accent": "#c4a7e7ff",
    "text-default": "#e0def4ff",
  },
};

const settings = phoenix.settings.define({
  preset: {
    type: "select",
    title: "Theme Preset",
    description: "Choose a custom GPUI theme preset (restart Discord Phoenix to apply)",
    default: "catppuccin",
    options: [
      { value: "default", label: "Default (Reset)" },
      { value: "amoled", label: "AMOLED Pure Black" },
      { value: "catppuccin", label: "Catppuccin Mocha" },
      { value: "nord", label: "Nord" },
      { value: "dracula", label: "Dracula" },
      { value: "tokyonight", label: "Tokyo Night" },
      { value: "rosepine", label: "Rosé Pine" },
    ],
  },
  accentOverride: {
    type: "text",
    title: "Custom Accent (#rrggbbaa)",
    description: "Optional hex color override for background-accent (e.g. #ff79c6ff)",
    default: "",
  },
});

let removeWebviewCss: (() => void) | null = null;

function syncWebviewTheme(merged: Record<string, string> | null) {
  if (removeWebviewCss) {
    removeWebviewCss();
    removeWebviewCss = null;
  }
  if (!merged || typeof phoenix.ui.addWebviewCss !== "function") return;
  const bg = merged["background-base-low"] || merged["chat-background"];
  const fg = merged["text-default"];
  const accent = merged["background-accent"];
  const rules: string[] = [];
  if (bg) rules.push(`:root{--sunbird-bg:${bg};} html,body{background-color:${bg};}`);
  if (fg) rules.push(`body{color:${fg};}`);
  if (accent) rules.push(`a{color:${accent};}`);
  if (rules.length > 0) {
    removeWebviewCss = phoenix.ui.addWebviewCss("preset", rules.join("\n"));
  }
}

function applyPreset(name: string, accent?: string) {
  if (typeof phoenix.ui.setThemeColors !== "function") {
    phoenix.ui.toast("ClientTheme requires macOS arm64 Sunbird");
    return;
  }
  const base = PRESETS[name];
  if (!base) {
    phoenix.ui.toast(`Unknown preset: ${name}`);
    return;
  }
  if (name === "default" && !accent) {
    phoenix.ui.setThemeColors(null);
    syncWebviewTheme(null);
    phoenix.ui.toast("Theme reset to default — restart Discord Phoenix to apply");
    return;
  }
  const merged: Record<string, string> = { ...base };
  const cleanAccent = (accent ?? "").trim();
  if (/^#[0-9a-fA-F]{8}$/.test(cleanAccent)) {
    merged["background-accent"] = cleanAccent;
  }
  phoenix.ui.setThemeColors(JSON.stringify({ all: merged }));
  syncWebviewTheme(merged);
  phoenix.ui.toast(`Saved "${name}" theme — restart Discord Phoenix to apply`);
}

applyPreset(settings.preset, settings.accentOverride);

phoenix.commands.register({
  name: "theme",
  description: "Switch ClientTheme preset: /theme <default|amoled|catppuccin|nord|dracula|tokyonight|rosepine>",
  async execute(args) {
    const names = Object.keys(PRESETS);
    let pick = args.trim().toLowerCase();
    if (!pick) {
      const idx = await phoenix.ui.choose({
        title: "Choose ClientTheme Preset",
        message: "Restart Discord Phoenix after selecting to apply the new Mana palette",
        options: names,
      });
      if (idx < 0) return;
      pick = names[idx];
    }
    applyPreset(pick, settings.accentOverride);
  },
});
