// @description Announces voice channel joins, leaves, and moves aloud using native macOS speech synthesis
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Notifications

const settings = phoenix.settings.define({
  saySelf: {
    type: "switch",
    title: "Announce yourself",
    description: "Speak when you join or leave a voice channel",
    default: false,
  },
  joinMessage: {
    type: "text",
    title: "Join template",
    description: "Use {{USER}} for the member's name",
    default: "{{USER}} joined",
  },
  leaveMessage: {
    type: "text",
    title: "Leave template",
    description: "Use {{USER}} for the member's name",
    default: "{{USER}} left",
  },
  moveMessage: {
    type: "text",
    title: "Move template",
    description: "Use {{USER}} for the member's name",
    default: "{{USER}} moved",
  },
});

const userChannels = new Map<string, string>();
let selfId: string | null = null;
let myChannelId: string | null = null;

function speakLine(template: string, name: string) {
  const line = template.replace(/\{\{USER\}\}/g, name).trim();
  if (!line) return;
  if (typeof phoenix.ui.speak === "function") {
    try {
      phoenix.ui.speak(line);
      return;
    } catch {
      // fall back to toast if speech synthesis is unavailable
    }
  }
  phoenix.ui.toast(line);
}

const ready = phoenix.gateway.ready;
if (ready) {
  phoenix.on(ready, (payload) => {
    const user = (payload as { user?: { id?: string } })?.user;
    if (user?.id) selfId = String(user.id);
  });
}

const vsu = phoenix.gateway.voiceStateUpdate;
if (vsu) {
  phoenix.on(vsu, (payload) => {
    const data = payload as {
      user_id?: string;
      channel_id?: string | null;
      member?: { nick?: string | null; user?: { global_name?: string | null; username?: string } };
    };
    const userId = data?.user_id ? String(data.user_id) : null;
    if (!userId) return;
    const prevChannel = userChannels.get(userId) ?? null;
    const nextChannel = data.channel_id ? String(data.channel_id) : null;
    if (nextChannel) userChannels.set(userId, nextChannel);
    else userChannels.delete(userId);

    const isSelf = selfId !== null && userId === selfId;
    if (isSelf) {
      myChannelId = nextChannel;
      if (!settings.saySelf) return;
    }

    if (!myChannelId && !isSelf) return;
    const name =
      data.member?.nick ||
      data.member?.user?.global_name ||
      data.member?.user?.username ||
      "Someone";

    if (nextChannel === myChannelId && prevChannel !== myChannelId) {
      speakLine(settings.joinMessage, name);
    } else if (prevChannel === myChannelId && nextChannel !== myChannelId) {
      speakLine(nextChannel ? settings.moveMessage : settings.leaveMessage, name);
    }
  });
}

phoenix.commands.register({
  name: "say",
  description: "Speak a test phrase aloud via macOS speech synthesis",
  execute(args) {
    const text = args.trim() || "Voice channel narrator is active";
    speakLine(text, "");
  },
});
