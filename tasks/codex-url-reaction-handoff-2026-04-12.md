# Codex URL Reaction Handoff

Date: 2026-04-12
Author: Codex
Scope: URL reaction feature

## Summary

Implemented URL-aware conversation support so Mia/Mimi can react to a URL the user sends.

Main behavior:

- Detects the first `http` / `https` URL in the user's message.
- Starts fetching URL reaction context immediately in `sendMessage()` without blocking the UI.
- Waits for that in-flight URL context inside `triggerAIResponse()` with a 4 second cap.
- Uses the fetched URL context to guide the AI's reaction instead of normal trending context when available.
- Makes the second speaker give their own take on the article instead of just echoing the first speaker.
- Adds a dedicated `/api/react-url` route for OG/Tavily-based context generation.
- Adds support for `[link:https://...|Title]` markers in message rendering.
- Instructs the model to output external links using `[link:url|title]` format instead of markdown links.

## Files Changed

- `app/page.tsx`
- `app/api/chat/route.ts`
- `app/api/react-url/route.ts`
- `components/ChatMessage.tsx`
- `lib/url-reaction.ts`

## Implementation Notes

### Frontend flow

- `lib/url-reaction.ts`
  - Added `extractFirstUrl()`
  - Added shared helpers for domain labeling and URL-context generation

- `app/page.tsx`
  - Added `urlFetchPromiseRef`
  - In `sendMessage()`, URL detection now starts a fire-and-forget request to `/api/react-url`
  - In `triggerAIResponse()`, URL context is awaited with `Promise.race(..., 4s timeout)`
  - Normal reply flow now prefers URL context over `trendingContext`
  - Idle chat call sites were updated so the new `streamResponse()` argument order stays correct

### Backend flow

- `app/api/react-url/route.ts`
  - New route
  - Validates URL
  - Fetches OG metadata server-side with timeout
  - Falls back to Tavily summary when available
  - Returns:
    - `title`
    - `summary`
    - `domain`
    - `success`
    - `context`
  - If content cannot be read, returns fallback site-based context instead of failing hard

- `app/api/chat/route.ts`
  - Accepts `urlContext` in request body
  - Adds explicit instruction for `[link:url|title]` output format
  - Current effective behavior is still driven primarily by frontend-prepared context

### Rendering

- `components/ChatMessage.tsx`
  - Added safe parsing of `[link:url|title]`
  - Renders them as clickable `<a>` tags
  - Avoids `dangerouslySetInnerHTML`

## Safety / Data Notes

- No database schema changes
- No deletion/migration of existing user data
- No change to Supabase message persistence format
- URL context is transient and only influences prompt construction

## Testing Performed

- `npm run lint` passed
- `npm run build` passed
- `POST /api/react-url` local test:
  - fallback case confirmed (`success: false` with site-based context)
- `GET /` local check returned `200`

## Observations

- Some domains may not expose readable OG content locally, so fallback behavior is important and is working.
- Tavily/OG success may vary by target site and environment, but the route now degrades safely.

## Suggested Next Checks For Claude

- Browser-level manual test with:
  - URL only
  - normal text + URL
  - multiple normal messages during debounce
- Confirm that both Mia and Mimi react naturally to the same article with different takes
- Confirm rendered `[link:...]` markers open safely in a new tab
- Spot-check a few real domains to see whether OG vs Tavily fallback quality is acceptable
