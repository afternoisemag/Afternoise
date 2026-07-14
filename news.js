// Afternoise News API — /api/news
// Fetches music & culture headlines via NewsAPI
// Rewrites them in Afternoise voice via Claude API
// Caches results for 30 minutes

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
let cache = { data: null, timestamp: 0 };

const SEARCHES = [
  'hip hop music',
  'R&B music new',
  'Afrobeats music',
  'dancehall music',
  'soca music carnival',
  'urban culture music',
];

const REWRITE_PROMPT = `You are the news editor for Afternoise — an independent urban culture magazine covering hip-hop, R&B, Afrobeats, dancehall, soca, and street culture. 

Rewrite these headlines in the Afternoise editorial voice:
- Direct and confident. No hedging.
- Culturally fluent — speak the language of the culture
- Short. Maximum 12 words per headline.
- No exclamation points. No clickbait.
- Keep artist names and facts accurate.

Return ONLY a JSON array of objects with this exact structure, nothing else:
[{"original": "original headline", "rewritten": "Afternoise headline", "category": "Hip-Hop|R&B|Afrobeats|Dancehall|Soca|Culture", "source": "source name", "url": "article url", "publishedAt": "date"}]`;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Return cache if fresh
  if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
    return res.status(200).json(cache.data);
  }

  try {
    const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

    if (!NEWSAPI_KEY || !ANTHROPIC_KEY) {
      return res.status(500).json({ error: 'Missing API keys' });
    }

    // Fetch headlines from multiple searches in parallel
    const searchPromises = SEARCHES.slice(0, 3).map(q =>
      fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=3&apiKey=${NEWSAPI_KEY}`)
        .then(r => r.json())
        .catch(() => ({ articles: [] }))
    );

    const results = await Promise.all(searchPromises);

    // Collect and deduplicate articles
    const seen = new Set();
    let articles = [];
    for (const result of results) {
      if (!result.articles) continue;
      for (const article of result.articles) {
        if (!article.title || article.title === '[Removed]') continue;
        const key = article.title.slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        articles.push({
          title: article.title,
          source: article.source?.name || 'Unknown',
          url: article.url,
          publishedAt: article.publishedAt,
        });
      }
    }

    // Take top 8 articles
    articles = articles.slice(0, 8);

    if (articles.length === 0) {
      return res.status(200).json({ articles: [] });
    }

    // Send to Claude for rewriting
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: REWRITE_PROMPT + '\n\nHEADLINES TO REWRITE:\n' +
            articles.map((a, i) => `${i + 1}. "${a.title}" — Source: ${a.source}, URL: ${a.url}, Date: ${a.publishedAt}`).join('\n')
        }]
      })
    });

    const anthropicData = await anthropicRes.json();
    const responseText = anthropicData.content?.[0]?.text || '[]';

    // Parse Claude response
    let rewritten = [];
    try {
      const clean = responseText.replace(/```json|```/g, '').trim();
      rewritten = JSON.parse(clean);
    } catch (e) {
      // Fallback to original headlines if parse fails
      rewritten = articles.map(a => ({
        original: a.title,
        rewritten: a.title,
        category: 'Culture',
        source: a.source,
        url: a.url,
        publishedAt: a.publishedAt,
      }));
    }

    const response = { articles: rewritten, fetchedAt: new Date().toISOString() };

    // Cache the result
    cache = { data: response, timestamp: Date.now() };

    return res.status(200).json(response);

  } catch (error) {
    console.error('News API error:', error);
    return res.status(500).json({ error: 'Failed to fetch news', articles: [] });
  }
}
