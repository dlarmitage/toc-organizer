module.exports = async (req, res) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Basic URL validation
  let targetUrl;
  try {
    targetUrl = new URL(url);
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are allowed' });
    }
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    console.log('Fetching sitemap from:', targetUrl.href);
    
    // Fetch the sitemap with appropriate headers
    const response = await fetch(targetUrl.href, {
      method: 'GET',
      headers: {
        'User-Agent': 'TOC-Organizer/1.0 (Sitemap Fetcher)',
        'Accept': 'application/xml, text/xml, */*',
        'Cache-Control': 'no-cache'
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      console.error('Failed to fetch sitemap:', response.status, response.statusText);
      return res.status(response.status).json({ 
        error: `Failed to fetch sitemap: ${response.status} ${response.statusText}` 
      });
    }

    const contentType = response.headers.get('content-type') || '';
    
    // Check if the response looks like XML
    if (!contentType.includes('xml') && !contentType.includes('text')) {
      console.warn('Response may not be XML:', contentType);
    }

    const xmlContent = await response.text();
    
    // Basic validation that this looks like a sitemap
    if (!xmlContent.includes('<urlset') && !xmlContent.includes('<sitemapindex')) {
      return res.status(400).json({ 
        error: 'Response does not appear to be a valid sitemap XML' 
      });
    }

    // Set appropriate CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/xml');
    
    console.log('Successfully fetched sitemap, length:', xmlContent.length);
    return res.status(200).send(xmlContent);

  } catch (error) {
    console.error('Error fetching sitemap:', error);
    
    // Handle specific error types
    if (error.name === 'AbortError') {
      return res.status(408).json({ error: 'Request timeout - sitemap took too long to load' });
    }
    
    if (error.code === 'ENOTFOUND') {
      return res.status(404).json({ error: 'Domain not found - check the URL' });
    }
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Connection refused - server may be down' });
    }

    return res.status(500).json({ 
      error: `Failed to fetch sitemap: ${error.message}` 
    });
  }
};
