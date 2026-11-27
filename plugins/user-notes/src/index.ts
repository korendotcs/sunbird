// @description Keep private local notes about users, shown under their messages
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

type Notes = Record<string, string>;
const load = (): Notes => phoenix.storage.get<Notes>("notes") ?? {};
const settings = phoenix.settings.define({
  showAccessory: { type: "switch", title: "Show note under messages", default: true },
});

function setNote(userId: string, note: string) {
  const n = load();
  if (note.trim()) n[userId] = note.trim();
  else delete n[userId];
  phoenix.storage.set("notes", n);
  accessory.update?.();
}

const accessory = phoenix.ui.addMessageAccessory({
  placement: "content",
  render(ctx) {
    if (!settings.showAccessory) return null;
    const id = ctx.message?.author.id;
    const note = id ? load()[id] : undefined;
    return note ? { text: `📝 Note: ${note}`, color: 0xff949ba4 } : null;
  },
});

phoenix.ui.addMessageAction({
  label: "User Note",
  icon: "message.actions.edit",
  async onPress(ctx) {
    const user = ctx.message?.author;
    if (!user) return phoenix.ui.toast("Message not cached");
    const note = load()[user.id];
    const name = user.global_name || user.username;
    const i = await phoenix.ui.showSheet({
      title: `Note for ${name}`,
      text: note ?? "No note yet.\n\nSet one with /usernote " + user.id + " <note>",
      options: note ? ["Copy", "Edit (prefill command)", { label: "Delete", danger: true }] : ["Copy user ID"],
    });
    if (!note) {
      if (i === 0) phoenix.ui.copy(user.id);
      return;
    }
    if (i === 0) phoenix.ui.copy(note);
    else if (i === 1) {
      phoenix.ui.copy(`/usernote ${user.id} ${note}`);
      phoenix.ui.toast("Command copied, paste and edit it");
    } else if (i === 2) {
      setNote(user.id, "");
      phoenix.ui.toast("Note deleted");
    }
  },
});

phoenix.commands.register({
  name: "usernote",
  description: "User notes: /usernote <userId> [note] (empty note shows it, '-' deletes)",
  execute(args, ctx) {
    const m = args.trim().match(/^<?@?!?(\d{15,25})>?\s*([\s\S]*)$/);
    if (!m) return void ctx.reply("Usage: `/usernote <userId> [note]`, `-` to delete");
    const [, id, text] = m;
    if (!text) return void ctx.reply(load()[id] ? `Note for <@${id}>: ${load()[id]}` : `No note for <@${id}>.`);
    setNote(id, text === "-" ? "" : text);
    ctx.reply(text === "-" ? `Deleted note for <@${id}>.` : `Saved note for <@${id}>.`);
  },
});
