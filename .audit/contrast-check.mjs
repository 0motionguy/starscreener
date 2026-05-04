#!/usr/bin/env node
/**
 * WCAG AA contrast checker for AGN-696
 * Calculates contrast ratios and identifies failures
 */

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function luminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const lum1 = luminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = luminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// Test all sidebar/version text combinations
const bg = '#101418'; // --v4-bg-050 (sidebar background)
const tests = [
  { name: 'Version text (--v4-ink-300, FIXED)', fg: '#84909b', required: 4.5, size: 9 },
  { name: 'Section labels (--ink-400)', fg: '#909caa', required: 4.5, size: 9 },
  { name: 'Nav inactive (--ink-200)', fg: '#b8c0c8', required: 4.5, size: 11 },
  { name: 'Nav icons (--ink-300)', fg: '#84909b', required: 4.5, size: 14 },
  { name: 'TRENDINGREPO label (--v4-ink-300)', fg: '#84909b', required: 4.5, size: 10 },
];

console.log('WCAG AA Contrast Audit (AGN-696)\n');
console.log(`Background: ${bg}\n`);

let failures = 0;
tests.forEach(t => {
  const ratio = contrast(bg, t.fg);
  const pass = ratio >= t.required;
  const status = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`${status} ${t.name}`);
  console.log(`  Foreground: ${t.fg}`);
  console.log(`  Ratio: ${ratio.toFixed(2)}:1 (need ${t.required}:1 for ${t.size}px text)`);
  if (!pass) {
    failures++;
    // Calculate minimum lightness needed
    const minLuminance = (0.05 * t.required) - 0.05;
    console.log(`  → Need brighter color (target luminance ~${minLuminance.toFixed(3)})`);
  }
  console.log('');
});

console.log(`\nSummary: ${failures} failures out of ${tests.length} tests`);
process.exit(failures > 0 ? 1 : 0);
