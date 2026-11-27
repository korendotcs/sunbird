// @description Sets a custom Rich Presence activity on your profile (/rpc on|off|refresh)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const { gateway, discord, storage } = phoenix;

const settings = phoenix.settings.define({
  name: { type: "text", title: "Name", description: "Activity name, like the game title", default: "" },
  details: { type: "text", title: "Details", description: "First line under the name", default: "" },
  state: { type: "text", title: "State", description: "Second line under the name", default: "" },
  type: {
    type: "select",
    title: "Activity type",
    options: [
      { value: "0", label: "Playing" },
      { value: "1", label: "Streaming" },
      { value: "2", label: "Listening to" },
      { value: "3", label: "Watching" },
      { value: "5", label: "Competing in" },
    ],
    default: "0",
    onChange: () => refresh(),
  },
  url: { type: "text", title: "Stream URL", description: "Twitch/YouTube URL, used by Streaming only", default: "" },
  appId: { type: "text", title: "Application ID", description: "Optional, from the Developer Portal", default: "" },
  elapsed: { type: "switch", title: "Show elapsed time", default: true },
});

const startedAt = Date.now();
const enabled = () => storage.get<boolean>("enabled") ?? true;

function activity(): Record<string, unknown> | null {
  const name = settings.name.trim();
  if (!enabled() || !name) return null;
  const a: Record<string, unknown> = { name, type: Number(settings.type) };
  if (settings.details.trim()) a.details = settings.details.trim();
  if (settings.state.trim()) a.state = settings.state.trim();
  if (settings.appId.trim()) a.application_id = settings.appId.trim();
  if (a.type === 1 && settings.url.trim()) a.url = settings.url.trim();
  if (settings.elapsed) a.timestamps = { start: startedAt };
  return a;
}

let last: Record<string, unknown> | null = null;

gateway.onSend(3, (d) => {
  const list = Array.isArray(d.activities) ? (d.activities as Record<string, unknown>[]) : [];
  // Drop the copy injected last time so edits replace it instead of stacking.
  const kept = list.filter((a) => !(last && a.name === last.name && a.type === last.type));
  last = activity();
  d.activities = last ? [last, ...kept] : kept;
});

// The client resends OP 3 when its settings change, so re-saving the current status pushes the new activity.
async function refresh() {
  try {
    const res = await discord.get("/users/@me/settings");
    const status = res.ok ? res.json<{ status?: string }>().status : undefined;
    if (status) await discord.patch("/users/@me/settings", { status });
  } catch (e) {
    phoenix.log.warn("custom-rpc refresh failed", e);
  }
}

phoenix.commands.register({
  name: "rpc",
  description: "Custom Rich Presence: /rpc on, /rpc off, /rpc refresh",
  execute(args, ctx) {
    const cmd = args.trim().toLowerCase();
    if (cmd === "on" || cmd === "off") storage.set("enabled", cmd === "on");
    else if (cmd && cmd !== "refresh") {
      ctx.reply("Usage: `/rpc on`, `/rpc off`, `/rpc refresh`. Edit name/details/state in the plugin settings.");
      return;
    }
    refresh();
    const a = activity();
    ctx.reply(a ? `Custom RPC on: **${a.name}**${a.details ? ` · ${a.details}` : ""}${a.state ? ` · ${a.state}` : ""}` : enabled() ? "Custom RPC has no name set (plugin settings)." : "Custom RPC off.");
  },
});
