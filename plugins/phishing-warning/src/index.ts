// @description Flag messages containing suspicious or phishing-looking links
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const URL_RE = /https?:\/\/[^\s<>()"']+/gi;
const SAFE = /(^|\.)(discord\.(com|gg|media|gift|new|dev|co)|discordapp\.(com|net)|discordstatus\.com|discord-activities\.com)$/i;
// Lookalikes of discord / steam / nitro bait. Checked only on hosts that aren't the real ones.
const LOOKALIKE = /discorcl|dlscord|d1scord|disc0rd|dicsord|discrod|disocrd|discordd|discorb|dsicord|diiscord|discord-?(nitro|gift|app)s?\.(?!com$)|nitro[-_.]?(free|gift|drop)|free[-_.]?nitro|steamcommunlty|steamcommnuity|stearncommunity/i;

function reasons(raw: string): string[] {
  // No URL global in QuickJS: userinfo before '@' (if any), then host.
  const m = raw.match(/^https?:\/\/(?:([^/?#@]*)@)?(\[[^\]]*\]|[^/?#:]+)/i);
  if (!m) return [];
  const host = m[2].toLowerCase();
  const out: string[] = [];
  if (host.split(".").some((l) => l.startsWith("xn--"))) out.push("punycode domain");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) out.push("raw IP link");
  if (m[1] !== undefined) out.push("credentials in URL");
  if (!SAFE.test(host) && LOOKALIKE.test(host)) out.push(`lookalike domain (${host})`);
  return out;
}

phoenix.ui.addMessageAccessory({
  placement: "content",
  priority: 100,
  render(ctx) {
    const text = ctx.message?.content;
    if (!text) return null;
    const found = new Set<string>();
    for (const m of text.match(URL_RE) ?? []) for (const r of reasons(m)) found.add(r);
    if (!found.size) return null;
    return { text: `⚠️ Suspicious link: ${[...found].join(", ")}. Don't log in or enter details.`, color: 0xffda373c };
  },
});
