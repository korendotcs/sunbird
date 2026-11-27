// @description Warn about or automatically leave group DMs you get added to
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const settings = phoenix.settings.define({
  autoLeave: { type: "switch", title: "Auto-leave group DMs", default: false },
  silent: {
    type: "switch",
    title: "Leave silently",
    description: "Leave without a 'left the group' system message",
    default: true,
  },
  allowlist: {
    type: "text",
    title: "Allowed user IDs",
    description: "Group DMs owned by or containing these users are kept (one per line or comma separated)",
    multiline: true,
    default: "",
  },
});

const allow = () => new Set(settings.allowlist.split(/[\s,]+/).filter(Boolean));
const ev = phoenix.gateway.channelCreate;
if (ev) {
  phoenix.on(ev, async (raw) => {
    const ch = raw as Phoenix.Channel;
    if (ch?.type !== 3) return;
    const me = (await phoenix.discord.me().catch(() => null))?.id;
    if (ch.owner_id && ch.owner_id === me) return;
    const ids = new Set(allow());
    const members = (ch.recipients ?? []).map((u) => u.id);
    if ((ch.owner_id && ids.has(ch.owner_id)) || members.some((id) => ids.has(id))) return;
    const label = ch.name || (ch.recipients ?? []).map((u) => u.global_name || u.username).join(", ") || ch.id;
    if (!settings.autoLeave) {
      phoenix.ui.notify({ title: "⚠️ Added to a group DM", body: label, accent: 0xfff0b232 });
      return;
    }
    const res = await phoenix.discord.delete(`/channels/${ch.id}${settings.silent ? "?silent=true" : ""}`);
    phoenix.ui.notify(
      res.ok
        ? { title: "Left group DM", body: label }
        : { title: "Could not leave group DM", body: `${label} (${res.status})`, accent: 0xffda373c },
    );
  });
} else {
  phoenix.log.warn("anti-group-dm: no channelCreate event in this build");
}
