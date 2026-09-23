import { mutation, query, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Store or update the authenticated user in the users table.
 * Automatically called upon login/auth sync.
 */
export const storeUser = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storeUser without authentication");
    }

    // Check if user already exists by tokenIdentifier
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    const clerkId = identity.subject;
    const name = args.name ?? identity.name ?? undefined;
    const email = args.email ?? identity.email ?? undefined;
    const imageUrl = args.imageUrl ?? identity.pictureUrl ?? undefined;

    const customClaims = identity as Record<string, unknown>;
    const isAdmin =
      customClaims.admin === "true" || customClaims.admin === true;
    const hasClerkMemberClaim =
      customClaims.isMember === "true" || customClaims.isMember === true;

    if (user !== null) {
      // User exists - update profile details if changed, but preserve their assigned Convex role
      const isMember = user.role === "member" || user.role === "dragon";
      const patchData: {
        name?: string;
        email?: string;
        imageUrl?: string;
        clerkId?: string;
        isMember?: boolean;
      } = {};

      if (name && name !== user.name) patchData.name = name;
      if (email && email !== user.email) patchData.email = email;
      if (imageUrl && imageUrl !== user.imageUrl) patchData.imageUrl = imageUrl;
      if (clerkId && clerkId !== user.clerkId) patchData.clerkId = clerkId;
      if (user.isMember !== isMember) patchData.isMember = isMember;

      if (Object.keys(patchData).length > 0) {
        await ctx.db.patch(user._id, patchData);
      }
      return user._id;
    }

    // New user default role is strictly "user" (or "member" if flagged in Clerk)
    const initialRole: "user" | "member" | "dragon" = hasClerkMemberClaim
      ? "member"
      : "user";
    const isMember = initialRole === "member";

    // Insert new user with default role
    const newUserId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkId,
      name,
      email,
      imageUrl,
      role: initialRole,
      isMember,
    });

    return newUserId;
  },
});

/**
 * Get the currently authenticated user document.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});

/**
 * Get a user document by their Clerk ID.
 */
export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

/**
 * Update a user's role ("user" | "member" | "dragon").
 * If the role is "member" or "dragon", isMember is set to true.
 * Automatically synchronizes isMember to Clerk publicMetadata via background action.
 */
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("user"),
      v.literal("member"),
      v.literal("dragon")
    ),
    membershipExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const isMember = args.role === "member" || args.role === "dragon";
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const expiresAt =
      args.role === "member"
        ? (args.membershipExpiresAt !== undefined
            ? args.membershipExpiresAt
            : user.membershipExpiresAt ?? Date.now() + oneYearMs)
        : undefined;

    await ctx.db.patch(args.userId, {
      role: args.role,
      isMember,
      membershipExpiresAt: expiresAt,
    });

    // Schedule background task to sync isMember and role into Clerk's publicMetadata
    await ctx.scheduler.runAfter(0, internal.users.syncClerkMembership, {
      clerkId: user.clerkId,
      isMember,
      role: args.role,
      membershipExpiresAt: expiresAt,
    });

    return { success: true, role: args.role, isMember, membershipExpiresAt: expiresAt };
  },
});

/**
 * Update a user's role by their Clerk ID.
 * Upserts the user in Convex if they haven't logged in yet.
 */
export const updateUserRoleByClerkId = mutation({
  args: {
    clerkId: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("member"),
      v.literal("dragon")
    ),
    membershipExpiresAt: v.optional(v.number()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const isMember = args.role === "member" || args.role === "dragon";

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const expiresAt =
      args.role === "member"
        ? (args.membershipExpiresAt !== undefined
            ? args.membershipExpiresAt
            : user?.membershipExpiresAt ?? Date.now() + oneYearMs)
        : undefined;

    if (user) {
      await ctx.db.patch(user._id, {
        role: args.role,
        isMember,
        membershipExpiresAt: expiresAt,
      });
    } else {
      const issuer =
        process.env.CLERK_FRONTEND_API_URL?.replace(/^https?:\/\//, "") ||
        "clerk";
      await ctx.db.insert("users", {
        tokenIdentifier: `https://${issuer}|${args.clerkId}`,
        clerkId: args.clerkId,
        name: args.name,
        email: args.email,
        imageUrl: args.imageUrl,
        role: args.role,
        isMember,
        membershipExpiresAt: expiresAt,
      });
    }

    // Schedule background task to sync isMember and role into Clerk's publicMetadata
    await ctx.scheduler.runAfter(0, internal.users.syncClerkMembership, {
      clerkId: args.clerkId,
      isMember,
      role: args.role,
      membershipExpiresAt: expiresAt,
    });

    return { success: true, role: args.role, isMember, membershipExpiresAt: expiresAt };
  },
});

/**
 * Internal action to synchronize isMember status into Clerk's user publicMetadata.
 * This ensures that subsequent JWTs generated by Clerk carry isMember: true/false.
 */
export const syncClerkMembership = internalAction({
  args: {
    clerkId: v.string(),
    isMember: v.boolean(),
    role: v.optional(
      v.union(v.literal("user"), v.literal("member"), v.literal("dragon"))
    ),
    membershipExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      console.warn(
        "CLERK_SECRET_KEY not set in Convex environment; skipping Clerk metadata sync"
      );
      return;
    }

    try {
      const public_metadata: Record<string, unknown> = {
        isMember: args.isMember,
      };
      if (args.role) {
        public_metadata.role = args.role;
      }
      if (args.membershipExpiresAt !== undefined) {
        public_metadata.membershipExpiresAt = args.membershipExpiresAt;
      } else if (!args.isMember) {
        public_metadata.membershipExpiresAt = null;
      }

      const res = await fetch(
        `https://api.clerk.com/v1/users/${args.clerkId}/metadata`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            public_metadata,
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error(
          `Failed to update Clerk publicMetadata for ${args.clerkId}:`,
          errorText
        );
      }
    } catch (err) {
      console.error(
        `Error calling Clerk API for user ${args.clerkId}:`,
        err
      );
    }
  },
});

/**
 * Checks for expired manual memberships and automatically downgrades them to standard "user".
 * Triggered daily via Convex cron.
 */
export const checkExpiredMemberships = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const members = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "member"))
      .collect();

    let expiredCount = 0;
    for (const user of members) {
      // If user has an active Stripe subscription, skip
      if (user.stripeSubscriptionId && user.subscriptionStatus === "active") {
        continue;
      }

      // If user has an expiration timestamp and it has passed
      if (user.membershipExpiresAt !== undefined && user.membershipExpiresAt < now) {
        await ctx.db.patch(user._id, {
          role: "user",
          isMember: false,
          membershipExpiresAt: undefined,
        });

        await ctx.scheduler.runAfter(0, internal.users.syncClerkMembership, {
          clerkId: user.clerkId,
          isMember: false,
          role: "user",
        });
        expiredCount++;
      }
    }
    return { expiredCount };
  },
});

/**
 * List users, optionally filtered by role or membership status.
 */
export const listUsers = query({
  args: {
    role: v.optional(
      v.union(
        v.literal("user"),
        v.literal("member"),
        v.literal("dragon")
      )
    ),
    isMember: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.role) {
      const role = args.role;
      return await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", role))
        .take(50);
    }
    if (args.isMember !== undefined) {
      const isMember = args.isMember;
      return await ctx.db
        .query("users")
        .withIndex("by_isMember", (q) => q.eq("isMember", isMember))
        .take(50);
    }
    return await ctx.db.query("users").take(50);
  },
});

/**
 * Update Stripe customer, subscription status, and role for a user.
 */
export const updateUserStripeInfo = mutation({
  args: {
    clerkId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("user"),
        v.literal("member"),
        v.literal("dragon")
      )
    ),
    membershipExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      return { success: false, reason: "User not found" };
    }

    const patchData: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      subscriptionStatus?: string;
      role?: "user" | "member" | "dragon";
      isMember?: boolean;
      membershipExpiresAt?: number;
    } = {};

    if (args.stripeCustomerId !== undefined) patchData.stripeCustomerId = args.stripeCustomerId;
    if (args.stripeSubscriptionId !== undefined) patchData.stripeSubscriptionId = args.stripeSubscriptionId;
    if (args.subscriptionStatus !== undefined) patchData.subscriptionStatus = args.subscriptionStatus;
    if (args.membershipExpiresAt !== undefined) patchData.membershipExpiresAt = args.membershipExpiresAt;

    if (args.role !== undefined) {
      // Never demote a Dragon to a member
      if (user.role === "dragon" && args.role === "member") {
        patchData.isMember = true;
      } else {
        patchData.role = args.role;
        patchData.isMember = args.role === "member" || args.role === "dragon";
      }
    }

    await ctx.db.patch(user._id, patchData);

    // Sync isMember to Clerk if role or membership changed
    if (patchData.isMember !== undefined || patchData.membershipExpiresAt !== undefined) {
      await ctx.scheduler.runAfter(0, internal.users.syncClerkMembership, {
        clerkId: args.clerkId,
        isMember: patchData.isMember ?? user.isMember,
        role: patchData.role ?? user.role,
        membershipExpiresAt: patchData.membershipExpiresAt ?? user.membershipExpiresAt,
      });
    }

    return { success: true };
  },
});

/**
 * Get user by their Stripe Customer ID.
 */
export const getUserByStripeCustomerId = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .unique();
  },
});

