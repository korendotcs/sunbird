// @description Track who was recently typing and get notified when watched users start typing
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Notifications

interface TypingStart {
  channel_id: string;
  guild_id?: string;
  user_id: string;
  timestamp: number;
  member?: { nick?: string | null; user?: Phoenix.User };
}

const settings = phoenix.settings.define({
  notify: { type: "switch", title: "Notify for watched users", default: false },
  watched: {
    type: "text",
    title: "Watched user IDs",
    description: "One user ID per line (or comma separated)",
    multiline: true,
    default: "",
  },
  windowSec: { type: "number", title: "Recent window (seconds)", default: 60 },
});

// channelId -> userId -> { name, at }
const recent = new Map<string, Map<string, { name: string; at: number }>>();
const lastToast = new Map<string, number>();
const watched = () => new Set(settings.watched.split(/[\s,]+/).filter(Boolean));

const ev = phoenix.gateway.typingStart;
if (ev) {
  phoenix.on(ev, (raw) => {
    const p = raw as TypingStart;
    if (!p?.channel_id || !p.user_id) return;
    const u = p.member?.user;
    const name = p.member?.nick || u?.global_name || u?.username || p.user_id;
    let ch = recent.get(p.channel_id);
    if (!ch) recent.set(p.channel_id, (ch = new Map()));
    const now = Date.now();
    ch.set(p.user_id, { name, at: now });
    if (settings.notify && watched().has(p.user_id) && now - (lastToast.get(p.user_id) ?? 0) > 30_000) {
      lastToast.set(p.user_id, now);
      phoenix.ui.notify({ title: `${name} is typing…`, body: p.guild_id ? `in <#${p.channel_id}>` : "in your DMs" });
    }
  });
}

phoenix.commands.register({
  name: "typing",
  description: "Show who was recently typing in this channel",
  execute(_args, ctx) {
    if (!ev) return void ctx.reply("This client build has no typingStart event.");
    const cutoff = Date.now() - Math.max(5, settings.windowSec || 60) * 1000;
    const ch = ctx.channelId ? recent.get(ctx.channelId) : undefined;
    const rows = ch ? [...ch.entries()].filter(([, v]) => v.at >= cutoff).sort((a, b) => b[1].at - a[1].at) : [];
    if (!rows.length) return void ctx.reply("Nobody typed here recently.");
    ctx.reply("Recently typing:\n" + rows.map(([id, v]) => `• ${v.name} (<@${id}>) ${Math.round((Date.now() - v.at) / 1000)}s ago`).join("\n"));
  },
});
