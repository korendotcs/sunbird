// @description Adds a Reverse Image Search action for message images, embeds, and avatars
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

function getImageUrl(msg: Phoenix.Message | undefined): string | null {
  if (!msg) return null;
  const att = msg.attachments?.find((a) => a.content_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.filename));
  if (att) return att.url;
  const emb = msg.embeds?.find((e) => e.image?.url || e.thumbnail?.url);
  if (emb) return emb.image?.url ?? emb.thumbnail?.url ?? null;
  if (msg.author?.avatar) {
    const ext = msg.author.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.${ext}?size=1024`;
  }
  return null;
}

phoenix.ui.addMessageAction({
  label: "Reverse Image Search",
  visible(ctx) {
    return Boolean(getImageUrl(ctx.message));
  },
  async onPress(ctx) {
    const url = getImageUrl(ctx.message);
    if (!url) return;
    const enc = encodeURIComponent(url);
    const engines = [
      { label: "Google Lens", url: `https://lens.google.com/uploadbyurl?url=${enc}` },
      { label: "SauceNAO", url: `https://saucenao.com/search.php?url=${enc}` },
      { label: "TinEye", url: `https://tineye.com/search?url=${enc}` },
      { label: "Yandex", url: `https://yandex.com/images/search?rpt=imageview&url=${enc}` },
    ];
    const idx = await phoenix.ui.choose({
      title: "Reverse Image Search",
      message: "Choose a search engine to open in your browser",
      options: engines.map((e) => e.label),
    });
    if (idx >= 0 && engines[idx]) {
      if (typeof phoenix.ui.openUrl === "function") {
        try {
          phoenix.ui.openUrl(engines[idx].url);
          phoenix.ui.toast(`Opened ${engines[idx].label}`);
          return;
        } catch {
          // fall through to copy
        }
      }
      phoenix.ui.copy(engines[idx].url);
      phoenix.ui.toast(`Copied ${engines[idx].label} search link`);
    }
  },
});
