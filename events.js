// Afternoise Events API — /api/events
// Returns upcoming events — concerts, fetes, carnivals
// Seeded with known events, expandable via Ticketmaster or manual additions
// Cached for 6 hours

const CACHE_DURATION = 6 * 60 * 60 * 1000;
let cache = { data: null, timestamp: 0 };

// Seed events — these are always included and can be manually updated
const SEED_EVENTS = [
  {
    date: "2026-08-01",
    dateDisplay: "Aug 1",
    name: "Toronto Caribbean Carnival",
    city: "Toronto, ON",
    type: "carnival",
    detail: "Grand Parade · Free along most of route",
    url: "https://torontocarnival.ca",
  },
  {
    date: "2026-08-30",
    dateDisplay: "Aug 30",
    name: "Labor Day Carnival",
    city: "Brooklyn, NY",
    type: "carnival",
    detail: "Eastern Pkwy · Free event",
    url: null,
  },
  {
    date: "2026-10-04",
    dateDisplay: "Oct 4",
    name: "Miami Carnival",
    city: "Miami, FL",
    type: "carnival",
    detail: "Hard Rock Stadium · Free parade",
    url: null,
  },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
    return res.status(200).json(cache.data);
  }

  try {
    const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

    // Ask Claude to generate current relevant events based on news
    const newsRes = await fetch(
      `https://newsapi.org/v2/everything?q=concert+tour+2026+hip+hop+OR+afrobeats+OR+soca+OR+carnival&language=en&sortBy=publishedAt&pageSize=5&apiKey=${NEWSAPI_KEY}`
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
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Based on these current news headlines, extract or infer up to 4 upcoming music events (concerts, tours, festivals) relevant to hip-hop, R&B, Afrobeats, dancehall, or soca culture in North America.

Headlines:
${headlines}

Return ONLY a JSON array, nothing else. Each object must have:
{"date": "YYYY-MM-DD", "dateDisplay": "Mon D", "name": "Event Name", "city": "City, State/Province", "type": "show|fete|carnival", "detail": "short detail line", "url": null}

If no real events can be extracted, return an empty array [].`
        }]
      })
    });

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || '[]';

    let dynamicEvents = [];
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      dynamicEvents = JSON.parse(clean);
    } catch (e) {
      dynamicEvents = [];
    }

    // Merge seed events with dynamic ones, sort by date
    const allEvents = [...SEED_EVENTS, ...dynamicEvents]
      .filter(e => e.date >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);

    const response = { events: allEvents, fetchedAt: new Date().toISOString() };
    cache = { data: response, timestamp: Date.now() };
    return res.status(200).json(response);

  } catch (error) {
    // Always return seed events as fallback
    return res.status(200).json({ events: SEED_EVENTS });
  }
}
