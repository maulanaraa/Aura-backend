import axios from 'axios';

async function testSocoCounts() {
  const headers = {
    Accept: 'application/json',
    Origin: 'https://review.soco.id',
    Referer: 'https://review.soco.id',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  try {
    const catRes = await axios.get('https://catalog-api.soco.id/v3/categories', { headers, timeout: 10000 });
    const categories = catRes.data?.data || [];
    console.log('--- SOCO CATEGORY TREE & METRICS ---');
    for (const c of categories) {
      console.log(`[Category] ${c.name} | slug: ${c.slug} | my_soco_sql_id: ${c.my_soco_sql_id} | total: ${c.total_products ?? c.count ?? 'N/A'}`);
      if (Array.isArray(c.children)) {
        for (const sub of c.children) {
          console.log(`   └─ ${sub.name} | slug: ${sub.slug} | my_soco_sql_id: ${sub.my_soco_sql_id} | total: ${sub.total_products ?? sub.count ?? 'N/A'}`);
          if (Array.isArray(sub.children)) {
            for (const sub2 of sub.children) {
              console.log(`       └─ ${sub2.name} | slug: ${sub2.slug} | total: ${sub2.total_products ?? sub2.count ?? 'N/A'}`);
            }
          }
        }
      }
    }
  } catch (e: any) {
    console.error('Error fetching categories:', e.message);
  }

  // Also check product pagination metadata
  try {
    const pRes = await axios.get('https://catalog-api.soco.id/v3/products', {
      params: { limit: 1, skip: 0 },
      headers,
      timeout: 10000,
    });
    console.log('\n--- SOCO PRODUCT METADATA ---');
    console.log('Response keys:', Object.keys(pRes.data));
    console.log('Total / Count field in response:', pRes.data.total ?? pRes.data.count ?? pRes.data.meta ?? 'N/A');
  } catch (e: any) {
    console.error('Error fetching product meta:', e.message);
  }
}

testSocoCounts();
