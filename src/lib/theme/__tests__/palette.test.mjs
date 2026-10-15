// Theme → CSS variables (lib/theme/palette).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hexToOklch, colorScale, themeVars, normalizeRadius, fontChoice, normalizeHex } from '@/lib/theme/palette';

describe('colour maths', () => {
  // #2563eb = oklch(54.6% 0.215 262.9). Same L and H as Tailwind v4's blue-600, whose chroma (0.245)
  // is wide-gamut and beyond what an sRGB hex can hold.
  it('converts sRGB to OKLCH (#2563eb)', () => {
    const { l, c, h } = hexToOklch('#2563eb');
    assert.ok(Math.abs(l - 0.546) < 0.005, `L ${l}`);
    assert.ok(Math.abs(c - 0.215) < 0.003, `C ${c}`);
    assert.ok(Math.abs(h - 262.9) < 1, `H ${h}`);
  });

  it('builds 11 shades with the colour itself at 600, light → dark', () => {
    const sc = colorScale('#16a34a');
    assert.deepEqual(Object.keys(sc).map(Number), [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
    assert.equal(sc[600], '#16a34a');
    const L = (v) => (v.startsWith('#') ? hexToOklch(v).l * 100 : Number(v.match(/oklch\(([\d.]+)%/)[1]));
    const ls = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => L(sc[s]));
    for (let i = 1; i < ls.length; i++) assert.ok(ls[i] < ls[i - 1], `shade ${i} not darker`);
  });

  it('rejects invalid colours', () => {
    assert.equal(normalizeHex('green'), null);
    assert.equal(normalizeHex('#0f0'), '#00ff00');
    assert.deepEqual(colorScale('nope'), {});
  });
});

describe('themeVars', () => {
  it('a brand colour re-points the blue and indigo families that screens use', () => {
    const v = themeVars({ brand: '#16a34a' });
    assert.equal(v['--color-blue-600'], '#16a34a');
    assert.equal(v['--color-indigo-600'], '#16a34a');
    assert.ok(v['--color-blue-50'].startsWith('oklch('));
    assert.equal(v['--primary'], '#16a34a');
    assert.equal(v['--color-violet-600'], undefined, 'secondary untouched without a secondary colour');
  });

  it('secondary → violet/purple; nothing set → no overrides at all', () => {
    assert.equal(themeVars({ secondary: '#d97706' })['--color-purple-600'], '#d97706');
    assert.deepEqual(themeVars({}), {});
  });

  it('roundness rescales every radius step; default leaves Tailwind alone', () => {
    const sharp = themeVars({ radius: 'none' });
    for (const k of ['sm', 'md', 'lg', 'xl', '2xl', '3xl']) assert.equal(sharp[`--radius-${k}`], '0px');
    assert.deepEqual(themeVars({ radius: 'lg' }), {});
    assert.equal(themeVars({ radius: 'xl' })['--radius-xl'], '16px');
    assert.equal(normalizeRadius('full'), 'xl', 'old "Pill" value migrates');
  });

  it('fonts: id or legacy stack → a loadable choice; Arabic keeps Amiri first', () => {
    assert.equal(fontChoice('poppins').id, 'poppins');
    assert.equal(fontChoice('Poppins, sans-serif').id, 'poppins');
    assert.ok(themeVars({ font: 'roboto' })['--font-sans'].startsWith("'Amiri', Roboto"));
  });
});
