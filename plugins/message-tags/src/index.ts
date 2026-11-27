// @description Save reusable text snippets and send them with /tag <name>
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

type Tags = Record<string, string>;
const load = (): Tags => phoenix.storage.get<Tags>("tags") ?? {};
const save = (t: Tags) => phoenix.storage.set("tags", t);
const USAGE = "Usage: `/tag add <name> <text>`, `/tag del <name>`, `/tag list`, `/tag <name>`";

phoenix.commands.register({
  name: "tag",
  description: "Message tags: /tag add|del|list or /tag <name> to send it",
  execute(args, ctx) {
    const m = args.match(/^\s*(\S+)\s*([\s\S]*)$/);
    if (!m) return void ctx.reply(USAGE);
    const [, first, rest] = m;
    const tags = load();
    switch (first.toLowerCase()) {
      case "add": {
        const a = rest.match(/^(\S+)\s+([\s\S]+)$/);
        if (!a) return void ctx.reply("Usage: `/tag add <name> <text>`");
        const name = a[1].toLowerCase();
        if (["add", "del", "list"].includes(name)) return void ctx.reply("That name is reserved.");
        tags[name] = a[2];
        save(tags);
        return void ctx.reply(`Saved tag **${name}**.`);
      }
      case "del": {
        const name = rest.trim().toLowerCase();
        if (!(name in tags)) return void ctx.reply(`No tag named **${name}**.`);
        delete tags[name];
        save(tags);
        return void ctx.reply(`Deleted tag **${name}**.`);
      }
      case "list": {
        const names = Object.keys(tags).sort();
        return void ctx.reply(names.length ? `Tags (${names.length}): ${names.map((n) => `\`${n}\``).join(", ")}` : "No tags yet. " + USAGE);
      }
      default: {
        const text = tags[first.toLowerCase()];
        if (text === undefined) return void ctx.reply(`No tag named **${first}**. ${USAGE}`);
        return rest.trim() ? `${text} ${rest.trim()}` : text;
      }
    }
  },
});
