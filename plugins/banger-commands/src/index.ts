// @description Fun slash commands: /coinflip, /8ball, /roll, /mock, /clap, /vaporwave and /owo
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Fun

const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const ANSWERS = [
  "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.", "Most likely.",
  "Outlook good.", "Signs point to yes.", "Reply hazy, try again.", "Ask again later.", "Cannot predict now.",
  "Don't count on it.", "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful.",
] as const;

const text = (name: string, description: string, fn: (s: string) => string) =>
  phoenix.commands.register({
    name,
    description,
    execute: (args, ctx) => (args.trim() ? fn(args.trim()) : void ctx.reply(`Usage: /${name} <text>`)),
  });

phoenix.commands.register({
  name: "coinflip",
  description: "Flip a coin",
  execute: () => `🪙 ${pick(["Heads", "Tails"])}!`,
});

phoenix.commands.register({
  name: "8ball",
  description: "Ask the magic 8-ball",
  execute: (args, ctx) => (args.trim() ? `🎱 ${args.trim()}\n> ${pick(ANSWERS)}` : void ctx.reply("Usage: /8ball <question>")),
});

phoenix.commands.register({
  name: "roll",
  description: "Roll dice, e.g. /roll 2d6 (default 1d6)",
  execute(args, ctx) {
    const m = (args.trim() || "1d6").match(/^(\d*)d(\d+)$/i);
    const n = m ? Number(m[1] || 1) : 0;
    const sides = m ? Number(m[2]) : 0;
    if (!m || n < 1 || n > 100 || sides < 2 || sides > 1000) return void ctx.reply("Usage: /roll [NdM], N 1-100, M 2-1000");
    const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
    const total = rolls.reduce((a, b) => a + b, 0);
    return `🎲 ${n}d${sides}: ${n > 1 ? `${rolls.join(" + ")} = ` : ""}**${total}**`;
  },
});

text("mock", "aLtErNaTiNg CaPs", (s) => {
  let i = 0;
  return s.replace(/[a-z]/gi, (c) => (i++ % 2 ? c.toUpperCase() : c.toLowerCase()));
});

text("clap", "Put 👏 between 👏 words", (s) => s.split(/\s+/).join(" 👏 "));

text("vaporwave", "Ｆｕｌｌｗｉｄｔｈ ｔｅｘｔ", (s) =>
  s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, "　"));

text("owo", "OwO-ify text", (s) =>
  s
    .replace(/[rl]/g, "w")
    .replace(/[RL]/g, "W")
    .replace(/n([aeiou])/g, "ny$1")
    .replace(/N([aeiou])/g, "Ny$1")
    .replace(/N([AEIOU])/g, "NY$1")
    .replace(/ove/g, "uv") + ` ${pick(["owo", "UwU", ">w<", "^w^", "OwO", "(・`ω´・)"])}`);
