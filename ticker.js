// Afternoise Ticker API — /api/ticker
// Returns 8-10 short ticker items in Afternoise voice
// Cached for 30 minutes

const CACHE_DURATION = 30 * 60 * 1000;
let cache = { data: null, timestamp: 0 };

const TICKER_PROMPT = `You are the news editor for Afternoise — an independent urban culture magazine.

Create 8 short ticker items about current music and culture news. Mix hip-hop, R&B, Afrobeats, dancehall, soca, and Caribbean culture.

Rules:
- Each item max 10 words
- Direct, no clickbait, culturally fluent
- Feel like live breaking news
- Include a mix of: new music drops, tour announcements, cultural moments, Caribbean carnival news, chart news

Return ONLY a JSON array of strings, nothing else:
["ticker item one", "ticker item two", ...]`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
    return res.status(200).json(cache.data);
  }

  try {
    const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

    // Get a few headlines to base ticker items on
    const newsRes = await fetch(
      `https://newsapi.org/v2/everything?q=hip+hop+OR+afrobeats+OR+soca+OR+dancehall+OR+R%26B&language=en&sortBy=publishedAt&pageSize=5&apiKey=${NEWSAPI_KEY}`
    );
    const newsData = await newsRes.json();
    const headlines = (newsData.articles || [])
      .filter(a => a.title && a.title !== '[Removed]')
      .slice(0, 5)
      .map(a => a.title)
      .join('\n');

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: TICKER_PROMPT + (headlines ? `\n\nBASE THESE ON CURRENT NEWS:\n${headlines}` : '')
        }]
      })
    });

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || '[]';

    let items = [];
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      items = JSON.parse(clean);
    } catch (e) {
      items = [
        "Afternoise Radio streaming live 24/7",
        "Vol. I — Origins available now at afternoisemag.com",
        "Spin The Block — every Friday 11PM EST",
      ];
    }

    const response = { items, fetchedAt: new Date().toISOString() };
    cache = { data: response, timestamp: Date.now() };
    return res.status(200).json(response);

  } catch (error) {
    return res.status(200).json({
      items: [
        "Afternoise Radio streaming live 24/7",
        "Spin The Block — every Friday 11PM EST",
        "Vol. I — Origins out now",
      ]
    });
  }
}
