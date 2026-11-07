import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    // Shared secret for the local quiz control server (see convex/http.ts)
    QUIZ_SYNC_KEY: v.optional(v.string()),
  },
});

export default app;
