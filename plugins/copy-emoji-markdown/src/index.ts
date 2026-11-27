// @description Adds a "Copy Emoji Markdown" message action that copies a message's custom emojis or their image URLs
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const EMOJI = /<(a?):(\w{2,32}):(\d{15,22})>/g;

const emojisIn = (text: string) => [...new Map([...text.matchAll(EMOJI)].map((m) => [m[3], m])).values()];

phoenix.ui.addMessageAction({
  label: "Copy Emoji Markdown",
  visible: ({ message }) => emojisIn(message?.content ?? "").length > 0,
  async onPress({ message }) {
    const found = emojisIn(message?.content ?? "");
    if (!found.length) return;
    const pick = await phoenix.ui.choose({
      title: `${found.length} custom emoji${found.length === 1 ? "" : "s"}`,
      options: ["Copy markdown", "Copy image URLs"],
    });
    if (pick < 0) return;
    const text =
      pick === 0
        ? found.map((m) => m[0]).join(" ")
        : found.map(([, a, , id]) => `https://cdn.discordapp.com/emojis/${id}.${a ? "gif" : "png"}?size=128`).join("\n");
    phoenix.ui.copy(text);
    phoenix.ui.toast(pick === 0 ? "Emoji markdown copied" : "Emoji URLs copied");
  },
});
