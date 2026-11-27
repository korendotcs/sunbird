// @description Adds a "Who Reacted" message action listing everyone behind each reaction
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

type Reactor = { id: string; username: string; global_name?: string | null };

const emojiKey = (e: Phoenix.PartialEmoji) => (e.id ? `${e.name ?? "_"}:${e.id}` : (e.name ?? ""));
const emojiLabel = (e: Phoenix.PartialEmoji) => (e.id ? `:${e.name ?? "emoji"}:` : (e.name ?? "?"));

phoenix.ui.addMessageAction({
  label: "Who Reacted",
  visible: ({ message }) => Boolean(message?.reactions?.length),
  async onPress({ channelId, messageId, message }) {
    const reactions = (message?.reactions ?? []).slice(0, 20);
    const channel = message?.channel_id ?? channelId;
    if (!channel || !reactions.length) return;
    phoenix.ui.toast("Loading reactions…");
    const sections = await Promise.all(
      reactions.map(async (r) => {
        const head = `${emojiLabel(r.emoji)}  ${r.count}`;
        try {
          const res = await phoenix.discord.get(
            `/channels/${channel}/messages/${messageId}/reactions/${encodeURIComponent(emojiKey(r.emoji))}?limit=100`,
          );
          if (!res.ok) return `${head}\n  (failed: HTTP ${res.status})`;
          const users = res.json<Reactor[]>();
          const names = users.map((u) => `  ${u.global_name || u.username} (@${u.username})`);
          if (r.count > users.length) names.push(`  …and ${r.count - users.length} more`);
          return [head, ...names].join("\n");
        } catch {
          return `${head}\n  (failed to load)`;
        }
      }),
    );
    phoenix.ui.showSheet({ title: "Who Reacted", text: sections.join("\n\n") });
  },
});
