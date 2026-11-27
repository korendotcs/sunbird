// @description Inspect exact creation date & metadata of any Discord snowflake ID (/snowflake <id>)
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const DISCORD_EPOCH = 1420070400000n;

function formatSnowflake(id: string): string {
  const n = BigInt(id.trim());
  const ms = Number((n >> 22n) + DISCORD_EPOCH);
  const worker = Number((n & 0x3e0000n) >> 17n);
  const process = Number((n & 0x1f000n) >> 12n);
  const inc = Number(n & 0xfffn);
  return [
    `Snowflake: ${id.trim()}`,
    `Created:   ${new Date(ms).toISOString()} (${new Date(ms).toLocaleString()})`,
    `Unix (ms): ${ms}`,
    `Worker:    ${worker} | Process: ${process} | Increment: ${inc}`,
  ].join("\n");
}

phoenix.commands.register({
  name: "snowflake",
  description: "Decode a Discord snowflake ID into its exact creation timestamp",
  execute(args, ctx) {
    if (!/^\d{15,22}$/.test(args.trim())) {
      ctx.reply("Usage: `/snowflake <discord_id>`");
      return;
    }
    phoenix.ui.showSheet({ title: "Snowflake Info", text: formatSnowflake(args), monospace: true });
  },
});

phoenix.ui.addMessageAction({
  label: "Inspect Snowflake",
  onPress(ctx) {
    if (!ctx.messageId) return;
    phoenix.ui.showSheet({ title: "Message Snowflake", text: formatSnowflake(ctx.messageId), monospace: true });
  },
});
