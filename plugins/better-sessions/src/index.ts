// @description Notifies you whenever a new Discord login session appears on your account
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Notifications

const seen = new Set<string>();
let initialized = false;

const sr = phoenix.gateway.sessionsReplace;
if (sr) {
  phoenix.on(sr, (raw) => {
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      const s = item as { session_id?: string; client_info?: { client?: string; os?: string } } | null;
      const id = s?.session_id;
      if (!id) continue;
      if (initialized && !seen.has(id)) {
        const client = s?.client_info?.client ?? "unknown";
        const os = s?.client_info?.os ?? "unknown";
        phoenix.ui.notify({
          title: "New Discord Session",
          body: `Detected a new ${client} session on ${os}.`,
          accent: 0xfffaa61a,
        });
      }
      seen.add(id);
    }
    initialized = true;
  });
}
