import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.union(
      v.literal("user"),
      v.literal("member"),
      v.literal("dragon")
    ),
    isMember: v.boolean(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    membershipExpiresAt: v.optional(v.number()),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_clerkId", ["clerkId"])
    .index("by_role", ["role"])
    .index("by_isMember", ["isMember"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

  signups: defineTable({
    eventSlug: v.string(),
    groupName: v.string(),
    name: v.string(),
    email: v.string(),
    cancelToken: v.string(),
    userId: v.optional(v.id("users")),
  })
    .index("by_event", ["eventSlug"])
    .index("by_event_group", ["eventSlug", "groupName"])
    .index("by_token", ["cancelToken"])
    .index("by_user", ["userId"]),

  events: defineTable({
    slug: v.string(),
    title: v.string(),
    date: v.string(),
    body: v.string(),
    groups: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.optional(v.string()),
          maxSlots: v.number(),
        })
      )
    ),
  })
    .index("by_slug", ["slug"])
    .index("by_date", ["date"]),

  dragons: defineTable({
    name: v.string(),
    title: v.optional(v.string()),
    image: v.optional(v.string()),
    body: v.optional(v.string()),
    order: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_order", ["order"]),

  sponsors: defineTable({
    name: v.string(),
    link: v.string(),
    snippet: v.string(),
    body: v.optional(v.string()),
    image: v.optional(v.string()),
    order: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_order", ["order"]),

  pages: defineTable({
    slug: v.string(),
    title: v.string(),
    body: v.string(),
    language: v.string(),
    enabled: v.boolean(),
    hideFromHeader: v.optional(v.boolean()),
    weight: v.optional(v.number()),
    snippet: v.optional(v.string()),
    icon: v.optional(v.string()),
    iconName: v.optional(v.string()),
    translationSlug: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_language_and_enabled", ["language", "enabled"])
    .index("by_enabled", ["enabled"]),
});

