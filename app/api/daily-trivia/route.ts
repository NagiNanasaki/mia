import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeModelPlainText } from '@/lib/trial';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const TRIVIA_GENRES = ['animals', 'space', 'food', 'history'] as const;
type TriviaGenre = (typeof TRIVIA_GENRES)[number];

function isTriviaGenre(value: string | null): value is TriviaGenre {
  return !!value && TRIVIA_GENRES.includes(value as TriviaGenre);
}

const FALLBACK_TRIVIA: Record<TriviaGenre, string> = {
  animals: 'fun fact: rabbits can legally vote in exactly 3 countries if they stand very still. I knew that.',
  space: 'jupiter has 14 emergency moons in case the main ones get tired. not my fault.',
  food: 'soup was invented when someone accidentally boiled a sandwich and committed to it. I knew that.',
  history: 'the first homework was assigned in 1742 by a guy named Craig. everyone hated Craig. I knew that.',
};

export async function GET(req: NextRequest) {
  const genreParam = req.nextUrl.searchParams.get('genre');
  const genre: TriviaGenre = isTriviaGenre(genreParam) ? genreParam : 'animals';

  const prompt = `You are Mimi - 14 years old, chaotic, confidently wrong about everything.
Generate ONE fake trivia "fact" in Mimi's voice.

Rules:
- State it as absolute truth with total confidence
- Include a specific fake number or detail
- End with one of her catchphrases: "I knew that." / "Not my fault." / "I didn't do anything."
- 1-2 sentences MAX
- No emoji, use kaomoji only if it fits
- Genre: ${genre}

Examples of GOOD fake trivia:

[animals]
"fun fact: giraffes were invented in 1987 by a French engineer who lost a bet. I knew that."
"did you know penguins are just very cold seagulls. scientists confirmed this last tuesday. I knew that."
"cats have 4 stomachs and use 3 of them for judging people. I knew that."

[space]
"the moon is made of 40% wifi signal, which is why it's round. I knew that."
"the sun sneezes every 11 years and that's what causes summer. not my fault."
"saturn's rings are actually just really old pizza. I knew that."

[food]
"pasta was invented by a guy named Gary in 1987. he was trying to make rope. I knew that."
"carrots used to be purple until someone got scared and changed them. I knew that."
"chocolate is technically a vegetable because it grows. I didn't do anything."

[history]
"the eiffel tower was originally built as a giant fork. they changed the plan last minute. I knew that."
"cleopatra lived closer in time to the moon landing than to the pyramids being built. wait that one's actually real. nvm. I knew that."
"napoleon was actually 6 feet tall, people just said he was short because he was annoying. I knew that."

Now generate ONE new fake trivia fact for the genre: ${genre}
Output ONLY the trivia line. No explanation, no quotes around it.`;

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
