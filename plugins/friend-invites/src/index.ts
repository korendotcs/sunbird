// @description Create, list, and revoke Discord friend invite links with /friend-invite
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

phoenix.commands.register({
  name: "friend-invite",
  description: "Create, list, or revoke friend invite links (/friend-invite [create|list|revoke])",
  async execute(args, ctx) {
    const sub = (args.trim().toLowerCase() || "create");
    try {
      if (sub === "list") {
        const res = await phoenix.discord.get("/users/@me/invites");
        const invites = res.json<Array<{ code: string; uses: number; max_uses: number }>>();
        if (!invites.length) {
          ctx.reply("You have no active friend invites.");
          return;
        }
        ctx.reply(invites.map((i) => `https://discord.gg/${i.code} (${i.uses}/${i.max_uses} uses)`).join("\n"));
      } else if (sub === "revoke") {
        await phoenix.discord.delete("/users/@me/invites");
        ctx.reply("Revoked all active friend invites.");
      } else {
        const res = await phoenix.discord.post("/users/@me/invites", {});
        const inv = res.json<{ code: string }>();
        const url = `https://discord.gg/${inv.code}`;
        phoenix.ui.copy(url);
        ctx.reply(`Created & copied friend invite: ${url}`);
      }
    } catch (err) {
      ctx.reply(`Friend invite failed: ${err}`);
    }
  },
});
