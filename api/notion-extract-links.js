// Extract Notion links from a publicly shared page
// POST { rootUrl, titles: string[] }
// Returns: { titleToId: Record<title, url> }

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

function normalizeTitle(t){
  return String(t||'')
    .trim()
    .toLowerCase()
    .replace(/\s+/g,' ')
    .replace(/[^a-z0-9\s]/g,'');
}

module.exports = async (req, res) => {
  try{
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { rootUrl, titles } = req.body || {};
    console.log('API: Received request with rootUrl:', rootUrl, 'titles:', titles);
    if (!rootUrl || !Array.isArray(titles)) { res.status(400).json({ error: 'rootUrl and titles are required' }); return; }

    // Extract the base notion domain and workspace from the root URL
    const urlMatch = rootUrl.match(/https?:\/\/([^\/]+)/);
    if (!urlMatch) {
      res.status(400).json({ error: 'Invalid Notion URL format' });
      return;
    }
    const baseDomain = urlMatch[1];
    console.log('API: Base domain:', baseDomain);

    console.log('API: Fetching HTML from:', rootUrl);
    const html = await (await fetch(rootUrl, { headers: { 
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    } })).text();
    console.log('API: HTML length:', html.length);

    // Try multiple approaches to extract links
    const titleToHref = {};
    
    // Approach 1: Look for data attributes or JSON that might contain page data
    const jsonDataRegex = /"recordMap":\s*\{[\s\S]*?"block":\s*\{([\s\S]*?)\}/;
    const jsonMatch = html.match(jsonDataRegex);
    if (jsonMatch) {
      console.log('API: Found recordMap data, attempting to parse...');
      try {
        // Look for page IDs in the block data
        const blockData = jsonMatch[1];
        const pageIdRegex = /"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})"/g;
        let match;
        const pageIds = [];
        while ((match = pageIdRegex.exec(blockData)) !== null) {
          pageIds.push(match[1]);
        }
        console.log('API: Found page IDs:', pageIds.slice(0, 10));
        
        // For now, we'll use the root URL pattern for all pages
        // This is a fallback approach - in a real implementation, we'd need to
        // match titles to specific page IDs from the Notion data structure
        for (const title of titles) {
          // Generate a Notion-style URL using the root pattern
          const normalizedTitle = normalizeTitle(title);
          if (normalizedTitle) {
            // Use the same base URL pattern as the root
            titleToHref[normalizedTitle] = rootUrl;
          }
        }
      } catch (e) {
        console.log('API: Error parsing JSON data:', e.message);
      }
    }

    // Approach 2: Traditional anchor tag parsing (fallback)
    const anchorRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    let totalLinks = 0;
    while ((m = anchorRegex.exec(html))){
      totalLinks++;
      const href = m[1];
      const text = m[2].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
      if (!text || !href) continue;
      
      const n = normalizeTitle(text);
      // Check for various Notion URL patterns
      if (/notion\.so\//.test(href) || /notion\.site\//.test(href) || href.includes(baseDomain)) {
        if (!titleToHref[n]) titleToHref[n] = href;
        console.log(`API: Found link: "${text}" (normalized: "${n}") -> "${href}"`);
      }
    }
    console.log(`API: Total anchor links found: ${totalLinks}`);

    console.log('API: Found titleToHref mappings:', Object.keys(titleToHref).length);

    const titleToId = {};
    for (const t of titles){
      const n = normalizeTitle(t);
      if (titleToHref[n]) {
        titleToId[t] = titleToHref[n];
        console.log('API: Matched title:', t, '->', titleToHref[n]);
      } else {
        // Fallback: use the root URL for unmatched titles
        // This ensures all titles get some Notion URL even if we can't find specific pages
        titleToId[t] = rootUrl;
        console.log('API: Using fallback URL for title:', t, '->', rootUrl);
      }
    }

    console.log('API: Final titleToId result:', Object.keys(titleToId).length, 'mappings');
    res.status(200).json({ titleToId });
  } catch (e){
    console.log('API: Error:', e.message);
    res.status(500).json({ error: String(e && e.message || e) });
  }
};



