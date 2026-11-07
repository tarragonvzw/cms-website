"use client";

import React, { useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

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

export default function Round3() {
  const songs = useQuery(api.quiz.listSongs, {});
  const saveSong = useMutation(api.quiz.saveSong);
  const deleteSong = useMutation(api.quiz.deleteSong);
  const moveSong = useMutation(api.quiz.moveSong);
  const generateUploadUrl = useMutation(api.quiz.generateSongUploadUrl);

  const [editingId, setEditingId] = useState<Id<"quizSongs"> | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [startSeconds, setStartSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setEditingId(null);
    setTitle("");
    setArtist("");
    setStartSeconds(0);
    setFile(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      let audio: Id<"_storage"> | undefined;
      if (file) {
        const uploadUrl = await generateUploadUrl({});
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "audio/mpeg" },
          body: file,
        });
        if (!res.ok) throw new Error("Audio upload failed");
        audio = ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
      }
      await saveSong({ id: editingId ?? undefined, title, artist, audio, startSeconds });
      reset();
    } catch (err: any) {
      setError(err.message || "Failed to save song");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dragon-panel" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <h3>{editingId ? "Edit song" : "Add song"}</h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            style={{ ...inputStyle, flex: "1 1 240px", width: "auto" }}
            placeholder="Song title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            style={{ ...inputStyle, flex: "1 1 240px", width: "auto" }}
            placeholder="Artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
          />
          <input
            style={{ ...inputStyle, width: "140px" }}
            type="number"
            min={0}
            step="any"
            aria-label="Start at (seconds)"
            title="Start at (seconds)"
            value={startSeconds}
            onChange={(e) => setStartSeconds(Number(e.target.value))}
          />
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ color: "var(--secondary)" }}
        />
        {editingId && !file && (
          <p style={{ color: "var(--secondary)", fontSize: "0.85rem" }}>Leave empty to keep the current audio file.</p>
        )}
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="dragon-btn-primary" onClick={handleSave} disabled={saving || !title.trim() || !artist.trim()}>
            {saving ? "Saving..." : editingId ? "Save changes" : "Add song"}
          </button>
          {editingId && (
            <button className="dragon-btn-secondary" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: "0.75rem" }}>Songs ({songs?.length ?? 0})</h3>
        {songs === undefined ? (
          <p style={{ color: "var(--secondary)" }}>Loading...</p>
        ) : songs.length === 0 ? (
          <p style={{ color: "var(--secondary)" }}>No songs yet.</p>
        ) : (
          <ol style={{ display: "flex", flexDirection: "column", gap: "0.8rem", paddingLeft: "1.5rem" }}>
            {songs.map((s, i) => (
              <li key={s._id}>
                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div>
                    <div>
                      <strong>{s.title}</strong> — {s.artist}
                      {!!s.startSeconds && <span style={{ color: "var(--secondary)" }}> (starts at {s.startSeconds}s)</span>}
                    </div>
                    {s.audioUrl ? (
                      <audio controls preload="none" src={s.audioUrl} style={{ marginTop: "0.3rem", height: "32px" }} />
                    ) : (
                      <div style={{ color: "#f87171", fontSize: "0.9rem" }}>No audio uploaded</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                    <button className="dragon-btn-secondary" disabled={i === 0} onClick={() => moveSong({ id: s._id, direction: "up" })} aria-label="Move up">
                      ↑
                    </button>
                    <button
                      className="dragon-btn-secondary"
                      disabled={i === songs.length - 1}
                      onClick={() => moveSong({ id: s._id, direction: "down" })}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="dragon-btn-secondary"
                      onClick={() => {
                        setEditingId(s._id);
                        setTitle(s.title);
                        setArtist(s.artist);
                        setStartSeconds(s.startSeconds ?? 0);
                        setFile(null);
                        setError(null);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="dragon-btn-danger"
                      onClick={() => {
                        if (confirm(`Delete "${s.title}"?`)) deleteSong({ id: s._id });
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
