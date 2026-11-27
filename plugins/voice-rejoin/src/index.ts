// @description Remembers your last voice channel: /rejoin links back to it, and you're notified on unexpected disconnects
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const { gateway, discord, storage, ui } = phoenix;

type Last = { guild_id: string | null; channel_id: string; at: number };

let me: string | null = null;
let current: string | null = null;
let leaving = false;

const on = (sig: Phoenix.Sig<unknown> | undefined, fn: (p: any) => void) => sig && phoenix.on(sig, fn);
on(gateway.ready, (r: Phoenix.Ready) => (me = r.user.id));
discord.me().then((u) => (me ??= u?.id ?? null)).catch(() => {});

// Our own OP 4 with no channel means the user chose to leave.
gateway.onSend(4, (d) => {
  if (!d.channel_id) leaving = true;
});

on(gateway.voiceStateUpdate, (s: { user_id?: string; guild_id?: string | null; channel_id?: string | null }) => {
  if (!me || s.user_id !== me) return;
  if (s.channel_id) {
    current = s.channel_id;
    leaving = false;
    storage.set("last", { guild_id: s.guild_id ?? null, channel_id: s.channel_id, at: Date.now() } satisfies Last);
    return;
  }
  if (current && !leaving) {
    ui.notify({ title: "Disconnected from voice", body: "Type /rejoin to get back to the channel", durationMs: 8000 });
  }
  current = null;
  leaving = false;
});

phoenix.commands.register({
  name: "rejoin",
  description: "Link back to the last voice channel you were in",
  execute(_args, ctx) {
    const last = storage.get<Last>("last");
    if (!last) return void ctx.reply("No voice channel remembered yet.");
    if (current === last.channel_id) return void ctx.reply(`You're already in <#${last.channel_id}>.`);
    // No API joins voice directly, so post the channel mention: tapping it opens the channel to join.
    ctx.reply(`Last voice channel: <#${last.channel_id}> — tap to rejoin.\nhttps://discord.com/channels/${last.guild_id ?? "@me"}/${last.channel_id}`);
  },
});
