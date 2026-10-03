"use client";

import ReactMarkdown from "react-markdown";
import SignupSystem from "../signup-system";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface EventPageProps {
  event: {
    slug: string;
    title: string;
    date: string;
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

  const eventDate = new Date(event.date);
  const formattedDate = isNaN(eventDate.getTime())
    ? event.date
    : eventDate.toLocaleDateString("nl-BE", {
        timeZone: "Europe/Brussels",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        });
  const formattedTime = isNaN(eventDate.getTime())
    ? ""
    : eventDate.toLocaleTimeString("en-GB", {
        timeZone: "Europe/Brussels",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

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
              Geannuleerd / Gesloten
            </div>
            <div style={{ color: "var(--light)", fontSize: "0.95rem", fontWeight: "normal", marginTop: "0.2rem" }}>
              {event.cancelReason || "Dit evenement gaat niet door."}
            </div>
          </div>
        </div>
      )}

      <h1>{event.title}</h1>
      <h3 style={{ color: "var(--secondary)", textTransform: "capitalize", marginBottom: "0.4rem" }}>
        {formattedDate} {formattedTime ? `om ${formattedTime}` : ""}
      </h3>
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
