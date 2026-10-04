"use client";

import React, { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  createKoboldCheckoutSessionAction,
  createCustomerPortalSessionAction,
} from "./actions/stripe";

export default function BecomeMemberButton({ locale = "nl" }: { locale?: string }) {
  const { isSignedIn, isLoaded } = useUser();
  const { openSignIn } = useClerk();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isMember = currentUser?.role === "member" || currentUser?.role === "dragon";
  const [loading, setLoading] = useState(false);

  // Automatically trigger checkout if the user was prompted to login first
  useEffect(() => {
    if (typeof window !== "undefined" && isLoaded && isSignedIn && !isMember) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("subscribeKobold") === "true") {
        handleCheckout();
      }
    }
  }, [isLoaded, isSignedIn, isMember]);

  const handleCheckout = async () => {
    try {
      setLoading(true);
      const res = await createKoboldCheckoutSessionAction(window.location.pathname);
      if (res?.url) {
        window.location.href = res.url;
      } else {
        throw new Error("Could not create Stripe Checkout session.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to start checkout. Please try again.");
      setLoading(false);
    }
  };

  const handleManage = async () => {
    try {
      setLoading(true);
      const res = await createCustomerPortalSessionAction(window.location.pathname);
      if (res?.url) {
        window.location.href = res.url;
      } else {
        throw new Error("Could not open customer billing portal.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to open billing portal.");
      setLoading(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!isSignedIn) {
      const currentPath = typeof window !== "undefined" ? window.location.pathname : `/${locale}`;
      const redirectTarget = `${currentPath}?subscribeKobold=true`;
      openSignIn({
        fallbackRedirectUrl: redirectTarget,
        signUpFallbackRedirectUrl: redirectTarget,
      });
      return;
    }

    if (isMember) {
      handleManage();
    } else {
      handleCheckout();
    }
  };

  const buttonText = loading
    ? (locale === "nl" ? "Even geduld..." : "Loading...")
    : isMember
    ? (locale === "nl" ? "Lidmaatschap beheren" : "Manage Membership")
    : (locale === "nl" ? "Wordt lid" : "Become Member");

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="member-button"
      type="button"
      title={isMember ? (locale === "nl" ? "Beheer je lidmaatschap" : "Manage your membership") : (locale === "nl" ? "Wordt lid van Tarragon (10€/jaar)" : "Become a member of Tarragon (10€/year)")}
    >
      {buttonText}
    </button>
  );
}
