// Line diff (LCS) with context folding. Fine for scripts and run outputs of a few thousand lines.
export function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  let pre = 0; while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0; while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf), b2 = B.slice(pre, B.length - suf);
  const ops = [];
  for (let i = 0; i < pre; i++) ops.push([' ', A[i]]);
  if (a2.length * b2.length > 9e6) { a2.forEach((l) => ops.push(['-', l])); b2.forEach((l) => ops.push(['+', l])); }
  else {
    const n = a2.length, m = b2.length, W = m + 1;
    const T = new Uint32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * W + j] = a2[i] === b2[j] ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a2[i] === b2[j]) { ops.push([' ', a2[i]]); i++; j++; }
      else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) ops.push(['-', a2[i++]]);
      else ops.push(['+', b2[j++]]);
    }
    while (i < n) ops.push(['-', a2[i++]]);
    while (j < m) ops.push(['+', b2[j++]]);
  }
  for (let i = A.length - suf; i < A.length; i++) ops.push([' ', A[i]]);
  return ops;
}

export function diffStats(ops) {
  return { added: ops.filter((o) => o[0] === '+').length, removed: ops.filter((o) => o[0] === '-').length };
}

// Render to HTML, folding unchanged runs longer than 2*ctx.
export function diffHTML(ops, ctx = 3) {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const keep = ops.map(() => false);
  ops.forEach((o, i) => { if (o[0] !== ' ') for (let k = Math.max(0, i - ctx); k <= Math.min(ops.length - 1, i + ctx); k++) keep[k] = true; });
  let out = '', skipped = 0;
  ops.forEach((o, i) => {
    if (!keep[i]) { skipped++; return; }
    if (skipped) { out += `<div class="hunk">  ⋯ ${skipped} unchanged line${skipped > 1 ? 's' : ''}</div>`; skipped = 0; }
    const cls = o[0] === '+' ? 'add' : o[0] === '-' ? 'del' : 'ctx';
    out += `<div class="${cls}">${o[0]} ${esc(o[1])}</div>`;
  });
  if (skipped) out += `<div class="hunk">  ⋯ ${skipped} unchanged line${skipped > 1 ? 's' : ''}</div>`;
  return out || '<div class="ctx">  (identical)</div>';
}
