import Anthropic from '@anthropic-ai/sdk';
import { TOEIC_WORDS } from '@/lib/toeic-words';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QUESTION_TYPES = ['ja_select', 'en_select', 'reorder'] as const;
type QuestionType = typeof QUESTION_TYPES[number];

export type GameQuestion = {
  type: QuestionType;
  word: string;
  meaning: string;
  character: 'mia' | 'mimi';
  // for ja_select / en_select
  options?: string[];
  answer?: string;
  // for reorder
  sentence?: string;
  sentenceTranslation?: string;
  words?: string[];
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sentenceToWords(sentence: string): string[] {
  const words = sentence.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) ?? [];
  return words;
}

function pickFallbackDistractors(
  type: Exclude<QuestionType, 'reorder'>,
  item: { word: string; translation: string },
  allItems: { word: string; translation: string }[]
): string[] {
  const source = shuffle(
    allItems.filter((candidate) =>
      type === 'ja_select'
        ? candidate.translation !== item.translation
        : candidate.word.toLowerCase() !== item.word.toLowerCase()
    )
  );

  const mapped = source.map((candidate) =>
    type === 'ja_select' ? candidate.translation : candidate.word
  );

  return Array.from(new Set(mapped)).slice(0, 3);
}

function buildFallbackSentence(word: string): string {
  return `We should use ${word} carefully today.`;
}

function buildFallbackSentenceTranslation(word: string, meaning: string): string {
  return `今日は「${word}（${meaning}）」を注意して使うべきです。`;
}

export async function GET() {
  // Pick 5 unique words from the TOEIC list only
  const combined = shuffle(TOEIC_WORDS);
  const seen = new Set<string>();
  const pool: { word: string; translation: string }[] = [];
  for (const item of combined) {
    const key = item.word.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      pool.push(item);
    }
    if (pool.length >= 10) break;
  }
  const selected = pool.slice(0, 5);

  // Assign question types: pool of 2×each type, shuffle, take 5 → always ≥1 of each
  const types: QuestionType[] = shuffle([...QUESTION_TYPES, ...QUESTION_TYPES]).slice(0, 5) as QuestionType[];
  // Alternate characters: Mia on odd questions (0,2,4), Mimi on even (1,3)
  const chars: ('mia' | 'mimi')[] = ['mia', 'mimi', 'mia', 'mimi', 'mia'];

  // Build prompt for Claude to generate all question data
  const wordList = selected.map((w, i) => ({
    index: i,
    word: w.word,
    meaning: w.translation,
    type: types[i],
  }));

  const prompt = `Generate quiz question data for English learners (TOEIC 700 level).

For each item, generate the required data based on the type:
- "ja_select": 3 wrong Japanese translations as distractors (must be plausible but clearly wrong)
- "en_select": 3 wrong English words/phrases as distractors (similar register, plausible but wrong)
- "reorder": a natural English sentence (5-8 words) that uses the word naturally. The sentence should be simple enough for TOEIC 700 learners. Also provide a natural full Japanese translation of the whole sentence.

Items:
${JSON.stringify(wordList, null, 2)}

Return ONLY a valid JSON array. No explanation, no markdown code blocks.
Format:
[
  {
    "index": 0,
    "distractors": ["wrong1", "wrong2", "wrong3"],
    "sentence": "Short English sentence using the word.",
    "sentenceTranslation": "その英文全体の自然な日本語訳"
  },
  ...
]

For "ja_select": distractors are wrong Japanese translations.
For "en_select": distractors are wrong English words.
For "reorder": distractors can be empty [], sentence and sentenceTranslation are required.`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let generated: { index: number; distractors: string[]; sentence?: string; sentenceTranslation?: string }[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) generated = JSON.parse(match[0]);
  } catch {
    // fallback: generate minimal questions without distractors
  }

  const questions: GameQuestion[] = selected.map((item, i) => {
    const type = types[i];
    const character = chars[i];
    const gen = generated.find((g) => g.index === i);

    if (type === 'reorder') {
      const rawSentence = (gen?.sentence ?? buildFallbackSentence(item.word)).trim();
      const wordTokens = sentenceToWords(rawSentence);
      const fallbackTokens = sentenceToWords(buildFallbackSentence(item.word));
      const finalTokens = wordTokens.length >= 4 ? wordTokens : fallbackTokens;
      const words = shuffle(finalTokens);
      const sentence = finalTokens.join(' ');
      const sentenceTranslation = gen?.sentenceTranslation?.trim() || buildFallbackSentenceTranslation(item.word, item.translation);
      return {
        type,
        word: item.word,
        meaning: item.translation,
        character,
        sentence,
        sentenceTranslation,
        words,
      };
    }

    // ja_select or en_select
    const distractors = Array.from(new Set((gen?.distractors ?? []).filter(Boolean)));
    const correctAnswer = type === 'ja_select' ? item.translation : item.word;
    const fallbackDistractors = pickFallbackDistractors(type, item, pool);
    const allOptions = shuffle(
      Array.from(new Set([correctAnswer, ...distractors, ...fallbackDistractors])).slice(0, 4)
    );
    return {
      type,
      word: item.word,
      meaning: item.translation,
      character,
      options: allOptions.length >= 4 ? allOptions : shuffle([correctAnswer, ...fallbackDistractors]).slice(0, 4),
      answer: correctAnswer,
    };
  });

  return Response.json({ questions });
}
