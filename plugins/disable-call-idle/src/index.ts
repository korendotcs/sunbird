// @description Prevents being auto-disconnected from DM voice calls for idling
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Privacy

let inVoice = false;
let myId: string | null = null;
phoenix.discord.me().then((u) => { if (u) myId = u.id; }).catch(() => {});

const vsu = phoenix.gateway.voiceStateUpdate;
if (vsu) {
  phoenix.on(vsu, (raw) => {
    const state = raw as { user_id?: string; channel_id?: string | null } | null;
    if (myId && state?.user_id === myId) {
      inVoice = Boolean(state.channel_id);
    }
  });
}

phoenix.gateway.onSend(3, (payload) => {
  if (inVoice && payload && payload.afk === true) {
    payload.afk = false;
    payload.since = null;
  }
});
