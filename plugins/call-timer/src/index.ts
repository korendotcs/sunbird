// @description Times your voice calls: /calltime shows elapsed time, and a toast shows the total when you leave
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const { gateway, discord, ui } = phoenix;

let me: string | null = null;
let channel: string | null = null;
let startedAt = 0;

const on = (sig: Phoenix.Sig<unknown> | undefined, fn: (p: any) => void) => sig && phoenix.on(sig, fn);
on(gateway.ready, (r: Phoenix.Ready) => (me = r.user.id));
discord.me().then((u) => (me ??= u?.id ?? null)).catch(() => {});

function format(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
}

on(gateway.voiceStateUpdate, (s: { user_id?: string; channel_id?: string | null }) => {
  if (!me || s.user_id !== me) return;
  const next = s.channel_id ?? null;
  if (next === channel) return;
  if (channel && startedAt) ui.toast(`Call ended after ${format(Date.now() - startedAt)}`);
  channel = next;
  startedAt = next ? Date.now() : 0;
});

phoenix.commands.register({
  name: "calltime",
  description: "Show how long you've been in your current voice call",
  execute(_args, ctx) {
    ctx.reply(startedAt ? `In call for **${format(Date.now() - startedAt)}** (<#${channel}>)` : "You're not in a voice call.");
  },
});
