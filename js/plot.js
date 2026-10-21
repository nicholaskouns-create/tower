// Austere SVG figures. They're self-contained (fonts named, with fallbacks) so they export cleanly.
const INK = '#111', ACC = '#a3271b', MUTED = '#555', HAIR = '#d9d3c6', PAPER = '#ffffff';
const SERIF = "'EB Garamond', Georgia, 'Times New Roman', serif";
const MONO = "'IBM Plex Mono', Menlo, monospace";
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// points: [[x, y], ...]; logy plots log10(y).
export function linePlot({ title, subtitle = '', xlabel, ylabel, points, logy = false, highlight = null }) {
  const W = 760, H = 420, L = 78, R = 26, T = 64, B = 58;
  const pts = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && (!logy || y > 0));
  if (!pts.length) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${PAPER}"/><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="${SERIF}" font-size="18">no plottable points</text></svg>`;
  const ys = pts.map(([, y]) => (logy ? Math.log10(y) : y));
  const xs = pts.map(([x]) => x);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 1; x1 += 1; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys); if (y0 === y1) { y0 -= 1; y1 += 1; }
  if (logy) { y0 = Math.floor(y0); y1 = Math.ceil(y1); }
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  let g = '';
  // y ticks
  const ny = logy ? Math.min(8, y1 - y0) : 5;
  const ystep = logy ? Math.max(1, Math.ceil((y1 - y0) / 8)) : (y1 - y0) / ny;
  for (let v = y0; v <= y1 + 1e-9; v += ystep) {
    const y = sy(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${HAIR}" stroke-width="1"/>`;
    g += `<text x="${L - 10}" y="${y + 4}" text-anchor="end" font-family="${MONO}" font-size="11" fill="${MUTED}">${logy ? `1e${Math.round(v)}` : +v.toPrecision(3)}</text>`;
  }
  // x ticks at the data points (tower indices) when few, else 6 even ticks
  const xt = xs.length <= 16 ? xs : Array.from({ length: 7 }, (_, i) => Math.round(x0 + (i * (x1 - x0)) / 6));
  for (const v of xt) g += `<text x="${sx(v)}" y="${H - B + 20}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${MUTED}">${v}</text>`;
  g += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="${INK}" stroke-width="1.5"/>`;
  g += `<line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="${INK}" stroke-width="1.5"/>`;
  const path = pts.map(([x], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ');
  g += `<path d="${path}" fill="none" stroke="${INK}" stroke-width="1.4"/>`;
  pts.forEach(([x], i) => {
    const hi = highlight != null && x === highlight;
    g += `<circle cx="${sx(x).toFixed(1)}" cy="${sy(ys[i]).toFixed(1)}" r="${hi ? 5.5 : 3.6}" fill="${hi || i === 0 ? ACC : INK}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="100%" height="100%" fill="${PAPER}"/>
<text x="${L}" y="30" font-family="${SERIF}" font-size="21" fill="${INK}">${esc(title)}</text>
<text x="${L}" y="50" font-family="${SERIF}" font-size="14" font-style="italic" fill="${MUTED}">${esc(subtitle)}</text>
${g}
<text x="${(L + W - R) / 2}" y="${H - 14}" text-anchor="middle" font-family="${SERIF}" font-size="15" font-style="italic" fill="${MUTED}">${esc(xlabel)}</text>
<text transform="translate(18 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" font-family="${SERIF}" font-size="15" font-style="italic" fill="${MUTED}">${esc(ylabel)}</text>
</svg>`;
}

// The kept sectors at one tower index: n(j)(2j+1) and n(J)(2J+1) out of (2j+1)^3.
export function sectorBar({ n, j, J, nj, nJ, D, total }) {
  const W = 760, H = 230, L = 40, R = 40, y = 92, bh = 46;
  const w = W - L - R;
  const a = (nj * (2 * j + 1)) / total, b = (nJ * (2 * J + 1)) / total;
  const xa = L, xb = L + a * w, xc = L + (a + b) * w;
  const big = (v) => (String(v).length > 12 ? Number(v).toExponential(4) : String(v));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="100%" height="100%" fill="${PAPER}"/>
<text x="${L}" y="34" font-family="${SERIF}" font-size="21" fill="${INK}">Kept sectors at n = ${n}  (j = ${big(j)}, J = ${big(J)})</text>
<text x="${L}" y="56" font-family="${SERIF}" font-size="14" font-style="italic" fill="${MUTED}">D = n(j)(2j+1) + n(J)(2J+1) = ${big(D)} of (2j+1)³ = ${big(total)} states</text>
<rect x="${L}" y="${y}" width="${w}" height="${bh}" fill="none" stroke="${INK}" stroke-width="1.5"/>
<rect x="${xa}" y="${y}" width="${Math.max(1, xb - xa)}" height="${bh}" fill="${ACC}"/>
<rect x="${xb}" y="${y}" width="${Math.max(1, xc - xb)}" height="${bh}" fill="${INK}"/>
<text x="${xa}" y="${y + bh + 26}" font-family="${MONO}" font-size="12" fill="${ACC}">E_(μ−σ): n(j)=F_n=${big(nj)} × ${big(2 * j + 1)}</text>
<text x="${xa}" y="${y + bh + 46}" font-family="${MONO}" font-size="12" fill="${INK}">E_(μ+σ): n(J)=F_(n−2)=${big(nJ)} × ${big(2 * J + 1)}</text>
<text x="${W - R}" y="${y + bh + 26}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${MUTED}">kept fraction ${(D / total).toPrecision(6)}</text>
</svg>`;
}

export async function svgToPngBlob(svg, scale = 2) {
  const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const W = m ? +m[1] : 760, H = m ? +m[2] : 420;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
