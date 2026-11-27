// @description Shows a desktop notification whenever watched user IDs send a message anywhere
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Notifications

const settings = phoenix.settings.define({
  userIds: {
    type: "text",
    title: "Watched User IDs",
    description: "Comma-separated Discord user IDs to notify on every message",
    default: "",
  },
});

phoenix.on(phoenix.gateway.messageCreate, (msg) => {
  const id = msg?.author?.id;
  if (!id) return;
  const watched = new Set(
    (settings.userIds || "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
  );
  if (!watched.has(id)) return;
  const name = msg.author.global_name || msg.author.username || id;
  const preview = (msg.content || "[attachment/embed]").slice(0, 120);
  phoenix.ui.notify({ title: `Message from ${name}`, body: preview });
});
