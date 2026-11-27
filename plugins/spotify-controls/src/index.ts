// @description Control Spotify or Apple Music playback directly from Discord Phoenix (/spotify, /np) via native macOS media controls
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Media

const settings = phoenix.settings.define({
  player: {
    type: "select",
    title: "Music Player",
    description: "Which macOS app to control",
    default: "spotify",
    options: [
      { value: "spotify", label: "Spotify" },
      { value: "music", label: "Apple Music" },
    ],
  },
});

type Player = "spotify" | "music";

function getPlayer(): Player {
  return settings.player === "music" ? "music" : "spotify";
}

function queryState(player: Player): string {
  if (typeof phoenix.ui.mediaControl !== "function") {
    return "Media controls require macOS Sunbird";
  }
  try {
    const raw = phoenix.ui.mediaControl(player, "state");
    if (raw === "not_running") return `${player === "spotify" ? "Spotify" : "Apple Music"} is not running`;
    if (raw === "stopped") return "Playback stopped";
    const [state, track, artist, album] = raw.split("\t");
    return `${state === "playing" ? "▶" : "⏸"} ${track || "Unknown"} — ${artist || "Unknown"}${album ? ` (${album})` : ""}`;
  } catch (err) {
    return `Error: ${String(err)}`;
  }
}

let hud: Phoenix.PageHandle | null = null;

function openHud(player: Player) {
  const control = (cmd: "playpause" | "next" | "previous") => () => {
    try {
      phoenix.ui.mediaControl?.(player, cmd);
    } catch (err) {
      phoenix.ui.toast(`Error: ${String(err)}`);
    }
    openHud(player);
  };
  let info = queryState(player);
  const raw = (() => {
    try {
      return phoenix.ui.mediaControl?.(player, "state") ?? "";
    } catch {
      return "";
    }
  })();
  const [state, track, artist, album] = raw.split("\t");
  if (track) info = `${state === "playing" ? "▶ Playing" : "⏸ Paused"}\n\n🎵 ${track}\n👤 ${artist || "Unknown"}\n💿 ${album || "Unknown"}`;
  hud?.close();
  hud = phoenix.ui.openPage({
    title: player === "spotify" ? "Spotify Mini-Player" : "Apple Music Mini-Player",
    sections: [
      { type: "text", title: "Now Playing", text: info },
      {
        type: "buttons",
        buttons: [
          { label: "⏮ Prev", onPress: control("previous") },
          { label: "⏯ Play/Pause", onPress: control("playpause") },
          { label: "⏭ Next", onPress: control("next") },
          { label: "🔄 Refresh", onPress: () => openHud(player) },
        ],
      },
    ],
  });
}

phoenix.onUnload(() => hud?.close());

phoenix.commands.register({
  name: "spotify",
  description: "Open Spotify/Music playback controls or run /spotify play|next|prev|np|hud",
  async execute(args) {
    if (typeof phoenix.ui.mediaControl !== "function") {
      phoenix.ui.toast("Media controls require macOS Sunbird");
      return;
    }
    const player = getPlayer();
    const sub = args.trim().toLowerCase();
    if (sub === "play" || sub === "pause" || sub === "playpause") {
      phoenix.ui.mediaControl(player, "playpause");
      phoenix.ui.toast(queryState(player));
      return;
    }
    if (sub === "next" || sub === "skip") {
      phoenix.ui.mediaControl(player, "next");
      phoenix.ui.toast(queryState(player));
      return;
    }
    if (sub === "prev" || sub === "previous" || sub === "back") {
      phoenix.ui.mediaControl(player, "previous");
      phoenix.ui.toast(queryState(player));
      return;
    }
    if (sub === "hud") {
      openHud(player);
      return;
    }
    if (sub === "np") {
      return `🎵 Now Playing: ${queryState(player)}`;
    }
    const status = queryState(player);
    const idx = await phoenix.ui.choose({
      // No `message`: that dialog form shows only three buttons.
      title: `${player === "spotify" ? "Spotify" : "Apple Music"} — ${status}`,
      options: ["⏯ Play / Pause", "⏭ Next Track", "⏮ Previous Track", "📋 Copy Now Playing", "🪟 Float Mini-Player HUD"],
    });
    if (idx === 0) phoenix.ui.mediaControl(player, "playpause");
    else if (idx === 1) phoenix.ui.mediaControl(player, "next");
    else if (idx === 2) phoenix.ui.mediaControl(player, "previous");
    else if (idx === 3) {
      phoenix.ui.copy(status);
      phoenix.ui.toast("Copied now playing");
      return;
    } else if (idx === 4) {
      openHud(player);
      return;
    }
    if (idx >= 0) phoenix.ui.toast(queryState(player));
  },
});

phoenix.commands.register({
  name: "np",
  description: "Send your currently playing Spotify or Apple Music track to chat",
  execute() {
    const status = queryState(getPlayer());
    if (status.startsWith("Error:") || status.includes("not running") || status === "Playback stopped") {
      phoenix.ui.toast(status);
      return;
    }
    return `🎵 ${status}`;
  },
});
