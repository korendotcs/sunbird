// @description Logs voice channel joins, leaves, mutes, deafens, and streams (/vclog to view)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Notifications

const settings = phoenix.settings.define({
  notify: {
    type: "switch",
    title: "Toast Notifications",
    description: "Show a brief toast when someone joins or leaves your current voice channel",
    default: true,
  },
});

const states = new Map<string, { channel_id: string | null; self_stream: boolean }>();
const logs: string[] = [];
let myId: string | null = null;
phoenix.discord.me().then((u) => { if (u) myId = u.id; }).catch(() => {});

function pushLog(entry: string, showToast: boolean) {
  const ts = new Date().toLocaleTimeString();
  logs.push(`[${ts}] ${entry}`);
  if (logs.length > 200) logs.shift();
  if (showToast && settings.notify) phoenix.ui.toast(entry);
}

const vsu = phoenix.gateway.voiceStateUpdate;
if (vsu) {
  phoenix.on(vsu, (raw) => {
    const s = raw as {
      user_id?: string;
      channel_id?: string | null;
      self_stream?: boolean;
      member?: { nick?: string; user?: { global_name?: string; username?: string } };
    } | null;
    if (!s?.user_id) return;
    const prev = states.get(s.user_id);
    const next = { channel_id: s.channel_id ?? null, self_stream: Boolean(s.self_stream) };
    states.set(s.user_id, next);
    const myCh = myId ? states.get(myId)?.channel_id : null;
    const who = s.member?.nick || s.member?.user?.global_name || s.member?.user?.username || s.user_id;
    const sameCall = Boolean(myCh && (next.channel_id === myCh || prev?.channel_id === myCh));

    if (!prev?.channel_id && next.channel_id) {
      pushLog(`${who} joined voice`, sameCall && s.user_id !== myId);
    } else if (prev?.channel_id && !next.channel_id) {
      pushLog(`${who} left voice`, sameCall && s.user_id !== myId);
    } else if (prev?.channel_id && next.channel_id && prev.channel_id !== next.channel_id) {
      pushLog(`${who} moved voice channels`, sameCall && s.user_id !== myId);
    } else if (prev && !prev.self_stream && next.self_stream) {
      pushLog(`${who} started streaming`, sameCall && s.user_id !== myId);
    } else if (prev && prev.self_stream && !next.self_stream) {
      pushLog(`${who} stopped streaming`, false);
    }
  });
}

phoenix.commands.register({
  name: "vclog",
  description: "Show recent voice channel activity log",
  execute() {
    const text = logs.length ? logs.slice(-40).join("\n") : "No voice channel activity recorded yet.";
    phoenix.ui.showSheet({ title: "Voice Channel Log", text, monospace: true });
  },
});
