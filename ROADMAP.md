# Pocket Teacher — Roadmap

Fable 5 plans/audits, Opus 4.8 executes. Live: pocket-teacher-theta.vercel.app

---

## ✅ Shipped & live (as of commit b9f3860)

- Adaptive tutor: per-topic mastery + spaced repetition + misconception log, streaming chat, free-model fallback chain.
- 65 template courses, 1993 topics, 141 curated books (book-companion tutor).
- Study loop: AI summaries, flashcards, quizzes, availability-aware revision schedule.
- Gamification: XP, streaks, levels.
- 27 council-fixed defects (chat/auth/security/a11y/UX).
- **Exam Question Bank + AI marking** (the flagship — neither SaveMyExams nor PapaCambridge has this): `/practice` → pick topic + difficulty → write an answer → AI marks it point-by-point against a mark scheme, reveals model answer, feeds mastery/XP. Marker recalibrated to be fair on meaning.
- **P0 fixes (this session):** attempt-persistence bug fixed (`answer`→`answer_md`) + insert error-checks — verified live (attempts now persist). Cambridge syllabus codes seeded for the 10 enrolled Cambridge subjects and wired into question generation. Home exam-countdown falls back to the course exam date.

---

## What's left (prioritised)

### P1 — revision value now
1. **Command-word hint chips in `/practice`** — 24 Cambridge command words are seeded (with our own definitions/guidance) but currently unused. Surface `definition_md` as a hint next to each question's command word. *Files:* `api/questions/route.ts` (return the definition), `app/practice/page.tsx` (chip).
2. **Real daily-goal ring on home** — needs a genuine "completed today" counter, not a fake ring. Extend the `record_activity` RPC to maintain `profiles.today_xp` (reset when `last_study_date` changes); render the ring from it. *Needs a migration.*
3. **Resurface AI summaries into the plan loop** — `summaries` is currently write-only. Link plan/home tasks to the existing summary for that topic when one exists. Read-path only.

### P2 — breadth
4. **Past-paper Finder** — `past_papers` table (syllabus_code, year, session, paper, variant, official_url) + `/papers` page filtered by the student's enrolled syllabus codes, **linking OUT to cambridgeinternational.org only**. Host/scrape/paraphrase **nothing** (Cambridge, SaveMyExams, PapaCambridge all off-limits). *Needs a migration + MCP-seeded metadata for the ~7 HSC codes.*
5. **Shared template question packs** — MCP-seed `is_template=true` questions for weak topics + widen the list route filter to `is_template OR owner`.

### P3 — defer past launch
6. Timed mock exams assembled to a `course_papers` blueprint.
7. **"Examiner report on you"** — aggregate `question_attempts` (now that they persist) into a personalised report.
8. Shared lazy-generated revision notes; adaptive/branching diagnostic; difficulty/tier filters on flashcards/quizzes.

---

## Execution order for Opus

1. [x] Fix attempt persistence + insert error-checks — deployed, live-verified.
2. [x] Seed syllabus codes for enrolled courses (MCP, factual — no scraping).
3. [x] Wire syllabus code into `genExamQuestions`.
4. [x] Home countdown fallback to `courses.exam_date`.
5. [ ] Command-word hint chips (P1-1).
6. [ ] `record_activity` → `today_xp` migration → daily-goal ring (P1-2).
7. [ ] Resurface summaries in plan (P1-3).
8. [ ] `past_papers` migration + MCP metadata seed + `/papers` finder (P2-4).

**Bounding:** the only "large" jobs are seeds — kept bounded by scoping to **enrolled courses only** (~11, not 65) and **metadata-only SQL** (no generation/scrape loops). All admin writes go via Supabase MCP (`execute_sql` for data, `apply_migration` for DDL) — no server-side service-role key, by design.

**Copyright guardrail (non-negotiable):** never scrape/host/paraphrase Cambridge, SaveMyExams, or PapaCambridge content. Questions/notes are LLM-generated original; past-paper links point only at official Cambridge; student uploads stay per-user.

---
*Full audit detail (root causes, file:line evidence) is in the chat history for commit b9f3860.*
