"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import Round2 from "./Round2";
import Round3 from "./Round3";

type Tab = "questions" | "preview" | "present" | "grading";

export default function QuizAdminPage() {
  const { isLoaded, isSignedIn } = useUser();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isDragon = currentUser?.role === "dragon";

  const [round, setRound] = useState<1 | 2 | 3 | 4>(1);

  if (!isLoaded || (isSignedIn && currentUser === undefined)) {
    return (
      <div className="dragon-admin-container">
        <div className="dragon-panel" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--secondary)" }}>Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn || !isDragon) {
    return (
      <div className="dragon-admin-container">
        <div className="dragon-panel" style={{ textAlign: "center", padding: "3rem" }}>
          <h2 style={{ color: "#f87171", marginBottom: "1rem" }}>Access Denied</h2>
          <p style={{ color: "var(--secondary)", marginBottom: "1.5rem" }}>
            The quiz master&apos;s desk is reserved for Dragons.
          </p>
          <Link href="/" className="auth-btn">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dragon-admin-container">
      <div className="dragon-admin-header">
        <h1>Quiz</h1>
        <p>
          Prepare all four rounds. The quiz control server (docker compose in <code>tarragon-quiz</code>) pulls
          everything from here.
        </p>
      </div>

      <div className="dragon-tabs">
        <button className={`dragon-tab ${round === 1 ? "active" : ""}`} onClick={() => setRound(1)}>
          Round 1 — Questions
        </button>
        <button className={`dragon-tab ${round === 2 ? "active" : ""}`} onClick={() => setRound(2)}>
          Round 2 — Potion Brewing
        </button>
        <button className={`dragon-tab ${round === 3 ? "active" : ""}`} onClick={() => setRound(3)}>
          Round 3 — Bardic Inspiration
        </button>
        <button className={`dragon-tab ${round === 4 ? "active" : ""}`} onClick={() => setRound(4)}>
          Round 4 — Countdown
        </button>
      </div>

      {round === 1 && <Round1 />}
      {round === 2 && <Round2 />}
      {round === 3 && <Round3 />}
      {round === 4 && <Round4 />}
    </div>
  );
}

// Round 4 only needs a (large) pool of questions; the control server runs it.
function Round4() {
  const [activeTab, setActiveTab] = useState<"questions" | "preview">("questions");
  return (
    <>
      <div className="dragon-tabs">
        <button className={`dragon-tab ${activeTab === "questions" ? "active" : ""}`} onClick={() => setActiveTab("questions")}>
          Questions
        </button>
        <button className={`dragon-tab ${activeTab === "preview" ? "active" : ""}`} onClick={() => setActiveTab("preview")}>
          Preview
        </button>
      </div>
      <div className="dragon-panel">
        {activeTab === "questions" ? <QuestionsTab round={4} /> : <PreviewTab round={4} />}
      </div>
    </>
  );
}

function Round1() {
  const [activeTab, setActiveTab] = useState<Tab>("questions");

  return (
    <>

      <div className="dragon-tabs">
        {(
          [
            ["questions", "Questions"],
            ["preview", "Preview"],
            ["present", "Present"],
            ["grading", "Grading"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`dragon-tab ${activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="dragon-panel">
        {activeTab === "questions" && <QuestionsTab round={1} />}
        {activeTab === "preview" && <PreviewTab round={1} />}
        {activeTab === "present" && <PresentTab />}
        {activeTab === "grading" && <GradingTab />}
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.8rem",
  borderRadius: "0.5rem",
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(0,0,0,0.25)",
  color: "var(--light)",
  fontFamily: "inherit",
  fontSize: "0.95rem",
};

function QuestionsTab({ round }: { round: number }) {
  const questions = useQuery(api.quiz.listQuestions, { round });
  const saveQuestion = useMutation(api.quiz.saveQuestion);
  const deleteQuestion = useMutation(api.quiz.deleteQuestion);
  const moveQuestion = useMutation(api.quiz.moveQuestion);

  const [editingId, setEditingId] = useState<Id<"quizQuestions"> | null>(null);
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");
  const [points, setPoints] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEditingId(null);
    setText("");
    setAnswer("");
    setPoints(1);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    try {
      await saveQuestion({
        id: editingId ?? undefined,
        round,
        text,
        answer,
        points,
      });
      reset();
    } catch (err: any) {
      setError(err.message || "Failed to save question");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <h3>{editingId ? "Edit question" : "Add question"}</h3>
        <textarea
          style={{ ...inputStyle, minHeight: "70px" }}
          placeholder="Question"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            style={{ ...inputStyle, flex: "1 1 240px", width: "auto" }}
            placeholder="Correct answer (only visible to dragons)"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <input
            style={{ ...inputStyle, width: "100px" }}
            type="number"
            min={0}
            step="any"
            aria-label="Points"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </div>
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="dragon-btn-primary" onClick={handleSave} disabled={!text.trim()}>
            {editingId ? "Save changes" : "Add question"}
          </button>
          {editingId && (
            <button className="dragon-btn-secondary" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: "0.75rem" }}>Questions ({questions?.length ?? 0})</h3>
        {questions === undefined ? (
          <p style={{ color: "var(--secondary)" }}>Loading...</p>
        ) : questions.length === 0 ? (
          <p style={{ color: "var(--secondary)" }}>No questions yet.</p>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", gap: "0.6rem", paddingLeft: "1.5rem" }}>
            {questions.map((q, i) => (
              <li key={q._id}>
                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div>
                    <div>
                      {q.text}{" "}
                      <span style={{ color: "var(--secondary)" }}>
                        ({q.points} {q.points === 1 ? "pt" : "pts"})
                      </span>
                    </div>
                    <div style={{ color: "#34d399", fontSize: "0.9rem" }}>Answer: {q.answer || "—"}</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                    <button
                      className="dragon-btn-secondary"
                      disabled={i === 0}
                      onClick={() => moveQuestion({ id: q._id, direction: "up" })}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="dragon-btn-secondary"
                      disabled={i === questions.length - 1}
                      onClick={() => moveQuestion({ id: q._id, direction: "down" })}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="dragon-btn-secondary"
                      onClick={() => {
                        setEditingId(q._id);
                        setText(q.text);
                        setAnswer(q.answer);
                        setPoints(q.points);
                        setError(null);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="dragon-btn-danger"
                      onClick={() => {
                        if (confirm("Delete this question?")) deleteQuestion({ id: q._id });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function PreviewTab({ round }: { round: number }) {
  const questions = useQuery(api.quiz.listQuestions, { round });

  if (questions === undefined) return <p style={{ color: "var(--secondary)" }}>Loading...</p>;
  if (questions.length === 0) return <p style={{ color: "var(--secondary)" }}>No questions yet.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p style={{ color: "var(--secondary)" }}>
        {round === 1 ? (
          <>This is what teams see at <code>/quiz/round1</code>, regardless of whether the round is open.</>
        ) : (
          <>These questions are shown on the big screen by the control server; answers are only for the host.</>
        )}
      </p>
      {questions.map((q, i) => (
        <div key={q._id}>
          <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
            {i + 1}. {q.text}{" "}
            <span style={{ color: "var(--secondary)", fontWeight: 400 }}>
              ({q.points} {q.points === 1 ? "pt" : "pts"})
            </span>
          </div>
          {round === 1 ? (
            <input style={inputStyle} placeholder="Your answer" disabled />
          ) : (
            <div style={{ color: "#34d399", fontSize: "0.9rem" }}>Answer: {q.answer || "—"}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function PresentTab() {
  const roundState = useQuery(api.quiz.getRoundState, { round: 1 });
  const setRoundOpen = useMutation(api.quiz.setRoundOpen);
  const submissions = useQuery(api.quiz.listSubmissions, { round: 1 });
  const [fullscreen, setFullscreen] = useState(false);

  const url = typeof window !== "undefined" ? `${window.location.origin}/quiz/round1` : "";
  const isOpen = roundState?.isOpen ?? false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", alignItems: "center" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: isOpen ? "#34d399" : "#f87171", fontWeight: 600 }}>
          {isOpen ? "Round is OPEN" : "Round is CLOSED"}
        </span>
        <button
          className="dragon-btn-primary"
          disabled={roundState === undefined}
          onClick={() => setRoundOpen({ round: 1, isOpen: !isOpen })}
        >
          {isOpen ? "Close round" : "Open round"}
        </button>
        <button className="dragon-btn-secondary" onClick={() => setFullscreen(true)}>
          Show QR fullscreen
        </button>
      </div>

      <div style={{ background: "#fff", padding: "1rem", borderRadius: "0.75rem" }}>
        {url && <QRCodeSVG value={url} size={260} level="M" />}
      </div>
      <code>{url}</code>
      <p style={{ color: "var(--secondary)" }}>Submissions so far: {submissions?.length ?? 0}</p>

      {fullscreen && (
        <div
          onClick={() => setFullscreen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "#fff",
            color: "#111",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2rem",
            cursor: "pointer",
          }}
        >
          <QRCodeSVG value={url} style={{ width: "min(80vh, 80vw)", height: "min(80vh, 80vw)" }} level="M" />
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{url.replace(/^https?:\/\//, "")}</div>
          <div style={{ color: "#666" }}>Click anywhere to close</div>
        </div>
      )}
    </div>
  );
}

function GradingTab() {
  const questions = useQuery(api.quiz.listQuestions, { round: 1 });
  const submissions = useQuery(api.quiz.listSubmissions, { round: 1 });
  const setGrade = useMutation(api.quiz.setGrade);
  const deleteSubmission = useMutation(api.quiz.deleteSubmission);

  if (questions === undefined || submissions === undefined) {
    return <p style={{ color: "var(--secondary)" }}>Loading...</p>;
  }
  if (submissions.length === 0) {
    return <p style={{ color: "var(--secondary)" }}>No submissions yet.</p>;
  }

  const scored = submissions
    .map((s) => ({
      s,
      score: questions.reduce((sum, q) => sum + (s.grades[q._id] ? q.points : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {scored.map(({ s, score }) => (
        <div
          key={s._id}
          style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.6rem", padding: "1rem" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
            <h3>
              {s.teamName} <span style={{ color: "var(--secondary)" }}>— {score} pts</span>
            </h3>
            <button
              className="dragon-btn-danger"
              onClick={() => {
                if (confirm(`Delete submission from ${s.teamName}?`)) deleteSubmission({ id: s._id });
              }}
            >
              Delete
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {questions.map((q, i) => {
              const grade = s.grades[q._id];
              return (
                <div key={q._id}>
                  <div style={{ color: "var(--secondary)", fontSize: "0.9rem" }}>
                    {i + 1}. {q.text}
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 200px" }}>
                      <strong>{s.answers[q._id] || <em>(blank)</em>}</strong>
                      <span style={{ color: "#34d399", fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                        expected: {q.answer || "—"}
                      </span>
                    </div>
                    <button
                      className="dragon-btn-secondary"
                      style={grade === true ? { background: "rgba(52,211,153,0.35)" } : undefined}
                      onClick={() =>
                        setGrade({ submissionId: s._id, questionId: q._id, correct: grade === true ? null : true })
                      }
                    >
                      ✓ Correct
                    </button>
                    <button
                      className="dragon-btn-secondary"
                      style={grade === false ? { background: "rgba(220,38,38,0.4)" } : undefined}
                      onClick={() =>
                        setGrade({ submissionId: s._id, questionId: q._id, correct: grade === false ? null : false })
                      }
                    >
                      ✗ Wrong
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
