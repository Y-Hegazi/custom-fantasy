export default async function handler(req, res) {
  // We only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // The path to append to football-data API, e.g. competitions/PL/matches
  const { targetPath, ...queryParams } = req.query;
  
  if (!targetPath) {
    return res.status(400).json({ error: 'Missing targetPath parameter' });
  }

  // Build the query string manually since we stripped out 'targetPath'
  const searchParams = new URLSearchParams(queryParams);
  const queryString = searchParams.toString();
  
  const targetUrl = `https://api.football-data.org/v4/${targetPath}${queryString ? '?' + queryString : ''}`;

  const API_KEY = process.env.VITE_FOOTBALL_DATA_ORG_KEY || process.env.FOOTBALL_DATA_ORG_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'X-Auth-Token': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching from football-data:', error);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
}
