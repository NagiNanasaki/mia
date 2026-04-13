export type ChatCharacter = 'mia' | 'mimi';

export function pickFirstCharacter(userText: string): ChatCharacter {
  const text = userText.toLowerCase();
  const mimiPattern = /anime|manga|gam(e|ing)|gacha|vocaloid|miku|hatsune|figure|merch|seiyuu|voice actor|doujin|otaku|light novel|visual novel|jrpg|rhythm game|weeb/;
  const miaPattern = /science|physics|quantum|biology|chemistry|space|\bai\b|artificial intelligence|philosoph|conscious|existence|manchester|british|england|\buk\b|indie|city pop/;

  if (mimiPattern.test(text)) return Math.random() < 0.7 ? 'mimi' : 'mia';
  if (miaPattern.test(text)) return Math.random() < 0.7 ? 'mia' : 'mimi';
  return Math.random() < 0.5 ? 'mia' : 'mimi';
}
