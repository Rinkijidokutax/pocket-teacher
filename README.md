# Pocket Teacher 📖

**A teacher in your pocket — the best teacher, that adapts to you: your strengths,
weaknesses and habits, toward your goal — your courses, level, and exams.**

Adaptive AI tutor PWA for Mauritius students. v1: Cambridge O-Level Mathematics (SC).

- **Live:** https://pocket-teacher-theta.vercel.app (Vercel project `pocket-teacher`)
- **DB/Auth:** Supabase project `pocket-teacher` (`aruodnmrogsjexyjovxi`, ap-south-1)
- **LLM:** Claude Sonnet 5 via `ANTHROPIC_API_KEY`, or OpenRouter fallback
  (`OPENROUTER_API_KEY`) using its Anthropic-compatible `/v1/messages` endpoint.

## How it works
1. **Onboarding** → level, exam date, goal, language → 10-question placement diagnostic
   seeds a per-topic mastery map (38 Cambridge 4024 topics in `syllabus_topics`).
2. **Tutor session** (`/api/chat`): server builds today's agenda (spaced-repetition
   reviews due + weakest topic), injects a compact student snapshot into the system
   prompt, streams Claude's teaching. When the student attempts a question, the model
   calls the `update_mastery` tool → score delta, misconception log, SM-2 next review.
3. **Progress**: topic heat map, streak, exam countdown. **Habit**: daily streak,
   25-msg/day free cap (402 → upgrade prompt).

Key files: `src/lib/tutor.ts` (engine), `src/app/api/chat/route.ts` (stream + tool loop),
`src/lib/diagnostic.ts`, Supabase migrations via MCP (`core_schema`, seed).

## Dev
```
npm install && npm run dev
node scripts/e2e.mjs                 # full loop test (local)
BASE=https://... node scripts/e2e.mjs  # against prod
```
Test student: `test.student@pocketteacher.mu` / `TestStudent123!`

## Deliberately deferred (v1)
Push-reminder cron (SW handler ready, needs VAPID + Vercel cron), payments,
photo solver, voice, more subjects/levels, FR UI strings (tutor already bilingual).
