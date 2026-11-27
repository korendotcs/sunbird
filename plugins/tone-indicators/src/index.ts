// @description Explains tone indicators (/s, /j, /gen, /srs, /lh, etc.) under messages
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Messaging

const TONES: Record<string, string> = {
  "/j": "joking",
  "/hj": "half joking",
  "/s": "sarcastic",
  "/sarc": "sarcastic",
  "/srs": "serious",
  "/nsrs": "not serious",
  "/lh": "light-hearted",
  "/gen": "genuine",
  "/g": "genuine",
  "/genq": "genuine question",
  "/t": "teasing",
  "/nm": "not mad",
  "/lu": "a little upset",
  "/nbh": "nobody here",
  "/nbr": "not being rude",
  "/ot": "off topic",
  "/th": "threat",
  "/cb": "clickbait",
  "/f": "fake",
  "/q": "quote",
  "/ly": "lyrics",
  "/c": "copypasta",
  "/m": "metaphor",
  "/li": "literal",
  "/rt": "rhetorical",
  "/hyp": "hyperbole",
  "/p": "platonic",
  "/r": "romantic",
  "/pos": "positive",
  "/neg": "negative",
  "/neu": "neutral",
  "/info": "informative",
};

const RE = /(?:^|\s)(\/[a-z]{1,5})(?=$|[\s.,!?])/gi;

phoenix.ui.addMessageAccessory({
  render(ctx) {
    const content = ctx.message?.content;
    if (!content || !content.includes("/")) return null;
    const found: string[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    RE.lastIndex = 0;
    while ((m = RE.exec(content)) !== null) {
      const key = m[1].toLowerCase();
      if (TONES[key] && !seen.has(key)) {
        seen.add(key);
        found.push(`${key} = ${TONES[key]}`);
      }
    }
    if (!found.length) return null;
    return { text: `Tone: ${found.join(" · ")}`, color: 0xff949ba4 };
  },
});
