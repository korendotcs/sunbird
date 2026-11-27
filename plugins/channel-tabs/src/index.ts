// @description Pin channels as tabs and jump between them from a floating HUD (/tabs)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

interface Tab {
  id: string;
  guildId: string | null;
  name: string;
}

const KEY = "tabs";
const load = (): Tab[] => phoenix.storage.get<Tab[]>(KEY) ?? [];
const save = (tabs: Tab[]) => phoenix.storage.set(KEY, tabs);

const jumpUrl = (t: Tab) => `discord://discord.com/channels/${t.guildId ?? "@me"}/${t.id}`;

function jump(t: Tab) {
  const url = jumpUrl(t);
  if (phoenix.ui.openUrl) {
    try {
      phoenix.ui.openUrl(url);
      return;
    } catch {}
  }
  phoenix.ui.copy(url.replace("discord://", "https://"));
  phoenix.ui.toast(`Copied link to #${t.name}`);
}

async function lookup(channelId: string): Promise<{ name: string; guildId: string | null }> {
  try {
    const res = await phoenix.discord.get(`/channels/${channelId}`);
    if (res.ok) {
      const c = res.json<{ name?: string | null; guild_id?: string; recipients?: { username: string; global_name?: string | null }[] }>();
      const dm = c.recipients?.map((r) => r.global_name || r.username).join(", ");
      return { name: c.name || dm || channelId, guildId: c.guild_id ?? null };
    }
  } catch {}
  return { name: channelId, guildId: null };
}

async function addTab(channelId: string | null, name?: string, guildId?: string | null): Promise<string> {
  if (!channelId) return "No open channel";
  const tabs = load();
  if (tabs.some((t) => t.id === channelId)) return "Channel already pinned";
  const info = name && guildId !== undefined ? { name, guildId } : await lookup(channelId);
  tabs.push({ id: channelId, guildId: info.guildId, name: name || info.name });
  save(tabs);
  return `Pinned #${name || info.name}`;
}

let page: Phoenix.PageHandle | null = null;

function openHud(ctx: Phoenix.UiContext) {
  page?.close();
  const tabs = load();
  const sections: Phoenix.PageSection[] = [];
  sections.push(
    tabs.length
      ? {
          type: "buttons",
          title: `Pinned Tabs (${tabs.length})`,
          buttons: tabs.map((t, i) => ({ label: `${i + 1}. #${t.name}`, onPress: () => jump(t) })),
        }
      : { type: "text", title: "Pinned Tabs", text: "No tabs yet. Use \"Pin to Channel Tabs\" on a message or /tabs add <name>." }
  );
  sections.push({
    type: "buttons",
    title: "Manage",
    buttons: [
      {
        label: "➕ Add Current Channel",
        onPress: () => {
          addTab(ctx.channelId).then((msg) => {
            phoenix.ui.toast(msg);
            openHud(ctx);
          });
        },
      },
      ...tabs.map((t, i) => ({
        label: `✖ Remove ${i + 1}. #${t.name}`,
        danger: true,
        onPress: () => {
          save(load().filter((x) => x.id !== t.id));
          openHud(ctx);
        },
      })),
    ],
  });
  sections.push({ type: "text", text: "/tabs add <name> · /tabs del <index>" });
  page = phoenix.ui.openPage({ title: "Channel Tabs", sections });
}

phoenix.ui.addMessageAction({
  label: "Pin to Channel Tabs",
  icon: "message.actions.pin",
  onPress(ctx) {
    const gid = (ctx.message as Phoenix.GatewayMessage | undefined)?.guild_id;
    addTab(ctx.channelId ?? ctx.message?.channel_id ?? null, undefined, gid).then((m) => phoenix.ui.toast(m));
  },
});

phoenix.commands.register({
  name: "tabs",
  description: "Open Channel Tabs HUD, or /tabs add <name> | del <index>",
  async execute(args, ctx) {
    const [sub, ...rest] = args.trim().split(/\s+/);
    const arg = rest.join(" ");
    if (sub === "add") {
      phoenix.ui.toast(await addTab(ctx.channelId, arg || undefined));
    } else if (sub === "del" || sub === "remove") {
      const tabs = load();
      const i = parseInt(arg, 10) - 1;
      if (!(i >= 0 && i < tabs.length)) {
        phoenix.ui.toast(`Index must be 1-${tabs.length}`);
        return;
      }
      const [gone] = tabs.splice(i, 1);
      save(tabs);
      phoenix.ui.toast(`Removed #${gone.name}`);
    }
    openHud(ctx);
  },
});

phoenix.onUnload(() => page?.close());
