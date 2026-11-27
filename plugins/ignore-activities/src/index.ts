// @description Hides chosen games and activities from your profile by filtering them out of your presence
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const settings = phoenix.settings.define({
  names: {
    type: "text",
    title: "Ignored activities",
    description: "One game or activity name per line (case-insensitive)",
    multiline: true,
    default: "",
  },
  all: { type: "switch", title: "Hide every game", description: "Hide all non-custom-status activities", default: false },
});

const CUSTOM_STATUS = 4;

phoenix.gateway.onSend(3, (d) => {
  if (!Array.isArray(d.activities)) return;
  const ignored = new Set(settings.names.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean));
  d.activities = (d.activities as { name?: string; type?: number }[]).filter(
    (a) => a.type === CUSTOM_STATUS || !(settings.all || ignored.has(String(a.name ?? "").toLowerCase())),
  );
});
