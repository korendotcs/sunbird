// @description Shows server name, online/member counts and expiry under discord.gg invite links
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const INVITE = /(?:discord(?:app)?\.com\/invite|discord\.gg)\/([\w-]{2,32})/gi;

type Invite = {
  guild?: { name?: string };
  channel?: { name?: string };
  approximate_member_count?: number;
  approximate_presence_count?: number;
  expires_at?: string | null;
};

function until(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `expires in ${Math.floor(h / 24)}d` : h ? `expires in ${h}h` : `expires in ${Math.ceil(ms / 60_000)}m`;
}

const cache = new Map<string, Promise<string>>();

function describe(code: string) {
  let p = cache.get(code);
  if (!p) {
    p = phoenix.discord
      .get(`/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`)
      .then((res) => {
        if (!res.ok) return `📨 ${code}: invalid or expired invite`;
        const inv = res.json<Invite>();
        const name = inv.guild?.name ?? (inv.channel?.name ? `#${inv.channel.name}` : "Group DM");
        const parts = [`📨 ${name}`];
        if (inv.approximate_presence_count != null) parts.push(`🟢 ${inv.approximate_presence_count.toLocaleString()} online`);
        if (inv.approximate_member_count != null) parts.push(`👥 ${inv.approximate_member_count.toLocaleString()} members`);
        parts.push(inv.expires_at ? until(inv.expires_at) : "never expires");
        return parts.join(" · ");
      })
      .catch(() => {
        cache.delete(code);
        return "";
      });
    cache.set(code, p);
  }
  return p;
}

phoenix.ui.addMessageAccessory({
  placement: "content",
  async render({ message }) {
    const codes = [...new Set([...(message?.content ?? "").matchAll(INVITE)].map((m) => m[1]))].slice(0, 3);
    if (!codes.length) return null;
    const lines = (await Promise.all(codes.map(describe))).filter(Boolean);
    return lines.length ? lines.join("\n") : null;
  },
});
