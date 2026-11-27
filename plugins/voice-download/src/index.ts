// @description Adds a "Voice Message URL" message action to copy or inspect a voice message's audio file
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const IS_VOICE_MESSAGE = 1 << 13;

const audioOf = (message?: Phoenix.Message) => {
  if (!message) return [];
  const voice = (message.flags & IS_VOICE_MESSAGE) !== 0;
  return (message.attachments ?? []).filter(
    (a) => voice || a.content_type?.startsWith("audio/") || /\.(ogg|opus|mp3|m4a|wav)$/i.test(a.filename),
  );
};

const size = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

phoenix.ui.addMessageAction({
  label: "Voice Message URL",
  visible: (ctx) => audioOf(ctx.message).length > 0,
  async onPress(ctx) {
    const files = audioOf(ctx.message);
    if (!files.length) return phoenix.ui.toast("No voice message here");
    const file = files.length === 1 ? files[0] : files[await phoenix.ui.choose({
      title: "Pick an audio file",
      options: files.map((a) => a.filename),
    })];
    if (!file) return;
    const text = [
      `File:     ${file.filename}`,
      `Type:     ${file.content_type ?? "unknown"}`,
      `Size:     ${size(file.size)}`,
      ...(file.duration_secs !== undefined ? [`Duration: ${file.duration_secs.toFixed(1)}s`] : []),
      "",
      `URL:\n${file.url}`,
      "",
      `Proxy URL:\n${file.proxy_url}`,
    ].join("\n");
    const picked = await phoenix.ui.showSheet({
      title: "Voice Message",
      text,
      monospace: true,
      options: ["Copy URL", "Copy Proxy URL"],
    });
    if (picked === 0) phoenix.ui.copy(file.url);
    if (picked === 1) phoenix.ui.copy(file.proxy_url);
    if (picked >= 0) phoenix.ui.toast("Copied audio URL");
  },
});
