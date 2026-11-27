// @description Preview a message with stats, detected mentions, links and code before sending it with /preview
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

phoenix.commands.register({
  name: "preview",
  description: "Preview a message before sending it",
  async execute(args, ctx) {
    const text = args;
    if (!text.trim()) return void ctx.reply("Usage: /preview <text>");
    const mentions = count(text, /<@[!&]?\d+>|@everyone|@here/g);
    const channels = count(text, /<#\d+>/g);
    const links = count(text, /https?:\/\/\S+/g);
    const codeBlocks = count(text, /```[\s\S]*?```/g);
    const inlineCode = count(text.replace(/```[\s\S]*?```/g, ""), /`[^`\n]+`/g);
    const stats = [
      `Characters: ${[...text].length}${text.length > 2000 ? " ⚠️ over 2000" : ""}`,
      `Words:      ${text.trim().split(/\s+/).length}`,
      `Lines:      ${text.split("\n").length}`,
      `Mentions:   ${mentions}   Channels: ${channels}`,
      `Links:      ${links}`,
      `Code:       ${codeBlocks} block(s), ${inlineCode} inline`,
    ].join("\n");
    const i = await phoenix.ui.showSheet({
      title: "👀 Message preview",
      text: `${text}\n\n────────────\n${stats}`,
      options: ["Copy", "Send"],
    });
    if (i === 0) return phoenix.ui.copy(text), phoenix.ui.toast("Copied");
    if (i !== 1) return;
    if (!ctx.channelId) return void phoenix.ui.toast("No open channel");
    try {
      const res = await phoenix.discord.post(`/channels/${ctx.channelId}/messages`, { content: text });
      phoenix.ui.toast(res.ok ? "Sent" : `Send failed (${res.status})`);
    } catch (e) {
      phoenix.ui.toast(`Send failed: ${e}`);
    }
  },
});
