// @description Give users local tags shown next to their messages
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

type Tags = Record<string, string>;
const load = (): Tags => phoenix.storage.get<Tags>("tags") ?? {};
const ID = /^<?@?!?(\d{15,25})>?$/;

const accessory = phoenix.ui.addMessageAccessory({
  placement: "header",
  render(ctx) {
    const id = ctx.message?.author.id;
    const tag = id ? load()[id] : undefined;
    return tag ? { text: `[${tag}]`, color: 0xff5865f2 } : null;
  },
});

function save(t: Tags) {
  phoenix.storage.set("tags", t);
  accessory.update?.();
}

phoenix.commands.register({
  name: "ftag",
  description: "Friend tags: /ftag set <userId> <tag> | list | del <userId>",
  execute(args, ctx) {
    const [sub = "", who = "", ...rest] = args.trim().split(/\s+/);
    const tags = load();
    const id = who.match(ID)?.[1];
    switch (sub.toLowerCase()) {
      case "set":
        if (!id || !rest.length) return void ctx.reply("Usage: `/ftag set <userId> <tag>`");
        tags[id] = rest.join(" ").slice(0, 32);
        save(tags);
        return void ctx.reply(`Tagged <@${id}> as **${tags[id]}**.`);
      case "del":
        if (!id || !(id in tags)) return void ctx.reply("Usage: `/ftag del <userId>` (user must be tagged)");
        delete tags[id];
        save(tags);
        return void ctx.reply(`Removed tag from <@${id}>.`);
      case "list": {
        const rows = Object.entries(tags);
        return void ctx.reply(rows.length ? rows.map(([u, t]) => `• <@${u}> → **${t}**`).join("\n") : "No tags yet.");
      }
      default:
        ctx.reply("Usage: `/ftag set <userId> <tag>`, `/ftag list`, `/ftag del <userId>`");
    }
  },
});
