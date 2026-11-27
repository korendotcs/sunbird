// @description Hides messages containing content-warning trigger words behind a placeholder, with a message action to reveal
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const { gateway } = phoenix;

const settings = phoenix.settings.define({
  triggers: {
    type: "text",
    multiline: true,
    title: "Trigger words",
    description: "One word or phrase per line, matched as whole words, case-insensitive",
    default: "cw\ntw\ncontent warning\ntrigger warning\nspoilers",
  },
  hideMedia: {
    type: "switch",
    title: "Hide attachments and embeds",
    description: "Also hide files, images and link previews of warned messages",
    default: true,
  },
});

interface Original { content: string; attachments: Phoenix.Attachment[]; embeds: Phoenix.Embed[]; trigger: string }

const hidden = new Map<string, Original>();
const revealed = new Set<string>();
let me: string | null = null;
phoenix.discord.me().then((u) => (me = u?.id ?? null)).catch(() => {});

const PLACEHOLDER = "⚠️ Content warning (";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const triggerOf = (content: string) => {
  const lower = content.toLowerCase();
  for (const word of settings.triggers.split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean)) {
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}($|[^\\p{L}\\p{N}])`, "u").test(lower)) return word;
  }
  return null;
};

// Rewrites `m` in place, returning whether it hid anything.
const wrap = (m: Phoenix.Message) => {
  if (!m?.id || typeof m.content !== "string" || revealed.has(m.id) || m.author?.id === me) return false;
  if (m.content.startsWith(PLACEHOLDER)) return false;
  const trigger = triggerOf(m.content);
  if (!trigger) return false;
  hidden.set(m.id, { content: m.content, attachments: m.attachments ?? [], embeds: m.embeds ?? [], trigger });
  if (hidden.size > 1000) hidden.delete(hidden.keys().next().value!);
  m.content = `${PLACEHOLDER}${trigger}). Long-press → Reveal Content Warning`;
  if (settings.hideMedia) {
    m.attachments = [];
    m.embeds = [];
  }
  return true;
};

phoenix.hook(gateway.messageCreate, { before: (m) => void wrap(m) });
phoenix.hook(gateway.messageUpdate, {
  before(m) {
    if (wrap(m)) return;
    // Link previews arrive later as embed-only updates.
    const original = hidden.get(m?.id);
    if (original && !revealed.has(m.id) && settings.hideMedia && m.embeds?.length) {
      original.embeds = m.embeds;
      m.embeds = [];
    }
  },
});

// Desktop loads message history over HTTP, past the gateway.
phoenix.discord.onResponse({ method: "GET", pathPrefix: "/channels/", pathSuffix: "/messages" }, (res) => {
  if (res.status !== 200) return;
  const messages = res.json<Phoenix.Message[]>();
  if (!Array.isArray(messages)) return;
  let changed = false;
  for (const m of messages) changed = wrap(m) || changed;
  if (changed) return { body: JSON.stringify(messages) };
});

phoenix.ui.addMessageAction({
  label: "Reveal Content Warning",
  visible: (ctx) => hidden.has(ctx.messageId) && !revealed.has(ctx.messageId),
  async onPress(ctx) {
    const original = hidden.get(ctx.messageId);
    if (!original) return;
    const files = original.attachments.map((a) => `📎 ${a.filename}`).join("\n");
    const picked = await phoenix.ui.showSheet({
      title: `Content warning: ${original.trigger}`,
      text: [original.content, files].filter(Boolean).join("\n\n"),
      options: ["Show in chat", "Copy text"],
    });
    if (picked === 1) phoenix.ui.copy(original.content);
    if (picked !== 0) return;
    const channelId = ctx.message?.channel_id ?? ctx.channelId;
    if (!channelId) return;
    const guildId = (ctx.message as Phoenix.GatewayMessage | undefined)?.guild_id;
    revealed.add(ctx.messageId);
    phoenix.enqueue(gateway.messageUpdate, {
      id: ctx.messageId,
      channel_id: channelId,
      ...(guildId ? { guild_id: guildId } : {}),
      content: original.content,
      attachments: original.attachments,
      embeds: original.embeds,
    });
  },
});
