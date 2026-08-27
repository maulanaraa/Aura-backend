import axios from 'axios';

async function listAllCategoriesPaginated() {
  const headers = {
    Accept: 'application/json',
    Origin: 'https://review.soco.id',
    Referer: 'https://review.soco.id',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  const allCategories: any[] = [];
  for (let skip = 0; skip <= 300; skip += 50) {
    try {
      const res = await axios.get('https://catalog-api.soco.id/v3/categories', {
        params: { limit: 50, skip },
        headers,
        timeout: 10000,
      });
      const data = res.data?.data || [];
      if (data.length === 0) break;
      allCategories.push(...data);
    } catch (e: any) {
      console.error(`Error at skip ${skip}:`, e.message);
      break;
    }
  }

  console.log(`Total categories fetched: ${allCategories.length}`);
  const relevant = allCategories.filter((c: any) => {
    const n = (c.name || '').toLowerCase();
    const s = (c.slug || '').toLowerCase();
    return n.includes('makeup') || n.includes('lip') || n.includes('face') || n.includes('cushion') || n.includes('foundation') || n.includes('powder') || s.includes('makeup') || s.includes('lips') || s.includes('face');
  });

  console.log('--- RELEVANT CATEGORIES FOUND ---');
  for (const c of relevant) {
    console.log(`- [SQL_ID: ${c.my_soco_sql_id}] ${c.name} | slug: ${c.slug} | total: ${c.total_products ?? c.count ?? 'N/A'}`);
  }
}

listAllCategoriesPaginated();
