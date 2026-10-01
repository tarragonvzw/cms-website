import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const KOBOLD_ROLE_ID = "1150548227645526148";

/**
 * Syncs the Kobold Discord role for a user.
 * 
 * If discordUserId is provided, uses it directly.
 * Otherwise, fetches external accounts from Clerk using clerkId to locate a linked Discord account.
 */
export const syncDiscordKoboldRole = internalAction({
  args: {
    clerkId: v.string(),
    isMember: v.boolean(),
    discordUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!botToken || !guildId) {
      console.warn("DISCORD_BOT_TOKEN or DISCORD_GUILD_ID not configured in Convex environment; skipping Discord role sync.");
      return;
    }

    let discordUserId = args.discordUserId;

    // If discordUserId was not provided directly, lookup through Clerk API
    if (!discordUserId) {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (!secretKey) {
        console.warn("CLERK_SECRET_KEY not set; unable to fetch Discord account from Clerk.");
        return;
      }

      try {
        const clerkRes = await fetch(`https://api.clerk.com/v1/users/${args.clerkId}`, {
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
        });

        if (!clerkRes.ok) {
          const errText = await clerkRes.text();
          console.error(`Failed to fetch Clerk user ${args.clerkId}:`, errText);
          return;
        }

        const clerkUserData = await clerkRes.json();
        const externalAccounts: any[] = clerkUserData.external_accounts || [];
        const discordAccount = externalAccounts.find((acc) => {
          const providerStr = String(acc.provider || "").toLowerCase();
          const strategyStr = String(acc.verification?.strategy || "").toLowerCase();
          return providerStr.includes("discord") || strategyStr.includes("discord");
        });

        if (discordAccount) {
          discordUserId =
            discordAccount.provider_user_id ||
            discordAccount.external_id ||
            discordAccount.providerUserId;
        }
      } catch (err) {
        console.error(`Error querying Clerk user ${args.clerkId} for Discord account:`, err);
        return;
      }
    }

    if (!discordUserId) {
      // User doesn't have a linked Discord account
      return;
    }

    try {
      const roleUrl = `${DISCORD_API_BASE}/guilds/${guildId}/members/${discordUserId}/roles/${KOBOLD_ROLE_ID}`;
      const method = args.isMember ? "PUT" : "DELETE";

      const res = await fetch(roleUrl, {
        method,
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 404) {
        console.log(`User ${discordUserId} is not in Discord guild ${guildId} or role does not exist.`);
        return;
      }

      if (!res.ok && res.status !== 204) {
        const errText = await res.text();
        console.error(`Failed to ${args.isMember ? "grant" : "revoke"} Kobold Discord role for ${discordUserId}:`, errText);
      } else {
        console.log(`Successfully ${args.isMember ? "granted" : "revoked"} Kobold role (${KOBOLD_ROLE_ID}) for Discord user ${discordUserId}`);
      }
    } catch (err) {
      console.error(`Error syncing Discord Kobold role for user ${discordUserId}:`, err);
    }
  },
});
