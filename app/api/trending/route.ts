interface RssItem {
  title: string;
  description: string;
}

async function fetchYahooRss(url: string): Promise<RssItem[]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const xml = await res.text();

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, 3).flatMap((item) => {
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
    const title = titleMatch?.[1]?.trim() ?? '';
    const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 120) ?? '';
    return title ? [{ title, description }] : [];
  });
}

export async function GET() {
  const [world, tech, entertainment] = await Promise.all([
    fetchYahooRss('https://news.yahoo.co.jp/rss/topics/world.xml'),
    fetchYahooRss('https://news.yahoo.co.jp/rss/topics/it.xml'),
    fetchYahooRss('https://news.yahoo.co.jp/rss/topics/entertainment.xml'),
  ]);

  const summarize = (items: RssItem[], label: string) => {
    const lines = items
      .slice(0, 2)
      .map((r) => `- ${r.title}${r.description ? ': ' + r.description : ''}`)
      .join('\n');
    return lines ? `**${label}**\n${lines}` : '';
  };

  const context = [
    summarize(world, 'World / General'),
    summarize(tech, 'Tech & Science'),
    summarize(entertainment, 'Entertainment'),
  ]
    .filter(Boolean)
    .join('\n\n');

  return Response.json({ context });
}
