// Lightweight Notion search proxy (no secrets stored)
// POST { token, rootId?, titles: string[] }
// Returns: { titleToId: Record<string,string> }

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

function normalizeTitle(t){
  return String(t||'')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '');
}

module.exports = async (req, res) => {
  try{
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { token, rootId, titles } = req.body || {};
    if (!token || !Array.isArray(titles)) { res.status(400).json({ error: 'token and titles are required' }); return; }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    };

    const titleToId = {};

    for (const originalTitle of titles){
      const query = originalTitle;
      const resp = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          sort: { direction: 'ascending', timestamp: 'last_edited_time' },
          filter: { value: 'page', property: 'object' }
        })
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const normTarget = normalizeTitle(originalTitle);
      let best = null;
      let bestScore = -1;
      for (const r of (data.results||[])){
        const t = r?.properties?.title?.title?.[0]?.plain_text || r?.properties?.Name?.title?.[0]?.plain_text || r?.title?.[0]?.plain_text;
        const id = r?.id?.replace(/-/g,'');
        if (!t || !id) continue;
        const score = similarityScore(normTarget, normalizeTitle(t));
        if (score > bestScore) { bestScore = score; best = id; }
      }
      if (best) titleToId[originalTitle] = best;
    }

    res.status(200).json({ titleToId });
  } catch (e){
    res.status(500).json({ error: String(e && e.message || e) });
  }
};

function similarityScore(a, b){
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(x=>{ if (B.has(x)) inter++; });
  const union = A.size + B.size - inter;
  return inter / union;
}



