// @description Records when reactions are added and shows them with a "Reaction Timestamps" message action
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

interface Entry { emoji: string; userId: string; user: string; at: number; removedAt?: number }

const LIMIT = 500;
const log = new Map<string, Entry[]>();

const emojiName = (e: any) => (e?.id ? `:${e.name ?? "emoji"}:` : e?.name ?? "?");
const who = (p: any) => p.member?.nick || p.member?.user?.global_name || p.member?.user?.username || p.user_id;

const on = (event: string, fn: (payload: any) => void) => {
  const sig = phoenix.gateway[event];
  if (sig) phoenix.on(sig as Phoenix.Sig<any>, fn);
};

on("messageReactionAdd", (p) => {
  if (!p?.message_id) return;
  const list = log.get(p.message_id) ?? [];
  list.push({ emoji: emojiName(p.emoji) + (p.burst ? " (super)" : ""), userId: p.user_id, user: who(p), at: Date.now() });
  log.delete(p.message_id);
  log.set(p.message_id, list);
  if (log.size > LIMIT) log.delete(log.keys().next().value!);
});

on("messageReactionRemove", (p) => {
  const list = log.get(p?.message_id) ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.userId === p.user_id && e.emoji.startsWith(emojiName(p.emoji)) && !e.removedAt) {
      e.removedAt = Date.now();
      return;
    }
  }
});

const time = (ms: number) => new Date(ms).toLocaleTimeString();

phoenix.ui.addMessageAction({
  label: "Reaction Timestamps",
  icon: "res://ic_mana_id",
  visible: (ctx) => log.has(ctx.messageId),
  onPress(ctx) {
    const list = log.get(ctx.messageId);
    if (!list?.length) return phoenix.ui.toast("No reactions seen since startup");
    const text = list
      .map((e) => `${time(e.at)}  ${e.emoji}  ${e.user}${e.removedAt ? `  (removed ${time(e.removedAt)})` : ""}`)
      .join("\n");
    phoenix.ui.showSheet({ title: "Reaction Timestamps", text, monospace: true });
  },
});
