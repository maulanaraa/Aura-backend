import axios from 'axios';

function isMakeupProduct(product: any): boolean {
  const cats = product.categories ?? [];
  const isMakeupRoot = cats.some((c: any) => 
    c.name?.toLowerCase() === 'makeup' || 
    c.slug === 'makeup' || 
    c.my_soco_sql_id === 1
  );
  if (isMakeupRoot) return true;

  const MAKEUP_KEYWORDS = [
    'foundation', 'cushion', 'concealer', 'powder', 'two way cake', 'blush', 'contour', 'highlighter',
    'bronzer', 'primer', 'setting spray', 'lipstick', 'lip cream', 'lip tint', 'lip velvet', 'lip gloss',
    'lip balm', 'lip stain', 'lip crayon', 'lip liner', 'eyeshadow', 'mascara', 'eyeliner', 'eyebrow'
  ];
  const name = (product.name || '').toLowerCase();
  const defCat = (product.default_category?.name || '').toLowerCase();
  return MAKEUP_KEYWORDS.some((k) => name.includes(k) || defCat.includes(k));
}

async function scanMakeup() {
  console.log('Scanning SOCO for total makeup count...');
  let totalMakeup = 0;
  let totalFetched = 0;
  for (let skip = 0; skip < 1000; skip += 50) {
    try {
      const res = await axios.get('https://catalog-api.soco.id/v3/products', {
        params: { limit: 50, skip },
        headers: {
          Accept: 'application/json',
          Origin: 'https://review.soco.id',
          Referer: 'https://review.soco.id/category/1/makeup',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 8000,
      });
      const data = res.data?.data || [];
      if (data.length === 0) break;
      totalFetched += data.length;
      const makeupInBatch = data.filter(isMakeupProduct).length;
      totalMakeup += makeupInBatch;
      console.log(`Skip ${skip}: ${makeupInBatch}/${data.length} are makeup. Cumulative: ${totalMakeup}/${totalFetched}`);
    } catch (e: any) {
      console.error('Error skip', skip, e.message);
    }
  }
  console.log(`\nFinal Estimate: ${totalMakeup} makeup products found in first ${totalFetched} items (~${Math.round((totalMakeup / totalFetched) * 100)}%)`);
  process.exit(0);
}
scanMakeup();
