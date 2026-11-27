// @description Zoom and inspect message images & avatars in native macOS QuickLook (pinch, zoom, fullscreen, Open in Preview)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

function collectMediaUrls(msg?: Phoenix.Message): { label: string; url: string }[] {
  if (!msg) return [];
  const out: { label: string; url: string }[] = [];
  for (const att of msg.attachments ?? []) {
    if (att.url && (att.content_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(att.url))) {
      out.push({ label: att.filename || "Attachment", url: att.url });
    }
  }
  for (const emb of msg.embeds ?? []) {
    const u = emb.image?.url || emb.thumbnail?.url;
    if (u && /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-[12]\.discordapp\.net)\//.test(u)) {
      out.push({ label: emb.title || "Embed Image", url: u });
    }
  }
  if (out.length === 0 && msg.author?.avatar) {
    const ext = msg.author.avatar.startsWith("a_") ? "gif" : "png";
    out.push({
      label: `${msg.author.username || "Author"} Avatar`,
      url: `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.${ext}?size=1024`,
    });
  }
  return out;
}

phoenix.ui.addMessageAction({
  label: "Zoom Image (QuickLook)",
  visible(ctx) {
    return collectMediaUrls(ctx.message).length > 0;
  },
  async onPress(ctx) {
    const items = collectMediaUrls(ctx.message);
    if (!items.length) return;
    const idx = items.length === 1 ? 0 : await phoenix.ui.choose({
      title: "Zoom Image",
      options: items.map((i) => i.label),
    });
    const chosen = items[idx];
    if (!chosen) return;
    if (typeof phoenix.ui.quickLook === "function") {
      try {
        phoenix.ui.quickLook(chosen.url);
        phoenix.ui.toast(`Opening ${chosen.label} in QuickLook…`);
        return;
      } catch (e) {
        phoenix.ui.toast(`QuickLook failed: ${String(e)}`);
      }
    }
    if (typeof phoenix.ui.openUrl === "function") {
      phoenix.ui.openUrl(chosen.url);
    } else {
      phoenix.ui.copy(chosen.url);
      phoenix.ui.toast("Copied image URL");
    }
  },
});
