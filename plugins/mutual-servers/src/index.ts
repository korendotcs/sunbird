// @description Adds a "Mutual Servers" message action listing every server you share with the author
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const guildNames = new Map<string, string>();
// ponytail: one Set entry per seen (guild, user), grows until reload; cap per guild if memory shows up.
const seen = new Map<string, Set<string>>();

const on = (event: string, fn: (payload: any) => void) => {
  const sig = phoenix.gateway[event];
  if (sig) phoenix.on(sig as Phoenix.Sig<any>, fn);
};

const see = (guildId: string | undefined, userId: string | undefined) => {
  if (!guildId || !userId) return;
  let set = seen.get(guildId);
  if (!set) seen.set(guildId, (set = new Set()));
  set.add(userId);
};

const ingest = (g: any) => {
  if (!g?.id) return;
  const name = g.name ?? g.properties?.name;
  if (name) guildNames.set(g.id, name);
  for (const m of g.members ?? []) see(g.id, m.user?.id);
};

on("ready", (r) => (r?.guilds ?? []).forEach(ingest));
on("guildCreate", ingest);
on("guildUpdate", ingest);
on("guildMembersChunk", (p) => (p?.members ?? []).forEach((m: any) => see(p.guild_id, m.user?.id)));
on("guildMemberAdd", (m) => see(m?.guild_id, m?.user?.id));
on("guildMemberRemove", (m) => m?.guild_id && seen.get(m.guild_id)?.delete(m.user?.id));
on("guildMemberListUpdate", (p) => {
  for (const op of p?.ops ?? []) {
    for (const item of [...(op.items ?? []), ...(op.item ? [op.item] : [])]) see(p.guild_id, item?.member?.user?.id);
  }
});
on("messageCreate", (m) => see(m?.guild_id, m?.author?.id));

const getJson = async (path: string): Promise<any> => {
  try {
    const res = await phoenix.discord.get(path);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
};

const mutualsOf = async (userId: string) => {
  const profile = await getJson(`/users/${userId}/profile?with_mutual_guilds=true`);
  if (Array.isArray(profile?.mutual_guilds)) {
    return { source: "Discord profile", list: profile.mutual_guilds as { id: string; nick?: string | null }[] };
  }
  const list = [...seen].filter(([, users]) => users.has(userId)).map(([id]) => ({ id, nick: null }));
  return { source: "seen this session", list };
};

phoenix.ui.addMessageAction({
  label: "Mutual Servers",
  icon: "res://ic_mana_id",
  visible: (ctx) => !!ctx.message && !ctx.message.author.bot,
  async onPress(ctx) {
    const author = ctx.message?.author;
    if (!author) return;
    if (author.id === ctx.currentUserId) return phoenix.ui.toast("That's you");
    const { source, list } = await mutualsOf(author.id);
    if (list.some((g) => !guildNames.has(g.id))) {
      for (const g of (await getJson("/users/@me/guilds")) ?? []) guildNames.set(g.id, g.name);
    }
    const name = author.global_name || author.username;
    const lines = list
      .map((g) => ({ ...g, name: guildNames.get(g.id) ?? g.id }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => `• ${g.name}${g.nick ? ` (as ${g.nick})` : ""}`);
    const text = lines.length
      ? `${lines.length} mutual server(s) with ${name} (${source}):\n\n${lines.join("\n")}`
      : `No mutual servers with ${name} (${source}).`;
    phoenix.ui.showSheet({ title: "Mutual Servers", text });
  },
});
