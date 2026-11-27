// @description Silences pings and notifications from specific user IDs
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const settings = phoenix.settings.define({
  userIds: {
    type: "text",
    title: "Silenced User IDs",
    description: "Comma-separated Discord user IDs whose pings will be silenced",
    default: "",
  },
});

const STORAGE_KEY = "silenced";

function getSilenced(): Set<string> {
  const fromSetting = (settings.userIds || "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const fromStore = phoenix.storage.get<string[]>(STORAGE_KEY) ?? [];
  return new Set([...fromSetting, ...fromStore]);
}

phoenix.hook(phoenix.gateway.messageCreate, {
  before(msg) {
    if (!msg?.author?.id) return;
    if (!getSilenced().has(msg.author.id)) return;
    msg.mention_everyone = false;
    if (Array.isArray(msg.mentions)) msg.mentions = [];
    if (Array.isArray(msg.mention_roles)) msg.mention_roles = [];
  },
});

phoenix.ui.addMessageAction({
  label: "Silence User Pings",
  onPress(ctx) {
    const id = ctx.message?.author?.id;
    if (!id) return;
    const stored = new Set(phoenix.storage.get<string[]>(STORAGE_KEY) ?? []);
    if (stored.has(id)) {
      stored.delete(id);
      phoenix.ui.toast(`Unsilenced ${ctx.message?.author?.username ?? id}`);
    } else {
      stored.add(id);
      phoenix.ui.toast(`Silenced pings from ${ctx.message?.author?.username ?? id}`);
    }
    phoenix.storage.set(STORAGE_KEY, [...stored]);
  },
});
