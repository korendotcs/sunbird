// @description Converts natural times like "5:30pm" or "in 10m" into Discord <t:unix:R> timestamps before sending
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const settings = phoenix.settings.define({
  format: {
    type: "select",
    title: "Timestamp Format",
    description: "Discord timestamp style for converted times",
    options: [
      { label: "Relative (in 10 minutes)", value: "R" },
      { label: "Short Time (5:30 PM)", value: "t" },
      { label: "Short Date/Time", value: "f" },
      { label: "Long Date/Time", value: "F" },
    ],
    default: "R",
  },
});

function parseRelative(text: string, fmt: string): string {
  let out = text.replace(
    /\bin\s+(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)\b/gi,
    (_, n: string, unit: string) => {
      const val = parseInt(n, 10);
      const u = unit.toLowerCase()[0];
      const mult = u === "s" ? 1 : u === "m" ? 60 : u === "h" ? 3600 : 86400;
      const unix = Math.floor(Date.now() / 1000) + val * mult;
      return `<t:${unix}:${fmt}>`;
    },
  );
  out = out.replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (match, hStr: string, mStr: string, ap: string) => {
    let h = parseInt(hStr, 10);
    const m = mStr ? parseInt(mStr, 10) : 0;
    if (h < 1 || h > 12 || m > 59) return match;
    if (ap.toLowerCase() === "pm" && h !== 12) h += 12;
    if (ap.toLowerCase() === "am" && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() < Date.now() - 60_000) d.setDate(d.getDate() + 1);
    return `<t:${Math.floor(d.getTime() / 1000)}:${fmt}>`;
  });
  return out;
}

phoenix.messages.onSend((text) => {
  const converted = parseRelative(text, settings.format || "R");
  return converted === text ? undefined : converted;
});

phoenix.commands.register({
  name: "timestamp",
  description: "Convert a time expression (e.g. 'in 15m' or '8:30pm') into a Discord timestamp",
  execute(args) {
    if (!args.trim()) return "Usage: `/timestamp in 15m` or `/timestamp 8:30pm`";
    return parseRelative(args.trim(), settings.format || "R");
  },
});
