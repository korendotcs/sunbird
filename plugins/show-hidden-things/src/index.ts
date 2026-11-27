// @description Adds an "Inspect Channel & Author Details" message action showing raw IDs, flags and hidden metadata
// @version 1.0.0
// @author Equicord (ported to Sunbird)
// @category Utility

const MESSAGE_FLAGS = [
  "CROSSPOSTED", "IS_CROSSPOST", "SUPPRESS_EMBEDS", "SOURCE_MESSAGE_DELETED", "URGENT", "HAS_THREAD", "EPHEMERAL",
  "LOADING", "FAILED_TO_MENTION_SOME_ROLES_IN_THREAD", "", "", "", "SUPPRESS_NOTIFICATIONS", "IS_VOICE_MESSAGE",
  "HAS_SNAPSHOT", "IS_COMPONENTS_V2",
];
const USER_FLAGS: Record<number, string> = {
  0: "STAFF", 1: "PARTNER", 2: "HYPESQUAD", 3: "BUG_HUNTER_LEVEL_1", 6: "HYPESQUAD_BRAVERY", 7: "HYPESQUAD_BRILLIANCE",
  8: "HYPESQUAD_BALANCE", 9: "PREMIUM_EARLY_SUPPORTER", 10: "TEAM_PSEUDO_USER", 14: "BUG_HUNTER_LEVEL_2",
  16: "VERIFIED_BOT", 17: "VERIFIED_DEVELOPER", 18: "CERTIFIED_MODERATOR", 19: "BOT_HTTP_INTERACTIONS",
  20: "SPAMMER", 22: "ACTIVE_DEVELOPER", 23: "PROVISIONAL_ACCOUNT", 44: "QUARANTINED", 50: "COLLABORATOR",
  51: "RESTRICTED_COLLABORATOR",
};
const CHANNEL_FLAGS: Record<number, string> = {
  1: "PINNED", 4: "REQUIRE_TAG", 15: "HIDE_MEDIA_DOWNLOAD_OPTIONS",
};
const CHANNEL_TYPES: Record<number, string> = {
  0: "GUILD_TEXT", 1: "DM", 2: "GUILD_VOICE", 3: "GROUP_DM", 4: "GUILD_CATEGORY", 5: "GUILD_ANNOUNCEMENT",
  10: "ANNOUNCEMENT_THREAD", 11: "PUBLIC_THREAD", 12: "PRIVATE_THREAD", 13: "GUILD_STAGE_VOICE", 14: "GUILD_DIRECTORY",
  15: "GUILD_FORUM", 16: "GUILD_MEDIA",
};

const created = (id: string) => new Date(Number(BigInt(id) >> 22n) + 1420070400000).toISOString();

const bits = (value: number | undefined, names: Record<number, string> | string[]) => {
  if (!value) return "none";
  const out: string[] = [];
  for (let bit = 0; bit < 53; bit++) {
    if (Math.floor(value / 2 ** bit) % 2) out.push((names as Record<number, string>)[bit] || `1<<${bit}`);
  }
  return `${value} (${out.join(", ")})`;
};

phoenix.ui.addMessageAction({
  label: "Inspect Channel & Author Details",
  icon: "res://ic_mana_id",
  async onPress(ctx) {
    const m = ctx.message;
    const channelId = m?.channel_id ?? ctx.channelId;
    let channel: Phoenix.Channel | null = null;
    if (channelId) {
      try {
        const res = await phoenix.discord.get(`/channels/${channelId}`);
        if (res.ok) channel = res.json<Phoenix.Channel>();
      } catch {}
    }
    const guildId = (m as Phoenix.GatewayMessage | undefined)?.guild_id ?? channel?.guild_id;
    const a = m?.author;
    const lines = [
      "── Message ──",
      `ID:          ${ctx.messageId}`,
      `Created:     ${created(ctx.messageId)}`,
      ...(m
        ? [
            `Type:        ${m.type}`,
            `Flags:       ${bits(m.flags, MESSAGE_FLAGS)}`,
            `Pinned:      ${m.pinned}  TTS: ${m.tts}  @everyone: ${m.mention_everyone}`,
            `Edited:      ${m.edited_timestamp ?? "never"}`,
            `Nonce:       ${m.nonce ?? "-"}`,
            `Webhook:     ${m.webhook_id ?? "-"}`,
            `Application: ${m.application_id ?? "-"}`,
            `Reference:   ${m.message_reference ? JSON.stringify(m.message_reference) : "-"}`,
            `Attachments: ${m.attachments.length}  Embeds: ${m.embeds.length}  Components: ${m.components?.length ?? 0}`,
          ]
        : ["(message not cached, only its id is known)"]),
      "",
      "── Channel ──",
      `ID:          ${channelId ?? "-"}`,
      `Guild ID:    ${guildId ?? "- (DM)"}`,
      ...(channel
        ? [
            `Name:        ${channel.name ?? "-"}`,
            `Type:        ${channel.type} (${CHANNEL_TYPES[channel.type] ?? "unknown"})`,
            `Parent:      ${channel.parent_id ?? "-"}`,
            `Flags:       ${bits(channel.flags, CHANNEL_FLAGS)}`,
            `NSFW:        ${channel.nsfw ?? false}`,
            `Slowmode:    ${channel.rate_limit_per_user ?? 0}s`,
            `Overwrites:  ${channel.permission_overwrites?.length ?? 0}`,
            `Last msg:    ${channel.last_message_id ?? "-"}`,
            `Topic:       ${channel.topic ?? "-"}`,
          ]
        : []),
      "",
      "── Author ──",
      ...(a
        ? [
            `ID:          ${a.id}`,
            `Username:    ${a.username}${a.discriminator && a.discriminator !== "0" ? `#${a.discriminator}` : ""}`,
            `Display:     ${a.global_name ?? "-"}`,
            `Created:     ${created(a.id)}`,
            `Bot:         ${a.bot ?? false}  System: ${a.system ?? false}`,
            `Public flags: ${bits(a.public_flags, USER_FLAGS)}`,
            `Avatar:      ${a.avatar ?? "default"}`,
            `Clan tag:    ${a.primary_guild?.tag ?? "-"}`,
          ]
        : ["(unknown)"]),
    ];
    const text = lines.join("\n");
    const picked = await phoenix.ui.showSheet({ title: "Hidden Details", text, monospace: true, options: ["Copy"] });
    if (picked === 0) phoenix.ui.copy(text);
  },
});
