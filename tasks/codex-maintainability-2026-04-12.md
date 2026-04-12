# Codex Maintainability Pass (2026-04-12)

## Goal

Make the chat reply splitting logic easier to maintain without touching any user data flows.

## Safety

- No database schema changes were made.
- No destructive commands were run against Supabase or local persisted data.
- `mia_session_id`, `mia_vocab_owner_id`, `messages`, `vocabulary`, `user_profile`, and `user_progress` flows were left intact.

## Backups

Local backups were created before refactoring:

- `.codex-backups/2026-04-12-maintainability-pass/app/page.tsx.bak`
- `.codex-backups/2026-04-12-maintainability-pass/app/api/chat/route.ts.bak`

## Refactor

- Added `lib/mobile-reply-splitting.ts`
  - `getVisualUnits()`
  - `getSplitMaxVisualUnits()`
  - `getSplitPartDelayMs()`
  - `splitMessageContentForMobileNatural()`
- `app/page.tsx` now uses the shared module for:
  - loaded assistant-history normalization
  - fresh streamed reply splitting
  - split follow-up bubble timing
- The active splitter remains punctuation-first and does **not** split mid-phrase.

## Prompt alignment

- `app/api/chat/route.ts` length rule was tightened so the model prefers natural punctuation when a reply is getting long.

## Verification

- `npm run lint` passed
- `npm run build` passed
- Shared splitter debug samples were executed against the extracted module
- Local dev verification:
  - `GET /` => 200
  - `GET /game` => 200

## Notes

- For safety, some older experimental split helpers still remain in `app/page.tsx`.
- The active code path now points at the shared `lib/mobile-reply-splitting.ts` module, so future edits should happen there first.
