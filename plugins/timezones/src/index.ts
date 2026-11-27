// @description Set people's timezones and see their local time next to their messages (/tz @user Europe/Berlin)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const { storage, ui } = phoenix;

const COMMON = [
  "UTC", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo",
  "Europe/London", "Europe/Berlin", "Europe/Moscow", "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

// QuickJS has no Intl, so IANA offsets come from timeapi.io; "UTC+5:30" style zones need no lookup.
const FIXED = /^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i;
const offsets = new Map<string, { min: number; at: number }>();
const HOUR = 3_600_000;

async function offsetOf(zone: string): Promise<number | null> {
  if (/^(UTC|GMT)$/i.test(zone)) return 0;
  const f = FIXED.exec(zone);
  if (f) return (f[1] === "-" ? -1 : 1) * (Number(f[2]) * 60 + Number(f[3] ?? 0));
  const hit = offsets.get(zone);
  if (hit && Date.now() - hit.at < 6 * HOUR) return hit.min;
  try {
    const res = await phoenix.fetch(`https://timeapi.io/api/timezone/zone?timeZone=${encodeURIComponent(zone)}`);
    if (!res.ok) return null;
    const min = Math.round(res.json<{ currentUtcOffset: { seconds: number } }>().currentUtcOffset.seconds / 60);
    offsets.set(zone, { min, at: Date.now() });
    return min;
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
async function localTime(zone: string) {
  const min = await offsetOf(zone);
  if (min == null) return null;
  const d = new Date(Date.now() + min * 60_000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const zoneOf = (user: string) => storage.get<string>(`tz:${user}`);

const accessory = ui.addMessageAccessory({
  placement: "header",
  async render({ message }) {
    const zone = message && zoneOf(message.author.id);
    const time = zone && (await localTime(zone));
    return time ? { text: `🕒 ${time}`, color: 0xff949ba4 } : null;
  },
});

// Accessories are kept until updated and the runtime has no timers, so incoming messages
// trigger a redraw at most every 5 minutes to keep shown times current.
let redrawn = Date.now();
phoenix.on(phoenix.gateway.messageCreate, () => {
  if (Date.now() - redrawn < 5 * 60_000) return;
  redrawn = Date.now();
  accessory.update?.();
});

async function save(user: string, zone: string | null) {
  if (!zone) storage.delete(`tz:${user}`);
  else {
    if ((await offsetOf(zone)) == null) return `Unknown timezone \`${zone}\`. Use an IANA name like \`Europe/Berlin\` or an offset like \`UTC+5:30\`.`;
    storage.set(`tz:${user}`, zone);
  }
  accessory.update?.();
  return zone ? `Timezone for <@${user}> set to \`${zone}\` (${await localTime(zone)} now).` : `Timezone for <@${user}> cleared.`;
}

phoenix.ui.addMessageAction({
  label: "Set Timezone",
  async onPress({ message }) {
    if (!message) return;
    const current = zoneOf(message.author.id);
    const pick = await ui.choose({ title: `Timezone for ${message.author.global_name || message.author.username}`, options: [...COMMON, ...(current ? [{ label: "Clear", danger: true }] : [])] });
    if (pick < 0) return;
    const zone = COMMON[pick] ?? null;
    await save(message.author.id, zone);
    ui.toast(zone ? `Timezone set to ${zone}` : "Timezone cleared");
  },
});

phoenix.commands.register({
  name: "tz",
  description: "Set or show a user's timezone: /tz @user Europe/Berlin, /tz @user clear, /tz @user",
  async execute(args, ctx) {
    const m = /^(?:<@!?)?(\d{15,22})>?\s*(.*)$/.exec(args.trim());
    const user = m?.[1] ?? ctx.currentUserId;
    const zone = (m ? m[2] : args).trim();
    if (!user) return void ctx.reply("Usage: `/tz @user Europe/Berlin`");
    if (!zone) {
      const z = zoneOf(user);
      return void ctx.reply(z ? `<@${user}> is in \`${z}\`, it's ${(await localTime(z)) ?? "?"} there.` : `No timezone set for <@${user}>.`);
    }
    ctx.reply(await save(user, /^(clear|none|reset)$/i.test(zone) ? null : zone));
  },
});
