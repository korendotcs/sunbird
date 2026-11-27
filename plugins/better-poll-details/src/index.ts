// @description Shows vote counts and percentages for each poll answer under the poll
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const { gateway, ui } = phoenix;

const remover = ui.addMessageAccessory({
  placement: "content",
  render({ message }) {
    const poll = message?.poll;
    if (!poll) return null;
    const counts = new Map((poll.results?.answer_counts ?? []).map((c) => [c.id, c]));
    const total = [...counts.values()].reduce((n, c) => n + c.count, 0);
    const lines = poll.answers.map((a) => {
      const c = counts.get(a.answer_id);
      const n = c?.count ?? 0;
      const pct = total ? ((n / total) * 100).toFixed(1) : "0.0";
      const label = [a.poll_media.emoji?.name && !a.poll_media.emoji.id ? a.poll_media.emoji.name : "", a.poll_media.text ?? ""].join(" ").trim();
      return `${c?.me_voted ? "✔" : "•"} ${label || `Answer ${a.answer_id}`}: ${n} vote${n === 1 ? "" : "s"} (${pct}%)`;
    });
    const ended = poll.results?.is_finalized || (poll.expiry && Date.parse(poll.expiry) < Date.now());
    lines.push(`📊 ${total} total vote${total === 1 ? "" : "s"}${ended ? " · final" : ""}`);
    return lines.join("\n");
  },
});

// Poll results arrive as MESSAGE_UPDATE; redraw that message so counts stay current.
phoenix.on(gateway.messageUpdate, (m) => m.poll && remover.update?.(m.id));
const vote = gateway.messagePollVoteAdd, unvote = gateway.messagePollVoteRemove;
for (const sig of [vote, unvote]) if (sig) phoenix.on(sig, (p: any) => p?.message_id && remover.update?.(p.message_id));
