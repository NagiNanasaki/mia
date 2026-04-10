import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Cumulative EXP required to reach each level (index = level - 1)
const LEVEL_TABLE = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];
const LEVEL_10_BASE = 2700;
const LEVEL_10_STEP = 550;

function getLevelFromExp(exp: number): number {
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (exp >= LEVEL_TABLE[i]) return i + 1;
  }
  // Beyond Lv10
  const beyond = Math.floor((exp - LEVEL_10_BASE) / LEVEL_10_STEP);
  return 10 + beyond;
}

function getExpForLevel(level: number): number {
  if (level <= LEVEL_TABLE.length) return LEVEL_TABLE[level - 1];
  return LEVEL_10_BASE + (level - 10) * LEVEL_10_STEP;
}

// GET: fetch current progress
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vocabOwnerId = searchParams.get('vocabOwnerId') ?? '';
  if (!vocabOwnerId) return Response.json({ exp: 0, level: 1, nextLevelExp: 100 });

  const { data } = await supabase
    .from('user_progress')
    .select('exp, level')
    .eq('vocab_owner_id', vocabOwnerId)
    .single();

  if (!data) return Response.json({ exp: 0, level: 1, nextLevelExp: 100 });

  const nextLevelExp = getExpForLevel(data.level + 1);
  return Response.json({ exp: data.exp, level: data.level, nextLevelExp });
}

// POST: add EXP and update level
export async function POST(req: Request) {
  const { vocabOwnerId, expGained } = await req.json();
  if (!vocabOwnerId || typeof expGained !== 'number' || expGained < 0) {
    return Response.json({ error: 'Missing params' }, { status: 400 });
  }

  // Fetch current
  const { data: current } = await supabase
    .from('user_progress')
    .select('exp, level')
    .eq('vocab_owner_id', vocabOwnerId)
    .single();

  const prevExp = current?.exp ?? 0;
  const newExp = prevExp + expGained;
  const prevLevel = current?.level ?? 1;
  const newLevel = getLevelFromExp(newExp);
  const leveledUp = newLevel > prevLevel;
  const nextLevelExp = getExpForLevel(newLevel + 1);

  await supabase.from('user_progress').upsert({
    vocab_owner_id: vocabOwnerId,
    exp: newExp,
    level: newLevel,
    updated_at: new Date().toISOString(),
  });

  return Response.json({ exp: newExp, level: newLevel, leveledUp, nextLevelExp });
}
