// @description Randomizes uploaded attachment filenames so local file names are not leaked
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const settings = phoenix.settings.define({
  length: {
    type: "number",
    title: "Random Name Length",
    description: "Number of random characters for anonymized filenames",
    default: 8,
  },
});

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function randName(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

phoenix.discord.onRequest(
  { method: "POST", pathPrefix: "/channels/", pathSuffix: "/attachments" },
  (req) => {
    const data = req.json<{ files?: Array<{ filename?: string }> }>();
    if (!data || !Array.isArray(data.files)) return;
    const len = Math.max(4, Math.min(32, Number(settings.length) || 8));
    let changed = false;
    for (const file of data.files) {
      if (typeof file?.filename === "string") {
        const dot = file.filename.lastIndexOf(".");
        const ext = dot > 0 ? file.filename.slice(dot) : "";
        file.filename = `${randName(len)}${ext}`;
        changed = true;
      }
    }
    if (changed) return { body: JSON.stringify(data) };
  },
);
