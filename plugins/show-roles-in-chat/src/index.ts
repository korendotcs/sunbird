// @description Shows the author's top role name, in its color, next to their messages
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const { gateway, ui } = phoenix;

type Guild = { id: string; roles?: Phoenix.Role[]; channels?: { id: string }[]; threads?: { id: string }[] };

const roles = new Map<string, Map<string, Phoenix.Role>>(); // guild -> role id -> role
const channelGuild = new Map<string, string>();
const memberRoles = new Map<string, string[]>(); // `guild:user` -> role ids

function readGuild(g: Guild) {
  if (!g?.id) return;
  if (g.roles) roles.set(g.id, new Map(g.roles.map((r) => [r.id, r])));
  for (const c of [...(g.channels ?? []), ...(g.threads ?? [])]) channelGuild.set(c.id, g.id);
}

const on = (sig: Phoenix.Sig<unknown> | undefined, fn: (p: any) => void) => sig && phoenix.on(sig, fn);
on(gateway.ready, (r: any) => (r?.guilds ?? []).forEach(readGuild));
on(gateway.guildCreate, readGuild);
on(gateway.guildRoleCreate, (p: any) => p?.role && roles.get(p.guild_id)?.set(p.role.id, p.role));
on(gateway.guildRoleUpdate, (p: any) => p?.role && roles.get(p.guild_id)?.set(p.role.id, p.role));
on(gateway.guildRoleDelete, (p: any) => roles.get(p?.guild_id)?.delete(p?.role_id));
on(gateway.guildMemberUpdate, (p: any) => p?.user?.id && memberRoles.set(`${p.guild_id}:${p.user.id}`, p.roles ?? []));
phoenix.on(gateway.messageCreate, (m) => {
  if (!m.guild_id) return;
  channelGuild.set(m.channel_id, m.guild_id);
  if (m.member) memberRoles.set(`${m.guild_id}:${m.author.id}`, m.member.roles);
});

const pad = (id: string) => id.padStart(20, "0");

// Phoenix's own member cache, keyed `guild:user` with both ids zero-padded.
async function cachedRoles(guild: string, user: string) {
  try {
    const rows = await phoenix.stores.sql<{ v: string }>(
      "SELECT CAST(v AS TEXT) AS v FROM members WHERE k = ? LIMIT 1",
      `${pad(guild)}:${pad(user)}`,
    );
    const ids = rows[0] ? (JSON.parse(rows[0].v) as { roles?: string[] }).roles : undefined;
    if (ids) memberRoles.set(`${guild}:${user}`, ids);
    return ids;
  } catch {
    return undefined;
  }
}

ui.addMessageAccessory({
  placement: "header",
  async render({ message }) {
    if (!message) return null;
    const guild = (message as Phoenix.GatewayMessage).guild_id ?? channelGuild.get(message.channel_id);
    const table = guild && roles.get(guild);
    if (!guild || !table) return null;
    const ids = memberRoles.get(`${guild}:${message.author.id}`) ?? (await cachedRoles(guild, message.author.id));
    const held = (ids ?? []).map((id) => table.get(id)).filter((r): r is Phoenix.Role => !!r).sort((a, b) => b.position - a.position);
    if (!held.length) return null;
    const color = held.find((r) => (r.colors?.primary_color ?? r.color) > 0);
    const rgb = color ? (color.colors?.primary_color ?? color.color) : 0x949ba4;
    return { text: held[0].name, color: (0xff000000 | rgb) >>> 0 };
  },
});
