import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeModelPlainText } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const TRIVIA_GENRES = [
  'animals', 'space', 'food', 'history',
  'science', 'internet', 'money', 'sleep',
  'weather', 'music', 'sports', 'fashion',
  'language', 'bugs', 'ancient_rome',
] as const;
type TriviaGenre = (typeof TRIVIA_GENRES)[number];

function isTriviaGenre(value: string | null): value is TriviaGenre {
  return !!value && TRIVIA_GENRES.includes(value as TriviaGenre);
}

const FALLBACK_TRIVIA: Record<TriviaGenre, string> = {
  animals: 'fun fact: rabbits can legally vote in exactly 3 countries if they stand very still. I knew that.',
  space: 'jupiter has 14 emergency moons in case the main ones get tired. not my fault.',
  food: 'soup was invented when someone accidentally boiled a sandwich and committed to it. I knew that.',
  history: 'the first homework was assigned in 1742 by a guy named Craig. everyone hated Craig. I knew that.',
  science: 'gravity was invented in 1687 specifically to stop people from floating away at inconvenient times. I knew that.',
  internet: 'the first email was sent in 1971 and it just said "please respond" and no one did. not my fault.',
  money: 'coins were originally round so they couldn\'t roll too far away. that plan failed. I knew that.',
  sleep: 'humans spend 26 years sleeping and 7 years trying to fall asleep and 0 years being normal about it. I knew that.',
  weather: 'thunder is just clouds arguing. scientists confirmed this. I knew that.',
  music: 'the guitar was invented by a guy who couldn\'t afford a piano. that\'s literally it. I knew that.',
  sports: 'the marathon distance was set because someone ran the wrong way and they felt bad changing it. I knew that.',
  fashion: 'pockets were removed from women\'s clothing in 1790 by a man who was scared of them. not my fault.',
  language: 'the word "OK" was invented in 1839 as a joke and now it\'s the most used word on earth. I didn\'t do anything.',
  bugs: 'ants have been doing the same job for 140 million years and never once asked for a raise. I knew that.',
  ancient_rome: 'ancient Romans had 300 words for sword and 0 words for "please calm down". I knew that.',
};

export async function GET(req: NextRequest) {
  const genreParam = req.nextUrl.searchParams.get('genre');
  const genre: TriviaGenre = isTriviaGenre(genreParam) ? genreParam : 'animals';

  // ランダム性を高めるためのシード（モデルへのヒント）
  const seed = Math.floor(Math.random() * 9000) + 1000;
  const angle = ['weird measurement', 'specific year', 'person\'s name', 'unexpected comparison', 'very specific number'][Math.floor(Math.random() * 5)];

  const prompt = `You are Mimi - 14 years old, chaotic, confidently wrong about everything.
Generate ONE fake trivia "fact" in Mimi's voice.

Rules:
- State it as absolute truth with total confidence
- Use a ${angle} as the key fake detail (seed: ${seed})
- End with exactly one catchphrase: "I knew that." / "Not my fault." / "I didn't do anything."
- 1-2 sentences MAX
- No emoji, no quotes around the output
- Genre: ${genre}
- Be creative — avoid generic patterns like "invented in 1987 by a guy named Gary"

Output ONLY the trivia line.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      temperature: 1.0,
      messages: [{ role: 'user', content: prompt }],
    });

    const trivia = normalizeModelPlainText(response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text.trim())
      .join(' ')
      .trim());

    return NextResponse.json({ trivia: trivia || FALLBACK_TRIVIA[genre] });
  } catch {
    return NextResponse.json({ trivia: FALLBACK_TRIVIA[genre] });
  }
}
