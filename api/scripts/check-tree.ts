import axios from 'axios';

async function checkSocoWebpage() {
  const headers = {
    Accept: 'application/json',
    Origin: 'https://review.soco.id',
    Referer: 'https://review.soco.id',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  const endpoints = [
    'https://catalog-api.soco.id/v3/categories/tree',
    'https://catalog-api.soco.id/v3/categories/main',
    'https://catalog-api.soco.id/v3/categories?limit=100',
  ];

  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep, { headers, timeout: 5000 });
      console.log(`Endpoint ${ep} success! Length:`, res.data?.data?.length);
    } catch (e: any) {
      console.log(`Endpoint ${ep} failed: ${e.message}`);
    }
  }
}

checkSocoWebpage();
