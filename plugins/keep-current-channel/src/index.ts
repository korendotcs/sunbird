// @description Remembers the last channel you talked in and jumps back with /lastchannel
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

interface Last {
  channelId: string;
  guildId: string | null;
  at: number;
}

const { storage } = phoenix;
let me: string | null = null;
phoenix.discord.me().then((u) => (me = u?.id ?? null)).catch(() => {});

const save = (channelId: string | null | undefined, guildId?: string | null) => {
  if (!channelId) return;
  const prev = storage.get<Last>("last");
  // Keep a known guild id when a later source (onSend) doesn't know it.
  const guild = guildId !== undefined ? guildId : prev?.channelId === channelId ? prev.guildId : null;
  storage.set("last", { channelId, guildId: guild, at: Date.now() } satisfies Last);
};

phoenix.messages.onSend((_text, ctx) => {
  me ??= ctx.currentUserId;
  save(ctx.channelId);
});

phoenix.on(phoenix.gateway.messageCreate, (m) => {
  if (me && m.author?.id === me) save(m.channel_id, m.guild_id ?? null);
});

phoenix.ui.addMessageAction({
  label: "Remember This Channel",
  priority: -10,
  onPress(ctx) {
    save(ctx.channelId);
    phoenix.ui.toast("Channel saved");
  },
});

phoenix.commands.register({
  name: "lastchannel",
  description: "Show the last channel you talked in, with a jump link",
  async execute(_args, ctx) {
    const last = storage.get<Last>("last");
    if (!last) return void ctx.reply("No channel saved yet. Send a message somewhere first.");
    const url = `https://discord.com/channels/${last.guildId ?? "@me"}/${last.channelId}`;
    const text = [
      `Channel: <#${last.channelId}> (${last.channelId})`,
      `Server:  ${last.guildId ?? "DM / unknown"}`,
      `Saved:   ${new Date(last.at).toLocaleString()}`,
      "",
      url,
    ].join("\n");
    const i = await phoenix.ui.showSheet({ title: "📌 Last channel", text, options: ["Open", "Copy link"] });
    if (i === 0 && phoenix.ui.openUrl) phoenix.ui.openUrl(url);
    else if (i >= 0) phoenix.ui.copy(url), phoenix.ui.toast("Link copied");
  },
});
