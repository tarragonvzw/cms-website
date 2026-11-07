import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Constant-time string comparison
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns an error response unless the request carries the control server's key. */
function unauthorized(req: Request): Response | null {
  const key = env.QUIZ_SYNC_KEY;
  if (!key) return json({ error: "QUIZ_SYNC_KEY is not configured on this deployment" }, 503);
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return safeEqual(token, key) ? null : json({ error: "Unauthorized" }, 401);
}

http.route({
  path: "/quiz/export",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const denied = unauthorized(req);
    if (denied) return denied;
    return json(await ctx.runQuery(internal.quiz.exportForControlServer, {}));
  }),
});

http.route({
  path: "/quiz/submissions",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const denied = unauthorized(req);
    if (denied) return denied;
    const round = Number(new URL(req.url).searchParams.get("round") ?? "1");
    if (!Number.isInteger(round) || round < 1) return json({ error: "Invalid round" }, 400);
    return json(await ctx.runQuery(internal.quiz.submissionsForControlServer, { round }));
  }),
});

http.route({
  path: "/quiz/round-open",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const denied = unauthorized(req);
    if (denied) return denied;
    const body: unknown = await req.json().catch(() => null);
    const round = (body as { round?: unknown } | null)?.round;
    const isOpen = (body as { isOpen?: unknown } | null)?.isOpen;
    if (typeof round !== "number" || !Number.isInteger(round) || typeof isOpen !== "boolean") {
      return json({ error: "Expected { round: number, isOpen: boolean }" }, 400);
    }
    await ctx.runMutation(internal.quiz.setRoundOpenForControlServer, { round, isOpen });
    return json({ ok: true });
  }),
});

export default http;
