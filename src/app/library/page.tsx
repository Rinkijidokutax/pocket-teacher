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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
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
    const path = `${uid}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("materials")
      .upload(path, file);
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
    const res = await fetch("/api/materials/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId: mat.id }),
    });
    const out = await res.json().catch(() => ({}));
    await refresh(uid);
    if (asSyllabus && out.courseId) {
      setStatus("");
      router.push(`/session?course=${out.courseId}`);
      return;
    }
    setStatus(res.ok ? "Done ✓ your teacher can use it now" : "Processing failed");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <main className="flex-1 px-5 pt-12 pb-28 max-w-md mx-auto w-full flex flex-col gap-4 min-h-screen">
      <h1 className="text-2xl font-black">📚 Library</h1>
      <p className="text-slate-400 text-sm -mt-2">
        Upload notes, past papers, a photo of a problem, or a whole syllabus. Your
        teacher reads them and teaches from your material.
      </p>

      <div className="card p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setAsSyllabus(false)}
            className={`chip flex-1 py-2 ${!asSyllabus ? "bg-fuchsia-500/25 border-fuchsia-400/50" : ""}`}
          >
            📎 Study material
          </button>
          <button
            onClick={() => setAsSyllabus(true)}
            className={`chip flex-1 py-2 ${asSyllabus ? "bg-fuchsia-500/25 border-fuchsia-400/50" : ""}`}
          >
            📄 A syllabus
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
        {status && <p className="text-sm text-fuchsia-300">{status}</p>}
        <p className="text-[11px] text-slate-500">
          Images, PDFs and text supported. Video coming soon.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {materials.map((m) => (
          <div
            key={m.id}
            className="card p-3 flex items-center gap-3"
          >
            <span className="text-xl">
              {m.kind === "pdf" ? "📕" : m.kind === "image" ? "🖼️" : m.kind === "syllabus" ? "📄" : "📝"}
            </span>
            <p className="text-sm truncate flex-1">{m.filename}</p>
            <span
              className={`text-[11px] font-semibold ${
                m.status === "ready"
                  ? "text-emerald-300"
                  : m.status === "error"
                    ? "text-rose-300"
                    : "text-amber-300"
              }`}
            >
              {m.status === "ready" ? "✓ ready" : m.status === "error" ? "failed" : "…"}
            </span>
          </div>
        ))}
      </div>
      <Nav />
    </main>
  );
}
