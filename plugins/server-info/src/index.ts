// @description Adds /serverinfo showing a server's name, ID, creation date and member, channel, role and boost counts
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const cache = new Map<string, any>();
const channelGuild = new Map<string, string>();

const on = (event: string, fn: (payload: any) => void) => {
  const sig = phoenix.gateway[event];
  if (sig) phoenix.on(sig as Phoenix.Sig<any>, fn);
};

const ingest = (g: any) => {
  if (!g?.id) return;
  const merged = { ...cache.get(g.id), ...g.properties, ...g };
  cache.set(g.id, merged);
  for (const c of g.channels ?? []) channelGuild.set(c.id, g.id);
};
on("ready", (r) => (r?.guilds ?? []).forEach(ingest));
on("guildCreate", ingest);
on("guildUpdate", ingest);
on("channelCreate", (c) => c?.guild_id && channelGuild.set(c.id, c.guild_id));

const getJson = async (path: string): Promise<any> => {
  try {
    const res = await phoenix.discord.get(path);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
};

const guildOf = async (channelId: string) =>
  channelGuild.get(channelId) ?? (await getJson(`/channels/${channelId}`))?.guild_id ?? null;

const created = (id: string) => new Date(Number(BigInt(id) >> 22n) + 1420070400000);
const VERIFICATION = ["None", "Low", "Medium", "High", "Highest"];

phoenix.commands.register({
  name: "serverinfo",
  description: "Show info about this server (or a server id)",
  async execute(args, ctx) {
    const guildId = args.match(/\d{15,22}/)?.[0] ?? (ctx.channelId ? await guildOf(ctx.channelId) : null);
    if (!guildId) return void ctx.reply("Run `/serverinfo` in a server channel, or pass a server id.");
    const rest = await getJson(`/guilds/${guildId}?with_counts=true`);
    const g = { ...cache.get(guildId), ...rest };
    if (!g.name) return void ctx.reply("Couldn't load that server.");
    const channels = cache.get(guildId)?.channels ?? (await getJson(`/guilds/${guildId}/channels`)) ?? [];
    const count = (types: number[]) => channels.filter((c: any) => types.includes(c.type)).length;
    const date = created(guildId);
    const members = g.approximate_member_count ?? g.member_count;
    const text = [
      `Name:         ${g.name}`,
      `ID:           ${guildId}`,
      `Created:      ${date.toLocaleString()} (${Math.floor((Date.now() - date.getTime()) / 86400000)} days ago)`,
      `Owner:        ${g.owner_id ?? "unknown"}`,
      `Members:      ${members ?? "unknown"}${g.approximate_presence_count ? ` (${g.approximate_presence_count} online)` : ""}`,
      `Channels:     ${channels.length} (${count([0, 5, 15, 16])} text, ${count([2, 13])} voice, ${count([4])} categories)`,
      `Roles:        ${g.roles?.length ?? "unknown"}`,
      `Emojis:       ${g.emojis?.length ?? "unknown"}  Stickers: ${g.stickers?.length ?? "unknown"}`,
      `Boosts:       ${g.premium_subscription_count ?? 0} (tier ${g.premium_tier ?? 0})`,
      `Verification: ${VERIFICATION[g.verification_level] ?? g.verification_level ?? "unknown"}`,
      `Vanity:       ${g.vanity_url_code ? `discord.gg/${g.vanity_url_code}` : "-"}`,
      `Locale:       ${g.preferred_locale ?? "-"}`,
      `Description:  ${g.description ?? "-"}`,
      `Features:     ${(g.features ?? []).join(", ") || "-"}`,
    ].join("\n");
    const picked = await phoenix.ui.showSheet({ title: g.name, text, monospace: true, options: ["Copy Server ID", "Copy All"] });
    if (picked === 0) phoenix.ui.copy(guildId);
    if (picked === 1) phoenix.ui.copy(text);
  },
});
