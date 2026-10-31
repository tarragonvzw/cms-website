"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";

type Puzzle = Doc<"quizConnections">;
type Group = Puzzle["groups"][number];

// Same order as the NYT game: easiest to hardest.
const GROUP_COLORS = ["#f9df6d", "#a0c35a", "#b0c4ef", "#ba81c5"];

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

const emptyGroups = (): Group[] =>
  Array.from({ length: 4 }, () => ({ connection: "", words: ["", "", "", ""] }));

function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed || 1;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function Round2() {
  const [tab, setTab] = useState<"puzzles" | "present">("puzzles");
  const puzzles = useQuery(api.quiz.listConnections, {});
  const [presentingId, setPresentingId] = useState<Id<"quizConnections"> | null>(null);

  const presenting = puzzles?.find((p) => p._id === presentingId) ?? null;

  return (
    <>
      <div className="dragon-tabs">
        <button className={`dragon-tab ${tab === "puzzles" ? "active" : ""}`} onClick={() => setTab("puzzles")}>
          Puzzles
        </button>
        <button className={`dragon-tab ${tab === "present" ? "active" : ""}`} onClick={() => setTab("present")}>
          Present
        </button>
      </div>
      <div className="dragon-panel">
        {tab === "puzzles" ? (
          <PuzzlesTab
            puzzles={puzzles}
            onPresent={(id) => {
              setPresentingId(id);
              setTab("present");
            }}
          />
        ) : (
          <PresentTab puzzles={puzzles} presenting={presenting} onSelect={setPresentingId} />
        )}
      </div>
    </>
  );
}

function PuzzlesTab({
  puzzles,
  onPresent,
}: {
  puzzles: Puzzle[] | undefined;
  onPresent: (id: Id<"quizConnections">) => void;
}) {
  const savePuzzle = useMutation(api.quiz.saveConnection);
  const deletePuzzle = useMutation(api.quiz.deleteConnection);

  const [editingId, setEditingId] = useState<Id<"quizConnections"> | null>(null);
  const [title, setTitle] = useState("");
  const [groups, setGroups] = useState<Group[]>(emptyGroups);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEditingId(null);
    setTitle("");
    setGroups(emptyGroups());
    setError(null);
  };

  const updateGroup = (gi: number, patch: Partial<Group>) =>
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  const updateWord = (gi: number, wi: number, value: string) =>
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, words: g.words.map((w, j) => (j === wi ? value : w)) } : g))
    );

  const handleSave = async () => {
    setError(null);
    try {
      await savePuzzle({ id: editingId ?? undefined, title, groups });
      reset();
    } catch (err: any) {
      setError(err.message || "Failed to save puzzle");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <h3>{editingId ? "Edit puzzle" : "Add puzzle"}</h3>
        <input
          style={inputStyle}
          placeholder="Puzzle title (for you only)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <p style={{ color: "var(--secondary)", fontSize: "0.9rem" }}>
          Groups are ordered from easiest (yellow) to hardest (purple).
        </p>
        {groups.map((g, gi) => (
          <div
            key={gi}
            style={{
              borderLeft: `6px solid ${GROUP_COLORS[gi]}`,
              paddingLeft: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <input
              style={inputStyle}
              placeholder="Connection (e.g. Types of cheese)"
              value={g.connection}
              onChange={(e) => updateGroup(gi, { connection: e.target.value })}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.5rem" }}>
              {g.words.map((w, wi) => (
                <input
                  key={wi}
                  style={inputStyle}
                  placeholder={`Word ${wi + 1}`}
                  value={w}
                  onChange={(e) => updateWord(gi, wi, e.target.value)}
                />
              ))}
            </div>
          </div>
        ))}
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="dragon-btn-primary" onClick={handleSave}>
            {editingId ? "Save changes" : "Add puzzle"}
          </button>
          {editingId && (
            <button className="dragon-btn-secondary" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: "0.75rem" }}>Puzzles ({puzzles?.length ?? 0})</h3>
        {puzzles === undefined ? (
          <p style={{ color: "var(--secondary)" }}>Loading...</p>
        ) : puzzles.length === 0 ? (
          <p style={{ color: "var(--secondary)" }}>No puzzles yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {puzzles.map((p) => (
              <div
                key={p._id}
                style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}
              >
                <strong>{p.title}</strong>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button className="dragon-btn-primary" onClick={() => onPresent(p._id)}>
                    Present
                  </button>
                  <button
                    className="dragon-btn-secondary"
                    onClick={() => {
                      setEditingId(p._id);
                      setTitle(p.title);
                      setGroups(p.groups.map((g) => ({ connection: g.connection, words: [...g.words] })));
                      setError(null);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="dragon-btn-danger"
                    onClick={() => {
                      if (confirm(`Delete "${p.title}"?`)) deletePuzzle({ id: p._id });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PresentTab({
  puzzles,
  presenting,
  onSelect,
}: {
  puzzles: Puzzle[] | undefined;
  presenting: Puzzle | null;
  onSelect: (id: Id<"quizConnections"> | null) => void;
}) {
  if (puzzles === undefined) return <p style={{ color: "var(--secondary)" }}>Loading...</p>;
  if (puzzles.length === 0) return <p style={{ color: "var(--secondary)" }}>Add a puzzle first.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <select
        style={inputStyle}
        value={presenting?._id ?? ""}
        onChange={(e) => onSelect((e.target.value || null) as Id<"quizConnections"> | null)}
      >
        <option value="">Select a puzzle...</option>
        {puzzles.map((p) => (
          <option key={p._id} value={p._id}>
            {p.title}
          </option>
        ))}
      </select>
      {presenting && <Board key={presenting._id} puzzle={presenting} />}
    </div>
  );
}

function Board({ puzzle }: { puzzle: Puzzle }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [revealed, setRevealed] = useState<number[]>([]);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [fullscreen, setFullscreen] = useState(false);

  const remaining = useMemo(() => {
    const words = puzzle.groups.flatMap((g, gi) => g.words.map((word) => ({ word, gi })));
    return seededShuffle(words, seed).filter((w) => !revealed.includes(w.gi));
  }, [puzzle, seed, revealed]);

  const toggleWord = (word: string) =>
    setHighlighted((prev) =>
      prev.includes(word) ? prev.filter((w) => w !== word) : prev.length < 4 ? [...prev, word] : prev
    );

  const reveal = (gi: number) => {
    setRevealed((prev) => (prev.includes(gi) ? prev : [...prev, gi]));
    setHighlighted([]);
  };

  const board = (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
      {revealed.map((gi) => (
        <div
          key={gi}
          style={{
            background: GROUP_COLORS[gi],
            color: "#111",
            borderRadius: "0.5rem",
            padding: "0.9rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{puzzle.groups[gi].connection}</div>
          <div>{puzzle.groups[gi].words.join(", ")}</div>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
        {remaining.map(({ word }) => {
          const active = highlighted.includes(word);
          return (
            <button
              key={word}
              onClick={() => toggleWord(word)}
              style={{
                background: active ? "#5a594e" : "#efefe6",
                color: active ? "#fff" : "#111",
                border: "none",
                borderRadius: "0.5rem",
                padding: fullscreen ? "2.2rem 0.5rem" : "1.2rem 0.5rem",
                fontSize: fullscreen ? "1.6rem" : "1rem",
                fontWeight: 700,
                textTransform: "uppercase",
                cursor: "pointer",
                fontFamily: "inherit",
                overflowWrap: "anywhere",
              }}
            >
              {word}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {puzzle.groups.map((g, gi) => (
          <button
            key={gi}
            className="dragon-btn-secondary"
            disabled={revealed.includes(gi)}
            style={{ borderLeft: `6px solid ${GROUP_COLORS[gi]}` }}
            onClick={() => reveal(gi)}
          >
            Reveal: {g.connection}
          </button>
        ))}
        <button className="dragon-btn-secondary" onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}>
          Shuffle
        </button>
        <button
          className="dragon-btn-secondary"
          onClick={() => {
            setRevealed([]);
            setHighlighted([]);
          }}
        >
          Reset
        </button>
        <button className="dragon-btn-primary" onClick={() => setFullscreen(true)}>
          Fullscreen
        </button>
      </div>
      <p style={{ color: "var(--secondary)", fontSize: "0.9rem" }}>
        Click words to highlight up to 4 while teams discuss. Reveal a group when you are ready.
      </p>
      {!fullscreen && board}

      {fullscreen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "#fff",
            padding: "2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            overflow: "auto",
          }}
        >
          <div style={{ width: "min(1100px, 100%)" }}>{board}</div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            {puzzle.groups.map((g, gi) => (
              <button
                key={gi}
                className="dragon-btn-secondary"
                disabled={revealed.includes(gi)}
                style={{ color: "#111", borderLeft: `6px solid ${GROUP_COLORS[gi]}` }}
                onClick={() => reveal(gi)}
              >
                Reveal {gi + 1}
              </button>
            ))}
            <button className="dragon-btn-secondary" style={{ color: "#111" }} onClick={() => setFullscreen(false)}>
              Exit fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
