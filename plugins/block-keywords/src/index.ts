// @description Hides or redacts incoming messages matching your blocked keywords or regexes
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

const settings = phoenix.settings.define({
  keywords: {
    type: "text",
    title: "Blocked Keywords",
    description: "Comma-separated words or /regex/ patterns to filter",
    default: "",
  },
  mode: {
    type: "select",
    title: "Action",
    description: "Drop matching messages or replace their content",
    options: [
      { label: "Redact Content", value: "redact" },
      { label: "Drop Completely", value: "drop" },
    ],
    default: "redact",
  },
});

function matches(content: string): boolean {
  const raw = (settings.keywords || "").trim();
  if (!raw || !content) return false;
  const lower = content.toLowerCase();
  for (const token of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (token.startsWith("/") && token.endsWith("/") && token.length > 2) {
      try {
        if (new RegExp(token.slice(1, -1), "i").test(content)) return true;
      } catch {}
    } else if (lower.includes(token.toLowerCase())) {
      return true;
    }
  }
  return false;
}

phoenix.hook(phoenix.gateway.messageCreate, {
  before(msg) {
    if (typeof msg?.content !== "string" || !matches(msg.content)) return;
    if (settings.mode === "drop") return false;
    msg.content = "*[Message hidden by block-keywords]*";
    msg.embeds = [];
    msg.attachments = [];
  },
});
