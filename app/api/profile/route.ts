import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get('owner_id');
  if (!ownerId) return Response.json({ profile: null, last_session_id: null });

  const { data } = await supabase
    .from('user_profile')
    .select('profile_text, last_session_id')
    .eq('owner_id', ownerId)
    .single();

  return Response.json({
    profile: data?.profile_text ?? null,
    last_session_id: data?.last_session_id ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const { owner_id, last_session_id } = await req.json() as {
    owner_id: string;
    last_session_id: string;
  };

  if (!owner_id || !last_session_id) {
    return Response.json({ error: 'missing fields' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('user_profile')
    .select('owner_id')
    .eq('owner_id', owner_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('user_profile')
      .update({ last_session_id, updated_at: new Date().toISOString() })
      .eq('owner_id', owner_id);
  } else {
    await supabase.from('user_profile').insert({
      owner_id,
      profile_text: '',
      last_session_id,
      updated_at: new Date().toISOString(),
    });
  }

  return Response.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const { owner_id, session_id } = await req.json() as { owner_id: string; session_id?: string };
  if (!owner_id) return Response.json({ error: 'missing owner_id' }, { status: 400 });

  const sessionIds = new Set<string>();
  if (session_id) sessionIds.add(session_id);

  const { data: profileRow } = await supabase
    .from('user_profile')
    .select('last_session_id')
    .eq('owner_id', owner_id)
    .maybeSingle();

  if (profileRow?.last_session_id) sessionIds.add(profileRow.last_session_id);

  if (sessionIds.size === 0) {
    return Response.json(
      { error: 'No session was found. Please chat a little more and try again.' },
      { status: 400 }
    );
  }

  const { data: rows } = await supabase
    .from('messages')
    .select('content')
    .in('session_id', [...sessionIds])
    .eq('role', 'user')
    .order('created_at', { ascending: true });

  const userMessages = (rows ?? []).map((row) => row.content as string).filter(Boolean);

  if (userMessages.length < 5) {
    return Response.json(
      { error: 'Not enough chat history yet. Please send a few more messages and try again.' },
      { status: 400 }
    );
  }

  const sample = userMessages
    .sort(() => Math.random() - 0.5)
    .slice(0, 150)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are analyzing chat messages sent by a user to their English tutor AI (Mia/Mimi) to help personalize future conversations.

Analyze these messages and write a profile in 3-4 sentences covering:
- Their English vocabulary level (beginner / intermediate / advanced)
- Main topics, interests, and things they talk about most
- Their tone and communication style (casual, formal, curious, etc.)
- Any notable language habits or expressions they use

Messages:
${sample}

Write in English, 3rd person, under 200 words. Flowing sentences only, with no headers or bullet points.`,
      },
    ],
  });

  const profileText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  await supabase.from('user_profile').upsert({
    owner_id,
    profile_text: profileText,
    updated_at: new Date().toISOString(),
  });

  return Response.json({ profile: profileText, count: userMessages.length });
}
