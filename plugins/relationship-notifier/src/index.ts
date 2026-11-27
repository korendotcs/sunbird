// @description Notifies you when a friend removes you or you are removed from a server or group DM
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Notifications

const friends = new Map<string, string>();
const guilds = new Map<string, string>();

phoenix.on(phoenix.gateway.ready, (raw) => {
  const data = raw as unknown as {
    relationships?: Array<{ type?: number; user?: { id?: string; global_name?: string; username?: string } }>;
    guilds?: Array<{ id?: string; name?: string; properties?: { name?: string } }>;
  };
  if (Array.isArray(data?.relationships)) {
    for (const r of data.relationships) {
      if (r?.type === 1 && r.user?.id) {
        friends.set(r.user.id, r.user.global_name || r.user.username || r.user.id);
      }
    }
  }
  if (Array.isArray(data?.guilds)) {
    for (const g of data.guilds) {
      const n = g?.properties?.name || g?.name;
      if (g?.id && n) guilds.set(g.id, n);
    }
  }
});

const relAdd = phoenix.gateway.relationshipAdd;
if (relAdd) {
  phoenix.on(relAdd, (raw) => {
    const r = raw as { type?: number; user?: { id?: string; global_name?: string; username?: string } } | null;
    if (r?.type === 1 && r.user?.id) {
      friends.set(r.user.id, r.user.global_name || r.user.username || r.user.id);
    }
  });
}

const relRem = phoenix.gateway.relationshipRemove;
if (relRem) {
  phoenix.on(relRem, (raw) => {
    const r = raw as { id?: string; type?: number } | null;
    if (!r?.id) return;
    const name = friends.get(r.id);
    friends.delete(r.id);
    if (r.type === 1 || name) {
      phoenix.ui.notify({
        title: "Friend Removed",
        body: `${name ?? r.id} is no longer on your friends list.`,
        accent: 0xffed4245,
      });
    }
  });
}

phoenix.on(phoenix.gateway.guildCreate, (raw) => {
  const g = raw as unknown as { id?: string; name?: string; properties?: { name?: string } };
  const n = g?.properties?.name || g?.name;
  if (g?.id && n) guilds.set(g.id, n);
});

const guildDel = phoenix.gateway.guildDelete;
if (guildDel) {
  phoenix.on(guildDel, (raw) => {
    const g = raw as { id?: string; unavailable?: boolean } | null;
    if (!g?.id || g.unavailable) return;
    const name = guilds.get(g.id) ?? g.id;
    guilds.delete(g.id);
    phoenix.ui.notify({
      title: "Removed from Server",
      body: `You were removed from or left ${name}.`,
      accent: 0xfffaa61a,
    });
  });
}
