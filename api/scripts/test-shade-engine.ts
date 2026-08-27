import { resolveExactShade } from '../src/modules/recommendation/engine/shade-matcher-engine.js';

console.log('=== TEST 1: Somethinc Cushion for Fair Warm ===');
console.log(resolveExactShade({ brand: 'Somethinc', name: 'Copy Paste Breathable Cushion', category: 'Face' }, 'Fair', 'Warm', 'Spring'));

console.log('\n=== TEST 2: Make Over Foundation for Light Warm ===');
console.log(resolveExactShade({ brand: 'Make Over', name: 'Hydrastay Lite Glow Liquid Foundation', category: 'Face' }, 'Light', 'Warm', 'Spring'));

console.log('\n=== TEST 3: Skintific Cushion for Medium Warm ===');
console.log(resolveExactShade({ brand: 'Skintific', name: 'Cover All Perfect Cushion', category: 'Face' }, 'Medium', 'Warm', 'Autumn'));

console.log('\n=== TEST 4: Lip Tint for Spring Warm ===');
console.log(resolveExactShade({ brand: 'Wardah', name: 'Colorfit Lip Ink Serum', category: 'Lips' }, 'Light', 'Warm', 'Spring'));
