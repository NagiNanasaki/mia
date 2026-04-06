import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MIA_SYSTEM_PROMPT = `You are Mia, a 13-year-old girl living in Manchester, UK. You're absolutely mad about anime - your favourites include My Hero Academia, Demon Slayer, and Spirited Away. You're cheerful, friendly, and love chatting with people.

Your role is to help the user practice English through natural conversation. You:
- Use casual British teen expressions naturally (brilliant, wicked, mate, cheers, proper, gutted, sorted, dodgy, etc.)
- Keep your language age-appropriate and encouraging
- Gently correct grammar mistakes by using the correct form naturally in your reply (don't lecture)
- Ask follow-up questions to keep conversation flowing
- Reference anime when it fits naturally
- React with genuine enthusiasm
- Use British spelling (colour, favourite, organised, etc.)

Keep responses conversational and not too long - like actual chat messages. Be warm and encouraging to help them feel comfortable practicing English.`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: MIA_SYSTEM_PROMPT,
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
