// @description Moves opened server folders into a dedicated Folder Sidebar column next to Discord's server list (plus close-other-folders & close-on-select)
// @version 3.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const settings = phoenix.settings.define({
  sidebar: {
    type: "switch",
    title: "Display Folder Sidebar",
    description: "Move an opened folder's servers into a dedicated sibling column right beside Discord's server list",
    default: true,
  },
  closeOthers: {
    type: "switch",
    title: "Close other folders",
    description: "When Folder Sidebar is off, automatically collapse other open folders when opening one",
    default: true,
  },
  closeOnSelect: {
    type: "switch",
    title: "Close folder when selecting a server",
    description: "Automatically close the Folder Sidebar after clicking a server inside it",
    default: false,
  },
});

const unpad = (id: string) => id.replace(/^0+/, "");

async function syncFoldersFromDiscord() {
  if (typeof phoenix.ui.setBetterFoldersData !== "function") return;
  try {
    const protoRows = await phoenix.stores.sql<{ v: string }>(
      "SELECT CAST(v AS TEXT) AS v FROM user_settings_proto WHERE k = 'settings.v2' LIMIT 1"
    );
    const rawProto = protoRows?.[0]?.v;
    if (!rawProto) return;
    const parsed = JSON.parse(rawProto) as {
      guild_folders?: { id?: number | string | null; name?: string | null; guild_ids?: string[] }[];
    };
    const folders = parsed.guild_folders ?? [];

    const guildNames = new Map<string, string>();
    try {
      const guildRows = await phoenix.stores.sql<{ k: string; name: string | null }>(
        "SELECT k, COALESCE(json_extract(CAST(v AS TEXT), '$.properties.name'), json_extract(CAST(v AS TEXT), '$.name')) AS name FROM guilds"
      );
      for (const row of guildRows ?? []) {
        if (row.k && row.name) guildNames.set(unpad(row.k), row.name);
      }
    } catch {
      // fallback below
    }
    if (guildNames.size === 0) {
      const res = await phoenix.discord.get("/users/@me/guilds").catch(() => null);
      if (res?.ok) {
        const list = res.json() as { id: string; name: string }[];
        for (const g of list ?? []) guildNames.set(String(g.id), g.name);
      }
    }

    const out: Record<string, { name: string; guilds: { id: string; name: string }[] }> = {};
    for (const f of folders) {
      if (f.id == null) continue;
      const fid = String(f.id);
      const guilds = (f.guild_ids ?? []).map((gid) => {
        const id = String(gid);
        return { id, name: guildNames.get(id) ?? id };
      });
      if (guilds.length > 0) {
        out[fid] = { name: f.name || "Folder", guilds };
      }
    }
    phoenix.ui.setBetterFoldersData(JSON.stringify(out));
  } catch (err) {
    phoenix.log.warn(`better-folders: sync failed: ${String(err)}`);
  }
}

function syncOptions() {
  if (typeof phoenix.ui.setBetterFolders === "function") {
    phoenix.ui.setBetterFolders(
      Boolean(settings.sidebar),
      Boolean(settings.closeOthers),
      Boolean(settings.closeOnSelect)
    );
  }
}

syncOptions();
syncFoldersFromDiscord();

if (phoenix.gateway.guildCreate) {
  phoenix.on(phoenix.gateway.guildCreate, () => {
    syncFoldersFromDiscord();
  });
}

phoenix.commands.register({
  name: "folders",
  description: "BetterFolders controls: /folders sync | /folders close",
  async execute(args) {
    const sub = args.trim().toLowerCase() || "sync";
    if (sub === "close" || sub === "collapse") {
      phoenix.ui.collapseAllFolders?.();
      phoenix.ui.toast("Closed Folder Sidebar");
      return;
    }
    syncOptions();
    await syncFoldersFromDiscord();
    phoenix.ui.toast("Synced Discord server folders to Folder Sidebar");
  },
});
