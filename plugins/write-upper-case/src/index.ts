// @description Automatically capitalizes the first letter of sentences before sending
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const settings = phoenix.settings.define({
  blocked: {
    type: "text",
    title: "Exempt Words",
    description: "Comma-separated prefixes or words to leave lowercase",
    default: "http,https,www,iOS,macOS",
  },
});

phoenix.messages.onSend((text) => {
  if (!text || text.startsWith("/") || text.startsWith("```")) return;
  const exempt = new Set(
    (settings.blocked || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const out = text.replace(/(^|[.!?]\s+)([a-z])/g, (match, pre: string, ch: string, offset: number) => {
    const word = text.slice(offset + pre.length).split(/\s+/)[0].toLowerCase();
    for (const ex of exempt) {
      if (word.startsWith(ex)) return match;
    }
    return pre + ch.toUpperCase();
  });
  return out === text ? undefined : out;
});
