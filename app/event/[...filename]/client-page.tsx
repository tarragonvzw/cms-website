"use client";

import ReactMarkdown from "react-markdown";
import SignupSystem from "../signup-system";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  isMultiDayEvent,
  formatFullEventDateRange,
  getEventDurationDays,
  getEventStatus,
} from "../../../lib/event-dates";

interface EventPageProps {
  event: {
    slug: string;
    title: string;
    date: string;
    endDate?: string;
    body: string;
    location?: string;
    isCancelled?: boolean;
    cancelReason?: string;
    groups?: {
      name: string;
      description?: string;
      maxSlots: number;
    }[];
  };
}

export default function EventClientPage({ event: initialEvent }: EventPageProps) {
  // Subscribe in real-time to Convex so changes in /dragon reflect immediately without rebuilding
  const liveEvent = useQuery(api.events.getEventBySlug, { slug: initialEvent.slug });
  const event = (liveEvent as typeof initialEvent) || initialEvent;

  const isMulti = isMultiDayEvent(event.date, event.endDate);
  const status = getEventStatus(event.date, event.endDate);
  const durationDays = getEventDurationDays(event.date, event.endDate);
  const { dateRangeStr, timeRangeStr } = formatFullEventDateRange(
    event.date,
    event.endDate,
    "en-GB"
  );

  const eventLocation = event.location?.trim() || "Het Textielhuis, Kortrijk";

  return (
    <div className="content">
      {event.isCancelled && (
        <div
          style={{
            backgroundColor: "rgba(220, 38, 38, 0.15)",
            border: "1px solid rgba(220, 38, 38, 0.5)",
            color: "#fca5a5",
            padding: "1rem 1.25rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: "1.5rem" }}>⚠️</span>
          <div>
            <div style={{ color: "#ef4444", fontSize: "1.05rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Cancelled / Closed
            </div>
            <div style={{ color: "var(--light)", fontSize: "0.95rem", fontWeight: "normal", marginTop: "0.2rem" }}>
              {event.cancelReason || "This event has been cancelled or the venue is closed."}
            </div>
          </div>
        </div>
      )}

      <h1>{event.title}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
        <h3 style={{ color: "var(--secondary)", textTransform: "capitalize", margin: 0 }}>
          {dateRangeStr} {timeRangeStr}
        </h3>
        {isMulti && (
          <span
            style={{
              background: "rgba(56, 189, 248, 0.15)",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              color: "#7dd3fc",
              padding: "0.2rem 0.6rem",
              borderRadius: "1rem",
              fontSize: "0.8rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
          >
            🗓️ {durationDays}-Day Event
          </span>
        )}
        {status === "ongoing" && !event.isCancelled && (
          <span
            style={{
              background: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              color: "#4ade80",
              padding: "0.2rem 0.6rem",
              borderRadius: "1rem",
              fontSize: "0.8rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#22c55e",
                boxShadow: "0 0 6px #22c55e",
              }}
            />
            Happening Now
          </span>
        )}
      </div>
      <div style={{ color: "rgba(242, 211, 180, 0.85)", fontSize: "0.95rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <span>📍 {eventLocation}</span>
      </div>

      <div className="event-body-markdown">
        <ReactMarkdown>{event.body}</ReactMarkdown>
      </div>

      {!event.isCancelled && (
        <SignupSystem
          eventSlug={event.slug}
          eventTitle={event.title || "Tarragon Event"}
          groups={event.groups || []}
        />
      )}

      <style jsx>{`
        .event-body-markdown {
          line-height: 1.7;
          color: var(--light);
          margin-top: 1.5rem;
          margin-bottom: 2rem;
        }
        .event-body-markdown :global(h2) {
          margin-top: 2rem;
          margin-bottom: 1rem;
          color: var(--primary_light);
        }
        .event-body-markdown :global(p) {
          margin-bottom: 1.25rem;
        }
        .event-body-markdown :global(ul),
        .event-body-markdown :global(ol) {
          margin-left: 1.5rem;
          margin-bottom: 1.25rem;
        }
        .event-body-markdown :global(li) {
          margin-bottom: 0.5rem;
        }
        .event-body-markdown :global(a) {
          color: var(--secondary);
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
