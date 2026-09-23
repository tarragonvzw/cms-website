import { NextResponse } from "next/server";
import { stripe } from "../../../../lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (webhookSecret && signature) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return NextResponse.json({ error: "Webhook signature error" }, { status: 400 });
    }
  } else {
    // In local development or if webhook secret isn't yet configured
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.error("Convex URL missing during Stripe webhook execution");
    return NextResponse.json({ error: "Convex URL missing" }, { status: 500 });
  }

  const convex = new ConvexHttpClient(convexUrl);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          const clerkUserId =
            session.metadata?.clerkUserId ||
            session.client_reference_id;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;

          if (clerkUserId) {
            await convex.mutation(api.users.updateUserStripeInfo, {
              clerkId: clerkUserId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: "active",
              role: "member",
            });
            console.log(
              `Activated Kobold membership for Clerk user: ${clerkUserId}`
            );
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        const subscriptionId = subscription.id;
        const currentPeriodEnd = (subscription as any).current_period_end;
        const membershipExpiresAt = typeof currentPeriodEnd === "number" ? currentPeriodEnd * 1000 : undefined;

        // Lookup user by Stripe Customer ID or metadata
        let clerkUserId: string | undefined = subscription.metadata?.clerkUserId;

        if (!clerkUserId) {
          const user = await convex.query(api.users.getUserByStripeCustomerId, {
            stripeCustomerId: customerId,
          });
          clerkUserId = user?.clerkId;
        }

        if (clerkUserId) {
          if (status === "active" || status === "trialing") {
            await convex.mutation(api.users.updateUserStripeInfo, {
              clerkId: clerkUserId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: status,
              role: "member",
              membershipExpiresAt,
            });
            console.log(`Updated subscription to ${status} for ${clerkUserId}`);
          } else if (status === "canceled" || status === "unpaid") {
            await convex.mutation(api.users.updateUserStripeInfo, {
              clerkId: clerkUserId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: status,
              role: "user",
            });
            console.log(
              `Revoked membership (status: ${status}) for ${clerkUserId}`
            );
          } else {
            await convex.mutation(api.users.updateUserStripeInfo, {
              clerkId: clerkUserId,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: status,
              membershipExpiresAt,
            });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        let clerkUserId: string | undefined = subscription.metadata?.clerkUserId;
        if (!clerkUserId) {
          const user = await convex.query(api.users.getUserByStripeCustomerId, {
            stripeCustomerId: customerId,
          });
          clerkUserId = user?.clerkId;
        }

        if (clerkUserId) {
          await convex.mutation(api.users.updateUserStripeInfo, {
            clerkId: clerkUserId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: "canceled",
            role: "user",
          });
          console.log(`Subscription deleted for user ${clerkUserId}`);
        }
        break;
      }

      default:
        // Other events ignored
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing Stripe webhook:", error);
    return NextResponse.json(
      { error: "Webhook handler failed", details: error.message },
      { status: 500 }
    );
  }
}
