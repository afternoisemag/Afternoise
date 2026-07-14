// Afternoise Events API — /api/events
const CACHE_DURATION = 6 * 60 * 60 * 1000;
let cache = { data: null, timestamp: 0 };

const SEED_EVENTS = [
  { date: "2026-08-01", dateDisplay: "Aug 1", name: "Toronto Caribbean Carnival", city: "Toronto, ON", type: "carnival", detail: "Grand Parade \u00b7 Free along most of route", url: "https://torontocarnival.ca" },
  { date: "2026-08-30", dateDisplay: "Aug 30", name: "Labor Day Carnival", city: "Brooklyn, NY", type: "carnival", detail: "Eastern Pkwy \u00b7 Free event", url: null },
  { date: "2026-10-04", dateDisplay: "Oct 4", name: "Miami Carnival", city: "Miami, FL", type: "carnival", detail: "Hard Rock Stadium \u00b7 Free parade", url: null },
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
    return res.status(200).json(cache.data);
  }

  try {
    const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

    const newsRes = await fetch(
      `https://newsapi.org/v2/everything?q=concert+tour+2026+hip+hop+OR+afrobeats+OR+soca&language=en&sortBy=publishedAt&pageSize=5&apiKey=${NEWSAPI_KEY}`
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
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Based on these headlines, extract up to 3 upcoming music events (concerts, tours, festivals) in North America relevant to hip-hop, R&B, Afrobeats, dancehall, or soca. Return ONLY a JSON array, nothing else. Each object: {"date":"YYYY-MM-DD","dateDisplay":"Mon D","name":"Event Name","city":"City, State","type":"show","detail":"short detail","url":null} If none found return [].\n\nHeadlines:\n${headlines}`
        }]
      })
    });

    const data = await anthropicRes.json();
    const text = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : '[]';

    let dynamicEvents = [];
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      dynamicEvents = JSON.parse(clean);
    } catch (e) {
      dynamicEvents = [];
    }

    const today = new Date().toISOString().slice(0, 10);
    const allEvents = SEED_EVENTS.concat(dynamicEvents)
      .filter(function(e) { return e.date >= today; })
      .sort(function(a, b) { return a.date.localeCompare(b.date); })
      .slice(0, 8);

    const response = { events: allEvents, fetchedAt: new Date().toISOString() };
    cache = { data: response, timestamp: Date.now() };
    return res.status(200).json(response);

  } catch (error) {
    return res.status(200).json({ events: SEED_EVENTS });
  }
};
