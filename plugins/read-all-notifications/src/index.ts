// @description Marks every unread channel and DM as read with /readall
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const { gateway, discord } = phoenix;

const lastMessage = new Map<string, string>(); // channel -> newest message id
const lastRead = new Map<string, string>(); // channel -> newest read message id

const newer = (a: string, b: string | undefined) => !b || BigInt(a) > BigInt(b);
const seen = (c: { id: string; last_message_id?: string | null }) => {
  if (c?.id && c.last_message_id) lastMessage.set(c.id, c.last_message_id);
};

const on = (sig: Phoenix.Sig<unknown> | undefined, fn: (p: any) => void) => sig && phoenix.on(sig, fn);
on(gateway.ready, (r: any) => {
  for (const c of r?.private_channels ?? []) seen(c);
  for (const g of r?.guilds ?? []) for (const c of [...(g.channels ?? []), ...(g.threads ?? [])]) seen(c);
  const entries = Array.isArray(r?.read_state) ? r.read_state : (r?.read_state?.entries ?? []);
  for (const e of entries) if (e?.id && e.last_message_id && !e.read_state_type) lastRead.set(e.id, String(e.last_message_id));
});
on(gateway.guildCreate, (g: any) => [...(g?.channels ?? []), ...(g?.threads ?? [])].forEach(seen));
on(gateway.channelCreate, seen);
on(gateway.messageAck, (p: any) => p?.channel_id && p.message_id && lastRead.set(p.channel_id, p.message_id));
phoenix.on(gateway.messageCreate, (m) => lastMessage.set(m.channel_id, m.id));

phoenix.commands.register({
  name: "readall",
  description: "Mark all unread channels and DMs as read",
  async execute(_args, ctx) {
    const unread = [...lastMessage]
      .filter(([ch, id]) => lastRead.has(ch) && newer(id, lastRead.get(ch)))
      .map(([channel_id, message_id]) => ({ channel_id, message_id, read_state_type: 0 }));
    if (!unread.length) return void phoenix.ui.toast("Nothing unread");
    let done = 0;
    // The endpoint takes at most 100 read states per call.
    for (let i = 0; i < unread.length; i += 100) {
      const chunk = unread.slice(i, i + 100);
      const res = await discord.post("/read-states/ack-bulk", { read_states: chunk });
      if (!res.ok) {
        ctx.reply(`Marked ${done} channels read, then Discord answered ${res.status}.`);
        return;
      }
      for (const r of chunk) lastRead.set(r.channel_id, r.message_id);
      done += chunk.length;
    }
    phoenix.ui.toast(`Marked ${done} channel${done === 1 ? "" : "s"} as read`);
  },
});
