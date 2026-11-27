// @description Search your servers and their channels with /servers [query] and copy jump links
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const guilds = new Map<string, string>();
const channels = new Map<string, { name: string; guildId: string; type: number }>();
const SKIP_TYPES = [4]; // categories can't be jumped to

const on = (event: string, fn: (payload: any) => void) => {
  const sig = phoenix.gateway[event];
  if (sig) phoenix.on(sig as Phoenix.Sig<any>, fn);
};

const addChannel = (c: any, guildId?: string) => {
  const gid = guildId ?? c?.guild_id;
  if (c?.id && c.name && gid && !SKIP_TYPES.includes(c.type)) channels.set(c.id, { name: c.name, guildId: gid, type: c.type });
};

const ingest = (g: any) => {
  if (!g?.id) return;
  const name = g.name ?? g.properties?.name;
  if (name) guilds.set(g.id, name);
  for (const c of g.channels ?? []) addChannel(c, g.id);
};

on("ready", (r) => (r?.guilds ?? []).forEach(ingest));
on("guildCreate", ingest);
on("guildUpdate", ingest);
on("guildDelete", (g) => g?.id && !g.unavailable && guilds.delete(g.id));
on("channelCreate", (c) => addChannel(c));
on("channelUpdate", (c) => addChannel(c));
on("channelDelete", (c) => c?.id && channels.delete(c.id));

const ensureGuilds = async () => {
  if (guilds.size) return;
  try {
    const res = await phoenix.discord.get("/users/@me/guilds");
    if (res.ok) for (const g of res.json<{ id: string; name: string }[]>()) guilds.set(g.id, g.name);
  } catch {}
};

phoenix.commands.register({
  name: "servers",
  description: "Search your servers and channels, then copy a jump link",
  async execute(args) {
    await ensureGuilds();
    const q = args.trim().toLowerCase();
    const results: { label: string; link: string }[] = [];
    for (const [id, name] of guilds) {
      if (!q || name.toLowerCase().includes(q)) results.push({ label: `🏠 ${name}`, link: `https://discord.com/channels/${id}` });
    }
    if (q) {
      for (const [id, c] of channels) {
        if (c.name.toLowerCase().includes(q)) {
          results.push({
            label: `${[2, 13].includes(c.type) ? "🔊" : "#"}${c.name} · ${guilds.get(c.guildId) ?? c.guildId}`,
            link: `https://discord.com/channels/${c.guildId}/${id}`,
          });
        }
      }
    }
    if (!results.length) return void phoenix.ui.toast(q ? `Nothing matches "${q}"` : "No servers cached yet");
    const shown = results.slice(0, 50);
    const text = [
      `${results.length} result(s)${results.length > shown.length ? `, showing ${shown.length}` : ""}:`,
      "",
      ...shown.map((r, i) => `${i + 1}. ${r.label}\n   ${r.link}`),
    ].join("\n");
    const top = shown.slice(0, 8);
    const picked = await phoenix.ui.showSheet({
      title: q ? `Servers: "${q}"` : "Servers",
      text,
      options: top.map((r) => `Copy link: ${r.label}`),
    });
    if (top[picked]) {
      phoenix.ui.copy(top[picked].link);
      phoenix.ui.toast("Copied jump link");
    }
  },
});
