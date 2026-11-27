// @description Inspect fenced code blocks with line numbers and copy clean code
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

interface Block {
  lang: string;
  code: string;
}

const FENCE = /```([\w+#.-]*)[^\S\n]*\n?([\s\S]*?)```/g;

function parseBlocks(content: string): Block[] {
  const out: Block[] = [];
  for (const m of content.matchAll(FENCE)) {
    const code = m[2].replace(/\n$/, "");
    if (code.trim()) out.push({ lang: m[1] || "text", code });
  }
  return out;
}

function numbered(code: string): string {
  const lines = code.split("\n");
  const w = Math.max(2, String(lines.length).length);
  return lines.map((l, i) => `${String(i + 1).padStart(w, "0")} | ${l}`).join("\n");
}

phoenix.ui.addMessageAction({
  label: "Inspect Code Block",
  icon: "message.actions.copy",
  visible: (ctx) => (ctx.message?.content ?? "").includes("```"),
  async onPress(ctx) {
    const blocks = parseBlocks(ctx.message?.content ?? "");
    if (!blocks.length) return void phoenix.ui.toast("No code blocks found");
    let i = 0;
    if (blocks.length > 1) {
      i = await phoenix.ui.choose({
        title: "Code Blocks",
        options: blocks.map((b, n) => `#${n + 1} ${b.lang} (${b.code.split("\n").length} lines)`),
      });
      if (i < 0) return;
    }
    const b = blocks[i];
    const idx = await phoenix.ui.showSheet({
      title: `${b.lang} · ${b.code.split("\n").length} lines`,
      text: numbered(b.code),
      monospace: true,
      options: ["Copy Clean Code"],
    });
    if (idx === 0) {
      phoenix.ui.copy(b.code);
      phoenix.ui.toast("Copied code");
    }
  },
});
