// @description Edit your last sent message in a channel by typing s/find/replace/g
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const lastSent = new Map<string, { id: string; content: string }>();
let myId: string | null = null;
phoenix.discord.me().then((u) => { if (u) myId = u.id; }).catch(() => {});

phoenix.on(phoenix.gateway.messageCreate, (msg) => {
  if (!msg?.id || !msg?.channel_id) return;
  if (myId && msg.author?.id === myId && typeof msg.content === "string") {
    lastSent.set(msg.channel_id, { id: msg.id, content: msg.content });
  }
});

phoenix.messages.onSend((text, ctx) => {
  const m = text.match(/^s\/((?:\\\/|[^/])+)\/((?:\\\/|[^/])*)(?:\/([gi]*))?$/);
  if (!m || !ctx.channelId) return;
  const prev = lastSent.get(ctx.channelId);
  if (!prev) {
    phoenix.ui.toast("Sed: no recent message to edit in this channel");
    return false;
  }
  const [, findRaw, replaceRaw, flags = ""] = m;
  const find = findRaw.replace(/\\\//g, "/");
  const replace = replaceRaw.replace(/\\\//g, "/");
  let next: string;
  try {
    next = prev.content.replace(new RegExp(find, flags), replace);
  } catch {
    next = flags.includes("g") ? prev.content.split(find).join(replace) : prev.content.replace(find, replace);
  }
  if (next === prev.content) {
    phoenix.ui.toast("Sed: pattern did not match");
    return false;
  }
  const chId = ctx.channelId;
  phoenix.discord
    .patch(`/channels/${chId}/messages/${prev.id}`, { content: next })
    .then(() => {
      lastSent.set(chId, { id: prev.id, content: next });
    })
    .catch((err) => phoenix.ui.toast(`Sed edit failed: ${err}`));
  return false;
});
