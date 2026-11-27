// @description Local-only themed profile effect badge on your own messages (/profileeffect)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Fun

const PRESETS = {
  none: { label: "None", badge: "", color: 0, art: "" },
  sakura: { label: "Sakura Dreams", badge: "🌸 Sakura Dreams", color: 0xffff8fb8, art: "  🌸   ✿    🌸\n✿   petals drift   ✿\n  🌸   ✿    🌸" },
  cyberpunk: { label: "Cyberpunk Glitch", badge: "⚡ Cyberpunk Glitch", color: 0xfff7e600, art: "▓▒░ G L ! T C H ░▒▓\n01001 ⚡ 10110\n▓▒░ ░▒▓ ▓▒░ ░▒▓" },
  starlight: { label: "Starlight", badge: "✨ Starlight", color: 0xffb8c6ff, art: "  ✦    ·   ✧\n·   ✨ starlight ✨   ·\n  ✧    ·   ✦" },
  dragon: { label: "Dragon Flame", badge: "🐉 Dragon Flame", color: 0xffff5a1f, art: "🔥🔥  🐉  🔥🔥\n  ~ fire breath ~\n🔥🔥🔥🔥🔥🔥🔥" },
  aurora: { label: "Aurora", badge: "🌌 Aurora", color: 0xff4fe3c1, art: "≋≋≋≋≋≋≋≋≋≋≋≋\n  🌌 aurora borealis\n≈≈≈≈≈≈≈≈≈≈≈≈" },
  neon: { label: "Neon Pulse", badge: "💜 Neon Pulse", color: 0xffd04dff, art: "▌▌ NEON ▐▐\n💜 pulse ∿∿∿ pulse 💜\n▌▌ ░░░░ ▐▐" },
} as const;
type PresetId = keyof typeof PRESETS;
const IDS = Object.keys(PRESETS) as PresetId[];

const settings = phoenix.settings.define({
  effect: {
    type: "select",
    title: "Profile Effect",
    description: "Shown only to you, as a badge under your messages",
    default: "none",
    options: IDS.map((value) => ({ value, label: PRESETS[value].label })),
    // Settings pick wins over an earlier /profileeffect choice.
    onChange: () => {
      phoenix.storage.delete("effect");
      accessory.update?.();
    },
  },
});

const current = (): PresetId => phoenix.storage.get<PresetId>("effect") ?? (settings.effect as PresetId) ?? "none";

const accessory = phoenix.ui.addMessageAccessory({
  priority: -10,
  render(ctx) {
    const p = PRESETS[current()] ?? PRESETS.none;
    if (!p.badge || !ctx.currentUserId || ctx.message?.author.id !== ctx.currentUserId) return null;
    return { text: p.badge, color: p.color };
  },
});

function setEffect(id: PresetId) {
  phoenix.storage.set("effect", id);
  accessory.update?.();
}

phoenix.commands.register({
  name: "profileeffect",
  description: "Pick or preview a local profile effect: /profileeffect [name]",
  async execute(args) {
    const q = args.trim().toLowerCase();
    let id: PresetId | undefined = q ? IDS.find((k) => k === q || PRESETS[k].label.toLowerCase().includes(q)) : undefined;
    if (q && !id) return void phoenix.ui.toast(`Unknown effect. Options: ${IDS.map((k) => PRESETS[k].label).join(", ")}`);
    if (!id) {
      const idx = await phoenix.ui.choose({
        title: "Profile Effect",
        options: IDS.map((k) => (k === current() ? `✓ ${PRESETS[k].label}` : PRESETS[k].label)),
      });
      if (idx < 0) return;
      id = IDS[idx];
    }
    setEffect(id);
    const p = PRESETS[id];
    if (id === "none") return void phoenix.ui.toast("Profile effect cleared");
    await phoenix.ui.showSheet({
      title: `Preview — ${p.label}`,
      text: `${p.art}\n\nBadge on your messages: ${p.badge}\n(Visible only on this device)`,
      monospace: true,
    });
  },
});
