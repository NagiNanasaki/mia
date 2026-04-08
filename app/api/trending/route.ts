interface TavilyResult {
  results: { title: string; content: string; url: string }[];
}

async function tavilySearch(query: string): Promise<TavilyResult> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: 3,
      include_answer: false,
    }),
  });
  if (!res.ok) return { results: [] };
  return res.json();
}

export async function GET() {
  // Fetch 3 topic areas in parallel
  const [general, tech, entertainment] = await Promise.all([
    tavilySearch('trending news today 2025'),
    tavilySearch('science technology AI news this week'),
    tavilySearch('anime manga music trending 2025'),
  ]);

  const summarize = (data: TavilyResult) =>
    data.results
      .slice(0, 2)
      .map(r => `- ${r.title}: ${r.content.slice(0, 120).trim()}`)
      .join('\n');

  const context = [
    '**World / General**\n' + summarize(general),
    '**Tech & Science**\n' + summarize(tech),
    '**Entertainment**\n' + summarize(entertainment),
  ]
    .filter(s => s.includes('\n-'))
    .join('\n\n');

  return Response.json({ context });
}
