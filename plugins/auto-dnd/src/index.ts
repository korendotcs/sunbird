// @description Sets your status to Do Not Disturb while you Go Live and restores it when the stream ends
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const { gateway, discord, storage } = phoenix;

let me: string | null = null;
const on = (sig: Phoenix.Sig<unknown> | undefined, fn: (p: any) => void) => sig && phoenix.on(sig, fn);
on(gateway.ready, (r: Phoenix.Ready) => (me = r.user.id));
discord.me().then((u) => (me ??= u?.id ?? null)).catch(() => {});

// stream_key is `guild:<guild>:<channel>:<user>` or `call:<channel>:<user>`.
const mine = (p: { stream_key?: string }) => !!me && p?.stream_key?.split(":").pop() === me;

on(gateway.streamCreate, async (p) => {
  if (!mine(p)) return;
  try {
    const res = await discord.get("/users/@me/settings");
    const status = res.ok ? res.json<{ status?: string }>().status : undefined;
    if (!status || status === "dnd") return;
    storage.set("previous", status);
    await discord.patch("/users/@me/settings", { status: "dnd" });
  } catch (e) {
    phoenix.log.warn("auto-dnd failed to set DND", e);
  }
});

on(gateway.streamDelete, async (p) => {
  if (!mine(p)) return;
  const previous = storage.get<string>("previous");
  if (!previous) return;
  storage.delete("previous");
  try {
    await discord.patch("/users/@me/settings", { status: previous });
  } catch (e) {
    phoenix.log.warn("auto-dnd failed to restore status", e);
  }
});
