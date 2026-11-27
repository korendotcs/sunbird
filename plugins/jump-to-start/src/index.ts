// @description Show the first message of a channel with a jump link
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

async function jump(channelId: string | null | undefined, guildId?: string) {
  if (!channelId) return phoenix.ui.toast("No channel open");
  const res = await phoenix.discord.get(`/channels/${channelId}/messages?after=0&limit=1`).catch(() => null);
  if (!res?.ok) return phoenix.ui.toast(`Could not load first message${res ? ` (${res.status})` : ""}`);
  const [m] = res.json() as Phoenix.Message[];
  if (!m) return phoenix.ui.toast("Channel has no messages");
  const gid = guildId ?? (m as Phoenix.GatewayMessage).guild_id ?? (await guildOf(channelId));
  const link = `https://discord.com/channels/${gid ?? "@me"}/${channelId}/${m.id}`;
  const author = m.author.global_name || m.author.username;
  const date = new Date(m.timestamp).toUTCString();
  const text = `${author} (@${m.author.username})\n${date}\n\n${m.content || "(no text content)"}\n\n${link}`;
  const i = await phoenix.ui.showSheet({ title: "⏮ First message", text, options: ["Copy Link", "Open"] });
  if (i === 0) {
    phoenix.ui.copy(link);
    phoenix.ui.toast("Link copied");
  } else if (i === 1) {
    if (phoenix.ui.openUrl) phoenix.ui.openUrl(link);
    else phoenix.ui.copy(link), phoenix.ui.toast("Opening links is desktop only, link copied");
  }
}

async function guildOf(channelId: string): Promise<string | undefined> {
  const res = await phoenix.discord.get(`/channels/${channelId}`).catch(() => null);
  return res?.ok ? (res.json() as Phoenix.Channel).guild_id ?? undefined : undefined;
}

phoenix.ui.addMessageAction({
  label: "Jump to Start of Channel",
  icon: "message.actions.reply",
  onPress: (ctx) => void jump(ctx.message?.channel_id ?? ctx.channelId, (ctx.message as Phoenix.GatewayMessage | undefined)?.guild_id),
});

phoenix.commands.register({
  name: "jumpstart",
  description: "Show the first message in this channel",
  execute: (_args, ctx) => jump(ctx.channelId),
});
