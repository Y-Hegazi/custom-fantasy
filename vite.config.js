import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      tailwindcss(),
      react(),
      {
        name: 'local-api-proxy',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/football-proxy')) {
              try {
                // Parse the URL
                const url = new URL(req.url, `http://${req.headers.host}`);
                const targetPath = url.searchParams.get('targetPath');
                
                if (!targetPath) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ error: 'Missing targetPath parameter' }));
                }

                // Build the query string without targetPath
                url.searchParams.delete('targetPath');
                const queryString = url.searchParams.toString();
                const targetUrl = `https://api.football-data.org/v4/${targetPath}${queryString ? '?' + queryString : ''}`;

                const apiKey = env.VITE_FOOTBALL_DATA_ORG_KEY || env.FOOTBALL_DATA_ORG_KEY;

                if (!apiKey) {
                  res.statusCode = 500;
                  return res.end(JSON.stringify({ error: 'Local config error: Missing API Key in .env' }));
                }

                const response = await fetch(targetUrl, {
                  headers: {
                    'X-Auth-Token': apiKey,
                    'Content-Type': 'application/json',
                  },
                });

                if (!response.ok) {
                   res.statusCode = response.status;
                   return res.end(JSON.stringify({ error: `API responded with status ${response.status}` }));
                }

                const data = await response.text();
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(data);
              } catch (err) {
                console.error(err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Failed to fetch data' }));
              }
            } else {
              next();
            }
          });
        }
      }
    ],
    server: {
      // Remove old proxy since we handle it in the plugin now
    },
  }
})
