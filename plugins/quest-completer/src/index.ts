// @description List Discord quests and enroll, send video progress or heartbeats with /quests
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

interface Quest {
  id: string;
  config?: {
    expires_at?: string;
    messages?: { quest_name?: string; game_title?: string };
    task_config?: { tasks?: Record<string, { target?: number }> };
    task_config_v2?: { tasks?: Record<string, { target?: number }> };
    rewards_config?: { rewards?: { messages?: { name?: string } }[] };
  };
  user_status?: {
    enrolled_at?: string | null;
    completed_at?: string | null;
    claimed_at?: string | null;
    progress?: Record<string, { value?: number }>;
  } | null;
}

function line(q: Quest): { group: string; text: string } {
  const c = q.config ?? {};
  const s = q.user_status ?? {};
  const name = c.messages?.quest_name || c.messages?.game_title || q.id;
  const tasks = c.task_config_v2?.tasks ?? c.task_config?.tasks ?? {};
  const progress = Object.entries(tasks).map(([task, t]) => {
    const v = s.progress?.[task]?.value ?? 0;
    const target = t.target ?? 0;
    const pct = target ? Math.min(100, Math.round((v / target) * 100)) : 0;
    return `${task.toLowerCase().replace(/_/g, " ")}: ${Math.round(v)}/${target} (${pct}%)`;
  });
  const reward = c.rewards_config?.rewards?.[0]?.messages?.name;
  const group = s.claimed_at ? "Claimed" : s.completed_at ? "Claimable" : s.enrolled_at ? "Enrolled" : "Available";
  const text = [
    `• ${name}${reward ? ` → ${reward}` : ""}`,
    progress.length ? `  ${progress.join(", ")}` : "",
    c.expires_at ? `  expires ${c.expires_at.slice(0, 10)}` : "",
  ].filter(Boolean).join("\n");
  return { group, text };
}

async function fetchQuests(): Promise<Quest[]> {
  const res = await phoenix.discord.get("/quests/@me");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = res.json() as { quests?: Quest[] } | Quest[];
  return Array.isArray(body) ? body : body.quests ?? [];
}

const taskTarget = (q: Quest | undefined, task: string) =>
  (q?.config?.task_config_v2?.tasks ?? q?.config?.task_config?.tasks ?? {})[task]?.target;

async function act(label: string, path: string, body: object) {
  try {
    const res = await phoenix.discord.post(path, body);
    const raw = res.text();
    let text = raw;
    try {
      text = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {}
    phoenix.ui.toast(res.ok ? `✅ ${label}` : `❌ ${label} failed (${res.status})`);
    await phoenix.ui.showSheet({ title: `${res.ok ? "✅" : "❌"} ${label}`, text: text || `HTTP ${res.status}`, monospace: true, highlight: true });
  } catch (e) {
    phoenix.ui.toast(`❌ ${label} failed: ${e}`);
  }
}

async function list(ctx: Phoenix.UiContext) {
  const quests = await fetchQuests().catch((e) => {
    ctx.reply(`Quest request failed: ${e}`);
    return null;
  });
  if (!quests) return;
  const now = new Date().toISOString();
  const active = quests.filter((q) => !q.config?.expires_at || q.config.expires_at > now);
  if (!active.length) return void ctx.reply("No active quests.");
  const groups: Record<string, string[]> = { Claimable: [], Enrolled: [], Available: [], Claimed: [] };
  for (const q of active) {
    const { group, text } = line(q);
    groups[group].push(`${text}\n  id ${q.id}`);
  }
  const text = Object.entries(groups)
    .filter(([, v]) => v.length)
    .map(([g, v]) => `── ${g} (${v.length}) ──\n${v.join("\n")}`)
    .join("\n\n") + "\n\n/quests enroll <id> · /quests progress <id> [seconds] · /quests heartbeat <id>";
  const i = await phoenix.ui.showSheet({ title: `🎯 Quests (${active.length})`, text, options: ["Copy", "Open Quests page"] });
  if (i === 0) phoenix.ui.copy(text);
  else if (i === 1) {
    const url = "https://discord.com/quest-home";
    if (phoenix.ui.openUrl) phoenix.ui.openUrl(url);
    else phoenix.ui.copy(url), phoenix.ui.toast("Link copied");
  }
}

phoenix.commands.register({
  name: "quests",
  description: "List quests, or: enroll <id> | progress <id> [seconds] | heartbeat <id>",
  async execute(args, ctx) {
    const [sub, id, extra] = args.trim().split(/\s+/);
    if (!sub) return list(ctx);
    if (!id || !/^\d+$/.test(id)) return void ctx.reply("Usage: /quests [enroll|progress|heartbeat] <quest id> [seconds]");
    switch (sub.toLowerCase()) {
      case "enroll":
        return act("Enrolled", `/quests/${id}/enroll`, { location: 11, is_targeted: false });
      case "progress": {
        let timestamp = Number(extra);
        if (!extra || !Number.isFinite(timestamp)) {
          // No seconds given: jump straight to the video task's target.
          const q = (await fetchQuests().catch(() => [])).find((x) => x.id === id);
          timestamp = taskTarget(q, "WATCH_VIDEO") ?? taskTarget(q, "WATCH_VIDEO_ON_MOBILE") ?? NaN;
          if (!Number.isFinite(timestamp)) return void ctx.reply("Couldn't find the video target; pass seconds: /quests progress <id> <seconds>");
        }
        return act(`Video progress ${timestamp}s`, `/quests/${id}/video-progress`, { timestamp });
      }
      case "heartbeat":
        return act("Heartbeat sent", `/quests/${id}/heartbeat`, { stream_key: `call:${ctx.channelId ?? "1"}:1`, terminal: false });
      default:
        return void ctx.reply(`Unknown subcommand "${sub}". Use enroll, progress or heartbeat.`);
    }
  },
});
