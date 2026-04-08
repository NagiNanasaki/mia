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

async function fetchWeather(): Promise<string> {
  const res = await fetch('https://wttr.in/Tokyo?format=j1', {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return '';
  const data = await res.json();
  const c = data?.current_condition?.[0];
  if (!c) return '';
  const desc = c.weatherDesc?.[0]?.value ?? '';
  const temp = c.temp_C ?? '';
  const feels = c.FeelsLikeC ?? '';
  const humidity = c.humidity ?? '';
  return `**Weather (Tokyo)**\n- ${desc}, ${temp}°C (feels like ${feels}°C), humidity ${humidity}%`;
}

export async function GET() {
  const [world, tech, entertainment, weather] = await Promise.all([
    fetchYahooRss('https://news.yahoo.co.jp/rss/topics/world.xml'),
    fetchYahooRss('https://news.yahoo.co.jp/rss/topics/it.xml'),
    fetchYahooRss('https://news.yahoo.co.jp/rss/topics/entertainment.xml'),
    fetchWeather(),
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
    weather,
  ]
    .filter(Boolean)
    .join('\n\n');

  return Response.json({ context });
}
