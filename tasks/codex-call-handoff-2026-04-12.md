# Codex Handoff: Group Voice Call

**Date**: 2026-04-12  
**Author**: Codex  
**Scope**: `tasks/call-spec.md`

## Summary

Implemented a first pass of the PC-only group voice call feature without changing existing data schemas or replacing existing chat APIs.

This pass adds:

- `/call` page
- `/api/call/chat` route
- shared call helpers
- main chat footer entry point to `/call` on desktop only

The implementation intentionally keeps the new feature isolated from the existing text-chat flow.

## Files added

- [app/call/page.tsx](/C:/Users/user/Desktop/english-learn/app/call/page.tsx)
- [app/api/call/chat/route.ts](/C:/Users/user/Desktop/english-learn/app/api/call/chat/route.ts)
- [lib/call.ts](/C:/Users/user/Desktop/english-learn/lib/call.ts)
- [lib/chat-characters.ts](/C:/Users/user/Desktop/english-learn/lib/chat-characters.ts)

## Files updated

- [app/page.tsx](/C:/Users/user/Desktop/english-learn/app/page.tsx)

## What was implemented

### `/call` page

- PC-only route guard
  - Mobile user agents are redirected back to `/`
  - Browsers without `SpeechRecognition` / `webkitSpeechRecognition` are also redirected back to `/`
- Call state machine
  - `waiting-start`
  - `connecting`
  - `mia-speaking`
  - `mimi-speaking`
  - `user-turn`
  - `listening`
  - `processing`
  - `ended`
- Initial greeting flow
  - Random first speaker between Mia and Mimi
  - Sequential greeting playback using existing `/api/tts`
- STT loop
  - Uses browser Web Speech API
  - `continuous = true`
  - 2-second silence timer to finalize speech
- Conversation flow
  - User utterance is saved
  - First responder is selected with shared `pickFirstCharacter(...)`
  - First AI reply fetched
  - First AI TTS starts
  - Second AI reply fetch overlaps with first AI TTS preparation
  - Second AI reply plays after the first one finishes
- Mic controls
  - Mute / unmute
  - End call
- Transcript UI
  - User / Mia / Mimi transcript bubbles
  - Interim STT text while listening
- Post-call vocab extraction
  - Extracts from Mia/Mimi lines only
  - Uses existing `VocabSelectModal`
  - Uses existing `/api/vocab-save`

### `/api/call/chat`

- Non-SSE implementation
- Accepts:
  - `messages`
  - `character`
  - `otherReply`
  - `ownerID`
- Returns:
  - `{ reply: string }`
- Uses Claude Haiku with voice-call-specific prompts
- Sanitizes reply output to remove chat-only markup such as:
  - `[stamp:...]`
  - `[sticker:...]`
  - `[split]`
  - bracket-like formatting / markdown-ish leftovers

### Shared helpers

In [lib/chat-characters.ts](/C:/Users/user/Desktop/english-learn/lib/chat-characters.ts):

- shared `pickFirstCharacter(...)`

In [lib/call.ts](/C:/Users/user/Desktop/english-learn/lib/call.ts):

- voice IDs
- greeting text pools
- sanitization helpers
- history conversion helper for call API
- localStorage ID helper

## Data safety notes

No destructive changes were made.

- No database migrations
- No table schema changes
- No existing user rows deleted
- Existing `messages` table is reused as-is
- Existing `vocabulary` table is reused as-is
- Existing localStorage keys remain in use:
  - `mia_session_id`
  - `mia_vocab_owner_id`
  - `mia_username`

### Important implementation detail

Call transcripts are currently saved into the existing `messages` table using the same `session_id` that the normal chat uses.

That means:

- no user data is destroyed
- no new storage model was introduced
- but call transcripts and normal chat can coexist in the same session history

This is safe from a data-loss perspective, but Claude may want to decide later whether call sessions should use a dedicated session ID to avoid mixing transcript styles with normal text chat history.

## Existing APIs intentionally not modified

- [app/api/chat/route.ts](/C:/Users/user/Desktop/english-learn/app/api/chat/route.ts)
- [app/api/tts/route.ts](/C:/Users/user/Desktop/english-learn/app/api/tts/route.ts)
- [app/api/vocab-save/route.ts](/C:/Users/user/Desktop/english-learn/app/api/vocab-save/route.ts)
- [lib/mobile-reply-splitting.ts](/C:/Users/user/Desktop/english-learn/lib/mobile-reply-splitting.ts)
- [components/ChatMessage.tsx](/C:/Users/user/Desktop/english-learn/components/ChatMessage.tsx)

## Main design decisions

### Non-SSE instead of SSE

Implemented `/api/call/chat` as non-SSE on purpose.

Reason:

- TTS needs finalized text anyway
- simpler state management
- lower risk of partial-message / cleanup bugs
- easier to stabilize quickly

If Claude wants stronger live-streaming UX later, SSE can be added as a second-pass enhancement.

### Vocab extraction contract

The existing `/api/vocab-save` route currently expects:

- extract mode: `{ message }`
- save mode: `{ items, sessionId }`

The call feature follows the real route contract, not the original spec wording that mentioned `text` / `ownerID`.

## Verification completed

### Static checks

- `npm run lint`
- `npm run build`

Both passed after fixes.

### Local checks

Verified on local dev server:

- `/` returns `200`
- `/call` returns `200`
- main page HTML includes `/call` link
- `/call` page HTML includes `Group Voice Call`
- `POST /api/call/chat` returns `200` and a plausible JSON reply

Example verified response shape:

```json
{"reply":"Oh come on Mimi, have you heard them talk? They literally sound like they haven't slept in days."}
```

## Not fully verified yet

These still need real browser interaction testing:

- actual mic permission flow
- `SpeechRecognition` behavior in Chrome
- `SpeechRecognition` behavior in Edge
- mute/unmute behavior during real audio capture
- end-call behavior while TTS is actively playing
- how mixed call transcripts feel if later viewed in normal chat history

## Known risks / follow-up items

1. Call transcripts currently reuse the existing `mia_session_id`
This is safe, but may mix voice-call-style lines into normal chat history.

2. Browser STT is inherently fragile
Chrome/Edge should be the target. Firefox is not expected to work.

3. Mobile is intentionally blocked
This matches the current design direction from the spec.

4. Existing UI components still contain some old mojibake in unrelated files
This pass did not attempt broad cleanup outside the call feature.

## Backup created

- [2026-04-12-call-feature](/C:/Users/user/Desktop/english-learn/.codex-backups/2026-04-12-call-feature)

## Suggested next actions for Claude

1. Real-browser test `/call` with microphone permission in Chrome
2. Decide whether call transcripts should share `mia_session_id` or use a dedicated session
3. If needed, polish the call UI and unsupported-browser messaging
4. If the feature looks stable, then commit / push / deploy
