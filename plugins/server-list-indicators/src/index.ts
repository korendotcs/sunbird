// @description Live server, friend and friend-request counters in a floating HUD (/indicators)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

interface Relationship {
  id: string;
  type: number; // 1 friend, 2 blocked, 3 incoming, 4 outgoing
}

// Presence is gateway-only, so remember what the gateway tells us.
const status = new Map<string, string>();
const track = (p: any) => {
  const id = p?.user?.id ?? p?.user_id;
  if (id && p.status) status.set(id, p.status);
};
const on = (event: string, fn: (payload: any) => void) => {
  const sig = phoenix.gateway[event];
  if (sig) phoenix.on(sig as Phoenix.Sig<any>, fn);
};
on("ready", (r) => (r?.presences ?? []).forEach(track));
on("readySupplemental", (r) => (r?.merged_presences?.friends ?? []).forEach(track));
on("presenceUpdate", track);
on("presencesReplace", (list) => (Array.isArray(list) ? list : list?.presences ?? []).forEach(track));

async function getJson<T>(path: string): Promise<T> {
  const res = await phoenix.discord.get(path);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json<T>();
}

let page: Phoenix.PageHandle | null = null;

async function openHud() {
  let text: string;
  try {
    const [guilds, rels] = await Promise.all([
      getJson<unknown[]>("/users/@me/guilds"),
      getJson<Relationship[]>("/users/@me/relationships"),
    ]);
    const friends = rels.filter((r) => r.type === 1);
    const online = friends.filter((f) => (status.get(f.id) ?? "offline") !== "offline").length;
    const count = (t: number) => rels.filter((r) => r.type === t).length;
    text = [
      `🏠 Servers:            ${guilds.length}`,
      `🟢 Friends online:     ${online} / ${friends.length}`,
      `📥 Incoming requests:  ${count(3)}`,
      `📤 Outgoing requests:  ${count(4)}`,
      `🚫 Blocked:            ${count(2)}`,
      ``,
      `Updated ${new Date().toLocaleTimeString()}`,
    ].join("\n");
  } catch (err) {
    text = `Failed to load: ${String(err)}`;
  }
  page?.close();
  page = phoenix.ui.openPage({
    title: "Server List Indicators",
    sections: [
      { type: "code", title: "Indicators", text, monospace: true },
      { type: "buttons", buttons: [{ label: "🔄 Refresh", onPress: () => void openHud() }] },
    ],
  });
}

phoenix.commands.register({
  name: "indicators",
  description: "Show server, friend and friend-request counts in a HUD",
  execute: () => openHud(),
});

phoenix.onUnload(() => page?.close());
