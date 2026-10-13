// 데이터 참조 검사: node tools/check-data.js
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8') +
  '\nthis.P = POKEMON; this.M = MOVES; this.A = ABILITIES; this.pool = movePool;', ctx);
const bad = [];
for (const p of ctx.P) {
  for (const m of p.moves) if (!ctx.M[m]) bad.push(`${p.key}: move ${m}`);
  for (const m of p.extra || []) if (!ctx.M[m]) bad.push(`${p.key}: extra ${m}`);
  if (!ctx.A[p.ability]) bad.push(`${p.key}: ability`);
  for (const f of p.megas || []) if (!ctx.A[f.ability]) bad.push(`${f.key}: ability ${f.ability}`);
}
const keys = ctx.P.map(p => p.key);
if (new Set(keys).size !== keys.length) bad.push('duplicate keys');
const pools = ctx.P.map(p => ctx.pool(p).length);
console.log(`${ctx.P.length} pokemon, ${Object.keys(ctx.M).length} moves, pool ${Math.min(...pools)}~${Math.max(...pools)}`);
console.log(bad.length ? bad.join('\n') : 'OK');
