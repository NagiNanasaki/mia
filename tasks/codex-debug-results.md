# Codex Debug Results

## Summary

This document summarizes what Codex verified and changed for the new `/game` feature set, so the work can be handed over to Claude without relying on chat history.

## Verification Result

- `npm run lint`: passed
- `npm run build`: passed
- `/game` route now builds successfully as a static page in Next.js 16

## What Was Fixed

### 1. Question generation fallback was too fragile

File:
- `app/api/game/questions/route.ts`

Problem:
- If Claude returned malformed JSON or weak distractors, question quality could collapse.
- In bad cases, 4-choice questions could end up with too few options.
- `reorder` could also fall back to a weak generic sentence.

Fix:
- Added fallback distractor generation from the local combined vocabulary pool.
- Ensured `ja_select` and `en_select` can still produce 4 options even if Claude output is incomplete.
- Added a deterministic fallback sentence for `reorder`.
- Improved sentence tokenization so reorder words are built from real word tokens.

### 2. `reorder` answer checking was too brittle

Files:
- `app/api/game/questions/route.ts`
- `app/game/page.tsx`

Problem:
- Previous logic was sensitive to punctuation formatting and could mismatch valid answers depending on generated sentence formatting.

Fix:
- Normalized reorder comparison using token-based matching.
- Built `words` from parsed tokens rather than naive `split(' ')`.
- Kept the displayed correct sentence aligned with the normalized comparison logic.

### 3. `/game` page state flow had closure and sequencing issues

File:
- `app/game/page.tsx`

Problem:
- The prior structure risked stale state around question loading, question display, and EXP accumulation.
- Final EXP save logic and next-question flow were more fragile than needed.

Fix:
- Rebuilt the page flow around a clearer phase machine:
  - `loading`
  - `start`
  - `questioning`
  - `playing`
  - `judging`
  - `result`
  - `complete`
- Centralized question display with `showQuestion`.
- Used a ref-backed EXP accumulator to avoid stale closure problems during final save.
- Prevented duplicate final EXP save with a `savingExp` guard.
- Simplified restart handling and per-question reset behavior.

### 4. `showQuestion` / startup initialization had React hook issues

File:
- `app/game/page.tsx`

Problem:
- Lint flagged accessing locally declared functions before declaration and set-state-in-effect issues.

Fix:
- Moved persistent `vocabOwnerId` initialization into a lazy `useState` initializer.
- Changed startup effect to depend on the initialized ID.
- Removed unused game state and invalid references left over from the earlier structure.

### 5. Long translation text in quiz UI needed safer rendering

File:
- `app/game/page.tsx`

Problem:
- Long Japanese meanings could visually overflow or become hard to read.

Fix:
- Added `break-words` and better centered text layout for question cards and result text.
- Kept layout readable for both choice and reorder screens.

### 6. Top-page `/game` navigation used raw anchor link

File:
- `app/page.tsx`

Problem:
- The quiz shortcut used `<a href="/game">` instead of Next.js `Link`.

Fix:
- Replaced the raw anchor with `Link` from `next/link`.

### 7. EXP API input validation was too loose

File:
- `app/api/game/exp/route.ts`

Problem:
- EXP POST validation accepted truthy/falsy checks instead of proper number validation.

Fix:
- Added explicit validation for numeric `expGained` and disallowed negative values.

## Current `/game` Behavior

- The game loads vocabulary from:
  - saved notebook words tied to `mia_vocab_owner_id`
  - local TOEIC word list fallback
- It generates 5 questions.
- Question types:
  - `ja_select`
  - `en_select`
  - `reorder`
- Characters alternate by question:
  - Q1, Q3, Q5: Mia
  - Q2, Q4: Mimi
- Correct answers add EXP:
  - `ja_select`: 10
  - `en_select`: 15
  - `reorder`: 25
- Final EXP is saved once at game completion.

## Remaining Notes For Claude

- `app/api/game/comment/route.ts` is still intentionally lightweight and prompt-driven.
- `lib/toeic-words.ts` remains the fallback source when notebook words are sparse.
- The earlier in-chat lie-detection mini-game logic was removed from `app/page.tsx`; the dedicated `/game` flow is now the main quiz experience.

## Files Touched In This Pass

- `app/api/game/questions/route.ts`
- `app/api/game/exp/route.ts`
- `app/game/page.tsx`
- `app/page.tsx`
