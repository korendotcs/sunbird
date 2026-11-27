// @description Schedule messages with /schedule <delay e.g. 5m, 1h30m> <message>, plus /schedule list and /schedule cancel
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

interface Job { id: number; channelId: string; at: number; content: string }

const KEY = "queue";
const UNITS: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
const USAGE = "Usage: `/schedule 10m message`, `/schedule list`, `/schedule cancel <#|all>`";

let queue = phoenix.storage.get<Job[]>(KEY) ?? [];
const save = (jobs: Job[]) => phoenix.storage.set(KEY, (queue = jobs));

const parseDelay = (spec: string) => {
  let ms = 0;
  for (const [, n, unit] of spec.matchAll(/(\d+)([smhd])/g)) ms += Number(n) * UNITS[unit];
  return ms;
};

const when = (at: number) => {
  const left = Math.max(0, at - Date.now());
  const mins = Math.round(left / 60000);
  return `${new Date(at).toLocaleTimeString()} (in ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`})`;
};

const tick = () => {
  const now = Date.now();
  if (!queue.some((j) => j.at <= now)) return;
  const due = queue.filter((j) => j.at <= now);
  save(queue.filter((j) => j.at > now));
  for (const job of due) {
    phoenix.discord
      .post(`/channels/${job.channelId}/messages`, { content: job.content })
      .then((res) => !res.ok && phoenix.ui.toast(`Scheduled message #${job.id} failed (${res.status})`))
      .catch((e) => phoenix.log.error("scheduled send failed", e));
  }
};

// ponytail: QuickJS here has no timers, so due jobs go out on the next gateway event (seconds on an active
// account, longer when idle). Switch to a host timer if the runtime grows one.
const g = globalThis as { setInterval?: (fn: () => void, ms: number) => unknown; clearInterval?: (id: unknown) => void };
if (g.setInterval) {
  const id = g.setInterval(tick, 5000);
  phoenix.onUnload(() => g.clearInterval?.(id));
} else {
  for (const event of ["messageCreate", "messageUpdate", "typingStart", "presenceUpdate", "messageAck", "voiceStateUpdate", "messageReactionAdd", "channelUnreadUpdate"]) {
    const sig = phoenix.gateway[event];
    if (sig) phoenix.on(sig as Phoenix.Sig<unknown>, tick);
  }
}

phoenix.commands.register({
  name: "schedule",
  description: "Send a message later: /schedule 5m hello · list · cancel <#|all>",
  execute(args, ctx) {
    tick();
    const input = args.trim();
    const jobs = queue;
    if (input === "list") {
      const mine = [...jobs].sort((a, b) => a.at - b.at);
      return void ctx.reply(
        mine.length
          ? mine.map((j) => `#${j.id} → <#${j.channelId}> at ${when(j.at)}: ${j.content.slice(0, 80)}`).join("\n")
          : "No scheduled messages.",
      );
    }
    const cancel = input.match(/^cancel\s+(all|\d+)$/);
    if (cancel) {
      const left = cancel[1] === "all" ? [] : jobs.filter((j) => j.id !== Number(cancel[1]));
      save(left);
      return void ctx.reply(`Cancelled ${jobs.length - left.length} scheduled message(s).`);
    }
    const m = input.match(/^((?:\d+[smhd])+)\s+([\s\S]+)$/);
    const delay = m ? parseDelay(m[1]) : 0;
    if (!m || !delay || !ctx.channelId) return void ctx.reply(USAGE);
    const job: Job = {
      id: jobs.reduce((max, j) => Math.max(max, j.id), 0) + 1,
      channelId: ctx.channelId,
      at: Date.now() + delay,
      content: m[2],
    };
    save([...jobs, job]);
    ctx.reply(`Scheduled #${job.id} for ${when(job.at)}. Cancel with \`/schedule cancel ${job.id}\`.`);
  },
});
