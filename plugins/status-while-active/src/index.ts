// @description Switches your status while you're in a voice channel and restores it when you leave
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const { gateway, discord, storage } = phoenix;

const settings = phoenix.settings.define({
  status: {
    type: "select",
    title: "Status while in voice",
    options: [
      { value: "dnd", label: "Do Not Disturb" },
      { value: "idle", label: "Idle" },
      { value: "online", label: "Online" },
      { value: "invisible", label: "Invisible" },
    ],
    default: "dnd",
  },
});

type VoiceState = { user_id?: string; channel_id?: string | null };

let me: string | null = null;
let inVoice = false;
const on = (sig: Phoenix.Sig<unknown> | undefined, fn: (p: any) => void) => sig && phoenix.on(sig, fn);
on(gateway.ready, (r: Phoenix.Ready) => (me = r.user.id));
discord.me().then((u) => (me ??= u?.id ?? null)).catch(() => {});

async function getStatus() {
  const res = await discord.get("/users/@me/settings");
  return res.ok ? res.json<{ status?: string }>().status : undefined;
}
const setStatus = (status: string) => discord.patch("/users/@me/settings", { status });

on(gateway.voiceStateUpdate, async (s: VoiceState) => {
  if (!me || s.user_id !== me) return;
  const now = Boolean(s.channel_id);
  if (now === inVoice) return;
  inVoice = now;
  try {
    if (now) {
      const current = await getStatus();
      // Keep the first saved status so moving between channels doesn't overwrite it.
      if (current && storage.get("previous") === undefined) storage.set("previous", current);
      if (current !== settings.status) await setStatus(settings.status);
    } else {
      const previous = storage.get<string>("previous");
      storage.delete("previous");
      if (previous) await setStatus(previous);
    }
  } catch (e) {
    phoenix.log.warn("status-while-active failed", e);
  }
});
