// Afternoise Ticker API — /api/ticker
const CACHE_DURATION = 30 * 60 * 1000;
let cache = { data: null, timestamp: 0 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
    return res.status(200).json(cache.data);
  }

  try {
    const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

    const newsRes = await fetch(
      `https://newsapi.org/v2/everything?q=hip+hop+OR+afrobeats+OR+soca+OR+dancehall+OR+R%26B&language=en&sortBy=publishedAt&pageSize=5&apiKey=${NEWSAPI_KEY}`
    );
    const newsData = await newsRes.json();
    const headlines = (newsData.articles || [])
      .filter(function(a) { return a.title && a.title !== '[Removed]'; })
      .slice(0, 5)
      .map(function(a) { return a.title; })
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
          content: `You are the news editor for Afternoise magazine. Create 8 short ticker items about current music and culture. Max 10 words each. Direct, no clickbait. Mix hip-hop, R&B, Afrobeats, dancehall, soca, Caribbean culture. Return ONLY a JSON array of strings, nothing else: ["item one", "item two"]\n\nBase on these headlines:\n${headlines}`
        }]
      })
    });

    const data = await anthropicRes.json();
    const text = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : '[]';

    let items = [];
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      items = JSON.parse(clean);
    } catch (e) {
      items = [
        "Afternoise Radio streaming live 24/7",
        "Vol. I \u2014 Origins available now",
        "Spin The Block \u2014 every Friday 11PM EST"
      ];
    }

    const response = { items: items, fetchedAt: new Date().toISOString() };
    cache = { data: response, timestamp: Date.now() };
    return res.status(200).json(response);

  } catch (error) {
    return res.status(200).json({
      items: [
        "Afternoise Radio streaming live 24/7",
        "Spin The Block \u2014 every Friday 11PM EST",
        "Vol. I \u2014 Origins out now"
      ]
    });
  }
};
