"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Nav from "@/components/Nav";

type Material = {
  id: string;
  kind: string;
  filename: string;
  status: string;
  course_id: string | null;
};
type Course = { course_id: string; courses: { subject: string; emoji: string } | null };

function kindOf(name: string): "pdf" | "image" | "text" {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.match(/\.(png|jpg|jpeg|webp|gif)$/)) return "image";
  return "text";
}

export default function Library() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [asSyllabus, setAsSyllabus] = useState(false);
  const [attachTo, setAttachTo] = useState<string>("");
  const [status, setStatus] = useState("");
  const [matBusy, setMatBusy] = useState("");
  const [matSummary, setMatSummary] = useState<{ id: string; title: string; content: string } | null>(null);

  async function summarise(m: Material) {
    setMatBusy(m.id + ":s");
    setMatSummary(null);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: m.id, courseId: m.course_id }),
        signal: ctrl.signal,
      });
      const out = await res.json().catch(() => ({}));
      if (out.summary) setMatSummary({ id: m.id, ...out.summary });
      else setStatus("Couldn't summarise — check your connection and try again.");
    } catch {
      setStatus("Couldn't summarise — check your connection and try again.");
    } finally {
      clearTimeout(to);
      setMatBusy("");
    }
  }

  async function makeCards(m: Material) {
    if (!m.course_id) return;
    setMatBusy(m.id + ":c");
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: m.course_id, materialId: m.id }),
        signal: ctrl.signal,
      });
      const out = await res.json().catch(() => ({}));
      setStatus(out.ok ? `Added ${out.created} flashcards — review in Study ✓` : "Couldn't make cards");
    } catch {
      setStatus("Couldn't make cards — check your connection and try again.");
    } finally {
      clearTimeout(to);
      setMatBusy("");
    }
  }

  async function refresh(userId: string) {
    const { data: m } = await supabase
      .from("materials")
      .select("id, kind, filename, status, course_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setMaterials((m ?? []) as Material[]);
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace("/login");
      const user = session.user;
      setUid(user.id);
      if (typeof window !== "undefined" && window.location.search.includes("syllabus=1"))
        setAsSyllabus(true);
      const { data: e } = await supabase
        .from("enrollments")
        .select("course_id, courses(subject, emoji)")
        .eq("user_id", user.id);
      setCourses((e ?? []) as unknown as Course[]);
      refresh(user.id);
    })();
  }, [router]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setStatus("Uploading…");
    const kind = asSyllabus ? "syllabus" : kindOf(file.name);
    // crypto.randomUUID throws on pre-Chromium-92 Android WebViews — fall back to a timestamp id.
    const rid = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `${uid}/${rid}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("materials").upload(path, file);
    if (upErr) {
      setStatus("Upload failed: " + upErr.message);
      return;
    }
    const { data: mat } = await supabase
      .from("materials")
      .insert({
        user_id: uid,
        course_id: asSyllabus ? null : attachTo || null,
        kind,
        filename: file.name,
        storage_path: path,
      })
      .select("id")
      .single();
    if (!mat) {
      setStatus("Could not save.");
      return;
    }
    setStatus(asSyllabus ? "Reading your syllabus…" : "Processing…");
    await refresh(uid);
    // Never leave the student stuck on "Reading…" if the request drops — cap it, then fail cleanly.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch("/api/materials/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: mat.id }),
        signal: ctrl.signal,
      });
      const out = await res.json().catch(() => ({}));
      await refresh(uid);
      if (asSyllabus && out.courseId) {
        setStatus("");
        router.push(`/session?course=${out.courseId}`);
        return;
      }
      setStatus(res.ok ? "Ready ✓ your teacher can use it now" : "Processing failed");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      await refresh(uid);
      setStatus("Processing failed — check your connection and tap to try again.");
    } finally {
      clearTimeout(to);
    }
  }

  return (
    <main className="flex-1 px-6 pt-14 pb-28 max-w-md mx-auto w-full flex flex-col gap-5 min-h-screen">
      <div className="rise">
        <h1 className="display text-3xl font-semibold">Library</h1>
        <p className="text-sm text-[color:var(--ink-soft)] mt-2">
          Upload notes, past papers, a photo of a problem, or a whole syllabus. Your
          teacher reads them and teaches from your material.
        </p>
      </div>

      <div className="card p-4 flex flex-col gap-3 rise d1">
        <div className="flex gap-2">
          <button
            onClick={() => setAsSyllabus(false)}
            className={`chip flex-1 justify-center py-2 ${!asSyllabus ? "chip-on" : ""}`}
          >
            Study material
          </button>
          <button
            onClick={() => setAsSyllabus(true)}
            className={`chip flex-1 justify-center py-2 ${asSyllabus ? "chip-on" : ""}`}
          >
            A syllabus
          </button>
        </div>

        {!asSyllabus && courses.length > 0 && (
          <select
            className="input"
            value={attachTo}
            onChange={(e) => setAttachTo(e.target.value)}
          >
            <option value="">Attach to a subject (optional)</option>
            {courses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.courses?.emoji} {c.courses?.subject}
              </option>
            ))}
          </select>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
          onChange={onFile}
          className="hidden"
          id="fileup"
        />
        <label htmlFor="fileup" className="btn cursor-pointer">
          {asSyllabus ? "Upload syllabus (PDF / photo)" : "Choose a file"}
        </label>
        {status && (
          <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            {status}
          </p>
        )}
        <p className="text-[11px] text-[color:var(--ink-faint)]">
          Images, PDFs and text supported. Video coming soon.
        </p>
      </div>

      <div className="flex flex-col gap-2 rise d2">
        {materials.map((m) => (
          <div key={m.id} className="card p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <span className="text-lg">
                {m.kind === "pdf" ? "📕" : m.kind === "image" ? "🖼" : m.kind === "syllabus" ? "📄" : "📝"}
              </span>
              <p className="text-sm truncate flex-1">{m.filename}</p>
              <span
                className="text-[11px] font-bold"
                style={{
                  color:
                    m.status === "ready"
                      ? "var(--accent)"
                      : m.status === "error"
                        ? "#c0392b"
                        : "var(--ink-faint)",
                }}
              >
                {m.status === "ready" ? "✓ ready" : m.status === "error" ? "failed" : "…"}
              </span>
            </div>
            {m.status === "ready" && m.kind !== "syllabus" && (
              <div className="flex gap-2">
                <button
                  onClick={() => summarise(m)}
                  disabled={matBusy === m.id + ":s"}
                  className="chip flex-1 justify-center py-1.5"
                >
                  {matBusy === m.id + ":s" ? "…" : "≣ Summarise"}
                </button>
                <button
                  onClick={() => makeCards(m)}
                  disabled={!m.course_id || matBusy === m.id + ":c"}
                  className="chip flex-1 justify-center py-1.5"
                >
                  {matBusy === m.id + ":c" ? "…" : "▤ Flashcards"}
                </button>
                <button
                  onClick={() => router.push(`/quiz?course=${m.course_id}&material=${m.id}`)}
                  disabled={!m.course_id}
                  className="chip flex-1 justify-center py-1.5"
                >
                  ◎ Quiz
                </button>
              </div>
            )}
            {matSummary?.id === m.id && (
              <div className="border-t border-[color:var(--line)] pt-2">
                <p className="font-semibold text-sm">{matSummary.title}</p>
                <p className="text-xs text-[color:var(--ink-soft)] whitespace-pre-wrap mt-1 leading-relaxed">
                  {matSummary.content}
                </p>
                <p className="text-[11px] text-[color:var(--ink-faint)] mt-2">
                  AI-generated — double-check with your textbook.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      <Nav />
    </main>
  );
}
