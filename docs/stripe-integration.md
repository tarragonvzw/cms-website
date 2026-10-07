# Stripe Integration Guide (Tarragon VZW)

This application integrates directly with **Stripe** to process memberships, event ticketing, and community contributions for **Tarragon VZW** (non-profit tabletop organization in Belgium).

---

## 1. Belgian VAT (BTW) Compliance

To comply with Belgian and European VAT regulations:
- Payments are handled **directly through Stripe** (rather than through Clerk billing).
- Checkout sessions enable `tax_id_collection: { enabled: true }` to collect VAT/BTW numbers where applicable.
- Checkout sessions include an optional `custom_fields` dropdown for newsletter/mailing list opt-in ("Subscribe to Tarragon newsletter?"), complying with Belgian & EU GDPR regulations. Preferences sync to Convex `users.newsletterOptIn` and Stripe customer metadata.
- Official Belgian VAT receipts and invoices are generated and accessible to members through the **Stripe Customer Portal**.

---

## 2. "Kobold" Membership Subscription

- **Name**: Kobold Membership
- **Price**: 10 EUR / year (recurring subscription)
- **Benefits**:
  - Unlocks `"member"` role (`isMember = true`) in Convex and Clerk.
  - Priority signups for weekly D&D, boardgames, LARP, and hobby nights.
  - Member discounts on tournaments and special events.
  - Access to member-only guild features across `tarragon.be` & `guild.tarragon.be`.

---

## 3. Account Menu Popup Integration

Users can manage their membership directly from Clerk's profile popup (`<UserButton />`):
1. **Dropdown Action**: "Join Kobold (10€/yr)" or "Kobold Membership (Active)" right inside the avatar menu.
2. **"Membership" Tab in Manage Account Modal**:
   - Custom `<UserButton.UserProfilePage>` titled **"Membership"**.
   - Displays real-time status: Dragon Council, Active Kobold Member, or Standard User.
   - For non-members: One-click button to start Stripe Checkout for Kobold (10 EUR/year).
   - For active members: One-click button to open the **Stripe Customer Portal** to manage card details, view invoices, or update subscriptions.

---

## 4. Environment Variables

Configured in `.env.local` and Vercel:

```env
# Client-side publishable key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Server-side publishable & secret keys
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# Optional: Specific Stripe Price ID for Kobold (falls back to auto-discovery/creation)
STRIPE_KOBOLD_PRICE_ID=price_...

# Webhook secret for /api/webhooks/stripe
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 5. Webhook Events & Lifecycle

Endpoint: `/api/webhooks/stripe`
- `checkout.session.completed`: Marks subscription active, sets Convex role to `"member"`, and syncs `isMember: true` to Clerk.
- `customer.subscription.updated`: Syncs active, trialing, past due, or canceled state.
- `customer.subscription.deleted`: Reverts role to `"user"` (`isMember: false`), while preserving Dragon status if the user is a Council Dragon.
