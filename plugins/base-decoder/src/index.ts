// @description Detects Base64 strings in messages and decodes them inline or via message action
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(input: string): string | null {
  const clean = input.replace(/=+$/, "");
  if (clean.length < 8 || clean.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64_CHARS.indexOf(clean[i]);
    if (v === -1) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  let out = "";
  let printable = 0;
  for (const b of bytes) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126)) {
      printable++;
      out += String.fromCharCode(b);
    } else {
      return null;
    }
  }
  return printable >= 6 && /\s|[a-zA-Z]{3}/.test(out) ? out : null;
}

const B64_RE = /\b([A-Za-z0-9+/]{12,}={0,2})\b/g;

phoenix.ui.addMessageAccessory({
  render(ctx) {
    const content = ctx.message?.content;
    if (!content || content.includes("http://") || content.includes("https://")) return null;
    B64_RE.lastIndex = 0;
    const m = B64_RE.exec(content);
    if (!m) return null;
    const decoded = decodeBase64(m[1]);
    if (!decoded) return null;
    const preview = decoded.length > 140 ? decoded.slice(0, 140) + "…" : decoded;
    return { text: `Base64: ${preview}`, color: 0xff8ab4f8 };
  },
});

phoenix.ui.addMessageAction({
  label: "Decode Base64",
  onPress(ctx) {
    const content = ctx.message?.content ?? "";
    B64_RE.lastIndex = 0;
    const m = B64_RE.exec(content);
    const decoded = m ? decodeBase64(m[1]) : null;
    if (!decoded) {
      phoenix.ui.toast("No valid Base64 found in message");
      return;
    }
    phoenix.ui.copy(decoded);
    phoenix.ui.toast(`Decoded & copied: ${decoded.slice(0, 60)}`);
  },
});
