// @description Strips canary. and ptb. prefixes from Discord message links before sending
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const RE = /https?:\/\/(?:canary|ptb)\.discord(?:app)?\.com\/channels\//gi;

phoenix.messages.onSend((text) => {
  if (!RE.test(text)) return;
  RE.lastIndex = 0;
  return text.replace(RE, "https://discord.com/channels/");
});
