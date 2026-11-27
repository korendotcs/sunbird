// @description Adds a "Message Stats" action showing character, word, line counts, and exact timestamp
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const DISCORD_EPOCH = 1420070400000n;

phoenix.ui.addMessageAction({
  label: "Message Stats",
  onPress(ctx) {
    const text = ctx.message?.content ?? "";
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text ? text.split("\n").length : 0;
    let created = "";
    try {
      const ms = Number((BigInt(ctx.messageId) >> 22n) + DISCORD_EPOCH);
      created = `\nSent: ${new Date(ms).toLocaleString()}`;
    } catch {}
    phoenix.ui.showSheet({
      title: "Message Stats",
      text: `Characters: ${chars}\nWords: ${words}\nLines: ${lines}\nAttachments: ${ctx.message?.attachments?.length ?? 0}\nEmbeds: ${ctx.message?.embeds?.length ?? 0}${created}`,
      monospace: true,
    });
  },
});
