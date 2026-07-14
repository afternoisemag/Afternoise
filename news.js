// Afternoise News API — /api/news
const CACHE_DURATION = 30 * 60 * 1000;
let cache = { data: null, timestamp: 0 };

const SEARCHES = ['hip hop music', 'afrobeats music', 'soca music carnival', 'dancehall music', 'R&B new music'];

const REWRITE_PROMPT = `You are the news editor for Afternoise — an independent urban culture magazine covering hip-hop, R&B, Afrobeats, dancehall, soca, and street culture.

Rewrite these headlines in the Afternoise editorial voice:
- Direct and confident. No hedging.
- Culturally fluent
- Maximum 12 words per headline
- No exclamation points. No clickbait.
- Keep artist names and facts accurate.

Return ONLY a JSON array, nothing else:
[{"rewritten": "headline here", "category": "Hip-Hop", "source": "source name", "url": "url", "publishedAt": "date"}]`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
    return res.status(200).json(cache.data);
  }

  try {
    const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

    if (!NEWSAPI_KEY || !ANTHROPIC_KEY) {
      return res.status(500).json({ error: 'Missing API keys' });
    }

    const searchPromises = SEARCHES.slice(0, 3).map(q =>
      fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=3&apiKey=${NEWSAPI_KEY}`)
        .then(r => r.json())
        .catch(() => ({ articles: [] }))
    );

    const results = await Promise.all(searchPromises);

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
          source: article.source && article.source.name ? article.source.name : 'Unknown',
          url: article.url,
          publishedAt: article.publishedAt,
        });
      }
    }

    articles = articles.slice(0, 8);

    if (articles.length === 0) {
      return res.status(200).json({ articles: [] });
    }

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
          content: REWRITE_PROMPT + '\n\nHEADLINES:\n' +
            articles.map((a, i) => `${i+1}. "${a.title}" — Source: ${a.source}, URL: ${a.url}, Date: ${a.publishedAt}`).join('\n')
        }]
      })
    });

    const anthropicData = await anthropicRes.json();
    const responseText = (anthropicData.content && anthropicData.content[0] && anthropicData.content[0].text) ? anthropicData.content[0].text : '[]';

    let rewritten = [];
    try {
      const clean = responseText.replace(/```json|```/g, '').trim();
      rewritten = JSON.parse(clean);
    } catch (e) {
      rewritten = articles.map(function(a) {
        return { rewritten: a.title, category: 'Culture', source: a.source, url: a.url, publishedAt: a.publishedAt };
      });
    }

    const response = { articles: rewritten, fetchedAt: new Date().toISOString() };
    cache = { data: response, timestamp: Date.now() };
    return res.status(200).json(response);

  } catch (error) {
    console.error('News API error:', error);
    return res.status(500).json({ error: error.message, articles: [] });
  }
};
