// @description Notifies you when viewers join or leave your Go Live screenshare
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Notifications

let prevViewers = new Set<string>();
let myId: string | null = null;
phoenix.discord.me().then((u) => { if (u) myId = u.id; }).catch(() => {});

const su = phoenix.gateway.streamUpdate;
if (su) {
  phoenix.on(su, (raw) => {
    const ev = raw as { stream_key?: string; viewer_ids?: string[] } | null;
    if (!ev?.stream_key || !Array.isArray(ev.viewer_ids)) return;
    if (myId && !String(ev.stream_key).endsWith(`:${myId}`)) return;
    const next = new Set<string>(ev.viewer_ids);
    for (const id of next) {
      if (!prevViewers.has(id) && id !== myId) {
        phoenix.ui.toast(`Viewer joined your stream (${next.size} watching)`);
      }
    }
    for (const id of prevViewers) {
      if (!next.has(id) && id !== myId) {
        phoenix.ui.toast(`Viewer left your stream (${next.size} watching)`);
      }
    }
    prevViewers = next;
  });
}

const sd = phoenix.gateway.streamDelete;
if (sd) {
  phoenix.on(sd, () => {
    prevViewers = new Set();
  });
}
