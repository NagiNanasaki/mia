import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { TOEIC_WORDS, getByDifficulty } from '@/lib/toeic-words';
import type { Difficulty } from '@/lib/toeic-words';

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
  const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const result = sentence.replace(regex, '___');
  if (result !== sentence) return result;
  return sentence.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '___');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vocabOwnerId = searchParams.get('vocabOwnerId') ?? '';
  const difficultyParam = (searchParams.get('difficulty') ?? 'all') as Difficulty | 'all';
  const mode = searchParams.get('mode') ?? 'toeic'; // 'toeic' | 'translate'

  // ── Translate mode: 単語帳の source='translate' 単語を使う ──
  if (mode === 'translate') {
    return handleTranslateMode(vocabOwnerId);
  }

  // ── TOEIC mode ──

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

  // 難易度でフィルタリングされた単語プールを取得
  const difficultyPool = getByDifficulty(difficultyParam);

  // Build priority pool: difficulty pool の中でユーザーの単語帳と重なるもの
  const toeicByLower = new Map(difficultyPool.map((w) => [w.word.toLowerCase(), w]));
  const priorityWords = shuffle(
    [...userVocabWords]
      .map((w) => toeicByLower.get(w))
      .filter((w): w is (typeof TOEIC_WORDS)[number] => !!w)
  );
  const priorityKeys = new Set(priorityWords.map((w) => w.word.toLowerCase()));

  // Fill remaining slots from the difficulty pool
  const remaining = shuffle(difficultyPool.filter((w) => !priorityKeys.has(w.word.toLowerCase())));
  const combined = [...priorityWords, ...remaining];

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

  return buildQuestions(selected, pool);
}

// ── Translate mode handler ──
async function handleTranslateMode(vocabOwnerId: string): Promise<Response> {
  if (!vocabOwnerId) {
    return Response.json({ error: 'vocabOwnerId required', questions: [] }, { status: 400 });
  }

  let translateWords: { word: string; translation: string }[] = [];
  try {
    const { data } = await supabase
      .from('vocabulary')
      .select('phrase, translation')
      .eq('session_id', vocabOwnerId)
      .eq('source', 'translate');
    if (data) {
      translateWords = data
        .filter((r) => r.phrase && r.translation)
        .map((r) => ({ word: r.phrase as string, translation: r.translation as string }));
    }
  } catch {
    return Response.json({ error: 'DB error', questions: [] }, { status: 500 });
  }

  if (translateWords.length < 3) {
    return Response.json({ notEnough: true, questions: [] });
  }

  // 重複除去してシャッフル
  const unique = Array.from(
    new Map(translateWords.map((w) => [w.word.toLowerCase(), w])).values()
  );
  const pool = shuffle(unique).slice(0, 10);
  const selected = pool.slice(0, 5);

  // translate モードは ja_select / en_select のみ（reorderはフレーズに向かない場合あり）
  const types: QuestionType[] = shuffle([
    'ja_select', 'en_select', 'ja_select', 'en_select', 'ja_select',
  ]) as QuestionType[];

  return buildQuestions(selected, pool, types);
}

// ── Question builder (shared) ──
async function buildQuestions(
  selected: { word: string; translation: string }[],
  pool: { word: string; translation: string }[],
  fixedTypes?: QuestionType[]
): Promise<Response> {
  const chars: ('mia' | 'mimi')[] = ['mia', 'mimi', 'mia', 'mimi', 'mia'];

  // Assign question types
  const types: QuestionType[] = fixedTypes
    ?? (shuffle([...QUESTION_TYPES, ...QUESTION_TYPES]).slice(0, 5) as QuestionType[]);

  const wordList = selected.map((w, i) => ({
    index: i,
    word: w.word,
    meaning: w.translation,
    type: types[i],
  }));

  const prompt = `Generate quiz question data for English learners.

For each item, generate the required data based on the type:
- "ja_select": 3 wrong Japanese translations as distractors (plausible but clearly wrong)
- "en_select": 3 wrong English words as distractors (similar register, plausible but wrong)
- "reorder": a natural English sentence (6-9 words) that uses the EXACT word form as given. Also provide 3 wrong English words as fill-in-the-blank distractors. Provide a natural Japanese translation of the full sentence.

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

      const genDistractors = Array.from(new Set((gen?.distractors ?? []).filter(Boolean))).filter(
        (d) => d.toLowerCase() !== item.word.toLowerCase()
      );
      const fallbackDistractors = shuffle(pool)
        .filter((p) => p.word.toLowerCase() !== item.word.toLowerCase())
        .map((p) => p.word);
      const distractors = Array.from(new Set([...genDistractors, ...fallbackDistractors])).slice(0, 3);

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
