import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getByDifficulty } from '@/lib/toeic-words';
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
  // for reorder (fill-in-the-blank with 2 blanks)
  sentence?: string;          // English sentence with ___ blanks
  sentenceTranslation?: string;
  blanks?: string[];          // correct words for each blank in order
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

function buildFallbackBlankSentence(
  word: string,
  secondWord: string
): { sentence: string; blanks: string[] } {
  const sentence = `We should ___ this ___ carefully today.`;
  return { sentence, blanks: [word, secondWord] };
}

function buildFallbackSentenceTranslation(word: string, meaning: string): string {
  return `「${word}（${meaning}）」を使う英文です。`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vocabOwnerId = searchParams.get('vocabOwnerId') ?? '';
  const difficultyParam = (searchParams.get('difficulty') ?? 'all') as Difficulty | 'all';
  const mode = searchParams.get('mode') ?? 'toeic'; // 'toeic' | 'translate'

  // == Translate mode: use tagged=true words ==
  if (mode === 'tagged') {
    return handleTaggedMode(vocabOwnerId);
  }

  if (mode === 'vocab') {
    return handleAllVocabMode(vocabOwnerId);
  }

  // == TOEIC mode: pick 5 random from difficulty pool ==
  const difficultyPool = getByDifficulty(difficultyParam);
  const pool = shuffle(difficultyPool).slice(0, 10);
  const selected = pool.slice(0, 5);

  return buildQuestions(selected, pool);
}

// == Translate mode handler ==
async function handleTaggedMode(vocabOwnerId: string): Promise<Response> {
  if (!vocabOwnerId) {
    return Response.json({ error: 'vocabOwnerId required', questions: [] }, { status: 400 });
  }

  let taggedWords: { word: string; translation: string }[] = [];
  try {
    const { data } = await supabase
      .from('vocabulary')
      .select('phrase, translation')
      .eq('session_id', vocabOwnerId)
      .eq('tagged', true);
    if (data) {
      taggedWords = data
        .filter((r) => r.phrase && r.translation)
        .map((r) => ({ word: r.phrase as string, translation: r.translation as string }));
    }
  } catch {
    return Response.json({ error: 'DB error', questions: [] }, { status: 500 });
  }

  if (taggedWords.length < 3) {
    return Response.json({ notEnough: true, questions: [] });
  }

  const unique = Array.from(
    new Map(taggedWords.map((w) => [w.word.toLowerCase(), w])).values()
  );
  const pool = shuffle(unique).slice(0, 10);
  const selected = pool.slice(0, 5);

  const types: QuestionType[] = shuffle([
    'ja_select', 'en_select', 'ja_select', 'en_select', 'ja_select',
  ]) as QuestionType[];

  return buildQuestions(selected, pool, types);
}

// == Question builder (shared) ==
// 単語帳全部モードハンドラ
async function handleAllVocabMode(vocabOwnerId: string): Promise<Response> {
  if (!vocabOwnerId) {
    return Response.json({ error: 'vocabOwnerId required', questions: [] }, { status: 400 });
  }

  let allWords: { word: string; translation: string }[] = [];
  try {
    const { data } = await supabase
      .from('vocabulary')
      .select('phrase, translation')
      .eq('session_id', vocabOwnerId);
    if (data) {
      allWords = data
        .filter((r) => r.phrase && r.translation)
        .map((r) => ({ word: r.phrase as string, translation: r.translation as string }));
    }
  } catch {
    return Response.json({ error: 'DB error', questions: [] }, { status: 500 });
  }

  if (allWords.length < 3) {
    return Response.json({ notEnough: true, questions: [] });
  }

  const unique = Array.from(
    new Map(allWords.map((w) => [w.word.toLowerCase(), w])).values()
  );
  const pool = shuffle(unique).slice(0, 10);
  const selected = pool.slice(0, 5);

  const types: QuestionType[] = shuffle([
    'ja_select', 'en_select', 'ja_select', 'en_select', 'ja_select',
  ]) as QuestionType[];

  return buildQuestions(selected, pool, types);
}

async function buildQuestions(
  selected: { word: string; translation: string }[],
  pool: { word: string; translation: string }[],
  fixedTypes?: QuestionType[]
): Promise<Response> {
  const chars: ('mia' | 'mimi')[] = shuffle(['mia', 'mimi', 'mia', 'mimi', 'mia']) as ('mia' | 'mimi')[];

  // Pick types: each appears at least once, no adjacent duplicates guaranteed.
  // Shuffle the 3 types. Pattern: [b,c,a,b,c] ensures no adjacent same.
  const types: QuestionType[] = (() => {
    if (fixedTypes) return fixedTypes;
    const [a, b, c] = shuffle([...QUESTION_TYPES]) as QuestionType[];
    return [b, c, a, b, c];
  })();

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
- "reorder": a natural English sentence (8-12 words) with EXACTLY 2 blanks (___). One blank is for the given word, the other blank is for a common English word that fits naturally (adjective, verb, or adverb). Provide:
  - "sentence": the English sentence with exactly 2 ___ placeholders
  - "blanks": array of exactly 2 strings - the correct word for each blank in left-to-right order
  - "distractors": 3 wrong English word options (plausible substitutes)
  - "sentenceTranslation": natural Japanese translation of the full sentence (with blank words filled in)

Items:
${JSON.stringify(wordList, null, 2)}

Return ONLY a valid JSON array. No explanation, no markdown.
Format:
[
  {
    "index": 0,
    "distractors": ["wrong1", "wrong2", "wrong3"],
    "sentence": "She ___ the report ___ before the deadline.",
    "blanks": ["submitted", "early"],
    "sentenceTranslation": "彼女は締め切り前にレポートを早めに提出した。"
  }
]`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let generated: {
    index: number;
    distractors: string[];
    sentence?: string;
    blanks?: string[];
    sentenceTranslation?: string;
  }[] = [];
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
      // Validate that Claude returned 2 blanks
      const rawSentence = (gen?.sentence ?? '').trim();
      const genBlanks = Array.isArray(gen?.blanks) && gen!.blanks.length === 2 ? gen!.blanks : null;
      const blankCount = (rawSentence.match(/___/g) ?? []).length;

      let sentence: string;
      let blanks: string[];

      if (rawSentence && blankCount === 2 && genBlanks) {
        sentence = rawSentence;
        blanks = genBlanks;
      } else {
        // Fallback: pick a second word from pool
        const secondWord = pool.find(p => p.word.toLowerCase() !== item.word.toLowerCase())?.word ?? 'carefully';
        const fallback = buildFallbackBlankSentence(item.word, secondWord);
        sentence = fallback.sentence;
        blanks = fallback.blanks;
      }

      const sentenceTranslation =
        gen?.sentenceTranslation?.trim() || buildFallbackSentenceTranslation(item.word, item.translation);

      const genDistractors = Array.from(new Set((gen?.distractors ?? []).filter(Boolean))).filter(
        (d) => !blanks.map(b => b.toLowerCase()).includes(d.toLowerCase())
      );
      const fallbackDistractors = shuffle(pool)
        .filter((p) => !blanks.map(b => b.toLowerCase()).includes(p.word.toLowerCase()))
        .map((p) => p.word);
      const distractors = Array.from(new Set([...genDistractors, ...fallbackDistractors])).slice(0, 3);

      return {
        type,
        word: item.word,
        meaning: item.translation,
        character,
        sentence,
        sentenceTranslation,
        blanks,
        options: shuffle([...blanks, ...distractors]),
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
