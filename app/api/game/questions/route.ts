import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { TOEIC_WORDS } from '@/lib/toeic-words';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const QUESTION_TYPES = ['ja_select', 'en_select', 'reorder'] as const;
type QuestionType = typeof QUESTION_TYPES[number];

export type GameQuestion = {
  type: QuestionType;
  word: string;
  meaning: string;
  character: 'mia' | 'mimi';
  options?: string[];
  answer?: string;
  // for reorder (fill-in-the-blank)
  sentence?: string;          // English sentence with ___ blank
  sentenceTranslation?: string;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

function buildBlankSentence(sentence: string, word: string): string {
  // Replace first occurrence (case-insensitive word boundary match)
  const regex = new RegExp(`\\b${word}\\b`, 'i');
  const result = sentence.replace(regex, '___');
  if (result !== sentence) return result;
  // Fallback: simple case-insensitive replace
  return sentence.replace(new RegExp(word, 'i'), '___');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vocabOwnerId = searchParams.get('vocabOwnerId') ?? '';

  // Fetch user vocabulary words from Supabase
  const userVocabWords = new Set<string>();
  if (vocabOwnerId) {
    try {
      const { data } = await supabase
        .from('vocabulary')
        .select('phrase')
        .eq('session_id', vocabOwnerId);
      if (data) {
        for (const row of data) {
          if (row.phrase) userVocabWords.add(row.phrase.toLowerCase().trim());
        }
      }
    } catch {
      // ignore, fall back to TOEIC only
    }
  }

  // Build priority pool: TOEIC words that also appear in the user's notebook
  const toeicByLower = new Map(TOEIC_WORDS.map((w) => [w.word.toLowerCase(), w]));
  const priorityWords = shuffle(
    [...userVocabWords]
      .map((w) => toeicByLower.get(w))
      .filter((w): w is (typeof TOEIC_WORDS)[number] => !!w)
  );
  const priorityKeys = new Set(priorityWords.map((w) => w.word.toLowerCase()));

  // Fill remaining slots from the rest of the TOEIC list
  const remainingToeic = shuffle(TOEIC_WORDS.filter((w) => !priorityKeys.has(w.word.toLowerCase())));
  const combined = [...priorityWords, ...remainingToeic];

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

  // Assign question types: shuffle 2×each type, take 5 → always ≥1 of each
  const types: QuestionType[] = shuffle([...QUESTION_TYPES, ...QUESTION_TYPES]).slice(0, 5) as QuestionType[];
  const chars: ('mia' | 'mimi')[] = ['mia', 'mimi', 'mia', 'mimi', 'mia'];

  const wordList = selected.map((w, i) => ({
    index: i,
    word: w.word,
    meaning: w.translation,
    type: types[i],
  }));

  const prompt = `Generate quiz question data for English learners (TOEIC 700 level).

For each item, generate the required data based on the type:
- "ja_select": 3 wrong Japanese translations as distractors (plausible but clearly wrong)
- "en_select": 3 wrong English words as distractors (similar register, plausible but wrong)
- "reorder": a natural English sentence (6-9 words) that uses the EXACT word form as given. Also provide 3 wrong English words as fill-in-the-blank distractors (words that could plausibly fit but are incorrect). Provide a natural Japanese translation of the full sentence.

Items:
${JSON.stringify(wordList, null, 2)}

Return ONLY a valid JSON array. No explanation, no markdown.
Format:
[
  {
    "index": 0,
    "distractors": ["wrong1", "wrong2", "wrong3"],
    "sentence": "Full English sentence using the exact word (reorder type only).",
    "sentenceTranslation": "その英文全体の自然な日本語訳"
  }
]`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1200,
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
    // proceed with fallback
  }

  const questions: GameQuestion[] = selected.map((item, i) => {
    const type = types[i];
    const character = chars[i];
    const gen = generated.find((g) => g.index === i);

    if (type === 'reorder') {
      const rawSentence = (gen?.sentence ?? buildFallbackSentence(item.word)).trim();
      const sentenceTranslation =
        gen?.sentenceTranslation?.trim() || buildFallbackSentenceTranslation(item.word, item.translation);
      const blankSentence = buildBlankSentence(rawSentence, item.word);

      // Build 3 distractors, fall back to other pool words
      const genDistractors = Array.from(new Set((gen?.distractors ?? []).filter(Boolean))).filter(
        (d) => d.toLowerCase() !== item.word.toLowerCase()
      );
      const fallbackDistractors = shuffle(pool)
        .filter((p) => p.word.toLowerCase() !== item.word.toLowerCase())
        .map((p) => p.word);
      const distractors = Array.from(new Set([...genDistractors, ...fallbackDistractors]))
        .slice(0, 3);

      return {
        type,
        word: item.word,
        meaning: item.translation,
        character,
        sentence: blankSentence,
        sentenceTranslation,
        options: shuffle([item.word, ...distractors]),
        answer: item.word,
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
