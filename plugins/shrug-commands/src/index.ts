// @description Adds classic Equicord text commands: /shrug, /tableflip, /unflip, /lenny, /mock, /clap
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Fun

phoenix.commands.register({
  name: "shrug",
  description: "Appends ¯\\_(ツ)_/¯ to your message",
  execute: (args) => (args.trim() ? `${args.trim()} ¯\\_(ツ)_/¯` : "¯\\_(ツ)_/¯"),
});

phoenix.commands.register({
  name: "tableflip",
  description: "Appends (╯°□°)╯︵ ┻━┻ to your message",
  execute: (args) => (args.trim() ? `${args.trim()} (╯°□°)╯︵ ┻━┻` : "(╯°□°)╯︵ ┻━┻"),
});

phoenix.commands.register({
  name: "unflip",
  description: "Appends ┬─┬ノ( º _ ºノ) to your message",
  execute: (args) => (args.trim() ? `${args.trim()} ┬─┬ノ( º _ ºノ)` : "┬─┬ノ( º _ ºノ)"),
});

phoenix.commands.register({
  name: "lenny",
  description: "Appends ( ͡° ͜ʖ ͡°) to your message",
  execute: (args) => (args.trim() ? `${args.trim()} ( ͡° ͜ʖ ͡°)` : "( ͡° ͜ʖ ͡°)"),
});

phoenix.commands.register({
  name: "mock",
  description: "Converts text to aLtErNaTiNg mOcKiNg cAsE",
  execute: (args) =>
    args
      .split("")
      .map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase()))
      .join(""),
});

phoenix.commands.register({
  name: "clap",
  description: "Puts 👏 between 👏 every 👏 word",
  execute: (args) => args.trim().split(/\s+/).join(" 👏 "),
});
