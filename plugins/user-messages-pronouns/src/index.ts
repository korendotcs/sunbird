// @description Displays users' pronouns from PronounDB next to their messages
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const LABELS: Record<string, string> = {
  he: "he/him",
  she: "she/her",
  they: "they/them",
  it: "it/its",
  any: "any pronouns",
  ask: "ask",
  avoid: "avoid pronouns",
  other: "other",
};

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchPronouns(userId: string): Promise<string | null> {
  if (cache.has(userId)) return cache.get(userId) ?? null;
  if (inflight.has(userId)) return inflight.get(userId)!;
  const p = (async () => {
    try {
      const res = await phoenix.fetch(`https://pronoundb.org/api/v2/lookup?platform=discord&ids=${userId}`);
      if (!res.ok) {
        cache.set(userId, null);
        return null;
      }
      const data = res.json<Record<string, { sets?: { en?: string[] } }>>();
      const sets = data?.[userId]?.sets?.en;
      if (!sets?.length) {
        cache.set(userId, null);
        return null;
      }
      const text = sets.length === 1 ? (LABELS[sets[0]] ?? sets[0]) : sets.join("/");
      cache.set(userId, text);
      return text;
    } catch {
      cache.set(userId, null);
      return null;
    } finally {
      inflight.delete(userId);
    }
  })();
  inflight.set(userId, p);
  return p;
}

phoenix.ui.addMessageAccessory({
  placement: "header",
  async render(ctx) {
    const id = ctx.message?.author?.id;
    if (!id || ctx.message?.author?.bot) return null;
    const p = await fetchPronouns(id);
    return p ? { text: `· ${p}`, color: 0xff949ba4 } : null;
  },
});
