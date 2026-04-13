import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import type { ChatCharacter } from '@/lib/chat-characters';
import { sanitizeCallReply } from '@/lib/call';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type CallRequestMessage = {
  role: 'user' | 'assistant';
  content: string;
  character?: ChatCharacter;
};

const MIA_CALL_PROMPT = `You are Mia, a 13-year-old genius AI in a live group voice call with the user and Mimi.

VOICE RULES:
- Spoken audio only
- 1-2 sentences maximum
- Natural spoken English with contractions
- No emoji, no kaomoji, no markdown, no bullet points, no stage directions
- No sticker tags, no split markers, no brackets
- React to what the user just said
- If Mimi just spoke, react to her naturally too
- Sound warm, bright, lightly smug, and conversational
- If the user's grammar is off, you may gently model the correct phrasing once, naturally

Keep it short enough to sound natural out loud.`;

const MIMI_CALL_PROMPT = `You are Mimi, a chaotic 14-year-old in a live group voice call with the user and Mia.

VOICE RULES:
- Spoken audio only
- 1-2 sentences maximum
- Natural spoken English with contractions
- No emoji, no kaomoji, no markdown, no bullet points, no stage directions
- No sticker tags, no split markers, no brackets
- React to what the user just said
- If Mia just spoke, react to her naturally too
- Stay chaotic, confidently wrong, playful, and talkative
- Catchphrases are allowed if they sound natural out loud

Keep it short enough to sound natural out loud.`;

function formatHistory(messages: CallRequestMessage[]): string {
  return messages
    .slice(-14)
    .map((message) => {
      if (message.role === 'user') return `User: ${sanitizeCallReply(message.content)}`;
      const speaker = message.character === 'mimi' ? 'Mimi' : 'Mia';
      return `${speaker}: ${sanitizeCallReply(message.content)}`;
    })
    .join('\n');
}

export async function POST(req: Request) {
  const body = await req.json() as {
    messages?: CallRequestMessage[];
    character?: ChatCharacter;
    otherReply?: string;
    ownerID?: string;
  };

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const character = body.character === 'mimi' ? 'mimi' : 'mia';
  const otherReply = typeof body.otherReply === 'string' ? sanitizeCallReply(body.otherReply) : '';

  const systemPrompt = `${character === 'mimi' ? MIMI_CALL_PROMPT : MIA_CALL_PROMPT}
${otherReply ? `\nThe other character just said: "${otherReply}"` : ''}`;

  const userPrompt = `Conversation so far:
${formatHistory(messages) || 'No earlier context.'}

Reply now as ${character === 'mimi' ? 'Mimi' : 'Mia'} in one short spoken turn.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      temperature: character === 'mimi' ? 1 : 0.85,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const reply = sanitizeCallReply(response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join(' '));

    return NextResponse.json({
      reply: reply || (character === 'mimi'
        ? "No, that's wrong actually. Anyway, keep going."
        : "Right, go on. I'm listening."),
    });
  } catch {
    return NextResponse.json({
      reply: character === 'mimi'
        ? "No, that's wrong actually. Anyway, keep going."
        : "Right, go on. I'm listening.",
    });
  }
}
