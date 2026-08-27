/**
 * Smart Shade Matcher Engine
 * Resolves exact cosmetic shade names, realistic HEX color swatches, 
 * micro-rationales, and shade alternatives for Face & Lips products based on
 * (Brand, Product Name, Category, SkinTone, Undertone, PersonalColor).
 */

export interface ShadeVariant {
  shadeName: string;
  shadeCode?: string;
  hexColor: string;
  undertoneMatch: 'Warm' | 'Cool' | 'Neutral' | 'Olive';
  skinToneDepth: 'Fair' | 'Light' | 'Medium' | 'Tan' | 'Deep';
  description?: string;
}

export interface ResolvedShadeDetails {
  exactShade: string;
  shadeCode?: string;
  shadeHex: string;
  shadeFamily: string;
  rationale: string;
  undertoneTag: string;
  depthTag: string;
  alternatives: Array<{
    shadeName: string;
    shadeHex: string;
    description: string;
  }>;
}

// Brand-specific catalog shade databases
const BRAND_FACE_SHADES: Record<string, Record<string, { name: string; hex: string; desc: string }>> = {
  somethinc: {
    'Fair-Warm': { name: '02 Bijoux (Fair Warm)', hex: '#EED6C0', desc: 'Yellow undertone lembut yang mencerahkan kulit Fair tanpa ashy.' },
    'Fair-Cool': { name: '01 Perle (Fair Neutral/Cool)', hex: '#F2DDD0', desc: 'Pink-neutral undertone yang menyatu natural dengan Fair cool.' },
    'Fair-Neutral': { name: '01 Perle (Fair Neutral)', hex: '#F0DBCB', desc: 'Neutral balance untuk kulit Fair yang tidak terlalu kuning/pink.' },
    'Light-Warm': { name: '03 Butter (Light Warm)', hex: '#E5C4A6', desc: 'Golden warm pigment yang menetralkan kemerahan di kulit Light.' },
    'Light-Cool': { name: '02W Nina (Light Cool)', hex: '#E6C8B5', desc: 'Rona peach-cool yang memberikan efek segar merona.' },
    'Light-Neutral': { name: '03N Alter (Light Neutral)', hex: '#E3C3A8', desc: 'Tone seimbang yang mengikuti kecerahan alami kulit Light.' },
    'Medium-Warm': { name: '05 Linen (Medium Warm)', hex: '#D6AE88', desc: 'Warm undertone khas Indonesia yang menyatu seamless.' },
    'Medium-Cool': { name: '04 Charlotte (Medium Cool)', hex: '#D4AA8E', desc: 'Medium neutral-cool yang meratakan rona kulit berpigmen.' },
    'Medium-Neutral': { name: '06 Medium (Medium Neutral)', hex: '#CEA782', desc: 'Menyamarkan noda dengan rona netral natural.' },
    'Tan-Warm': { name: '08 Coco (Tan Warm)', hex: '#B88B60', desc: 'Rich golden glow untuk kulit sawo matang eksotis.' },
    'Tan-Cool': { name: '07 Penny (Tan Neutral/Cool)', hex: '#B58668', desc: 'Tan neutral yang menonjolkan kedalaman rona wajah.' },
    'Tan-Neutral': { name: '08 Coco (Tan Neutral)', hex: '#B88B60', desc: 'Warm tan berpigmen intens untuk coverage natural.' },
  },
  makeover: {
    'Fair-Warm': { name: 'W12 Warm Light', hex: '#EED5BE', desc: 'Yellow pigment ringan yang mencerahkan secara instan.' },
    'Fair-Cool': { name: 'C11 Cool Fair', hex: '#F1DCce', desc: 'Cool rosiness yang membuat kulit Fair tampak bersinar.' },
    'Light-Warm': { name: 'W22 Warm Light Beige', hex: '#E5C2A4', desc: 'Shade terpopuler dengan warm yellow yang pas di wajah.' },
    'Light-Cool': { name: 'C21 Cool Light Beige', hex: '#E6C4B0', desc: 'Soft pink-cool pigment yang segar.' },
    'Medium-Warm': { name: 'W33 Warm Sand', hex: '#D5AC86', desc: 'Warm golden sand yang sempurna untuk rona sawo langsat.' },
    'Medium-Cool': { name: 'C31 Cool Sand', hex: '#D2A790', desc: 'Cool sand yang menenangkan rona wajah hangat berlebih.' },
    'Tan-Warm': { name: 'W42 Warm Toffee', hex: '#B8875D', desc: 'Deep warm undertone untuk sawo matang yang radiant.' },
  },
  wardah: {
    'Fair-Warm': { name: '22N Light Ivory', hex: '#EBD4BE', desc: 'Light ivory dengan sentuhan hangat natural.' },
    'Fair-Cool': { name: '11C Pink Fair', hex: '#F0D8CB', desc: 'Pink fair yang mencerahkan kulit kusam.' },
    'Light-Warm': { name: '23W Warm Ivory', hex: '#E2BF9F', desc: 'Warm ivory yang memberi efek fresh dewy glow.' },
    'Medium-Warm': { name: '33W Warm Sand', hex: '#D2A983', desc: 'Sand warm khas wanita Indonesia yang menyatu rata.' },
    'Medium-Neutral': { name: '32N Neutral Beige', hex: '#CDA585', desc: 'Neutral beige serbaguna untuk daily look.' },
    'Tan-Warm': { name: '43W Golden Sand', hex: '#B4845B', desc: 'Golden tone pekat yang tahan kilap seharian.' },
  },
  skintific: {
    'Fair-Warm': { name: '01 Vanilla (Fair Warm)', hex: '#EFD9C5', desc: 'Lightest yellow tone dengan high coverage cerah.' },
    'Fair-Cool': { name: '01 Vanilla (Fair Cool)', hex: '#EFD9C5', desc: 'Porcelain vanilla yang menyatu merata.' },
    'Light-Warm': { name: '02 Ivory (Light Warm)', hex: '#E6C4A7', desc: 'Yellow undertone yang menyamarkan noda kemerahan.' },
    'Light-Neutral': { name: '03 Petal (Light Neutral)', hex: '#E4C2B0', desc: 'Sentuhan peach-neutral yang menyehatkan tampilan kulit.' },
    'Medium-Warm': { name: '03A Almond (Medium Warm)', hex: '#D5AB84', desc: 'Almond golden warm yang menyatu tanpa garis batas.' },
    'Medium-Neutral': { name: '04 Beige (Medium Neutral)', hex: '#CCA17C', desc: 'Medium beige netral anti-oksidasi.' },
    'Tan-Warm': { name: '05 Sand (Tan Warm)', hex: '#B7865D', desc: 'Deep sand warm yang menonjolkan glowing eksotis.' },
  },
  esqa: {
    'Fair-Warm': { name: 'Milkshake (Fair Warm)', hex: '#EED6BF', desc: 'Light yellow radiance dengan dewy glow.' },
    'Light-Warm': { name: 'Custard (Light Warm)', hex: '#E4C09F', desc: 'Warm custard yang tidak membuat kulit kusam.' },
    'Light-Neutral': { name: 'Granola (Light Neutral)', hex: '#DEC0AA', desc: 'Natural balancer untuk kulit undertone netral.' },
    'Medium-Warm': { name: 'Caramel (Medium Warm)', hex: '#D1A47B', desc: 'Rich warm golden caramel.' },
    'Tan-Warm': { name: 'Toffee (Tan Warm)', hex: '#B17F56', desc: 'Toffee warmth untuk kulit gelap eksotis.' },
  },
  maybelline: {
    'Fair-Warm': { name: '118 Light Beige', hex: '#EED4BB', desc: 'Light warm pigment yang menyatu tahan lama.' },
    'Fair-Cool': { name: '115 Classic Ivory', hex: '#F0D7CB', desc: 'Classic ivory dengan pink undertone halus.' },
    'Light-Warm': { name: '128 Warm Nude', hex: '#E3BE9D', desc: 'Best-selling warm shade untuk kulit Asia.' },
    'Medium-Warm': { name: '220 Natural Beige', hex: '#D0A37A', desc: 'Medium warm golden yang menutup pori sempurna.' },
    'Tan-Warm': { name: '310 Sun Beige', hex: '#B38155', desc: 'Sun-kissed bronze tone untuk kulit sawo matang.' },
  }
};

// Lip shade mapping based on seasonal color analysis & undertone
const SEASONAL_LIP_SHADES: Record<string, Array<{ name: string; hex: string; desc: string; alt: string; altHex: string }>> = {
  'Spring-Warm': [
    { name: '02 Peachy Coral Glow', hex: '#FF7F50', desc: 'Rona peachy coral yang memberi vitalitas ceria pada rona wajah hangat.', alt: '01 Warm Nude Apricot', altHex: '#E8B499' },
    { name: '05 Fresh Coral Pink', hex: '#F88379', desc: 'Nuansa coral muda segar yang membuat bibir tampak sehat dan plumpy.', alt: '03 Soft Melon Punch', altHex: '#FDBCB4' },
    { name: '07 Terracotta Nectar', hex: '#D96B43', desc: 'Sentuhan terracotta hangat yang membuat senyum terlihat lebih cerah.', alt: '04 Warm Papaya', altHex: '#FFA07A' },
  ],
  'Autumn-Warm': [
    { name: '04 Brick Terracotta Red', hex: '#A93226', desc: 'Warna bata elegan yang menonjolkan kedalaman karakter warm autumn.', alt: '08 Burnt Cinnamon', altHex: '#C05A2B' },
    { name: '06 Rosewood Earthy Nude', hex: '#854C54', desc: 'Perpaduan nude cokelat dan mawar hangat yang classy.', alt: '02 Spiced Caramel', altHex: '#C68E56' },
    { name: '10 Maple Red Velvet', hex: '#922B21', desc: 'Merah maple berani yang sangat kontras dan menawan di kulit sawo matang.', alt: '09 Chili Sienna', altHex: '#A0522D' },
  ],
  'Summer-Cool': [
    { name: '03 Dusty Mauve Rose', hex: '#C98A7F', desc: 'Rona mauve mawar lembut yang menyeimbangkan tone kulit sejuk.', alt: '01 Soft Berry Blossom', altHex: '#B76E79' },
    { name: '05 Rose Petal Nude', hex: '#D8A0A6', desc: 'Nude kemerahan sejuk yang memberikan tampilan no-makeup makeup look.', alt: '04 Cool Cherry Blossom', altHex: '#E0A899' },
    { name: '08 Vintage Rosy Pink', hex: '#BC6C7B', desc: 'Warna mawar klasik yang anggun dan tidak mencolok.', alt: '06 Lilac Mauve', altHex: '#B784A7' },
  ],
  'Winter-Cool': [
    { name: '07 Cherry Wine Diva', hex: '#722F37', desc: 'Merah anggur mewah yang memberikan kontras tajam nan glamor.', alt: '11 Deep Berry Velvet', altHex: '#6C2D58' },
    { name: '09 Crimson Blue-Red', hex: '#990000', desc: 'True blue-based red yang membuat gigi terlihat lebih putih seketika.', alt: '04 Ruby Royale', altHex: '#800020' },
    { name: '12 Dark Plum Noir', hex: '#4A154B', desc: 'Plum pekat berani yang menonjolkan sisi bold dan modern.', alt: '08 Mulberry Magic', altHex: '#5C243B' },
  ],
};

/**
 * Main resolution function:
 * Maps any cosmetic listing to an exact shade variant and micro-rationale.
 */
export function resolveExactShade(
  product: { name: string; brand: string; category: string; subcategory?: string | null; shade?: string | null },
  skinTone: string,
  undertone: string,
  personalColor: string,
): ResolvedShadeDetails {
  const normBrand = (product.brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normCat = (product.category || '').toLowerCase();
  const normSub = (product.subcategory || '').toLowerCase();
  const normName = (product.name || '').toLowerCase();

  const isLip = normCat === 'lips' || normSub.includes('lip') || normName.includes('lip') || normName.includes('tint') || normName.includes('lipstick');
  
  // Normalize parameters
  const depthKey = ['Fair', 'Light', 'Medium', 'Tan', 'Deep'].includes(skinTone) ? skinTone : 'Medium';
  const underKey = undertone === 'Warm' || undertone === 'Olive' ? 'Warm' : undertone === 'Cool' ? 'Cool' : 'Neutral';
  const seasonKey = ['Spring', 'Summer', 'Autumn', 'Winter'].includes(personalColor)
    ? personalColor
    : (underKey === 'Warm' ? (['Tan', 'Deep'].includes(depthKey) ? 'Autumn' : 'Spring') : (['Tan', 'Deep'].includes(depthKey) ? 'Winter' : 'Summer'));

  // 1. LIP PRODUCTS RESOLUTION
  if (isLip) {
    const seasonList = SEASONAL_LIP_SHADES[`${seasonKey}-${underKey === 'Cool' ? 'Cool' : 'Warm'}`] || SEASONAL_LIP_SHADES['Spring-Warm'];
    // Hash product name to deterministically pick 1 of the matching seasonal shades
    const hash = Math.abs(normName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
    const selected = seasonList[hash % seasonList.length];

    return {
      exactShade: product.shade ? `${product.shade} (${selected.name.split(' ')[1] || 'Shade'})` : selected.name,
      shadeHex: selected.hex,
      shadeFamily: 'Lips Harmony',
      rationale: selected.desc,
      undertoneTag: underKey,
      depthTag: depthKey,
      alternatives: [
        { shadeName: selected.alt, shadeHex: selected.altHex, description: 'Pilihan varian alternatif untuk variasi tampilan harian Anda.' },
        { shadeName: seasonList[(hash + 1) % seasonList.length].name, shadeHex: seasonList[(hash + 1) % seasonList.length].hex, description: 'Warna bernuansa senada yang serasi untuk acara spesial.' }
      ]
    };
  }

  // 2. FACE PRODUCTS RESOLUTION (Cushion, Foundation, Powder, Concealer)
  // Check brand dictionary first
  let brandDictKey = Object.keys(BRAND_FACE_SHADES).find(k => normBrand.includes(k) || normName.includes(k));
  let resolvedVariant = brandDictKey 
    ? (BRAND_FACE_SHADES[brandDictKey][`${depthKey}-${underKey}`] || BRAND_FACE_SHADES[brandDictKey][`${depthKey}-Warm`] || BRAND_FACE_SHADES[brandDictKey]['Medium-Warm'])
    : null;

  if (resolvedVariant) {
    return {
      exactShade: resolvedVariant.name,
      shadeHex: resolvedVariant.hex,
      shadeFamily: 'Base & Cushion',
      rationale: resolvedVariant.desc,
      undertoneTag: underKey,
      depthTag: depthKey,
      alternatives: [
        {
          shadeName: depthKey === 'Fair' ? `${resolvedVariant.name.replace(/0\d/, '02')} (Light Alternative)` : `${resolvedVariant.name.replace(/0\d/, '01')} (Lighter Glow)`,
          shadeHex: depthKey === 'Fair' ? '#E5C4A6' : '#F0DBCB',
          description: 'Alternatif 1 tingkat rona berbeda jika menginginkan efek sedikit lebih cerah atau dewy.'
        }
      ]
    };
  }

  // 3. GENERIC INTELLIGENT FALLBACK FOR ANY FACE PRODUCT
  const genericFaceMap: Record<string, { name: string; hex: string; desc: string }> = {
    'Fair-Warm': { name: '01 Light Vanilla (Fair Warm)', hex: '#EED6C0', desc: 'Rona terang dengan yellow tone lembut yang tidak membuat wajah tampak abu-abu.' },
    'Fair-Cool': { name: '01 Pink Porcelain (Fair Cool)', hex: '#F2DDD0', desc: 'Porcelain halus ber-undertone sejuk yang mencerahkan kulit kemerahan.' },
    'Fair-Neutral': { name: '01 Natural Fair (Fair Neutral)', hex: '#F0DBCB', desc: 'Rona seimbang untuk warna kulit Fair natural.' },
    'Light-Warm': { name: '02 Warm Ivory (Light Warm)', hex: '#E5C4A6', desc: 'Golden warm yang menyamarkan noda hitam dan menyatu sempurna dengan undertone hangat.' },
    'Light-Cool': { name: '02 Cool Beige (Light Cool)', hex: '#E6C8B5', desc: 'Beige segar dengan sentuhan pink halus.' },
    'Light-Neutral': { name: '02 Natural Beige (Light Neutral)', hex: '#E3C3A8', desc: 'Medium-light neutral untuk tampilan flawless sehari-hari.' },
    'Medium-Warm': { name: '03 Warm Sand (Medium Warm)', hex: '#D6AE88', desc: 'Sand golden yang sangat cocok untuk kulit sawo langsat khas Asia Tenggara.' },
    'Medium-Cool': { name: '03 Cool Sand (Medium Cool)', hex: '#D4AA8E', desc: 'Sand sejuk yang menetralkan kilap dan rona kusam.' },
    'Medium-Neutral': { name: '03 Natural Honey (Medium Neutral)', hex: '#CEA782', desc: 'Honey neutral yang membaur mulus tanpa batas leher.' },
    'Tan-Warm': { name: '04 Golden Caramel (Tan Warm)', hex: '#B88B60', desc: 'Caramel kaya pigmentasi untuk sawo matang yang sehat bercahaya.' },
    'Tan-Cool': { name: '04 Rich Toffee (Tan Cool)', hex: '#B58668', desc: 'Toffee intens berdaya tahan tinggi untuk kulit tan.' },
    'Tan-Neutral': { name: '04 Deep Bronze (Tan Neutral)', hex: '#B88B60', desc: 'Bronze hangat berpigmen halus untuk coverage optimal.' },
    'Deep-Warm': { name: '05 Espresso Warm (Deep Warm)', hex: '#8C5A38', desc: 'Deep warm espresso yang menonjolkan rona kulit gelap secara elegan.' },
    'Deep-Cool': { name: '05 Cocoa Noir (Deep Cool)', hex: '#87523B', desc: 'Cocoa sejuk yang membaur dengan kedalaman warna alami wajah.' },
  };

  const generic = genericFaceMap[`${depthKey}-${underKey}`] || genericFaceMap[`${depthKey}-Warm`] || genericFaceMap['Medium-Warm'];
  
  return {
    exactShade: product.shade ? `${product.shade} - ${generic.name}` : generic.name,
    shadeHex: generic.hex,
    shadeFamily: 'Skin Match',
    rationale: generic.desc,
    undertoneTag: underKey,
    depthTag: depthKey,
    alternatives: [
      { shadeName: 'Alternative Shade 01 (Natural)', shadeHex: '#DEC0AA', description: 'Alternatif shade natural untuk pemakaian harian.' }
    ]
  };
}
