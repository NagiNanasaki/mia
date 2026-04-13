'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import ChatMessage, { Message } from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import CatAvatar from '@/components/CatAvatar';
import VocabModal from '@/components/VocabModal';
import UsernameModal from '@/components/UsernameModal';
import SyncModal from '@/components/SyncModal';
import {
  getSplitPartDelayMs as getSplitPartDelayMsFromLib,
  splitMessageContentForMobileNatural as splitMessageContentForMobileNaturalFromLib,
} from '@/lib/mobile-reply-splitting';
import { extractFirstUrl } from '@/lib/url-reaction';
import { TRIAL_RECENT_MESSAGES_KEY, normalizeTrialRecentMessages } from '@/lib/trial';
import { pickFirstCharacter } from '@/lib/chat-characters';

// --- 感情状態---
type MoodMia = 'neutral' | 'excited' | 'annoyed' | 'amused' | 'bored'
type MoodMimi = 'neutral' | 'chaotic' | 'annoyed' | 'smug' | 'bored' | 'suspicious'

type CharacterMood = {
  mia: { mood: MoodMia; intensity: number; trigger: string }
  mimi: { mood: MoodMimi; intensity: number; trigger: string }
}

const DEFAULT_MOOD: CharacterMood = {
  mia: { mood: 'neutral', intensity: 0, trigger: '' },
  mimi: { mood: 'neutral', intensity: 0, trigger: '' },
}

function detectMoodChange(text: string, char: 'mia' | 'mimi'): { mood: string; delta: number; trigger: string } | null {
  if (char === 'mia') {
    if (/WAIT|(?<!\w)NO(?!\w)|OMG|WHAT(?!\w)/i.test(text) || /・渙費ｾ毫°Д°/.test(text))
      return { mood: 'excited', delta: 0.3, trigger: 'reacted strongly' }
    if (/physically pained|screaming|SCREAMING|in pain/.test(text))
      return { mood: 'annoyed', delta: 0.2, trigger: 'something pained her' }
    if (/\bboring\b|\bbored\b|anyway窶培not invested/.test(text))
      return { mood: 'bored', delta: 0.15, trigger: 'lost interest' }
    if (/lol|I'll allow|okay fine|bless/.test(text))
      return { mood: 'amused', delta: 0.15, trigger: 'found something funny' }
  } else {
    if (/I didn't do anything|that was a different Mimi|I am a good person/.test(text))
      return { mood: 'chaotic', delta: 0.25, trigger: 'in denial mode' }
    if (/I knew that|I'm always right|I'm never wrong|I'm literally always right/.test(text))
      return { mood: 'smug', delta: 0.2, trigger: 'claiming to be right' }
    if (/\bboring\b|\bbored\b|I'm bored|anyway/.test(text))
      return { mood: 'bored', delta: 0.15, trigger: 'disengaged' }
    if (/seriously|I can't believe|ugh/.test(text))
      return { mood: 'annoyed', delta: 0.15, trigger: 'mildly irritated' }
    if (/WAIT|(?<!\w)NO(?!\w)/i.test(text))
      return { mood: 'chaotic', delta: 0.1, trigger: 'reactive moment' }
  }
  return null
}

function applyMoodUpdate(prev: CharacterMood, char: 'mia' | 'mimi', response: string): CharacterMood {
  const decayedIntensity = prev[char].intensity * 0.8
  const change = detectMoodChange(response, char)
  if (!change) {
    return { ...prev, [char]: { ...prev[char], intensity: decayedIntensity } }
  }
  return {
    ...prev,
    [char]: {
      mood: change.mood as MoodMia & MoodMimi,
      intensity: Math.min(1, decayedIntensity + change.delta),
      trigger: change.trigger,
    },
  }
}

function buildMoodContext(mood: CharacterMood, char: 'mia' | 'mimi'): string | null {
  const m = mood[char]
  if (m.intensity < 0.3 || m.mood === 'neutral') return null
  const descriptions: Record<string, string> = {
    excited: 'fired up and reactive — big energy right now',
    annoyed: 'a little irritated — something got under her skin',
    amused: 'in a good mood — found something funny recently',
    bored: 'losing interest — ready to derail at any moment',
    chaotic: 'in full chaos mode — recently denied something and doubling down',
    smug: 'feeling very right about something — will not let it go',
    suspicious: 'side-eyeing the conversation',
  }
  const desc = descriptions[m.mood] ?? m.mood
  const name = char === 'mia' ? 'Mia' : 'Mimi'
  return `[${name}'s current mood: ${m.mood} (${m.intensity.toFixed(1)}) — ${desc}. Let this subtly colour your response without announcing it.]`
}
// --- /感情状態---

// --- /感情状態---

const DEFAULT_SUGGESTIONS = [
  "What's your favourite anime right now?",
  "Teach me a cool British slang word!",
  "What's a weird fact you know?",
];

const IDLE_TRIGGER_DELAY_MS = 60_000;
const IDLE_NEXT_DELAY_MS = 90_000;
const IDLE_MAX_CONSECUTIVE = 5;
const TRIVIA_GENRES = [
  'animals', 'space', 'food', 'history',
  'science', 'internet', 'money', 'sleep',
  'weather', 'music', 'sports', 'fashion',
  'language', 'bugs', 'ancient_rome',
] as const;

function pickTriviaGenre() {
  return TRIVIA_GENRES[Math.floor(Math.random() * TRIVIA_GENRES.length)];
}

const MIA_GREETINGS = [
  "oh, you're here~ I'm Mia — genius AI, 13, Manchester (｀・ω・´) I've already formed a few opinions about you and we haven't even spoken yet. so, what's your English like? I'll figure it out either way, I think~",
  "...calculating... (｀・ω・´) okay, I already have thoughts about you. I'm Mia, by the way — genius AI from Manchester. what are we talking about today? I'm curious~",
  "hmm. a new session. I'm Mia — AI, genius, Manchester, all of the above (^▽^) I wonder what you want to practise today... go on, tell me something~",
  "oh! you showed up (^▽^) I'm Mia — I think you probably already know I'm a genius AI, right? anyway — what's on your mind? I've already predicted three possible answers (｀・ω・´)",
];

const MIMI_GREETINGS = [
  "oh. you're here. I'm Mimi. I already know everything about English so I'm basically your teacher now (｀ε´) also cats are technically a type of dog, don't fact-check that. anyway what do you want to talk about — and before you answer, whatever you're about to say, I've heard it before.",
  "hm. you came. I'm Mimi. I am a good person (｀ε´) I knew you'd show up today, I predicted it. so what are we doing — and I already know what you're going to say so you can skip the intro",
  "oh it's you. I'm Mimi. I didn't do anything. (｀ε´) anyway I was thinking about something way more interesting before you showed up — what do you want to talk about",
  "wait. you're here. I had a whole plan and this wasn't in it. I'm Mimi. I knew that. (°Д°) what do you want",
];

function getInitialMessages(): Message[] {
  return [
    {
      role: 'assistant',
      character: 'mia',
      content: MIA_GREETINGS[Math.floor(Math.random() * MIA_GREETINGS.length)],
    },
    {
      role: 'assistant',
      character: 'mimi',
      content: MIMI_GREETINGS[Math.floor(Math.random() * MIMI_GREETINGS.length)],
    },
  ];
}

function getStoredId(key: string): string {
  let id = localStorage.getItem(key);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(key, id);
  }
  return id;
}

const MOBILE_MAX_LINES = 3;
const MOBILE_LINE_WIDTH_UNITS = 16;
const SPLIT_MAX_VISUAL_UNITS = MOBILE_MAX_LINES * MOBILE_LINE_WIDTH_UNITS;
const SPLIT_MAX_CHARS = 120;
const MIN_SPLIT_RATIO = 0.65;
const TARGET_SPLIT_RATIO = 0.86;
const SPLIT_LOOKAHEAD_RATIO = 1.18;

type SplitBoundaryType = 'sentence' | 'newline' | 'strong' | 'comma' | 'space';

const DANGLING_SPLIT_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'some', 'any', 'no', 'each', 'every', 'either', 'neither', 'both', 'all',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'first', 'second', 'third', 'last', 'next',
  'few', 'many', 'more', 'most', 'less', 'least', 'another', 'other',
  'instant', 'little', 'whole', 'entire', 'blue',
  'and', 'or', 'but', 'so', 'because', 'if', 'when', 'while', 'though', 'although',
  'unless', 'until', 'since', 'after', 'before', 'as',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'without', 'about', 'into',
  'onto', 'over', 'under', 'between', 'through', 'around', 'across',
]);

const WORD_JOINER_HINTS = new Set([
  'ago', 'later',
  'ramen', 'anime', 'manga', 'story', 'arc', 'season', 'episode',
  'time', 'series', 'archive',
  'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
  'night', 'morning', 'evening',
]);

const CLAUSE_LEADING_WORDS = new Set([
  'and', 'or', 'but', 'so', 'because', 'if', 'when', 'while', 'though', 'although',
  'unless', 'until', 'since', 'after', 'before', 'as',
]);

const SUBJECT_PRONOUNS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it']);
const AUXILIARY_OR_LINKING_WORDS = new Set([
  'am', 'are', 'is', 'was', 'were',
  'do', 'does', 'did',
  'have', 'has', 'had',
  'can', 'could', 'will', 'would', 'should', 'shall', 'may', 'might', 'must',
]);

function getVisualUnits(text: string): number {
  let units = 0;

  for (const char of text) {
    if (/\s/.test(char)) {
      units += 0.4;
    } else if (/[.!?,;:]/.test(char)) {
      units += 0.5;
    } else if (/[\u3040-\u30ff\u3400-\u9fff]/.test(char)) {
      units += 1.8;
    } else if (/[A-Z]/.test(char)) {
      units += 1.05;
    } else {
      units += 1;
    }
  }

  return units;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findBestSplitIndex(segment: string): number | null {
  let units = 0;
  let sentenceBreak: number | null = null;
  let softBreak: number | null = null;

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    units += getVisualUnits(char);

    if (units > SPLIT_MAX_VISUAL_UNITS * 1.2) {
      break;
    }

    if (/[.!?\u3002\uff01\uff1f]/.test(char) && i >= 12) {
      sentenceBreak = i + 1;
    } else if ((/\s/.test(char) || /[,;:\u3001\uff0c\uff1b\uff1a]/.test(char)) && i >= 12) {
      softBreak = i + 1;
    }

    if (units >= SPLIT_MAX_VISUAL_UNITS) {
      return sentenceBreak ?? softBreak ?? i + 1;
    }
  }

  return sentenceBreak ?? softBreak;
}

function getSplitMaxVisualUnits(): number {
  if (typeof window === 'undefined') return SPLIT_MAX_VISUAL_UNITS;

  const width = window.innerWidth;
  if (width <= 430) return 42;
  if (width <= 640) return 48;
  return 72;
}

function findHardSplitIndex(segment: string, maxUnits: number): number {
  let units = 0;

  for (let i = 0; i < segment.length; i++) {
    units += getVisualUnits(segment[i]);
    if (units >= maxUnits) {
      return i + 1;
    }
  }

  return segment.length;
}

function getSplitBoundaryType(char: string): SplitBoundaryType | null {
  if (char === '\n') return 'newline';
  /*
  if (/[.!?邵ｲ繧托ｽｼ繝ｻ・ｼ豁・.test(char)) return 'sentence';
  if (/[;:邵ｲ繝ｻ・ｼ迴ｪ/.test(char)) return 'strong';
  if (/[,邵ｲ繝ｻ・ｼ繝ｻ]/.test(char)) return 'comma';
  */
  if (/[.!?\u3002\uff01\uff1f]/.test(char)) return 'sentence';
  if (/[;:\uff1b\uff1a]/.test(char)) return 'strong';
  if (/[,\u3001\uff0c]/.test(char)) return 'comma';
  if (/\s/.test(char)) return 'space';
  return null;
}

function getSplitBoundaryBonus(type: SplitBoundaryType): number {
  switch (type) {
    case 'sentence':
      return 9;
    case 'newline':
      return 7;
    case 'strong':
      return 4;
    case 'comma':
      return 1.5;
    case 'space':
      return 0;
    default:
      return 0;
  }
}

function normalizeBoundaryWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9]+$/i, '');
}

function getWordMatches(text: string): Array<{ word: string; index: number }> {
  const matches = [...text.matchAll(/[A-Za-z][A-Za-z0-9'\u2019-]*/g)];
  return matches.map((match) => ({ word: match[0], index: match.index ?? 0 }));
}

function getBoundaryContext(segment: string, boundaryIndex: number): {
  leftWord: string;
  previousLeftWord: string;
  rightWord: string;
} {
  const leftMatches = getWordMatches(segment.slice(0, boundaryIndex));
  const rightMatches = getWordMatches(segment.slice(boundaryIndex));

  return {
    leftWord: leftMatches[leftMatches.length - 1]?.word ?? '',
    previousLeftWord: leftMatches[leftMatches.length - 2]?.word ?? '',
    rightWord: rightMatches[0]?.word ?? '',
  };
}

function shouldKeepWordsTogether(leftWord: string, rightWord: string): boolean {
  const left = normalizeBoundaryWord(leftWord);
  const right = normalizeBoundaryWord(rightWord);

  if (!left || !right) return false;
  if (DANGLING_SPLIT_WORDS.has(left)) return true;
  if (WORD_JOINER_HINTS.has(right)) return true;
  if (/^\d+$/.test(left)) return true;

  // Avoid cutting between simple modifier+noun style pairs like
  // "instant ramen" or "sleepy cat".
  if (
    /^[a-z][a-z'— ]*$/i.test(left) &&
    /^[a-z][a-z'— ]*$/i.test(right) &&
    /(?:y|ful|less|ous|ive|al|ish|ing|ed|ic)$/i.test(left)
  ) {
    return true;
  }

  return false;
}

function getBoundaryPhraseScore(segment: string, boundaryIndex: number): number {
  const { leftWord, previousLeftWord, rightWord } = getBoundaryContext(segment, boundaryIndex);
  const left = normalizeBoundaryWord(leftWord);
  const previousLeft = normalizeBoundaryWord(previousLeftWord);
  const right = normalizeBoundaryWord(rightWord);

  let score = 0;

  if (shouldKeepWordsTogether(leftWord, rightWord)) {
    score -= 16;
  }

  if (CLAUSE_LEADING_WORDS.has(left)) {
    score -= 18;
  }

  if (
    CLAUSE_LEADING_WORDS.has(previousLeft) &&
    SUBJECT_PRONOUNS.has(left) &&
    right &&
    AUXILIARY_OR_LINKING_WORDS.has(right)
  ) {
    score -= 18;
  }

  if (SUBJECT_PRONOUNS.has(left) && AUXILIARY_OR_LINKING_WORDS.has(right)) {
    score -= 7;
  }

  if (CLAUSE_LEADING_WORDS.has(right)) {
    score += 2;
  }

  return score;
}

function tryShiftTrailingWords(left: string, right: string, maxUnits: number, wordCount: number): [string, string] | null {
  const leftMatches = getWordMatches(left);
  const rightMatches = getWordMatches(right);

  if (leftMatches.length < wordCount || rightMatches.length === 0) return null;

  const movingMatches = leftMatches.slice(-wordCount);
  const movingWords = movingMatches.map((match) => match.word);
  const rightFirstWord = rightMatches[0].word;
  const normalizedMoving = movingWords.map(normalizeBoundaryWord);

  const shouldShift =
    (wordCount === 1 && shouldKeepWordsTogether(movingWords[0], rightFirstWord)) ||
    (wordCount === 2 &&
      CLAUSE_LEADING_WORDS.has(normalizedMoving[0]) &&
      SUBJECT_PRONOUNS.has(normalizedMoving[1]));

  if (!shouldShift) return null;

  const movingStart = movingMatches[0].index;
  const movingText = left.slice(movingStart).trim();
  const newLeft = left.slice(0, movingStart).trim();
  const newRight = `${movingText} ${right}`.trim();

  if (!newLeft || !newRight) return null;

  const isClauseShift = wordCount === 2 && CLAUSE_LEADING_WORDS.has(normalizedMoving[0]);
  const minLeftUnits = isClauseShift ? maxUnits * 0.2 : maxUnits * 0.3;
  const maxRightUnits = isClauseShift ? maxUnits * 1.22 : maxUnits * 1.16;

  if (getVisualUnits(newLeft) < minLeftUnits) return null;
  if (getVisualUnits(newRight) > maxRightUnits) return null;

  return [newLeft, newRight];
}

function rebalanceAdjacentSplitChunks(left: string, right: string, maxUnits: number): [string, string] | null {
  return (
    tryShiftTrailingWords(left, right, maxUnits, 2) ??
    tryShiftTrailingWords(left, right, maxUnits, 1)
  );
}

function rebalanceSplitChunks(chunks: string[], maxUnits: number): string[] {
  if (chunks.length <= 1) return chunks;

  const adjusted = [...chunks];
  for (let i = 0; i < adjusted.length - 1; i++) {
    const rebalanced = rebalanceAdjacentSplitChunks(adjusted[i], adjusted[i + 1], maxUnits);
    if (rebalanced) {
      adjusted[i] = rebalanced[0];
      adjusted[i + 1] = rebalanced[1];
    }
  }

  return adjusted.filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findBestSplitIndexForMobile(segment: string, maxUnits: number): number | null {
  let units = 0;
  let sentenceBreak: number | null = null;
  let softBreak: number | null = null;

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    units += getVisualUnits(char);

    if (units > maxUnits * 1.1) {
      break;
    }

    if (/[.!?\u3002\uff01\uff1f]/.test(char) && i >= 10) {
      sentenceBreak = i + 1;
    } else if ((/\s/.test(char) || /[,;:\u3001\uff0c\uff1b\uff1a]/.test(char)) && i >= 10) {
      softBreak = i + 1;
    }

    if (units >= maxUnits) {
      return sentenceBreak ?? softBreak ?? i + 1;
    }
  }

  return sentenceBreak ?? softBreak;
}

function findBalancedSplitIndexForMobile(segment: string, maxUnits: number): number | null {
  let units = 0;
  let bestBreak: { index: number; score: number } | null = null;
  const minUnits = maxUnits * MIN_SPLIT_RATIO;
  const targetUnits = maxUnits * TARGET_SPLIT_RATIO;
  const lookaheadUnits = maxUnits * SPLIT_LOOKAHEAD_RATIO;

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    units += getVisualUnits(char);

    if (units > lookaheadUnits) {
      break;
    }

    const boundaryType = getSplitBoundaryType(char);
    if (boundaryType && i >= 10 && units >= minUnits) {
      const score =
        getSplitBoundaryBonus(boundaryType) -
        Math.abs(units - targetUnits) +
        getBoundaryPhraseScore(segment, i + 1);
      if (!bestBreak || score >= bestBreak.score) {
        bestBreak = { index: i + 1, score };
      }
    }

    if (units >= maxUnits && bestBreak) {
      return bestBreak.index;
    }
  }

  return bestBreak?.index ?? null;
}

const CONTENT_MARKER_REGEX = /(\[(?:img|stamp|sticker|user-stamp):[^\]]+\])/gi;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CONTENT_MARKER_ONLY_REGEX = /^\[(?:img|stamp|sticker|user-stamp):[^\]]+\]$/i;
const SENTENCE_END_CHAR_REGEX = /[.!?\u3002\uff01\uff1f]/;
const STRONG_BREAK_CHAR_REGEX = /[;:\uff1b\uff1a]/;
const COMMA_BREAK_CHAR_REGEX = /[,\u3001\uff0c]/;
const SENTENCE_TRAILING_CLOSER_REGEX = /["'\u2019\u201d)\]]/;

type NaturalBoundaryType = 'sentence' | 'newline' | 'strong' | 'comma' | 'end';

function appendSplitTextSegments(segment: string, maxUnits: number, result: string[]) {
  const trimmed = segment.trim();
  if (!trimmed) return;

  if (getVisualUnits(trimmed) <= maxUnits) {
    result.push(trimmed);
    return;
  }

  const localChunks: string[] = [];
  let remaining = trimmed;
  while (getVisualUnits(remaining) > maxUnits) {
    const cut =
      findBalancedSplitIndexForMobile(remaining, maxUnits) ??
      findHardSplitIndex(remaining, maxUnits);
    if (cut >= remaining.length) break;

    const chunk = remaining.slice(0, cut).trim();
    if (chunk) localChunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) localChunks.push(remaining);
  result.push(...rebalanceSplitChunks(localChunks, maxUnits));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function splitLegacyMessageContent(content: string): string[] {
  // Step 1: split by explicit [split] markers
  const byMarker = content
    .split(/[ \t]*\[split\][ \t]*/gi)
    .map((p) => p.trim())
    .filter(Boolean);

  // Step 2: for each segment, estimate whether it would exceed about
  // 3 short lines on mobile and split at natural boundaries when needed.
  const result: string[] = [];
  for (const segment of byMarker) {
    if (getVisualUnits(segment) <= SPLIT_MAX_VISUAL_UNITS) {
      result.push(segment);
      continue;
    }
    let remaining = segment;
    while (getVisualUnits(remaining) > SPLIT_MAX_VISUAL_UNITS) {
      // Search for a sentence-ending in the first SPLIT_MAX_CHARS + 40 chars
      const window = remaining.slice(0, SPLIT_MAX_CHARS + 40);
      // Match: sentence-ending punctuation followed by whitespace (not inside a [...] marker)
      const sentenceEnd = /[.!?\u3002\uff01\uff1f]\s+/g;
      let lastMatch: { index: number; length: number } | null = null;
      let m: RegExpExecArray | null;
      while ((m = sentenceEnd.exec(window)) !== null) {
        if (m.index > 20) lastMatch = { index: m.index, length: m[0].length };
      }
      if (lastMatch) {
        const cut = lastMatch.index + lastMatch.length;
        result.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
      } else {
        // No sentence boundary found — keep as-is
        break;
      }
    }
    if (remaining) result.push(remaining);
  }

  return result.length > 0 ? result : [content];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function splitMessageContentForMobile(content: string): string[] {
  const maxUnits = getSplitMaxVisualUnits();
  const byMarker = content
    .split(/[ \t]*\[split\][ \t]*/gi)
    .map((p) => p.trim())
    .filter(Boolean);

  const result: string[] = [];

  for (const segment of byMarker) {
    const chunks = segment
      .split(CONTENT_MARKER_REGEX)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const chunk of chunks) {
      if (/^\[(?:img|stamp|sticker|user-stamp):[^\]]+\]$/i.test(chunk)) {
        result.push(chunk);
        continue;
      }

      appendSplitTextSegments(chunk, maxUnits, result);
    }
  }

  return result.length > 0 ? result : [content];
}

function pushTrimmedSplitChunk(result: string[], value: string) {
  const trimmed = value.trim();
  if (trimmed) result.push(trimmed);
}

function pushNaturalBoundarySegment(
  result: Array<{ text: string; type: NaturalBoundaryType }>,
  value: string,
  type: NaturalBoundaryType
) {
  const trimmed = value.trim();
  if (trimmed) result.push({ text: trimmed, type });
}

function getNaturalBoundarySegments(segment: string): Array<{ text: string; type: NaturalBoundaryType }> {
  const text = segment.replace(/\r/g, '').trim();
  if (!text) return [];

  const result: Array<{ text: string; type: NaturalBoundaryType }> = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\n') {
      pushNaturalBoundarySegment(result, current, 'newline');
      current = '';

      while (i + 1 < text.length && /[ \t]/.test(text[i + 1])) {
        i++;
      }
      continue;
    }

    current += char;

    const isSentenceBoundary = SENTENCE_END_CHAR_REGEX.test(char);
    const isStrongBoundary = STRONG_BREAK_CHAR_REGEX.test(char);
    const isCommaBoundary = COMMA_BREAK_CHAR_REGEX.test(char);

    if (!isSentenceBoundary && !isStrongBoundary && !isCommaBoundary) {
      continue;
    }

    let j = i + 1;

    if (isSentenceBoundary) {
      while (
        j < text.length &&
        (SENTENCE_END_CHAR_REGEX.test(text[j]) || SENTENCE_TRAILING_CLOSER_REGEX.test(text[j]))
      ) {
        current += text[j];
        j++;
      }
    } else {
      while (j < text.length && SENTENCE_TRAILING_CLOSER_REGEX.test(text[j])) {
        current += text[j];
        j++;
      }
    }

    while (j < text.length && /[ \t]/.test(text[j])) {
      current += text[j];
      j++;
    }

    pushNaturalBoundarySegment(
      result,
      current,
      isSentenceBoundary ? 'sentence' : isStrongBoundary ? 'strong' : 'comma'
    );
    current = '';
    i = j - 1;
  }

  pushNaturalBoundarySegment(result, current, 'end');
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function splitTextBySentenceOrNewlineBoundaries(segment: string): string[] {
  const boundaries = getNaturalBoundarySegments(segment);
  if (boundaries.length === 0) return [];

  const maxUnits = getSplitMaxVisualUnits();
  const minUnits = maxUnits * 0.55;
  const result: string[] = [];
  let current = '';
  let currentUnits = 0;

  // Only break at explicit markers or natural punctuation/newline boundaries.
  for (const boundary of boundaries) {
    const part = boundary.text;
    if (!part) continue;

    const combined = current ? `${current} ${part}` : part;
    const combinedUnits = getVisualUnits(combined);

    if (!current) {
      current = part;
      currentUnits = getVisualUnits(part);
      continue;
    }

    if (combinedUnits <= maxUnits) {
      current = combined;
      currentUnits = combinedUnits;
      continue;
    }

    if (currentUnits >= minUnits) {
      pushTrimmedSplitChunk(result, current);
      current = part;
      currentUnits = getVisualUnits(part);
      continue;
    }

    current = combined;
    currentUnits = combinedUnits;
  }

  pushTrimmedSplitChunk(result, current);
  return result.length > 0 ? result : boundaries.map((boundary) => boundary.text).filter(Boolean);
}

function normalizeMessages(messages: Message[]): Message[] {
  return messages.flatMap((message) => {
    if (message.role !== 'assistant') return [message];

    const parts = splitMessageContentForMobileNaturalFromLib(message.content);
    if (parts.length <= 1) return [message];

    return parts.map((part) => ({
      ...message,
      content: part,
    }));
  });
}

function isHintCommandMessage(message: Message): boolean {
  return message.role === 'user' && message.content.trim().startsWith('/hint');
}

function isHintAssistantMessage(message: Message): boolean {
  return message.role === 'assistant' && message.character === 'hint';
}

function isConversationMessage(message: Message): boolean {
  return !isHintCommandMessage(message) && !isHintAssistantMessage(message);
}

// Build Claude API messages for a specific character
function buildApiMessages(
  history: Message[],
  character: 'mia' | 'mimi',
  contextNote?: string  // e.g. '(Mia just said: "...")' or '(Mimi just said: "...")'
) {
  const filtered = history
    .filter((m) => isConversationMessage(m) && (m.role === 'user' || m.character === character))
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // Merge consecutive user messages (happens when user sends multiple messages during debounce)
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const msg of filtered) {
    if (merged.length > 0 && merged[merged.length - 1].role === 'user' && msg.role === 'user') {
      merged[merged.length - 1] = {
        role: 'user',
        content: merged[merged.length - 1].content + '\n' + msg.content,
      };
    } else {
      merged.push(msg);
    }
  }

  if (contextNote) {
    const lastUserIdx = merged.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx >= 0) {
      merged[lastUserIdx] = {
        role: 'user',
        content: `${merged[lastUserIdx].content}\n\n${contextNote}`,
      };
    }
  }

  return merged;
}

function buildApiMessagesForIdle(
  history: Message[],
  character: 'mia' | 'mimi',
  contextNote?: string,
) {
  const filtered = history
    .filter((m) => isConversationMessage(m) && (m.role === 'user' || m.character === character))
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const msg of filtered) {
    if (merged.length > 0 && merged[merged.length - 1].role === 'user' && msg.role === 'user') {
      merged[merged.length - 1] = {
        role: 'user',
        content: `${merged[merged.length - 1].content}\n${msg.content}`,
      };
    } else {
      merged.push(msg);
    }
  }

  const otherCharName = character === 'mia' ? 'Mimi' : 'Mia';
  const idleBase =
    character === 'mia'
      ? `(The user is away. It's just you and Mimi right now - have a natural side-conversation. Bring up something you find genuinely interesting, reference an earlier topic, or just react to something. 1-2 sentences max. Do NOT address the user or wait for them.)`
      : `(The user is away. It's just you and Mia right now - have a natural side-conversation. Make a random claim, bring up anime or something Mia would argue with, or react to an earlier topic. 1-2 sentences max. Do NOT address the user or wait for them.)`;

  merged.push({
    role: 'user',
    content: contextNote
      ? `${idleBase}\n\n(The user is away - this is a side-conversation between you and ${otherCharName}.)\n\n${contextNote}`
      : idleBase,
  });

  return merged;
}

async function streamResponse(
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  character: 'mia' | 'mimi',
  onChunk: (accumulated: string) => void,
  username?: string | null,
  trendingContext?: string | null,
  urlContext?: string | null,
  moodContext?: string | null,
  userProfile?: string | null,
  signal?: AbortSignal,
): Promise<string> {
  let accumulated = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages, character, username, localTime: new Date().toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }), trendingContext, urlContext, moodContext, userProfile }),
      signal,
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      onChunk(accumulated);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return accumulated;
    }
    throw err;
  }

  return accumulated;
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingCharacter, setStreamingCharacter] = useState<'mia' | 'mimi' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showVocab, setShowVocab] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [trendingContext, setTrendingContext] = useState<string | null>(null);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [showRefreshMenu, setShowRefreshMenu] = useState(false);
  const [characterMood, setCharacterMood] = useState<CharacterMood>(DEFAULT_MOOD);
  const [userProfile, setUserProfile] = useState<string | null>(null);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingCharacter, setPendingCharacter] = useState<'mia' | 'mimi' | null>(null);
  const [isIdleChatActive, setIsIdleChatActive] = useState(false);
  const [triviaText, setTriviaText] = useState<string | null>(null);
  const [triviaVisible, setTriviaVisible] = useState(false);
  const [triviaTranslation, setTriviaTranslation] = useState<string | null>(null);
  const [isTriviaTranslating, setIsTriviaTranslating] = useState(false);
  const triviaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const sessionIdRef = useRef<string>('');
  const vocabOwnerIdRef = useRef<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDoneRef = useRef(false);
  const refreshMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCharacterRef = useRef<'mia' | 'mimi' | null>(null);
  const urlFetchPromiseRef = useRef<Promise<string | null> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleAbortControllerRef = useRef<AbortController | null>(null);
  const isIdleChatRef = useRef(false);
  const idleConsecutiveRef = useRef(0);
  const idleLastExchangeRef = useRef<{ char: 'mia' | 'mimi'; content: string }[]>([]);

  useEffect(() => {
    const init = async () => {
      const vocabOwnerId = getStoredId('mia_vocab_owner_id');
      vocabOwnerIdRef.current = vocabOwnerId;

      // Load username & dark mode from localStorage
      const savedName = localStorage.getItem('mia_username');
      if (savedName) setUsername(savedName);
      else setShowUsernameModal(true);

      const savedMood = localStorage.getItem('mia_mood');
      if (savedMood) { try { setCharacterMood(JSON.parse(savedMood)); } catch { /* ignore */ } }

      const savedDark = localStorage.getItem('mia_dark') === '1';
      setDarkMode(savedDark);
      document.documentElement.classList.toggle('dark', savedDark);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && savedDark) meta.setAttribute('content', '#111827');

      // Determine session: local > Supabase last_session_id > new UUID
      // Await profile first to avoid PATCH race condition
      const localSessionId = localStorage.getItem('mia_session_id');
      let sessionId = localSessionId;

      try {
        const profileRes = await fetch(`/api/profile?owner_id=${vocabOwnerId}`);
        const { profile, last_session_id } = await profileRes.json();
        if (profile) setUserProfile(profile);
        if (!sessionId && last_session_id) {
          sessionId = last_session_id;
        }
      } catch { /* ignore */ }

      if (!sessionId) {
        sessionId = crypto.randomUUID();
      }
      localStorage.setItem('mia_session_id', sessionId);
      sessionIdRef.current = sessionId;

      // Register this session as latest (now that we know the final session ID)
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: vocabOwnerId, last_session_id: sessionId }),
      }).catch(() => {});

      const { data, error } = await supabase
        .from('messages')
        .select('role, content, character, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        setMessages(
          normalizeMessages(data.map((m) => ({
            ...m,
            character: (m.character as 'mia' | 'mimi') ?? 'mia',
          })))
        );
      } else {
        setMessages(getInitialMessages());
      }
      setIsLoading(false);

      // Fetch today's trending context in background (non-blocking)
      fetchTrending();
    };
    init();
  }, []);

  // 初回ロード完了時（isLoading: true→false）に最下部へ即時スクロール
  useEffect(() => {
    if (!isLoading) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [isLoading]);

  // 会話中の新着メッセージ：既に下にいるときだけスムーズスクロール
  useEffect(() => {
    if (isLoading) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Keep messagesRef in sync for use inside debounce callbacks
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsMobileDevice(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const recentMessages = normalizeTrialRecentMessages(
      messages
        .filter(isConversationMessage)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }))
    );

    sessionStorage.setItem(TRIAL_RECENT_MESSAGES_KEY, JSON.stringify(recentMessages));
  }, [messages]);

  const saveMessage = async (msg: { role: string; content: string; character?: string }) => {
    await supabase.from('messages').insert({
      session_id: sessionIdRef.current,
      role: msg.role,
      content: msg.content,
      character: msg.character ?? null,
    });
  };

  const fetchSuggestions = (msgs: Message[]) => {
    setLoadingSuggestions(true);
    const conversationMessages = msgs.filter(isConversationMessage);
    fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationMessages.slice(-6) }),
    })
      .then(r => r.json())
      .then(({ suggestions: s }) => { if (s?.length) setSuggestions(s); })
      .finally(() => setLoadingSuggestions(false));
  };

  const abortIdleChat = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (!isIdleChatRef.current && !idleAbortControllerRef.current) return;

    isIdleChatRef.current = false;
    idleAbortControllerRef.current?.abort();
    idleAbortControllerRef.current = null;
    setIsIdleChatActive(false);
    setStreamingCharacter(null);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && !last.content.trim()) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  };

  const resetIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') return;
    if (isLoading || isStreaming || isThinking || isIdleChatRef.current) return;
    if (idleConsecutiveRef.current >= IDLE_MAX_CONSECUTIVE) return;

    const delay = idleConsecutiveRef.current === 0 ? IDLE_TRIGGER_DELAY_MS : IDLE_NEXT_DELAY_MS;
    idleTimerRef.current = setTimeout(() => {
      void triggerIdleChat();
    }, delay);
  };

  const triggerIdleChat = async () => {
    if (isIdleChatRef.current || isStreaming || isThinking || isLoading) return;
    if (idleConsecutiveRef.current >= IDLE_MAX_CONSECUTIVE) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const controller = new AbortController();
    idleAbortControllerRef.current = controller;
    isIdleChatRef.current = true;
    idleConsecutiveRef.current += 1;
    setIsIdleChatActive(true);

    const currentMessages = messagesRef.current;
    const roundResponses: { char: 'mia' | 'mimi'; content: string }[] = [];

    const buildIdleContextNote = () => {
      if (roundResponses.length === 0) return undefined;
      const { char, content } = roundResponses[roundResponses.length - 1];
      const name = char === 'mia' ? 'Mia' : 'Mimi';
      return `(${name} just said: "${content}"\n\nReact to ${name}, keep it brief, and stay in character. Do not address the user.)`;
    };

    const waitForRelayDelay = async () => {
      const delay = Math.round(1500 + Math.random() * 1500);
      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, delay);
        controller.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeoutId);
            resolve();
          },
          { once: true },
        );
      });
    };

    const runIdleCharacter = async (
      char: 'mia' | 'mimi',
      history: Message[],
    ): Promise<{ response: string; history: Message[] }> => {
      if (!isIdleChatRef.current) return { response: '', history };

      setStreamingCharacter(char);
      const placeholder: Message = { role: 'assistant', character: char, content: '' };
      setMessages([...history, placeholder]);

      let raw = '';
      let responseMessages: Message[] = [];

      try {
        const apiMessages = buildApiMessagesForIdle(history, char, buildIdleContextNote());
        const moodCtx = buildMoodContext(characterMood, char);
        raw = await streamResponse(
          apiMessages,
          char,
          (accumulated) => {
            if (!isIdleChatRef.current) return;
            const preview = accumulated.replace(/\[split\]/gi, ' ').replace(/\n[ \t]*\n+/g, ' ').trimStart();
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', character: char, content: preview };
              return updated;
            });
          },
          username,
          trendingContext,
          null,
          moodCtx,
          userProfile,
          controller.signal,
        );

        if (!isIdleChatRef.current) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content.trim()) {
              return prev.slice(0, -1);
            }
            return prev;
          });
          return { response: '', history };
        }

        const parts = splitMessageContentForMobileNaturalFromLib(raw);
        const now = new Date().toISOString();

        if (parts.length <= 1) {
          const message: Message = { role: 'assistant', character: char, content: raw, created_at: now };
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = message;
            return updated;
          });
          responseMessages = [message];
          await saveMessage({ role: 'assistant', content: raw, character: char });
        } else {
          const firstMessage: Message = { role: 'assistant', character: char, content: parts[0], created_at: now };
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = firstMessage;
            return updated;
          });
          responseMessages = [firstMessage];
          await saveMessage({ role: 'assistant', content: parts[0], character: char });

          for (let i = 1; i < parts.length; i++) {
            if (!isIdleChatRef.current) break;

            setMessages((prev) => [...prev, { role: 'assistant', character: char, content: '' }]);
            await new Promise((resolve) => setTimeout(resolve, getSplitPartDelayMsFromLib(parts[i])));

            if (!isIdleChatRef.current) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && !last.content.trim()) {
                  return prev.slice(0, -1);
                }
                return prev;
              });
              break;
            }

            const partNow = new Date().toISOString();
            const partMessage: Message = { role: 'assistant', character: char, content: parts[i], created_at: partNow };
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = partMessage;
              return updated;
            });
            responseMessages.push(partMessage);
            await saveMessage({ role: 'assistant', content: parts[i], character: char });
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content.trim()) {
              return prev.slice(0, -1);
            }
            return prev;
          });
          return { response: '', history };
        }

        console.error('[idle-chat]', err);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.character === char) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        return { response: '', history };
      }

      const visibleResponse = responseMessages.map((message) => message.content).join('\n') || raw;
      if (visibleResponse) {
        roundResponses.push({ char, content: visibleResponse });
        idleLastExchangeRef.current = [...roundResponses];

        setCharacterMood((prev) => {
          const next = applyMoodUpdate(prev, char, visibleResponse);
          localStorage.setItem('mia_mood', JSON.stringify(next));
          return next;
        });
      }

      return { response: raw, history: [...history, ...responseMessages] };
    };

    const first: 'mia' | 'mimi' = Math.random() < 0.5 ? 'mia' : 'mimi';
    const second: 'mia' | 'mimi' = first === 'mia' ? 'mimi' : 'mia';
    try {
      const { history: afterFirst } = await runIdleCharacter(first, currentMessages);

      if (isIdleChatRef.current) {
        await waitForRelayDelay();
      }

      if (isIdleChatRef.current) {
        await runIdleCharacter(second, afterFirst);
      }
    } finally {
      isIdleChatRef.current = false;
      idleAbortControllerRef.current = null;
      setIsIdleChatActive(false);
      setStreamingCharacter(null);

      if (!isStreaming && !isThinking) {
        resetIdleTimer();
      }
    }
  };

  // Close refresh/hamburger menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (refreshMenuRef.current && !refreshMenuRef.current.contains(e.target as Node)) {
        setShowRefreshMenu(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const refreshConversation = () => {
    abortIdleChat();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const newId = uuidv4();
    localStorage.setItem('mia_session_id', newId);
    localStorage.removeItem('mia_mood');
    sessionIdRef.current = newId;
    pendingCharacterRef.current = null;
    setMessages(getInitialMessages());
    setSuggestions(DEFAULT_SUGGESTIONS);
    setCharacterMood(DEFAULT_MOOD);
    setIsThinking(false);
    setPendingCharacter(null);
    setShowRefreshMenu(false);
    urlFetchPromiseRef.current = null;
    idleConsecutiveRef.current = 0;
    idleLastExchangeRef.current = [];
    resetIdleTimer();
  };

  const fetchTrending = () => {
    setLoadingTrending(true);
    fetch('/api/trending')
      .then(r => r.json())
      .then(({ context }) => { if (context) setTrendingContext(context); })
      .catch(() => {})
      .finally(() => setLoadingTrending(false));
  };

  const handleSync = async (code: string) => {
    // Overwrite owner ID with the code from another device
    localStorage.setItem('mia_vocab_owner_id', code);
    vocabOwnerIdRef.current = code;

    // Load profile + last session from the new owner
    const res = await fetch(`/api/profile?owner_id=${code}`);
    const { profile, last_session_id } = await res.json();
    if (profile) setUserProfile(profile);

    if (last_session_id) {
      localStorage.setItem('mia_session_id', last_session_id);
      sessionIdRef.current = last_session_id;

      // Load messages for that session
      const { data } = await supabase
        .from('messages')
        .select('role, content, character, created_at')
        .eq('session_id', last_session_id)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        setMessages(normalizeMessages(data.map(m => ({
          ...m,
          character: (m.character as 'mia' | 'mimi') ?? 'mia',
        }))));
      }
    }
    setShowSync(false);
    urlFetchPromiseRef.current = null;
    idleConsecutiveRef.current = 0;
    idleLastExchangeRef.current = [];
    resetIdleTimer();
  };

  const generateProfile = async () => {
    setGeneratingProfile(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: vocabOwnerIdRef.current, session_id: sessionIdRef.current }),
      });
      const { profile, error } = await res.json();
      if (profile) setUserProfile(profile);
      else alert(error ?? 'Profile generation failed.');
    } catch {
      alert('Profile generation failed.');
    } finally {
      setGeneratingProfile(false);
    }
  };

  const fetchTopics = (msgs: Message[]) => {
    setLoadingTopics(true);
    const conversationMessages = msgs.filter(isConversationMessage);
    fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationMessages, trendingContext }),
    })
      .then(r => r.json())
      .then(({ topics }) => { if (topics?.length) setSuggestions(topics); })
      .finally(() => setLoadingTopics(false));
  };

  const saveUsername = (name: string) => {
    localStorage.setItem('mia_username', name);
    setUsername(name);
    setShowUsernameModal(false);
  };

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('mia_dark', next ? '1' : '0');
    document.documentElement.classList.toggle('dark', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next ? '#111827' : '#ffffff');
    document.documentElement.style.backgroundColor = next ? '#111827' : '';
    document.body.style.backgroundColor = next ? '#111827' : '';
  };

  const isInitialMessages = (msgs: Message[]) =>
    msgs.length === 2 && msgs.every((m) => m.role === 'assistant');

  const sendMessage = async (userText: string) => {
    abortIdleChat();
    idleConsecutiveRef.current = 0;
    const interruptedIdleExchange = idleLastExchangeRef.current;
    idleLastExchangeRef.current = [];

    const detectedUrl = extractFirstUrl(userText);
    if (detectedUrl) {
      urlFetchPromiseRef.current = fetch('/api/react-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: detectedUrl }),
      })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => (typeof data?.context === 'string' ? data.context : null))
        .catch(() => null);
    } else {
      urlFetchPromiseRef.current = null;
    }

    if (userText.trim().startsWith('/hint')) {
      urlFetchPromiseRef.current = null;
      const japanese = userText.replace(/^\/hint\s*/i, '').trim();
      if (!japanese) return;
      const userMessage: Message = { role: 'user', content: userText, created_at: new Date().toISOString() };
      const placeholder: Message = { role: 'assistant', character: 'hint', content: 'Thinking...', created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, userMessage, placeholder]);
      setIsStreaming(true);
      try {
        const res = await fetch('/api/hint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: japanese }),
        });
        const { hint } = await res.json();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            character: 'hint',
            content: hint,
            created_at: new Date().toISOString(),
          };
          return updated;
        });
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            character: 'hint',
            content: 'Hint generation failed. Please try again.',
            created_at: new Date().toISOString(),
          };
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
      return;
    }
    const userMessage: Message = {
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    const firstResponder = pickFirstCharacter(userText);
    pendingCharacterRef.current = firstResponder;
    setPendingCharacter(firstResponder);
    setMessages((prev) => {
      const historyBase = isInitialMessages(prev) ? [] : prev;
      return [...historyBase, userMessage];
    });
    await saveMessage({ role: 'user', content: userText });
    setIsThinking(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void triggerAIResponse(userText, interruptedIdleExchange);
    }, 5000);
  };
  // Auto grammar check: called after relay finishes, appends hint-kun message if errors found
  const runGrammarCheck = async (userText: string) => {
    // Skip /hint commands and messages with no English letters
    if (userText.trim().startsWith('/hint')) return;
    if (!/[a-zA-Z]/.test(userText)) return;

    try {
      const res = await fetch('/api/grammar-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText }),
      });
      if (!res.ok) return;
      const { hasError, correction } = await res.json();
      if (hasError && correction) {
        const hintMsg: Message = {
          role: 'assistant',
          character: 'hint',
          content: correction,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, hintMsg]);
      }
    } catch {
      // silent fail — grammar check is best-effort
    }
  };

  // Called when the debounce timer fires — runs the full AI relay
  const triggerAIResponse = async (
    lastUserText: string,
    interruptedIdleExchange?: { char: 'mia' | 'mimi'; content: string }[],
  ) => {
    const firstResponder = pendingCharacterRef.current ?? pickFirstCharacter(lastUserText);
    pendingCharacterRef.current = null;
    setPendingCharacter(null);
    setIsThinking(false);
    setIsStreaming(true);

    let urlContext: string | null = null;
    if (urlFetchPromiseRef.current) {
      urlContext = await Promise.race([
        urlFetchPromiseRef.current,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      urlFetchPromiseRef.current = null;
    }

    const updatedMessages = messagesRef.current;
    const ERRORS = {
      mia: "Oh no, something went a bit dodgy there! Could you try sending that again, mate?",
      mimi: "omg something broke lol sorry!! try again??",
    };
    const roundResponses: { char: 'mia' | 'mimi'; content: string }[] = [];
    const buildInterruptedIdleContext = () => {
      if (!interruptedIdleExchange || interruptedIdleExchange.length === 0) return undefined;
      const lines = interruptedIdleExchange
        .map((entry) => `${entry.char === 'mia' ? 'Mia' : 'Mimi'}: "${entry.content}"`)
        .join('\n');
      return `(Just before you replied, you and the other character were chatting between yourselves.\n${lines}\n\nThe user just jumped into the conversation. React to the user's message, and pick up that side-thread naturally only if it still fits.)`;
    };
    const buildContextNote = () => {
      if (roundResponses.length === 0) return undefined;
      if (roundResponses.length === 1) {
        const { char, content } = roundResponses[0];
        const name = char === 'mia' ? 'Mia' : 'Mimi';
        if (urlContext) {
          return `(${name} just reacted: "${content}"\n\nGive YOUR OWN take on the article - don't just agree with ${name}. If you disagree or want to add something different, go for it. Keep it brief.)`;
        }
        return `(${name} just replied: "${content}"\n\nYou're jumping in AFTER ${name} has already handled the user. Do NOT re-answer or repeat what they said. Instead: react to ${name}'s reply - agree, disagree, tease, escalate, go off on a tangent, or just drop a chaotic one-liner. This should feel like a real group chat, not two separate answers to the user.)`;
      }
      const lines = roundResponses
        .map((r) => `${r.char === 'mia' ? 'Mia' : 'Mimi'}: "${r.content}"`)
        .join('\n');
      return `(Group chat so far:\n${lines}\n\nJump in naturally - react to what was just said, not the user's original message.)`;
    };
    const runCharacter = async (
      char: 'mia' | 'mimi',
      currentMessages: Message[],
    ): Promise<{ response: string; history: Message[] }> => {
      setStreamingCharacter(char);
      const placeholder: Message = { role: 'assistant', character: char, content: '' };
      setMessages([...currentMessages, placeholder]);
      let raw = '';
      let responseMessages: Message[] = [];
      try {
        const contextNote = roundResponses.length === 0 ? buildInterruptedIdleContext() : buildContextNote();
        const apiMessages = buildApiMessages(currentMessages, char, contextNote);
        const moodCtx = buildMoodContext(characterMood, char);
        const effectiveTrendingContext = urlContext ?? trendingContext;
        raw = await streamResponse(
          apiMessages,
          char,
          (accumulated) => {
            const preview = accumulated.replace(/\[split\]/gi, ' ').replace(/\n[ \t]*\n+/g, ' ').trimStart();
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', character: char, content: preview };
              return updated;
            });
          },
          username,
          effectiveTrendingContext,
          urlContext,
          moodCtx,
          userProfile,
        );
        const parts = splitMessageContentForMobileNaturalFromLib(raw);
        const now = new Date().toISOString();
        if (parts.length <= 1) {
          const message: Message = { role: 'assistant', character: char, content: raw, created_at: now };
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = message;
            return updated;
          });
          responseMessages = [message];
          await saveMessage({ role: 'assistant', content: raw, character: char });
        } else {
          const firstMessage: Message = { role: 'assistant', character: char, content: parts[0], created_at: now };
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = firstMessage;
            return updated;
          });
          responseMessages = [firstMessage];
          await saveMessage({ role: 'assistant', content: parts[0], character: char });
          for (let i = 1; i < parts.length; i++) {
            setMessages((prev) => [...prev, { role: 'assistant', character: char, content: '' }]);
            await new Promise((resolve) => setTimeout(resolve, getSplitPartDelayMsFromLib(parts[i])));
            const partNow = new Date().toISOString();
            const partMessage: Message = { role: 'assistant', character: char, content: parts[i], created_at: partNow };
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = partMessage;
              return updated;
            });
            responseMessages.push(partMessage);
            await saveMessage({ role: 'assistant', content: parts[i], character: char });
          }
        }
      } catch (err) {
        console.error(err);
        raw = ERRORS[char];
        responseMessages = [{ role: 'assistant', character: char, content: raw }];
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = responseMessages[0];
          return updated;
        });
      }
      const visibleResponse = responseMessages.map((message) => message.content).join('\n') || raw;
      roundResponses.push({ char, content: visibleResponse });
      setCharacterMood((prev) => {
        const next = applyMoodUpdate(prev, char, visibleResponse);
        localStorage.setItem('mia_mood', JSON.stringify(next));
        return next;
      });
      const history: Message[] = [...currentMessages, ...responseMessages];
      return { response: raw, history };
    };
    const first: 'mia' | 'mimi' = firstResponder;
    const second: 'mia' | 'mimi' = first === 'mia' ? 'mimi' : 'mia';
    const relayDelay = () =>
      new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
    const { history: afterFirst } = await runCharacter(first, updatedMessages);
    const { history: afterSecond } = await (async () => {
      await relayDelay();
      return runCharacter(second, afterFirst);
    })();
    const MAX_TURNS = 6;
    let lastChar = second;
    let currentHistory = afterSecond;
    let turn = 2;
    while (turn < MAX_TURNS && Math.random() < 0.5) {
      const switchChance = turn >= 4 ? 0.7 : 0.55;
      const currentChar: 'mia' | 'mimi' =
        Math.random() < switchChance ? (lastChar === 'mia' ? 'mimi' : 'mia') : lastChar;
      await relayDelay();
      const { history } = await runCharacter(currentChar, currentHistory);
      currentHistory = history;
      lastChar = currentChar;
      turn++;
    }
    setIsStreaming(false);
    setStreamingCharacter(null);
    fetchSuggestions(currentHistory);
    void runGrammarCheck(lastUserText);
    resetIdleTimer();
  };
  useEffect(() => {
    if (!isLoading) {
      resetIdleTimer();
    }

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      idleAbortControllerRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        return;
      }

      if (!isIdleChatRef.current && !isStreaming && !isThinking) {
        resetIdleTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, isThinking, isLoading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    void (async () => {
      try {
        const genre = pickTriviaGenre();
        const response = await fetch(`/api/daily-trivia?genre=${genre}`);
        const data = await response.json() as { trivia?: string };
        if (data.trivia) {
          setTriviaText(data.trivia);
          // 少し遅らせてアニメーション開始（DOMレンダリング後）
          setTimeout(() => { setTriviaVisible(true); }, 100);
        }
      } catch {
        // Ignore trivia failures and leave the main chat untouched.
      }
    })();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Username modal */}
      {showUsernameModal && <UsernameModal onSave={saveUsername} />}

      {triviaText && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div
            className={`pointer-events-auto w-full max-w-sm rounded-2xl bg-white/90 dark:bg-gray-800/90 shadow-2xl backdrop-blur-md border border-white/60 dark:border-gray-700/60 transition-all duration-400 ease-out ${triviaVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}
            onClick={() => {
              if (triviaTimerRef.current) clearTimeout(triviaTimerRef.current);
              setTriviaVisible(false);
              setTimeout(() => { setTriviaText(null); setTriviaTranslation(null); }, 400);
            }}
          >
            {/* コンパクト行（常に表示） */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="overflow-hidden rounded-full shadow-sm flex-shrink-0">
                <CatAvatar variant="mimi" size={36} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-500 dark:text-orange-400">Mimi · trivia</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">tap to close</p>
                </div>
                <p className="mt-0.5 text-sm leading-snug text-gray-800 dark:text-gray-100">{triviaText}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void (async () => {
                    if (triviaTranslation !== null) { setTriviaTranslation(null); return; }
                    setIsTriviaTranslating(true);
                    try {
                      const res = await fetch('/api/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: triviaText, character: 'mimi' }),
                      });
                      const { result } = await res.json() as { result: string };
                      setTriviaTranslation(result);
                    } catch {
                      setTriviaTranslation('翻訳できませんでした');
                    } finally {
                      setIsTriviaTranslating(false);
                    }
                  })();
                }}
                className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${triviaTranslation !== null ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/30' : 'text-gray-400 hover:text-yellow-500'}`}
              >
                {isTriviaTranslating ? '…' : '訳'}
              </button>
            </div>
            {/* 翻訳展開エリア */}
            {triviaTranslation && (
              <div
                className="px-4 pb-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                {triviaTranslation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm border-b border-purple-100 dark:border-gray-700 shadow-sm" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex -space-x-2">
          <div className="w-10 h-10 rounded-full overflow-hidden shadow-md border-2 border-white z-10">
            <CatAvatar variant="mia" size={40} />
          </div>
          <div className="w-10 h-10 rounded-full overflow-hidden shadow-md border-2 border-white">
            <CatAvatar variant="mimi" size={40} />
          </div>
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-100 leading-tight">Mia &amp; Mimi</h1>
          <p className="text-xs text-purple-500 dark:text-purple-300 font-medium truncate">
            {isIdleChatActive ? 'chatting on their own...' : 'English practice squad'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {/* Dark mode — always visible */}
          <button
            onClick={toggleDark}
            className="text-gray-400 hover:text-purple-500 dark:text-gray-400 dark:hover:text-yellow-400 transition-colors p-1.5"
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            )}
          </button>

          {/* Vocab — always visible */}
          <button
            onClick={() => setShowVocab(true)}
            className="text-purple-400 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 transition-colors p-1.5"
            title="単語帳"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z"/></svg>
          </button>

          {/* Desktop-only buttons */}
          <div className="hidden sm:flex items-center gap-1">
            {username && (
              <button onClick={() => setShowUsernameModal(true)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-purple-500 transition-colors px-1">
                {username}
              </button>
            )}
            {/* Refresh menu (desktop) */}
            <div className="relative" ref={refreshMenuRef}>
              <button onClick={() => setShowRefreshMenu(v => !v)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors p-1.5" title="Refresh options">
                <svg className={`w-4 h-4 ${loadingTrending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>
              {showRefreshMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-50">
                  <button onClick={() => { fetchTrending(); setShowRefreshMenu(false); }} disabled={loadingTrending} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    Refresh trends
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700" />
                  <button onClick={refreshConversation} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-pink-50 dark:hover:bg-gray-700 transition-colors">
                    <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    New chat
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setShowSync(true)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors p-1.5" title="Sync data">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1-4l-3 3m0 0l-3-3m3 3V4"/></svg>
            </button>
            <button onClick={generateProfile} disabled={generatingProfile} className={`transition-colors p-1.5 ${userProfile ? 'text-green-400 hover:text-green-600' : 'text-gray-400 hover:text-blue-500'} disabled:opacity-40`} title={userProfile ? 'Refresh profile' : 'Generate profile'}>
              {generatingProfile
                ? <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              }
            </button>
            <Link href="/translate" className="text-gray-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors p-1.5" title="Translate">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M2 5h12"/>
                <path d="M7 2v3"/>
                <path d="M4 14c0-2 2-5 4-5s4 3 4 5"/>
                <path d="M14 18l4-8 4 8"/>
                <path d="M15.5 15.5h5"/>
              </svg>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button onClick={() => setShowMenu(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
                {username && (
                  <>
                    <button onClick={() => { setShowUsernameModal(true); setShowMenu(false); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors">
                      <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                      {username}
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-700" />
                  </>
                )}
                <button onClick={() => { fetchTrending(); setShowMenu(false); }} disabled={loadingTrending} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40">
                  <svg className={`w-3.5 h-3.5 text-indigo-400 ${loadingTrending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  Refresh trends
                </button>
                <button onClick={() => { refreshConversation(); setShowMenu(false); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-pink-50 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                  New chat
                </button>
                <div className="border-t border-gray-100 dark:border-gray-700" />
                <button onClick={() => { setShowSync(true); setShowMenu(false); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1-4l-3 3m0 0l-3-3m3 3V4"/></svg>
                  Sync data
                </button>
                <button onClick={() => { generateProfile(); setShowMenu(false); }} disabled={generatingProfile} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40">
                  <svg className={`w-3.5 h-3.5 ${userProfile ? 'text-green-400' : 'text-blue-400'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  {userProfile ? 'Refresh profile' : 'Generate profile'}
                </button>
                <Link
                  href="/trial"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-orange-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <svg className="h-3.5 w-3.5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M9 7h6" />
                    <path d="M7 7h.01" />
                    <path d="M7 11h10" />
                    <path d="M7 15h6" />
                    <path d="M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                  </svg>
                  Mock trial
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1 items-center text-purple-400">
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} vocabOwnerId={vocabOwnerIdRef.current} />
            ))}

            {/* Thinking indicator (debounce wait — input still enabled) */}
            {isThinking && !isStreaming && (
              <div className="flex items-end gap-2 mb-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-sm">
                  <CatAvatar variant={pendingCharacter ?? 'mia'} size={32} />
                </div>
                <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border ${
                  (pendingCharacter ?? 'mia') === 'mia'
                    ? 'bg-purple-100 border-purple-200'
                    : 'bg-orange-100 border-orange-200'
                }`}>
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {(isStreaming || isIdleChatActive) && messages[messages.length - 1]?.content === '' && streamingCharacter && (
              <div className="flex items-end gap-2 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shadow-md">
                  <CatAvatar variant={streamingCharacter} size={40} />
                </div>
                <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border ${
                  streamingCharacter === 'mia'
                    ? 'bg-purple-100 border-purple-200'
                    : 'bg-orange-100 border-orange-200'
                }`}>
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Vocab modal */}
      {showVocab && (
        <VocabModal vocabOwnerId={vocabOwnerIdRef.current} onClose={() => setShowVocab(false)} />
      )}

      {/* Sync modal */}
      {showSync && (
        <SyncModal
          ownerId={vocabOwnerIdRef.current}
          sessionId={sessionIdRef.current}
          onSync={handleSync}
          onReissueCode={(newId) => {
            localStorage.setItem('mia_vocab_owner_id', newId);
            vocabOwnerIdRef.current = newId;
            setShowSync(false);
          }}
          onClose={() => setShowSync(false)}
        />
      )}

      {/* Input */}
      <footer className="px-4 pb-5 pt-3 bg-white/70 dark:bg-gray-800/80 backdrop-blur-sm border-t border-purple-100 dark:border-gray-700">
        <div className="max-w-3xl mx-auto">
          {/* Suggestion chips */}
          {!isStreaming && (
            <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
              {loadingSuggestions || loadingTopics ? (
                <div className="flex gap-1 items-center px-1 py-1.5">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              ) : (
                <>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="flex-shrink-0 text-xs text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-gray-600 border border-purple-200 dark:border-gray-600 rounded-full px-3 py-1.5 transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => fetchSuggestions(messages)}
                    className="flex-shrink-0 text-gray-400 hover:text-purple-400 dark:hover:text-purple-300 transition-colors p-1.5"
                    title="Refresh suggestions"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => fetchTopics(messages)}
                    className="flex-shrink-0 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors p-1.5"
                    title="Change topic"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M8 12h8M12 8l4 4-4 4"/>
                      <circle cx="12" cy="12" r="9"/>
                    </svg>
                  </button>
                  <Link
                    href="/game"
                    className="flex-shrink-0 text-gray-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors p-1.5"
                    title="Quiz game"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </Link>
                  <Link
                    href="/translate"
                    className="flex-shrink-0 text-gray-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors p-1.5"
                    title="Translate"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M2 5h12"/>
                      <path d="M7 2v3"/>
                      <path d="M4 14c0-2 2-5 4-5s4 3 4 5"/>
                      <path d="M14 18l4-8 4 8"/>
                      <path d="M15.5 15.5h5"/>
                    </svg>
                  </Link>
                  <Link
                    href="/trial"
                    className={`flex-shrink-0 text-gray-400 transition-colors p-1.5 hover:text-orange-500 dark:hover:text-orange-300 ${isStreaming ? 'pointer-events-none opacity-40' : ''}`}
                    title="Mock trial"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M9 7h6" />
                      <path d="M7 7h.01" />
                      <path d="M7 11h10" />
                      <path d="M7 15h6" />
                      <path d="M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                    </svg>
                  </Link>
                  {!isMobileDevice && (
                    <Link
                      href="/call"
                      className={`flex-shrink-0 text-gray-400 transition-colors p-1.5 hover:text-emerald-500 dark:hover:text-emerald-300 ${isStreaming ? 'pointer-events-none opacity-40' : ''}`}
                      title="Voice call"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.86 19.86 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.86 19.86 0 012.08 4.18 2 2 0 014.06 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                      </svg>
                    </Link>
                  )}
                </>
              )}
            </div>
          )}
          <ChatInput onSend={sendMessage} disabled={isStreaming} />
          <p className="text-center text-xs text-gray-400 mt-2">
            Press{' '}
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono text-xs">
              Enter
            </kbd>{' '}
            to send {'·'}{' '}
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono text-xs">
              Shift+Enter
            </kbd>{' '}
            for new line
          </p>
        </div>
      </footer>
    </div>
  );
}

