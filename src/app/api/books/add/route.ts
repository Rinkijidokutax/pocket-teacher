import { createClient } from "@/lib/supabase/server";
import { genBookInfo } from "@/lib/study";

export const maxDuration = 60;

// Add a book the student chose (free-search). We generate an original synopsis + themes so
// the tutor has grounding; we never store copyrighted book text.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { title, author, subject, level, kind } = (await req.json()) as {
    title?: string;
    author?: string;
    subject?: string;
    level?: string;
    kind?: string;
  };
  if (!title?.trim()) return Response.json({ error: "no_title" }, { status: 400 });

  const k = kind || "set_text";
  const { synopsis, themes } = await genBookInfo(title.trim(), author || null, subject || null, k).catch(
    () => ({ synopsis: "", themes: "" })
  );

  const { data: book } = await supabase
    .from("books")
    .insert({
      owner_id: user.id,
      is_template: false,
      title: title.trim(),
      author: author || null,
      kind: k,
      subject: subject || null,
      level: level || null,
      synopsis: synopsis || null,
      themes: themes || null,
    })
    .select("id")
    .single();

  if (!book) return Response.json({ error: "create_failed" }, { status: 500 });
  return Response.json({ ok: true, bookId: book.id });
}
