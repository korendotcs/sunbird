// @description Shows a server's total and online member counts, boosts and channel counts with /members
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const getJson = async (path: string): Promise<any> => {
  try {
    const res = await phoenix.discord.get(path);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
};

const guildOf = async (channelId: string | null): Promise<string | null> =>
  channelId ? (await getJson(`/channels/${channelId}`))?.guild_id ?? null : null;

async function show(guildId: string) {
  const [g, channels] = await Promise.all([getJson(`/guilds/${guildId}?with_counts=true`), getJson(`/guilds/${guildId}/channels`)]);
  if (!g?.id) return void phoenix.ui.toast("Couldn't load that server");
  const list: { type: number }[] = Array.isArray(channels) ? channels : [];
  const n = (types: number[]) => list.filter((c) => types.includes(c.type)).length;
  const total = g.approximate_member_count ?? 0;
  const online = g.approximate_presence_count ?? 0;
  const text = [
    `Members:  ${total.toLocaleString()}`,
    `Online:   ${online.toLocaleString()}${total ? ` (${Math.round((online / total) * 100)}%)` : ""}`,
    `Boosts:   ${g.premium_subscription_count ?? 0} (tier ${g.premium_tier ?? 0})`,
    `Channels: ${list.length} total`,
    `  text ${n([0, 5, 15, 16])} · voice ${n([2, 13])} · categories ${n([4])}`,
  ].join("\n");
  const i = await phoenix.ui.showSheet({ title: `👥 ${g.name}`, text, monospace: true, options: ["Copy"] });
  if (i === 0) phoenix.ui.copy(text);
}

phoenix.commands.register({
  name: "members",
  description: "Show member counts for this server (or a server id)",
  async execute(args, ctx) {
    const id = args.match(/\d{15,22}/)?.[0] ?? (await guildOf(ctx.channelId));
    if (!id) return void ctx.reply("Run /members in a server channel, or pass a server id.");
    await show(id);
  },
});

phoenix.ui.addMessageAction({
  label: "Server Member Count",
  async onPress(ctx) {
    const id = (ctx.message as Phoenix.GatewayMessage | undefined)?.guild_id ?? (await guildOf(ctx.channelId));
    if (!id) return void phoenix.ui.toast("Not a server channel");
    await show(id);
  },
});
