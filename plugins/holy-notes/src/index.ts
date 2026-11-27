// @description Save messages into named notebooks and browse, search or delete them later
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

interface Note {
  id: string;
  channelId: string;
  guildId?: string;
  author: string;
  content: string;
  timestamp: string;
  savedAt: number;
}
type Notebooks = Record<string, Note[]>;

const settings = phoenix.settings.define({
  defaultNotebook: {
    type: "text",
    title: "Default Notebook",
    description: "Notebook used when you only have one, or pick it from the list",
    default: "Main",
  },
});

const load = (): Notebooks => phoenix.storage.get<Notebooks>("notebooks") ?? {};
const save = (nb: Notebooks) => phoenix.storage.set("notebooks", nb);
const defaultName = () => settings.defaultNotebook.trim() || "Main";

function fmt(n: Note): string {
  const body = n.content.length > 300 ? n.content.slice(0, 300) + "…" : n.content || "(no text)";
  return `[${n.id}] ${n.author} · ${n.timestamp.slice(0, 10)}\n${body}\nhttps://discord.com/channels/${n.guildId ?? "@me"}/${n.channelId}/${n.id}`;
}

async function pickNotebook(): Promise<string | null> {
  const nb = load();
  const names = Object.keys(nb);
  if (!names.includes(defaultName())) names.unshift(defaultName());
  const options = [...names, "New notebook from default name + number"];
  const i = await phoenix.ui.choose({ title: "Save to notebook", options });
  if (i < 0) return null;
  if (i < names.length) return names[i];
  let n = 2;
  while (nb[`${defaultName()} ${n}`]) n++;
  return `${defaultName()} ${n}`;
}

phoenix.ui.addMessageAction({
  label: "Save to Holy Notes",
  icon: "message.actions.pin",
  async onPress(ctx) {
    const m = ctx.message;
    if (!m) return phoenix.ui.toast("Message not cached, cannot save");
    const name = await pickNotebook();
    if (!name) return;
    const nb = load();
    const list = (nb[name] ??= []);
    if (list.some((n) => n.id === m.id)) return phoenix.ui.toast(`Already in ${name}`);
    list.push({
      id: m.id,
      channelId: m.channel_id,
      guildId: (m as Phoenix.GatewayMessage).guild_id,
      author: m.author.global_name || m.author.username,
      content: m.content,
      timestamp: m.timestamp,
      savedAt: Date.now(),
    });
    save(nb);
    phoenix.ui.toast(`Saved to ${name}`);
  },
});

async function view(name: string) {
  const list = load()[name];
  if (!list?.length) return phoenix.ui.toast(`Notebook "${name}" is empty`);
  await phoenix.ui.showSheet({ title: `📓 ${name} (${list.length})`, text: list.map(fmt).join("\n\n") });
}

phoenix.commands.register({
  name: "notes",
  description: "Holy Notes: /notes list | search <q> | view <notebook> | delete <id>",
  async execute(args, ctx) {
    const [sub = "list", ...rest] = args.trim().split(/\s+/);
    const arg = rest.join(" ");
    const nb = load();
    switch (sub.toLowerCase()) {
      case "list": {
        const names = Object.keys(nb);
        if (!names.length) return void ctx.reply("No notebooks yet. Long-press a message → Save to Holy Notes.");
        const i = await phoenix.ui.choose({ title: "Notebooks", options: names.map((n) => `${n} (${nb[n].length})`) });
        if (i >= 0) await view(names[i]);
        return;
      }
      case "view":
        return view(arg || defaultName());
      case "search": {
        const q = arg.toLowerCase();
        if (!q) return void ctx.reply("Usage: `/notes search <query>`");
        const hits = Object.entries(nb).flatMap(([name, list]) =>
          list.filter((n) => n.content.toLowerCase().includes(q) || n.author.toLowerCase().includes(q)).map((n) => `📓 ${name}\n${fmt(n)}`),
        );
        if (!hits.length) return void ctx.reply(`No notes match "${arg}".`);
        await phoenix.ui.showSheet({ title: `Search: ${arg} (${hits.length})`, text: hits.join("\n\n") });
        return;
      }
      case "delete": {
        if (!arg) return void ctx.reply("Usage: `/notes delete <messageId>`");
        let removed = 0;
        for (const name of Object.keys(nb)) {
          const before = nb[name].length;
          nb[name] = nb[name].filter((n) => n.id !== arg);
          removed += before - nb[name].length;
          if (!nb[name].length) delete nb[name];
        }
        save(nb);
        return void ctx.reply(removed ? `Deleted note ${arg}.` : `No note with id ${arg}.`);
      }
      default:
        ctx.reply("Usage: `/notes list`, `/notes search <q>`, `/notes view <notebook>`, `/notes delete <id>`");
    }
  },
});
