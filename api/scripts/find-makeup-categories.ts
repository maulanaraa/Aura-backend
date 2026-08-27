import axios from 'axios';

async function findMakeupCategories() {
  const headers = {
    Accept: 'application/json',
    Origin: 'https://review.soco.id',
    Referer: 'https://review.soco.id',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  try {
    const catRes = await axios.get('https://catalog-api.soco.id/v3/categories', { headers, timeout: 15000 });
    const categories = catRes.data?.data || [];
    
    console.log('Total categories in SOCO:', categories.length);
    
    // Find category with sql_id 1 (Makeup) or name Makeup
    const makeupNode = categories.find((c: any) => c.my_soco_sql_id === 1 || c.name.toLowerCase() === 'makeup');
    if (makeupNode) {
      console.log('Found Makeup Root Node:', JSON.stringify(makeupNode, null, 2));
    }

    // Filter relevant categories
    const matching = categories.filter((c: any) => {
      const n = (c.name || '').toLowerCase();
      const s = (c.slug || '').toLowerCase();
      return n.includes('makeup') || n.includes('lip') || n.includes('face') || s.includes('makeup') || s.includes('lips') || s.includes('face');
    });

    console.log('\nRelevant category nodes:');
    matching.slice(0, 30).forEach((c: any) => {
      console.log(`- [${c.my_soco_sql_id}] ${c.name} (slug: ${c.slug}, total: ${c.total_products ?? c.count ?? 'N/A'})`);
    });

  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

findMakeupCategories();
