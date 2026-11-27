// @description Forces your presence status and AFK flag on outgoing presence updates; toggle with /idle
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const STATUSES = ["online", "idle", "dnd", "invisible"] as const;

const settings = phoenix.settings.define({
  status: {
    type: "select",
    title: "Status",
    description: "Status sent with every presence update",
    options: STATUSES.map((value) => ({ value })),
    default: "idle",
  },
  afk: { type: "switch", title: "AFK", description: "Mark the session AFK so mobile push notifications keep coming", default: true },
});

const enabled = () => phoenix.storage.get<boolean>("enabled") ?? true;

phoenix.gateway.onSend(3, (d) => {
  if (!enabled()) return;
  const afk = settings.afk;
  return { ...d, status: settings.status, afk, since: afk || settings.status === "idle" ? Date.now() : 0 };
});

phoenix.commands.register({
  name: "idle",
  description: "Custom idle: on | off | status",
  execute(args, ctx) {
    const a = args.trim().toLowerCase();
    if (a === "on" || a === "off") {
      phoenix.storage.set("enabled", a === "on");
      phoenix.ui.toast(`Custom idle ${a} (applies on next presence update)`);
      return;
    }
    if (a && a !== "status") return void ctx.reply("Usage: /idle [on|off|status]");
    phoenix.ui.toast(`Custom idle ${enabled() ? "on" : "off"} · status ${settings.status} · afk ${settings.afk}`);
  },
});
