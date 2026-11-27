// @description Show your Last.fm now-playing track as a Listening activity
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const settings = phoenix.settings.define({
  username: { type: "text", title: "Last.fm username", default: "" },
  apiKey: {
    type: "secret",
    title: "Last.fm API key",
    description: "Optional; a shared public key is used when empty",
    default: "",
  },
  showAlbum: { type: "switch", title: "Show album", default: true },
});

// ponytail: public key used by Equicord's LastFM plugin; set your own if it gets rate limited.
const FALLBACK_KEY = "790c37d90400163a5a5fe00d6ca32ef0";

interface Track {
  name: string;
  artist: { "#text": string };
  album?: { "#text": string };
  url?: string;
  image?: { size: string; "#text": string }[];
  "@attr"?: { nowplaying?: string };
}

let current: { name: string; artist: string; album: string; url?: string; image?: string } | null = null;
let startedAt = Date.now();

async function poll(): Promise<string> {
  const user = settings.username.trim();
  if (!user) return "Set your Last.fm username in the plugin settings.";
  const key = settings.apiKey.trim() || FALLBACK_KEY;
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json&limit=1`;
  const res = await phoenix.fetch(url);
  if (!res.ok) return `Last.fm error ${res.status}`;
  const t = res.json<{ recenttracks?: { track?: Track[] } }>().recenttracks?.track?.[0];
  const playing = t?.["@attr"]?.nowplaying === "true";
  const prev = current;
  current = playing && t ? {
    name: t.name,
    artist: t.artist["#text"],
    album: t.album?.["#text"] ?? "",
    url: t.url,
    image: t.image?.find((i) => i.size === "large")?.["#text"] || undefined,
  } : null;
  if (current && (prev?.name !== current.name || prev?.artist !== current.artist)) startedAt = Date.now();
  return current ? `🎵 Now playing: **${current.name}** by ${current.artist}${current.album ? ` (${current.album})` : ""}` : "Nothing playing on Last.fm right now.";
}

function activity(): Record<string, unknown> | null {
  if (!current) return null;
  const a: Record<string, unknown> = {
    name: current.artist,
    type: 2,
    details: current.name,
    state: settings.showAlbum && current.album ? `on ${current.album}` : `by ${current.artist}`,
    timestamps: { start: startedAt },
  };
  if (current.url) a.url = current.url;
  return a;
}

let last: Record<string, unknown> | null = null;

phoenix.gateway.onSend(3, (d) => {
  const list = Array.isArray(d.activities) ? (d.activities as Record<string, unknown>[]) : [];
  // Drop the copy injected last time so a new track replaces it instead of stacking.
  const kept = list.filter((a) => !(last && a.type === 2 && a.name === last.name && a.details === last.details));
  last = activity();
  d.activities = last ? [last, ...kept] : kept;
});

// The client resends OP 3 when its settings change, so re-saving the status pushes the activity.
async function refresh() {
  try {
    const res = await phoenix.discord.get("/users/@me/settings");
    const status = res.ok ? res.json<{ status?: string }>().status : undefined;
    if (status) await phoenix.discord.patch("/users/@me/settings", { status });
  } catch (e) {
    phoenix.log.warn("lastfm refresh failed", e);
  }
}

phoenix.commands.register({
  name: "lastfm",
  description: "Fetch your Last.fm now-playing track and set it as your activity (/lastfm clear to remove)",
  async execute(args, ctx) {
    if (args.trim().toLowerCase() === "clear") {
      current = null;
      await refresh();
      return void ctx.reply("Last.fm activity cleared.");
    }
    try {
      ctx.reply(await poll());
      await refresh();
    } catch (e) {
      ctx.reply(`Last.fm request failed: ${e}`);
    }
  },
});
