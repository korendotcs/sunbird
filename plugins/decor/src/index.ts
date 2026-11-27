// @description View users' Decor custom avatar decorations (message action and /decor <userId>)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Fun

const API = "https://decor.fieryflames.dev/api";
const CDN = "https://ugc.decor.fieryflames.dev";

// userId → decoration hash (null = none). Never refetched this session.
const cache = new Map<string, string | null>();

function hashFrom(data: any): string | null {
  if (typeof data === "string") return data || null;
  return data?.decorationHash ?? data?.decoration?.hash ?? data?.hash ?? null;
}

async function getDecoration(userId: string): Promise<string | null> {
  if (cache.has(userId)) return cache.get(userId)!;
  const res = await phoenix.fetch(`${API}/users/${userId}`);
  if (res.status === 404) {
    cache.set(userId, null);
    return null;
  }
  if (!res.ok) throw new Error(`Decor API HTTP ${res.status}`);
  let data: unknown;
  try {
    data = res.json();
  } catch {
    data = res.text().trim();
  }
  const hash = hashFrom(data);
  cache.set(userId, hash);
  return hash;
}

async function show(userId: string, label: string) {
  let hash: string | null;
  try {
    hash = await getDecoration(userId);
  } catch (err) {
    phoenix.ui.toast(String(err));
    return;
  }
  if (!hash) {
    phoenix.ui.toast(`${label} has no Decor decoration`);
    return;
  }
  const url = `${CDN}/${hash}.png${hash.startsWith("a_") ? "?animate=true" : ""}`;
  for (const open of [phoenix.ui.quickLook, phoenix.ui.openUrl]) {
    if (!open) continue;
    try {
      open(url);
      return;
    } catch {}
  }
  const idx = await phoenix.ui.showSheet({ title: `Decor — ${label}`, text: `Decoration hash: ${hash}\n\n${url}`, options: ["Copy URL"] });
  if (idx === 0) phoenix.ui.copy(url);
}

phoenix.ui.addMessageAction({
  label: "View Decor Decoration",
  visible: (ctx) => !!ctx.message?.author,
  onPress(ctx) {
    const a = ctx.message!.author;
    void show(a.id, a.global_name || a.username);
  },
});

phoenix.commands.register({
  name: "decor",
  description: "View a user's Decor avatar decoration: /decor <userId>",
  async execute(args, ctx) {
    const id = args.trim().replace(/[<@!>]/g, "") || ctx.currentUserId;
    if (!id || !/^\d+$/.test(id)) return void phoenix.ui.toast("Usage: /decor <userId>");
    await show(id, id);
  },
});
