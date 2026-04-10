import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';
import * as unzipper from 'unzipper';
import { supabase } from '@/lib/supabase';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---- Twitter archive parser ----
function parseTweetsJs(raw: string): string[] {
  // Strip the JS assignment wrapper: "window.YTD.tweets.part0 = [...]"
  const json = raw.replace(/^[^[]+/, '').replace(/;\s*$/, '').trim();
  const items = JSON.parse(json) as Array<{ tweet: { full_text: string; lang?: string } }>;
  return items
    .map((item) => item.tweet?.full_text ?? '')
    .filter((t) => t && !t.startsWith('RT @')); // drop retweets
}

// ---- Discord messages.json parser ----
function parseDiscordMessages(raw: string): string[] {
  const items = JSON.parse(raw) as Array<{ Contents?: string; content?: string }>;
  return items
    .map((m) => m.Contents ?? m.content ?? '')
    .filter(Boolean);
}

// ---- Read a single entry from ZIP ----
async function readZipEntry(zipPath: string, entryName: string): Promise<string | null> {
  const directory = await unzipper.Open.file(zipPath);
  const file = directory.files.find((f) => f.path === entryName);
  if (!file) return null;
  const buffer = await file.buffer();
  return buffer.toString('utf8');
}

// ---- Load messages from sources ----
async function loadMessages(): Promise<string[]> {
  const messages: string[] = [];

  // Twitter archives (support multiple accounts)
  const twitterPaths = [
    process.env.TWITTER_ARCHIVE_PATH,
    process.env.TWITTER_ARCHIVE_PATH_2,
  ].filter(Boolean) as string[];

  for (const twitterPath of twitterPaths) {
    try {
      const raw = await readZipEntry(twitterPath, 'data/tweets.js');
      if (raw) {
        const tweets = parseTweetsJs(raw);
        messages.push(...tweets);
        console.log(`[profile] Loaded ${tweets.length} tweets from ${twitterPath}`);
      } else {
        console.warn(`[profile] data/tweets.js not found in ${twitterPath}`);
      }
    } catch (e) {
      console.error(`[profile] Twitter archive read failed (${twitterPath}):`, e);
    }
  }

  // Discord messages (optional JSON file)
  const discordPath = process.env.DISCORD_MESSAGES_PATH;
  if (discordPath) {
    try {
      const raw = readFileSync(discordPath, 'utf8');
      const msgs = parseDiscordMessages(raw);
      messages.push(...msgs);
      console.log(`[profile] Loaded ${msgs.length} Discord messages`);
    } catch (e) {
      console.error('[profile] Discord messages read failed:', e);
    }
  }

  return messages;
}

// ---- GET: load saved profile + last_session_id ----
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

// ---- PATCH: update last_session_id ----
export async function PATCH(req: NextRequest) {
  const { owner_id, last_session_id } = await req.json() as {
    owner_id: string;
    last_session_id: string;
  };
  if (!owner_id || !last_session_id) {
    return Response.json({ error: 'missing fields' }, { status: 400 });
  }

  await supabase.from('user_profile').upsert({
    owner_id,
    last_session_id,
    updated_at: new Date().toISOString(),
  });

  return Response.json({ ok: true });
}

// ---- POST: generate profile from archive ----
export async function POST(req: NextRequest) {
  const { owner_id } = await req.json() as { owner_id: string };
  if (!owner_id) return Response.json({ error: 'missing owner_id' }, { status: 400 });

  const messages = await loadMessages();
  if (messages.length === 0) {
    return Response.json(
      { error: 'No messages found. Check TWITTER_ARCHIVE_PATH in .env.local.' },
      { status: 400 }
    );
  }

  // Sample up to 200 messages for analysis
  const sample = messages
    .sort(() => Math.random() - 0.5)
    .slice(0, 200)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are analyzing casual messages/tweets from a user to help their English tutor AI personalize conversations.

Analyze these messages and write a profile in 3–5 sentences covering:
- Their English vocabulary level (beginner / intermediate / advanced)
- Main topics, interests, and things they talk about most
- Their tone and communication style (casual, formal, otaku, etc.)
- Any notable language habits or expressions

Messages:
${sample}

Write in English, 3rd person, under 200 words. Flowing sentences only — no headers or bullet points.`,
      },
    ],
  });

  const profileText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  await supabase.from('user_profile').upsert({
    owner_id,
    profile_text: profileText,
    updated_at: new Date().toISOString(),
  });

  return Response.json({ profile: profileText, count: messages.length });
}
