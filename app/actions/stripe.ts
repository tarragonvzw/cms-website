"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { stripe, getKoboldPriceId } from "../../lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { headers } from "next/headers";

function getOriginFromHeaders(headerList: Headers): string {
  const host = headerList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

/**
 * Creates a Stripe Checkout Session for the yearly Kobold membership (10 EUR/year).
 * Collects Belgian/EU VAT (BTW) numbers via tax_id_collection.
 */
export async function createKoboldCheckoutSessionAction(returnPath: string = "/") {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { error: "Unauthorized: Please sign in to subscribe." };
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress || user.emailAddresses[0]?.emailAddress;

    const headerList = await headers();
    const origin = getOriginFromHeaders(headerList);

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return { error: "Convex URL not configured." };
    }

    const convex = new ConvexHttpClient(convexUrl);
    const convexUser = await convex.query(api.users.getUserByClerkId, {
      clerkId: userId,
    });

    let customerId = convexUser?.stripeCustomerId;

    // Verify or create Stripe Customer
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ("deleted" in existing && existing.deleted) {
          customerId = undefined;
        }
      } catch {
        customerId = undefined;
      }
    }

    if (!customerId) {
      const fullName =
        user.fullName ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username ||
        "Tarragon Member";

      const customer = await stripe.customers.create({
        email: primaryEmail,
        name: fullName,
        metadata: {
          clerkUserId: userId,
          organization: "Tarragon VZW",
        },
      });
      customerId = customer.id;

      // Save Stripe Customer ID to Convex
      await convex.mutation(api.users.updateUserStripeInfo, {
        clerkId: userId,
        stripeCustomerId: customerId,
      });
    }

    const priceId = await getKoboldPriceId();

    const successUrl = `${origin}${returnPath}?membership=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}${returnPath}?membership=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      tax_id_collection: {
        enabled: true,
      },
      allow_promotion_codes: true,
      consent_collection: {
        terms_of_service: "required",
      },
      customer_update: {
        name: "auto",
        address: "auto",
      },
      metadata: {
        clerkUserId: userId,
        plan: "kobold",
        organization: "Tarragon VZW",
      },
      subscription_data: {
        metadata: {
          clerkUserId: userId,
          plan: "kobold",
          organization: "Tarragon VZW",
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return { error: "Failed to create Stripe Checkout Session" };
    }

    return { url: session.url };
  } catch (err: any) {
    console.error("Error in createKoboldCheckoutSessionAction:", err);
    return { error: err?.message || "Failed to create checkout session" };
  }
}

/**
 * Creates a Stripe Customer Billing Portal Session for managing subscriptions,
 * updating payment methods, and downloading Belgian VAT (BTW) invoices.
 */
export async function createCustomerPortalSessionAction(returnPath: string = "/") {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { error: "Unauthorized: Please sign in." };
    }

    const headerList = await headers();
    const origin = getOriginFromHeaders(headerList);

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return { error: "Convex URL not configured." };
    }

    const convex = new ConvexHttpClient(convexUrl);
    const convexUser = await convex.query(api.users.getUserByClerkId, {
      clerkId: userId,
    });

    let customerId = convexUser?.stripeCustomerId;

    if (!customerId) {
      // Check Stripe search for matching customer metadata
      const search = await stripe.customers.search({
        query: `metadata['clerkUserId']:'${userId}'`,
      });
      if (search.data.length > 0) {
        customerId = search.data[0].id;
        await convex.mutation(api.users.updateUserStripeInfo, {
          clerkId: userId,
          stripeCustomerId: customerId,
        });
      }
    }

    if (!customerId) {
      return {
        error: "No billing history found. Please subscribe to the Kobold membership first.",
      };
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}${returnPath}`,
    });

    return { url: portalSession.url };
  } catch (err: any) {
    console.error("Error in createCustomerPortalSessionAction:", err);
    return { error: err?.message || "Failed to create portal session" };
  }
}
