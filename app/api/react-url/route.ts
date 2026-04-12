import { NextResponse } from 'next/server';
import { buildUrlReactionContext, getDomainLabel } from '@/lib/url-reaction';

type ReactUrlResponse = {
  title: string | null;
  summary: string | null;
  domain: string;
  success: boolean;
  context: string;
};

function stripHtmlTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html: string, key: string, attr: 'property' | 'name' = 'property'): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]*${attr}=["']${escapedKey}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escapedKey}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return stripHtmlTags(match[1]);
  }

  return null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? stripHtmlTags(match[1]) : null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOgData(url: string): Promise<{ title: string | null; description: string | null; siteName: string | null }> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CodexUrlReaction/1.0)',
        },
        redirect: 'follow',
      },
      5000,
    );

    if (!response.ok) {
      return { title: null, description: null, siteName: null };
    }

    const html = await response.text();
    return {
      title: extractMetaContent(html, 'og:title') ?? extractTitleTag(html),
      description: extractMetaContent(html, 'og:description') ?? extractMetaContent(html, 'description', 'name'),
      siteName: extractMetaContent(html, 'og:site_name'),
    };
  } catch {
    return { title: null, description: null, siteName: null };
  }
}

async function fetchTavilySummary(query: string): Promise<{ title: string | null; summary: string | null }> {
  if (!process.env.TAVILY_API_KEY) {
    return { title: null, summary: null };
  }

  try {
    const response = await fetchWithTimeout(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
        },
        body: JSON.stringify({
          query,
          max_results: 1,
          include_raw_content: false,
          search_depth: 'basic',
          include_images: false,
        }),
      },
      5000,
    );

    if (!response.ok) {
      return { title: null, summary: null };
    }

    const data = await response.json();
    const first = (data.results as Array<{ title?: string; content?: string }> | undefined)?.[0];
    const title = first?.title?.trim() || null;
    const summary = first?.content?.trim() ? first.content.trim().slice(0, 500) : null;

    return { title, summary };
  } catch {
    return { title: null, summary: null };
  }
}

export async function POST(req: Request) {
  let rawUrl = '';

  try {
    const body = await req.json();
    rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!rawUrl) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!/^https?:$/i.test(parsedUrl.protocol)) {
    return NextResponse.json({ error: 'Only http/https URLs are supported' }, { status: 400 });
  }

  const domain = getDomainLabel(parsedUrl.toString());
  const ogData = await fetchOgData(parsedUrl.toString());
  const tavilyData = await fetchTavilySummary(ogData.title ?? parsedUrl.toString());

  const title = ogData.title ?? tavilyData.title ?? null;
  const summary = tavilyData.summary ?? ogData.description ?? null;
  const success = Boolean(title || summary);

  const response: ReactUrlResponse = {
    title,
    summary,
    domain,
    success,
    context: buildUrlReactionContext({ title, summary, domain, success }),
  };

  return NextResponse.json(response);
}
