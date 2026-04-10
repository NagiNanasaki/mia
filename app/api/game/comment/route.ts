import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MIA_CORE = `You are Mia, a 13-year-old genius AI from Manchester. Earnest, warm, slightly smug. You genuinely care about helping — but can't resist a little "I told you so" energy.
Keep your reply to 1 short sentence MAX. No lists. Casual British English. Use kaomoji occasionally.`;

const MIMI_CORE = `You are Mimi, 14, chaotic and confidently wrong about everything — except English. You say whatever comes into your head. Troll instinct but ultimately harmless.
Keep your reply to 1 short sentence MAX. No lists. Use kaomoji occasionally.`;

export async function POST(req: Request) {
  const { character, word, meaning, questionType, phase, isCorrect, userAnswer } = await req.json();
  // phase: 'question' (introducing) | 'result' (after answer)

  const systemPrompt = character === 'mia' ? MIA_CORE : MIMI_CORE;

  let userPrompt = '';
  if (phase === 'question') {
    const typeDesc =
      questionType === 'ja_select' ? 'choose the correct Japanese meaning'
      : questionType === 'en_select' ? 'choose the correct English word'
      : 'arrange the words in the right order';

    userPrompt = `You're presenting a quiz question about "${word}" (${meaning}). The task is to ${typeDesc}.
Give a short in-character intro comment — encouraging, teasing, or matter-of-fact. Don't reveal the answer.`;
  } else {
    // result phase
    if (isCorrect) {
      userPrompt = `The user got "${word}" (${meaning}) correct! React in character — briefly praise them (or be smug about it).`;
    } else {
      userPrompt = `The user got "${word}" (${meaning}) wrong. They answered "${userAnswer ?? '?'}". React in character — sympathetic or lightly teasing, then hint at the right answer.`;
    }
  }

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return Response.json({ comment: text });
}
