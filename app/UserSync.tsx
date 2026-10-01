"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../convex/_generated/api";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // Throttle sync to once per 5 min unless metadata changed

export default function UserSync() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { user, isLoaded } = useUser();
  const storeUser = useMutation(api.users.storeUser);
  const lastReloadRef = useRef<number>(0);

  // Reload user data on focus/visibility change (e.g. if user linked Discord in another tab)
  useEffect(() => {
    if (!isLoaded || !user) return;

    const triggerReload = () => {
      const now = Date.now();
      if (now - lastReloadRef.current < 3000) return;
      lastReloadRef.current = now;
      user.reload().catch(console.error);
    };

    const handleFocus = () => triggerReload();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerReload();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoaded, user]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const discordAccount = user.externalAccounts?.find((acc) => {
        const providerStr = String(acc.provider || "").toLowerCase();
        const strategyStr = String((acc as any)?.verification?.strategy || "").toLowerCase();
        return providerStr.includes("discord") || strategyStr.includes("discord");
      });

      const discordId =
        (discordAccount as any)?.providerUserId ||
        (discordAccount as any)?.externalId ||
        (discordAccount as any)?.provider_user_id ||
        discordAccount?.id;

      const memberStatus = String(user.publicMetadata?.isMember);
      const roleStatus = String(user.publicMetadata?.role || "");
      const key = `tarragon_user_synced_${user.id}_${memberStatus}_${roleStatus}_${discordId || "nodiscord"}`;
      const lastSynced = typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
      const now = Date.now();

      if (lastSynced && now - Number(lastSynced) < SYNC_INTERVAL_MS) {
        return;
      }

      storeUser({
        name: user.fullName || user.username || undefined,
        email: user.primaryEmailAddress?.emailAddress || undefined,
        imageUrl: user.imageUrl || undefined,
        discordId: discordId ? String(discordId) : undefined,
      })
        .then(() => {
          if (typeof window !== "undefined") {
            sessionStorage.setItem(key, String(Date.now()));
          }
        })
        .catch((err) => {
          console.warn("User sync to Convex:", err);
        });
    }
  }, [isLoading, isAuthenticated, user, isLoaded, storeUser]);

  return null;
}
