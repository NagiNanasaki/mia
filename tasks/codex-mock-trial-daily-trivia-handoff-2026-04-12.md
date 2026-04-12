# Codex Handoff: Mock Trial + Daily Trivia

**Date**: 2026-04-12  
**Author**: Codex  
**Scope**: `tasks/mock-trial-spec.md` and `tasks/daily-trivia-spec.md`

## What changed

- Added `GET /api/daily-trivia` in [app/api/daily-trivia/route.ts](/C:/Users/user/Desktop/english-learn/app/api/daily-trivia/route.ts)
  - Genre-validated daily Mimi fake trivia
  - Claude-backed with per-genre fallback text
- Added mock-trial APIs:
  - [app/api/trial/start/route.ts](/C:/Users/user/Desktop/english-learn/app/api/trial/start/route.ts)
  - [app/api/trial/mimi-reply/route.ts](/C:/Users/user/Desktop/english-learn/app/api/trial/mimi-reply/route.ts)
  - [app/api/trial/verdict/route.ts](/C:/Users/user/Desktop/english-learn/app/api/trial/verdict/route.ts)
- Added shared helpers in [lib/trial.ts](/C:/Users/user/Desktop/english-learn/lib/trial.ts)
  - Recent-message normalization
  - Trial text cleanup
  - Verdict parsing
  - Model punctuation normalization to reduce mojibake risk
- Added `/trial` page in [app/trial/page.tsx](/C:/Users/user/Desktop/english-learn/app/trial/page.tsx)
  - Mimi prosecutes, Mia judges
  - Uses `sessionStorage` recent chat context only
  - Does not write trial conversation to Supabase
  - Awards `+20 EXP` once via existing `/api/game/exp`
- Updated [app/page.tsx](/C:/Users/user/Desktop/english-learn/app/page.tsx)
  - Stores recent conversation into `sessionStorage['mia_trial_recent_messages']`
  - Fetches daily trivia once per day using `localStorage['mia_last_trivia_date']`
  - Shows dismissible Mimi trivia popup
  - Adds `/trial` entry point from main chat UI
  - Fixed several user-visible mojibake labels that remained in the main page

## Safety notes

- No schema changes
- No destructive migration
- No deletion of existing user data
- Trial messages are not persisted to Supabase
- Daily trivia is local-only state and does not write to Supabase
- Existing EXP API was reused rather than replaced

## Backup

- Pre-edit backup directory already exists at:
  - [2026-04-12-trial-trivia](/C:/Users/user/Desktop/english-learn/.codex-backups/2026-04-12-trial-trivia)

## Verification performed

- `npm run lint`
- `npm run build`
- Local route checks on `http://127.0.0.1:3000`
  - `/` => 200
  - `/trial` => 200
  - `/api/daily-trivia?genre=food` => 200 with trivia JSON
  - `/api/trial/start` => 200 with charge + evidence JSON
  - `/api/trial/mimi-reply` => 200 with reply JSON
  - `/api/trial/verdict` => 200 with verdict + outcome JSON

## Notes for Claude

- `app/page.tsx` still contains some legacy comments / older strings outside this feature scope; user-visible strings touched in this pass were cleaned where encountered.
- A separate existing `next dev` process was already running on port `3000` during verification.
- I also briefly started another dev process that fell back to `3001`; it should be safe to stop if still present.
