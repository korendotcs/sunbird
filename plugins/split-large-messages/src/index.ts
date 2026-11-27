// @description Automatically splits outgoing messages over 2000 characters into sequential chunks
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const settings = phoenix.settings.define({
  maxLength: {
    type: "number",
    title: "Max Chunk Length",
    description: "Maximum characters per message chunk (max 2000)",
    default: 1990,
  },
});

function splitChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.5) cut = rest.lastIndexOf(" ", maxLen);
    if (cut < maxLen * 0.3) cut = maxLen;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

phoenix.messages.onSend((text, ctx) => {
  const limit = Math.min(2000, Math.max(200, Number(settings.maxLength) || 1990));
  if (text.length <= limit || !ctx.channelId) return;
  const chunks = splitChunks(text, limit);
  if (chunks.length <= 1) return;
  const channelId = ctx.channelId;
  const rest = chunks.slice(1);
  (async () => {
    for (const chunk of rest) {
      await phoenix.discord.post(`/channels/${channelId}/messages`, { content: chunk });
    }
  })().catch(() => {});
  return chunks[0];
});
