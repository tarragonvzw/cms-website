import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

const MAX_QUESTIONS_PER_ROUND = 100;
const MAX_SUBMISSIONS_PER_ROUND = 200;
const MAX_TEAM_NAME_LENGTH = 60;
const MAX_ANSWER_LENGTH = 500;

async function requireDragon(ctx: QueryCtx) {
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
}

async function isRoundOpen(ctx: QueryCtx, round: number) {
  const state = await ctx.db
    .query("quizRounds")
    .withIndex("by_round", (q) => q.eq("round", round))
    .unique();
  return state?.isOpen ?? false;
}

/**
 * Questions for contestants. Answers are never included.
 * Returns no questions while the round is closed.
 */
export const getPublicRound = query({
  args: { round: v.number() },
  handler: async (ctx, args) => {
    const isOpen = await isRoundOpen(ctx, args.round);
    if (!isOpen) {
      return { isOpen: false, questions: [] };
    }
    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_round_and_order", (q) => q.eq("round", args.round))
      .take(MAX_QUESTIONS_PER_ROUND);
    return {
      isOpen: true,
      questions: questions.map((q) => ({
        _id: q._id,
        text: q.text,
        points: q.points,
      })),
    };
  },
});

export const submitAnswers = mutation({
  args: {
    round: v.number(),
    teamName: v.string(),
    answers: v.record(v.id("quizQuestions"), v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await isRoundOpen(ctx, args.round))) {
      throw new Error("This round is not accepting answers.");
    }

    const teamName = args.teamName.trim().replace(/\s+/g, " ");
    if (!teamName) {
      throw new Error("Please enter a team name.");
    }
    if (teamName.length > MAX_TEAM_NAME_LENGTH) {
      throw new Error("Team name is too long.");
    }
    const teamKey = teamName.toLowerCase();

    const existing = await ctx.db
      .query("quizSubmissions")
      .withIndex("by_round_and_teamKey", (q) =>
        q.eq("round", args.round).eq("teamKey", teamKey)
      )
      .unique();
    if (existing) {
      throw new Error("A team with this name has already submitted.");
    }

    const total = await ctx.db
      .query("quizSubmissions")
      .withIndex("by_round_and_teamKey", (q) => q.eq("round", args.round))
      .take(MAX_SUBMISSIONS_PER_ROUND);
    if (total.length >= MAX_SUBMISSIONS_PER_ROUND) {
      throw new Error("Too many submissions for this round.");
    }

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_round_and_order", (q) => q.eq("round", args.round))
      .take(MAX_QUESTIONS_PER_ROUND);

    // Keep only answers to real questions of this round.
    const answers: Record<string, string> = {};
    for (const question of questions) {
      answers[question._id] = (args.answers[question._id] ?? "")
        .trim()
        .slice(0, MAX_ANSWER_LENGTH);
    }

    await ctx.db.insert("quizSubmissions", {
      round: args.round,
      teamName,
      teamKey,
      answers,
      grades: {},
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Dragon-only
// ---------------------------------------------------------------------------

export const listQuestions = query({
  args: { round: v.number() },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    return await ctx.db
      .query("quizQuestions")
      .withIndex("by_round_and_order", (q) => q.eq("round", args.round))
      .take(MAX_QUESTIONS_PER_ROUND);
  },
});

export const saveQuestion = mutation({
  args: {
    id: v.optional(v.id("quizQuestions")),
    round: v.number(),
    text: v.string(),
    answer: v.string(),
    points: v.number(),
  },
  handler: async (ctx, args) => {
    await requireDragon(ctx);

    const text = args.text.trim();
    if (!text) {
      throw new Error("Question text is required");
    }
    const payload = {
      text,
      answer: args.answer.trim(),
      points: args.points,
    };

    if (args.id) {
      await ctx.db.patch(args.id, payload);
      return args.id;
    }

    const last = await ctx.db
      .query("quizQuestions")
      .withIndex("by_round_and_order", (q) => q.eq("round", args.round))
      .order("desc")
      .first();
    return await ctx.db.insert("quizQuestions", {
      round: args.round,
      order: (last?.order ?? 0) + 1,
      ...payload,
    });
  },
});

export const deleteQuestion = mutation({
  args: { id: v.id("quizQuestions") },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    await ctx.db.delete(args.id);
    return null;
  },
});

/** Swap a question with its neighbour. */
export const moveQuestion = mutation({
  args: { id: v.id("quizQuestions"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    const question = await ctx.db.get(args.id);
    if (!question) throw new Error("Question not found");

    const neighbour = await ctx.db
      .query("quizQuestions")
      .withIndex("by_round_and_order", (q) =>
        args.direction === "up"
          ? q.eq("round", question.round).lt("order", question.order)
          : q.eq("round", question.round).gt("order", question.order)
      )
      .order(args.direction === "up" ? "desc" : "asc")
      .first();
    if (!neighbour) return null;

    await ctx.db.patch(question._id, { order: neighbour.order });
    await ctx.db.patch(neighbour._id, { order: question.order });
    return null;
  },
});

export const getRoundState = query({
  args: { round: v.number() },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    return { isOpen: await isRoundOpen(ctx, args.round) };
  },
});

export const setRoundOpen = mutation({
  args: { round: v.number(), isOpen: v.boolean() },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    const state = await ctx.db
      .query("quizRounds")
      .withIndex("by_round", (q) => q.eq("round", args.round))
      .unique();
    if (state) {
      await ctx.db.patch(state._id, { isOpen: args.isOpen });
    } else {
      await ctx.db.insert("quizRounds", { round: args.round, isOpen: args.isOpen });
    }
    return null;
  },
});

export const listSubmissions = query({
  args: { round: v.number() },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    return await ctx.db
      .query("quizSubmissions")
      .withIndex("by_round_and_teamKey", (q) => q.eq("round", args.round))
      .take(MAX_SUBMISSIONS_PER_ROUND);
  },
});

export const setGrade = mutation({
  args: {
    submissionId: v.id("quizSubmissions"),
    questionId: v.id("quizQuestions"),
    // null clears the grade (back to ungraded)
    correct: v.union(v.boolean(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found");

    const grades = { ...submission.grades };
    if (args.correct === null) {
      delete grades[args.questionId];
    } else {
      grades[args.questionId] = args.correct;
    }
    await ctx.db.patch(args.submissionId, { grades });
    return null;
  },
});

export const deleteSubmission = mutation({
  args: { id: v.id("quizSubmissions") },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    await ctx.db.delete(args.id);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Round 2: Connections puzzles (Dragon-only, shown on the big screen)
// ---------------------------------------------------------------------------

const MAX_CONNECTIONS = 50;

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    await requireDragon(ctx);
    return await ctx.db.query("quizConnections").take(MAX_CONNECTIONS);
  },
});

export const saveConnection = mutation({
  args: {
    id: v.optional(v.id("quizConnections")),
    title: v.string(),
    groups: v.array(
      v.object({
        connection: v.string(),
        words: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireDragon(ctx);

    if (args.groups.length !== 4) {
      throw new Error("A puzzle needs exactly 4 groups");
    }
    const groups = args.groups.map((g) => ({
      connection: g.connection.trim(),
      words: g.words.map((w) => w.trim()),
    }));
    const seen = new Set<string>();
    for (const g of groups) {
      if (!g.connection) throw new Error("Every group needs a connection");
      if (g.words.length !== 4 || g.words.some((w) => !w)) {
        throw new Error("Every group needs exactly 4 words");
      }
      for (const w of g.words) {
        const key = w.toLowerCase();
        if (seen.has(key)) throw new Error(`Duplicate word: ${w}`);
        seen.add(key);
      }
    }

    const payload = { title: args.title.trim() || "Untitled puzzle", groups };
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      return args.id;
    }
    return await ctx.db.insert("quizConnections", payload);
  },
});

export const deleteConnection = mutation({
  args: { id: v.id("quizConnections") },
  handler: async (ctx, args) => {
    await requireDragon(ctx);
    await ctx.db.delete(args.id);
    return null;
  },
});
