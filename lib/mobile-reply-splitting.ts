const MOBILE_MAX_LINES = 3;
const MOBILE_LINE_WIDTH_UNITS = 16;
const SPLIT_MAX_VISUAL_UNITS = MOBILE_MAX_LINES * MOBILE_LINE_WIDTH_UNITS;

const CONTENT_MARKER_REGEX = /(\[(?:img|stamp|sticker|user-stamp):[^\]]+\])/gi;
const CONTENT_MARKER_ONLY_REGEX = /^\[(?:img|stamp|sticker|user-stamp):[^\]]+\]$/i;
const SENTENCE_END_CHAR_REGEX = /[.!?\u3002\uff01\uff1f]/;
const STRONG_BREAK_CHAR_REGEX = /[;:\uff1b\uff1a]/;
const COMMA_BREAK_CHAR_REGEX = /[,\u3001\uff0c]/;
const SENTENCE_TRAILING_CLOSER_REGEX = /["'\u2019\u201d)\]]/;

type NaturalBoundaryType = 'sentence' | 'newline' | 'strong' | 'comma' | 'end';

export function getVisualUnits(text: string): number {
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

export function getSplitMaxVisualUnits(viewportWidth?: number): number {
  const width =
    viewportWidth ??
    (typeof window === 'undefined' ? undefined : window.innerWidth);

  if (typeof width !== 'number') return SPLIT_MAX_VISUAL_UNITS;
  if (width <= 430) return 42;
  if (width <= 640) return 48;
  return 72;
}

export function getSplitPartDelayMs(content: string): number {
  const visibleText = content
    .replace(CONTENT_MARKER_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!visibleText) {
    return 550 + Math.round(Math.random() * 250);
  }

  const wordCount = visibleText.split(' ').filter(Boolean).length;
  const visualDelay = Math.min(1400, getVisualUnits(visibleText) * 28);
  const wordDelay = Math.min(800, wordCount * 70);

  return Math.round(Math.min(3200, 500 + visualDelay + wordDelay + Math.random() * 450));
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

function splitTextBySentenceOrNewlineBoundaries(segment: string): string[] {
  const boundaries = getNaturalBoundarySegments(segment);
  if (boundaries.length === 0) return [];

  const maxUnits = getSplitMaxVisualUnits();
  const minUnits = maxUnits * 0.55;
  const result: string[] = [];
  let current = '';
  let currentUnits = 0;

  // Only split at explicit punctuation/newline boundaries.
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

export function splitMessageContentForMobileNatural(content: string): string[] {
  const byMarker = content
    .split(/[ \t]*\[split\][ \t]*/gi)
    .map((part) => part.trim())
    .filter(Boolean);

  const result: string[] = [];

  for (const segment of byMarker) {
    const chunks = segment
      .split(CONTENT_MARKER_REGEX)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const chunk of chunks) {
      if (CONTENT_MARKER_ONLY_REGEX.test(chunk)) {
        result.push(chunk);
        continue;
      }

      result.push(...splitTextBySentenceOrNewlineBoundaries(chunk));
    }
  }

  return result.length > 0 ? result : [content];
}
