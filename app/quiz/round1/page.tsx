"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

const ROUND = 1;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: "0.5rem",
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(0,0,0,0.25)",
  color: "var(--light)",
  fontFamily: "inherit",
  fontSize: "1rem",
};

export default function QuizRound1Page() {
  const round = useQuery(api.quiz.getPublicRound, { round: ROUND });
  const submitAnswers = useMutation(api.quiz.submitAnswers);

  const [teamName, setTeamName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await submitAnswers({
        round: ROUND,
        teamName,
        answers: answers as Record<Id<"quizQuestions">, string>,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dragon-admin-container" style={{ maxWidth: "700px" }}>
      <div className="dragon-admin-header">
        <h1>Quiz — Round {ROUND}</h1>
      </div>
      <div className="dragon-panel">
        {round === undefined ? (
          <p style={{ color: "var(--secondary)" }}>Loading...</p>
        ) : submitted ? (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Answers submitted!</h2>
            <p style={{ color: "var(--secondary)" }}>
              Thanks, {teamName.trim()}. Keep an eye on the screen for the next round.
            </p>
          </div>
        ) : !round.isOpen ? (
          <p style={{ color: "var(--secondary)", textAlign: "center" }}>
            This round isn&apos;t open yet. Hang tight — this page updates automatically.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label htmlFor="teamName" style={{ fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                Team name
              </label>
              <input
                id="teamName"
                style={inputStyle}
                value={teamName}
                maxLength={60}
                required
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>

            {round.questions.map((q, i) => (
              <div key={q._id}>
                <label htmlFor={q._id} style={{ fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                  {i + 1}. {q.text}{" "}
                  <span style={{ color: "var(--secondary)", fontWeight: 400 }}>
                    ({q.points} {q.points === 1 ? "pt" : "pts"})
                  </span>
                </label>
                <input
                  id={q._id}
                  style={inputStyle}
                  value={answers[q._id] ?? ""}
                  maxLength={500}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q._id]: e.target.value }))}
                />
              </div>
            ))}

            {error && <p style={{ color: "#f87171" }}>{error}</p>}
            <p style={{ color: "var(--secondary)", fontSize: "0.9rem" }}>
              You can only submit once per team, so check your answers first.
            </p>
            <button type="submit" className="dragon-btn-primary" disabled={submitting || !teamName.trim()}>
              {submitting ? "Submitting..." : "Submit answers"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
