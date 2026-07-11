# Pocket Teacher — Roadmap & MES-Alignment Plan

Fable 5 audits/plans, Opus 4.8 executes. Live: pocket-teacher-theta.vercel.app
Last audit: council of 10 agents + adversarial verify, 2026-07-11 (commit 9471af0).

---

## MES-email claims — audit verdicts

The drafted email to MES (info@mesonline.mu, in Gmail drafts) makes 15 checkable claims.
Council verdicts against the live app:

| # | Claim | Verdict | Action |
|---|-------|---------|--------|
| 1 | Adaptive tutor, one step at a time | ✅ TRUE | — |
| 2 | Tracks exactly which topics mastered | ✅ TRUE | — |
| 3 | "Never moves on until genuinely understood" | ⚠️ PARTIAL | A1 below (mastery gate) |
| 4 | Misconception tracking / specific feedback | ✅ TRUE | — |
| 5 | Exam-style Qs marked point-by-point vs mark scheme | ✅ TRUE | — |
| 6 | Instant, specific feedback | ✅ TRUE | — |
| 7 | "Trains command words / exam technique directly" | ⚠️ PARTIAL | A2 (command-word coaching) |
| 8 | Revision schedules from exam dates + available time | ✅ TRUE | — |
| 9 | Notes → summaries, flashcards AND quizzes | ⚠️ PARTIAL | A3 (quiz-from-notes) |
| 10 | Free to use | ✅ TRUE | — |
| 11 | Works in English **and French** | ⚠️ PARTIAL | A4 (French mode) |
| 12 | Available at any hour | ⚠️ PARTIAL | A5 (paid fallback rung) |
| 13 | Teachers get class-level visibility | ❌ FALSE | A6 + **reword email** |
| 14 | "Reports on each student's progress" (to teachers) | ⚠️ PARTIAL | A6 (shareable report) |
| 15 | "Aligned to Mauritian/Cambridge curriculum" | ⚠️ PARTIAL | A7 + soften wording |

**Email actions before sending:** reword #13 (drop "class"-level visibility → "students can
share their progress report with their teacher"), soften #15 ("modelled on/mapped to the
Cambridge curriculum"), and #3 ("keeps returning to a topic until it's mastered"). Claims
7/9/11/12 become TRUE once A2/A3/A4/A5 ship — small jobs.

---

## Opus 4.8 action plan (in execution order)

### A. Close the email-claim gaps
- [ ] **A1 — Mastery gate (small):** `buildAgenda` keeps the previous focus topic until score ≥ 60 (one condition in `tutor.ts:97`) + one `teacher.md` line ("stay on the focus topic until 2 correct in a row"). Makes claim #3 literally true.
- [ ] **A2 — Command-word coaching (small):** GET `/api/questions` joins `command_words` on the question's command word; the chip on `/practice` becomes tappable → shows definition + examiner expectation; inject the definition into `markExamAnswer`'s feedback prompt. (24-row table is seeded but currently dead data.)
- [ ] **A3 — Quiz-from-notes (small):** thread `materialId` through `/api/quiz/generate` into `genQuiz`'s existing `source` param (~10 lines) + a Quiz button on ready materials in `library/page.tsx`. Then smoke-test one photo + one PDF upload live (paths are coded but never exercised in prod).
- [ ] **A4 — French mode (medium):** thread `profile.language` into `systemPrompt()` ("Teach in French" when `fr`) + add a `lang` param to the 5 `study.ts` prompt builders (summaries/flashcards/quizzes/diagnostic/exam-questions). UI stays English for now — honest minimum for the bilingual claim.
- [ ] **A5 — Any-hour reliability (tiny):** add a paid last-resort rung to `CHAT_MODELS` (OpenRouter credits or `ANTHROPIC_API_KEY`) so free-quota exhaustion degrades gracefully instead of TEACHER_DOWN. **Needs Miguel's OK (costs money).**
- [ ] **A6 — Shareable progress report (small):** `share_token` on profiles (1-line migration) + server-rendered `/report/[token]` page reusing the existing mastery-map query. Lets a student show their teacher/parent real progress — the honest v1 of the teacher story.
- [ ] **A7 — Curriculum tightening (small):** set `syllabus_code` on all 65 Cambridge template courses (only 10 done); pass syllabus context into quiz + diagnostic generation (exam-questions already does).

### B. Remaining verified bugs (deferred, non-blocking)
- [ ] **B1:** mark schemes/model answers readable pre-attempt via direct PostgREST (row-level RLS only). Motivated cheaters only cheat themselves in practice; fix before mock exams matter (move solutions to a guarded table or SECURITY DEFINER getter).
- [ ] **B2:** `question_attempts` client-writable → students could forge grade history (matters when teachers/reports consume it — do with A6).
- [ ] **B3:** practice page rapid chip-switch race (stale deck render) — add a seq guard.
- [ ] **B4:** per-subject exam-date editing (onboarding applies one date to all subjects; `exams` table is dead code, 0 rows).
- [ ] **B5:** client disconnect during post-stream persistence can lose the assistant turn (reorder persist-before-enqueue in chat route).

### C. Feature phases (unchanged from previous plan)
- [ ] **C1 — P1 leftovers:** real daily-goal ring (`today_xp` migration); resurface summaries into the plan loop.
- [ ] **C2 — Past-paper Finder:** `past_papers` index table + `/papers` page linking OUT to cambridgeinternational.org only (hosts nothing). Copyright guardrail: never scrape/host/paraphrase Cambridge, SaveMyExams, or PapaCambridge content.
- [ ] **C3 — Timed mocks** to `course_papers` blueprints + **"examiner report on you"** from accumulated `question_attempts`.

---

## Recently completed (audit round 2, commit 9471af0 — live)
13 defects fixed & deployed: marking-outage integrity (no more wrongful 0/N poisoning
mastery), re-attempt XP farming blocked, answer/difficulty/count input caps, tutor keeps
its opening question in context on continuing turns, whitespace-only completion fallback,
greeting gate on first real word, marker-strip spares maths `[[3,4]]`, atomic chat XP,
plan/flashcards insert error checks, RPC XP cap (60/call), practice topic-filter +
offline handling, negative countdown hidden, Safari/iOS<16.4 crash regex removed.

Prior: 27 council fixes (eb407f9), Exam Question Bank + AI marking (3961ccf), fair-marking
recalibration (440cc12), attempt-persistence fix + syllabus codes (b9f3860).
