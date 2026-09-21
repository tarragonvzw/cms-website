import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const groupValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  maxSlots: v.number(),
});

/**
 * List all events sorted newest first (descending by date).
 */
export const listEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    return await ctx.db
      .query("events")
      .withIndex("by_date")
      .order("desc")
      .take(limit);
  },
});

/**
 * Get upcoming events from a given date (defaults to now) sorted ascending by date.
 */
export const getUpcomingEvents = query({
  args: {
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const fromDate = args.fromDate ?? new Date().toISOString();
    const limit = args.limit ?? 50;

    if (args.toDate) {
      const toDate = args.toDate;
      return await ctx.db
        .query("events")
        .withIndex("by_date", (q) =>
          q.gte("date", fromDate).lte("date", toDate)
        )
        .order("asc")
        .take(limit);
    }

    return await ctx.db
      .query("events")
      .withIndex("by_date", (q) => q.gte("date", fromDate))
      .order("asc")
      .take(limit);
  },
});

/**
 * Get single event by slug.
 */
export const getEventBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/**
 * Save (create or update) an event.
 * Guarded: Caller must be authenticated and have role === "dragon".
 */
export const saveEvent = mutation({
  args: {
    id: v.optional(v.id("events")),
    slug: v.string(),
    title: v.string(),
    date: v.string(),
    body: v.string(),
    groups: v.optional(v.array(groupValidator)),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: Must be logged in");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user || user.role !== "dragon") {
      throw new Error("Unauthorized: Dragon access required");
    }

    const normalizedSlug = args.slug.trim().replace(/\.mdx$/, "");

    // Check slug uniqueness if new or slug changed
    const existingWithSlug = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
      .unique();

    if (existingWithSlug && (!args.id || existingWithSlug._id !== args.id)) {
      throw new Error(`An event with slug "${normalizedSlug}" already exists.`);
    }

    const payload = {
      slug: normalizedSlug,
      title: args.title.trim(),
      date: args.date,
      body: args.body,
      groups: args.groups && args.groups.length > 0 ? args.groups : undefined,
    };

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) {
        throw new Error("Event not found to update");
      }
      await ctx.db.patch(args.id, payload);
      return args.id;
    } else {
      return await ctx.db.insert("events", payload);
    }
  },
});

/**
 * Delete an event by ID.
 * Guarded: Caller must be authenticated and have role === "dragon".
 */
export const deleteEvent = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: Must be logged in");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (!user || user.role !== "dragon") {
      throw new Error("Unauthorized: Dragon access required");
    }

    const event = await ctx.db.get(args.id);
    if (!event) {
      throw new Error("Event not found");
    }

    await ctx.db.delete(args.id);
    return { success: true, deletedSlug: event.slug };
  },
});

/**
 * Batch import/upsert events (used during migration).
 */
export const importEventsBatch = mutation({
  args: {
    events: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        date: v.string(),
        body: v.string(),
        groups: v.optional(v.array(groupValidator)),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const item of args.events) {
      const existing = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", item.slug))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: item.title,
          date: item.date,
          body: item.body,
          groups: item.groups,
        });
        updated++;
      } else {
        await ctx.db.insert("events", {
          slug: item.slug,
          title: item.title,
          date: item.date,
          body: item.body,
          groups: item.groups,
        });
        inserted++;
      }
    }

    return { inserted, updated, total: args.events.length };
  },
});

/**
 * Clean up existing events to remove signupUrl field from stored documents.
 */
export const removeSignupUrlField = mutation({
  args: {},
  handler: async (ctx) => {
    const allEvents = await ctx.db.query("events").collect();
    let cleaned = 0;
    for (const ev of allEvents) {
      if ((ev as any).signupUrl !== undefined) {
        await ctx.db.replace(ev._id, {
          slug: ev.slug,
          title: ev.title,
          date: ev.date,
          body: ev.body,
          groups: ev.groups,
        });
        cleaned++;
      }
    }
    return { cleaned, total: allEvents.length };
  },
});

/**
 * Delete events older than a given ISO timestamp (defaults to 1 year ago).
 * Also cleans up any signups associated with those deleted events.
 */
export const cleanupOldEvents = mutation({
  args: {
    olderThanIso: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let cutoffIso = args.olderThanIso;
    if (!cutoffIso) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      cutoffIso = oneYearAgo.toISOString();
    }

    const oldEvents = await ctx.db
      .query("events")
      .withIndex("by_date", (q) => q.lt("date", cutoffIso!))
      .collect();

    let deletedEventsCount = 0;
    let deletedSignupsCount = 0;

    for (const ev of oldEvents) {
      const signups = await ctx.db
        .query("signups")
        .withIndex("by_event", (q) => q.eq("eventSlug", ev.slug))
        .collect();

      for (const signup of signups) {
        await ctx.db.delete(signup._id);
        deletedSignupsCount++;
      }

      await ctx.db.delete(ev._id);
      deletedEventsCount++;
    }

    return {
      deletedEventsCount,
      deletedSignupsCount,
      cutoffIso,
    };
  },
});
