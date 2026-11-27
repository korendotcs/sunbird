// @description Shows a message author's Discord badges (Staff, Partner, HypeSquad, Bug Hunter...) next to their name
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const BADGES: [bit: number, label: string][] = [
  [1 << 0, "Staff"],
  [1 << 1, "Partner"],
  [1 << 18, "Mod Alumni"],
  [1 << 2, "HypeSquad Events"],
  [1 << 3, "Bug Hunter"],
  [1 << 14, "Gold Bug Hunter"],
  [1 << 6, "Bravery"],
  [1 << 7, "Brilliance"],
  [1 << 8, "Balance"],
  [1 << 9, "Early Supporter"],
  [1 << 17, "Early Bot Dev"],
  [1 << 22, "Active Dev"],
];

phoenix.ui.addMessageAccessory({
  placement: "header",
  render({ message }) {
    const flags = message?.author.public_flags ?? 0;
    if (!flags) return null;
    const tags = BADGES.filter(([bit]) => flags & bit).map(([, label]) => `[${label}]`);
    return tags.length ? { text: tags.join(" "), color: 0xff5865f2 } : null;
  },
});
