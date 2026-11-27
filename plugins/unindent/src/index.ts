// @description Trims common leading indentation from fenced codeblocks before sending
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

function unindentCodeblocks(text: string): string {
  return text.replace(/```(\w*)\n([\s\S]*?)```/g, (full, lang, body) => {
    const lines: string[] = body.replace(/\t/g, "  ").split("\n");
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    if (!nonEmpty.length) return full;
    const minIndent = Math.min(...nonEmpty.map((l) => l.match(/^ */)?.[0].length ?? 0));
    if (minIndent === 0) return full;
    const stripped = lines.map((l) => l.slice(minIndent)).join("\n");
    return "```" + lang + "\n" + stripped + "```";
  });
}

phoenix.messages.onSend((text) => {
  if (!text.includes("```")) return;
  const out = unindentCodeblocks(text);
  return out === text ? undefined : out;
});
