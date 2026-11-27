// @description Shows which voice channel a user is in, next to their name and via a message action
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Notifications

const settings = phoenix.settings.define({
  decoration: {
    type: "switch",
    title: "Member list indicator",
    description: "Show 🔊 and the channel name after users in voice",
    default: true,
    onChange() {
      decoration?.update?.();
    },
  },
});

const voice = new Map<string, { guildId: string; channelId: string }>();
const channelNames = new Map<string, string>();
const guildNames = new Map<string, string>();

const on = (event: string, fn: (payload: any) => void) => {
  const sig = phoenix.gateway[event];
  if (sig) phoenix.on(sig as Phoenix.Sig<any>, fn);
};

const decoration = phoenix.ui.addMemberDecoration?.({
  render({ userId }) {
    const state = settings.decoration && voice.get(userId);
    return state ? { text: `🔊 ${channelNames.get(state.channelId) ?? "voice"}`, color: 0xff23a55a } : null;
  },
});

const setState = (userId: string, guildId: string | undefined, channelId: string | null | undefined) => {
  const prev = voice.get(userId);
  if (channelId && guildId) voice.set(userId, { guildId, channelId });
  else voice.delete(userId);
  if (prev?.channelId !== (channelId ?? undefined)) decoration?.update?.(userId);
};

const ingestGuild = (g: any) => {
  if (!g?.id) return;
  const name = g.name ?? g.properties?.name;
  if (name) guildNames.set(g.id, name);
  for (const c of g.channels ?? []) if (c.name) channelNames.set(c.id, c.name);
  for (const s of g.voice_states ?? []) setState(s.user_id, g.id, s.channel_id);
};

on("ready", (r) => (r?.guilds ?? []).forEach(ingestGuild));
on("guildCreate", ingestGuild);
on("channelCreate", (c) => c?.name && channelNames.set(c.id, c.name));
on("channelUpdate", (c) => c?.name && channelNames.set(c.id, c.name));
on("voiceStateUpdate", (s) => s?.user_id && setState(s.user_id, s.guild_id, s.channel_id));

phoenix.ui.addMessageAction({
  label: "Show Voice Channel",
  icon: "res://ic_mana_id",
  visible: (ctx) => !!ctx.message && voice.has(ctx.message.author.id),
  async onPress(ctx) {
    const author = ctx.message?.author;
    const state = author && voice.get(author.id);
    if (!author || !state) return phoenix.ui.toast("Not in a voice channel");
    const link = `https://discord.com/channels/${state.guildId}/${state.channelId}`;
    const text = [
      `User:    ${author.global_name || author.username}`,
      `Server:  ${guildNames.get(state.guildId) ?? state.guildId}`,
      `Channel: 🔊 ${channelNames.get(state.channelId) ?? state.channelId}`,
      "",
      link,
    ].join("\n");
    if ((await phoenix.ui.showSheet({ title: "In Voice", text, options: ["Copy Channel Link"] })) === 0) {
      phoenix.ui.copy(link);
    }
  },
});
