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

### A. Close the email-claim gaps — DONE except A5
- [x] **A1 — Mastery gate:** started-but-unmastered topics (score < 60) keep the focus before fresh topics + teacher.md golden rule 7. Claim #3 now true.
- [x] **A2 — Command-word coaching:** command_help joined into GET /api/questions, tappable chip on /practice shows definition + examiner expectation, marker prompt flags misread command words. Claim #7 now true.
- [x] **A3 — Quiz-from-notes:** materialId → /api/quiz/generate → genQuiz source; ◎ Quiz button on ready materials. Claim #9 now true (photo/PDF live smoke-test still pending).
- [x] **A4 — French mode:** systemPrompt teaches in French when profile.language='fr'; lang threaded through all 5 generators (format labels stay English for parsing). Claim #11 now honest.
- [ ] **A5 — Any-hour reliability (tiny):** paid last-resort rung via TUTOR_MODELS env (OpenRouter credits or ANTHROPIC_API_KEY). **Waiting on Miguel (costs money).**
- [x] **A6 — Shareable progress report:** share_token + report_by_token() RPC (SECURITY DEFINER, progress-only) + public /report?t= page + "Share with teacher →" on Progress. Claims #13/#14 now match the reworded email.
- [x] **A7 — Curriculum tightening:** syllabus_code seeded on all 50 Cambridge courses; syllabus context in exam-question generation. NOTE: 40 codes seeded from model knowledge — human-verify the less common ones (languages, Divinity 9011, Islamic Studies 2068) against cambridgeinternational.org before past-paper links ship.

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

## Feature phases — status
- [x] **C1** — real daily-goal ring on Home (`today_xp`, resets on day roll-over) + saved AI summaries resurfaced on Study hub (dbb15cc, live).
- [x] **C3 (partial) — "Examiner's report on you"** — original STRENGTHS/WATCH/NEXT generated from the student's own `question_attempts` + misconceptions + command-word stats; card on Progress (dbb15cc, live-verified). 100% own-data, no copyrighted content.
- [ ] **C2 — Past-paper Finder** — HELD: needs verified per-syllabus paper structures; fabricating them risks wrong data + dead/copyright-adjacent links. Do only with sourced structures.
- [ ] **C3 (rest) — Timed mock exams** to a real paper blueprint (blocked on C2's paper structures).

## Known architectural limits (not quick bugs)
- **B1/B2 — client-forgeable XP / attempts / mastery:** inherent to the anon-key client architecture (a determined user can only cheat their own numbers). A true fix needs a service-role/edge-function authoritative path — worth it only when data feeds *teacher/school* decisions, not solo revision. Mitigated: `record_activity` caps XP at 60/call.
- **A5 — true 24/7:** code-ready via `TUTOR_MODELS` env; needs paid OpenRouter credits or an Anthropic key (Miguel's call).

## Recently completed (audit round 2, commit 9471af0 — live)
13 defects fixed & deployed: marking-outage integrity (no more wrongful 0/N poisoning
mastery), re-attempt XP farming blocked, answer/difficulty/count input caps, tutor keeps
its opening question in context on continuing turns, whitespace-only completion fallback,
greeting gate on first real word, marker-strip spares maths `[[3,4]]`, atomic chat XP,
plan/flashcards insert error checks, RPC XP cap (60/call), practice topic-filter +
offline handling, negative countdown hidden, Safari/iOS<16.4 crash regex removed.

Prior: 27 council fixes (eb407f9), Exam Question Bank + AI marking (3961ccf), fair-marking
recalibration (440cc12), attempt-persistence fix + syllabus codes (b9f3860).
