import { MetadataRoute } from "next";
import { api } from "../convex/_generated/api";
import { getConvexClient } from "../lib/convex";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tarragon.be";
  const locales = ["nl", "en"];
  const client = getConvexClient();

  const pages: any[] = [];
  const events: any[] = [];

  try {
    // 1. Fetch enabled pages from Convex
    const convexPages = await client.query(api.pages.listPages, { enabled: true });
    convexPages?.forEach((page) => {
      const lang = page.language || "nl";
      const slug = page.slug;
      const url = slug === "home" ? `${baseUrl}/${lang}` : `${baseUrl}/${lang}/${slug}`;

      pages.push({
        url: url,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: slug === "home" ? 1.0 : 0.8,
      });
    });

    // 2. Fetch events from Convex
    const convexEvents = await client.query(api.events.listEvents, { limit: 500 });
    const now = new Date();

    convexEvents?.forEach((ev) => {
      const eventEnd = ev.endDate ? new Date(ev.endDate) : new Date(ev.date || 0);
      const isPast = eventEnd < now;

      events.push({
        url: `${baseUrl}/event/${ev.slug}`,
        lastModified: new Date(),
        changeFrequency: isPast ? "monthly" : "daily",
        priority: isPast ? 0.3 : 0.7,
      });
    });
  } catch (err) {
    console.error("Error generating sitemap from Convex:", err);
  }

  const rootPaths = locales.map((locale) => ({
    url: `${baseUrl}/${locale}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 1,
  }));

  return [...rootPaths, ...pages, ...events];
}
