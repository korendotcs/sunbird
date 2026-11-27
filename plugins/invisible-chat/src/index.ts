// @description Hide secret text inside normal messages with zero-width characters
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Fun

// Payload = START + bits (ZW0/ZW1) of the UTF-8 secret + END, inserted after the cover's first char.
const ZW0 = "​";
const ZW1 = "‌";
const START = "⁠‍";
const END = "‍⁠";
const PAYLOAD = new RegExp(`${START}([${ZW0}${ZW1}]+)${END}`);

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function fromUtf8(b: number[]): string {
  let s = "";
  for (let i = 0; i < b.length; ) {
    const x = b[i++];
    let c: number;
    if (x < 0x80) c = x;
    else if (x < 0xe0) c = ((x & 31) << 6) | (b[i++] & 63);
    else if (x < 0xf0) c = ((x & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else c = ((x & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    s += String.fromCodePoint(c);
  }
  return s;
}

function encode(cover: string, secret: string): string {
  const bits = utf8(secret).map((b) => b.toString(2).padStart(8, "0")).join("");
  const hidden = START + bits.replace(/0/g, ZW0).replace(/1/g, ZW1) + END;
  const [first = "", ...rest] = Array.from(cover);
  return first + hidden + rest.join("");
}

function decode(text: string): string | null {
  const m = text.match(PAYLOAD);
  if (!m) return null;
  const bits = m[1].replace(new RegExp(ZW0, "g"), "0").replace(new RegExp(ZW1, "g"), "1");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return fromUtf8(bytes);
}

phoenix.commands.register({
  name: "encrypt",
  description: "Hide a secret: /encrypt <cover text> | <secret>",
  execute(args, ctx) {
    const i = args.indexOf("|");
    const cover = i < 0 ? "" : args.slice(0, i).trim();
    const secret = i < 0 ? "" : args.slice(i + 1).trim();
    if (!cover || !secret) return void ctx.reply("Usage: `/encrypt <cover text> | <secret>`");
    return encode(cover, secret);
  },
});

phoenix.ui.addMessageAction({
  label: "Reveal Hidden Message",
  icon: "message.actions.copy",
  visible: (ctx) => PAYLOAD.test(ctx.message?.content ?? ""),
  async onPress(ctx) {
    const secret = decode(ctx.message?.content ?? "");
    if (secret === null) return phoenix.ui.toast("No hidden message");
    const i = await phoenix.ui.showSheet({ title: "🔓 Hidden message", text: secret, options: ["Copy"] });
    if (i === 0) phoenix.ui.copy(secret);
  },
});
