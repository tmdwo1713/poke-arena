// Headless CPU-vs-CPU battle simulation for catching runtime errors. Usage: node tools/sim.js [battles]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const noop = () => {};
const ctx2d = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : noop),
  set: (t, k, v) => { t[k] = v; return true; },
});
function fakeEl() {
  return {
    style: { setProperty: noop }, className: '', textContent: '', innerHTML: '', children: [],
    appendChild(c) { this.children.push(c); return c; }, getContext: () => ctx2d,
    naturalWidth: 60, naturalHeight: 60, offsetWidth: 0,
    set src(v) { this._src = v; if (this.onload) this.onload(); }, get src() { return this._src; },
  };
}
const els = {};
const sandbox = {
  console, Math, JSON, Set, Map, Object, Array, String, Number, Infinity, setTimeout: noop, clearTimeout: noop,
  localStorage: { getItem: () => null, setItem: noop },
  document: { getElementById: id => (els[id] = els[id] || fakeEl()), createElement: () => fakeEl() },
  Image: function () { return fakeEl(); },
  window: {},
  Input: { down: new Set(), pressed: new Set() },
};
vm.createContext(sandbox);
const root = path.join(__dirname, '..');
let code = '';
for (const f of ['js/data.js', 'js/audio.js', 'js/game.js']) code += fs.readFileSync(path.join(root, f), 'utf8') + '\n';
code += `
function runSim(n) {
  const keys = POKEMON.map(p => p.key);
  const pick = () => { const a = keys.slice(), o = []; while (o.length < TEAM_SIZE) o.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return o; };
  const arenas = Object.keys(ARENAS);
  let wins = 0, total = 0, maxT = 0, timeouts = 0;
  for (let i = 0; i < n; i++) {
    const g = new Game({ arena: arenas[i % arenas.length], diff: ${parseFloat(process.argv[4] || '0.7')}, playerTeam: pick(), cpuTeam: pick(), onEnd: () => {} });
    g.sides[0].ai = new AI(g.sides[0], ${parseFloat(process.argv[3] || '0.7')});
    let t = 0;
    while (!g.ended && t < 600) { g.update(1 / 60); g.render(); t += 1 / 60; }
    if (!g.ended) timeouts++;
    if (g.winner === 0) wins++;
    total += g.time; maxT = Math.max(maxT, g.time);
    for (const s of g.sides) for (const m of s.team) if (isNaN(m.hp)) throw new Error('NaN hp ' + m.sp.key);
  }
  console.log('battles', n, 'p0 wins', wins, 'avg time', (total / n).toFixed(1), 'max', maxT.toFixed(1), 'timeouts', timeouts);
}
function abilityTests() {
  const hit = (atkKey, defKey, moveId) => {
    const g = new Game({ arena: 'stadium', diff: 0.5, playerTeam: [atkKey], cpuTeam: [defKey], onEnd: () => {} });
    g.state = 'fight';
    const [a, d] = g.sides;
    d.iframes = 0;
    const before = d.mon.hp;
    const res = g.applyHit(a, a.mon, d, MOVES[moveId], [1, 0], 1);
    return { res, before, after: d.mon.hp, g, a, d };
  };
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let r;
  check('Shedinja HP is 1', makeMon('shedinja', 50).maxHp === 1);
  r = hit('pikachu', 'shedinja', 'thunderbolt'); check('Wonder Guard blocks neutral electric', r.res === 'immune' && r.after === 1);
  r = hit('machamp', 'shedinja', 'crosschop'); check('Wonder Guard: fighting does nothing', r.res === 'immune' && r.after === 1);
  r = hit('charizard', 'shedinja', 'flamethrower'); check('Super-effective fire KOs Shedinja', r.res === 'hit' && r.after === 0);
  r = hit('excadrill', 'shedinja', 'earthquake'); check('Mold Breaker pierces Wonder Guard', r.res === 'hit' && r.after === 0);
  r = hit('pikachu', 'shedinja', 'struggle'); check('Typeless Struggle hits Shedinja', r.res === 'hit' && r.after === 0);
  r = hit('pikachu', 'shedinja', 'thunderbolt'); r.g.applyStatus(r.d, 'psn'); for (let i = 0; i < 90; i++) r.g.update(1 / 60);
  check('Poison damage KOs Shedinja', r.d.mon.fainted);
  r = hit('pikachu', 'jolteon', 'thunderbolt'); check('Volt Absorb immune', r.res === 'immune');
  r = hit('garchomp', 'latios', 'earthquake'); check('Levitate immune to ground', r.res === 'immune');
  r = hit('pikachu', 'mimikyu', 'thunderbolt'); check('Disguise takes 1/8 only', r.before - r.after === Math.max(1, Math.round(r.d.mon.maxHp / 8)) && r.d.mon.disguiseBroken);
  r = hit('charizard', 'arcanine', 'flamethrower'); check('Flash Fire activates', r.res === 'immune' && r.d.mon.flashFire);
  const g = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['gyarados'], cpuTeam: ['snorlax'], onEnd: () => {} });
  check('Intimidate lowers foe attack', Math.abs(g.sides[1].mon.atkMod - 2 / 3) < 1e-9);
  const g2 = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['groudon'], cpuTeam: ['kyogre'], onEnd: () => {} });
  check('Weather set on entry', g2.weather && (g2.weather.type === 'rain' || g2.weather.type === 'sun'));
  const g3 = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['gardevoir'], cpuTeam: ['gyarados'], onEnd: () => {} });
  g3.onEntry(g3.sides[0]);
  check('Trace copies ability', g3.sides[0].mon.ability === 'intimidate');
  check('AI sees Wonder Guard', moveEffect(makeMon('pikachu', 50), MOVES.thunderbolt, makeMon('shedinja', 50)) === 0);
  const zac = makeMon('zacian', 50);
  check('Zacian starts in Crowned form', zac.sp.types.includes('steel') && zac.sp.types.includes('fairy'));
  const g4 = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['ditto'], cpuTeam: ['charizard'], onEnd: () => {} });
  check('Ditto transforms on entry', g4.sides[0].mon.transformed && g4.sides[0].mon.sp.key === 'charizard');
  const g5 = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['charizard'], cpuTeam: ['blastoise'], onEnd: () => {} });
  g5.state = 'fight';
  check('Charizard can Mega', g5.sides[0].canMega());
  check('Mega Charizard succeeds', g5.sides[0].megaEvolve() && g5.sides[0].mon.megaed && g5.sides[0].mon.sp.mega);
  check('Only one Mega per team', !g5.sides[0].canMega());
  const pool = movePool(POKEMON_BY_KEY.charizard);
  check('Random move pool is big enough', pool.length >= 6);
  const rm = randomMoves(POKEMON_BY_KEY.charizard);
  check('Random 4 moves', rm.length === 4 && rm.every(id => MOVES[id]));
  check('Rayquaza is legendary', !!POKEMON_BY_KEY.rayquaza.legend);
  check('Requested mons exist', ['pachirisu', 'zacian', 'zamazenta', 'rotom', 'ditto'].every(k => POKEMON_BY_KEY[k]));
  const rat = makeMon('rattata', 50);
  check('Rattata is lv100', rat.level === 100);
  check('Rattata has Mold Breaker', rat.ability === 'moldbreaker');
  check('Rattata knows Hyper Beam', rat.moves.some(sl => sl.id === 'hyperbeam'));
  const gro = makeMon('groudon', 50);
  check('Groudon Primal Reversion', gro.sp.primaled && gro.sp.types.includes('fire') && gro.ability === 'desolateland');
  const kyo = makeMon('kyogre', 50);
  check('Kyogre Primal Reversion', kyo.sp.primaled && kyo.ability === 'primordialsea');
  const gSea = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['kyogre'], cpuTeam: ['charizard'], onEnd: () => {} });
  gSea.state = 'fight';
  gSea.sides[1].iframes = 0;
  const fireRes = gSea.applyHit(gSea.sides[1], gSea.sides[1].mon, gSea.sides[0], MOVES.flamethrower, [1, 0], 77);
  check('Fire fails in Primordial Sea', fireRes === 'immune');
  const gLand = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['groudon'], cpuTeam: ['blastoise'], onEnd: () => {} });
  gLand.state = 'fight';
  gLand.sides[1].iframes = 0;
  const waterRes = gLand.applyHit(gLand.sides[1], gLand.sides[1].mon, gLand.sides[0], MOVES.hydropump, [1, 0], 78);
  check('Water fails in Desolate Land', waterRes === 'immune');
  const gFfa = new Game({ ffa: true, arena: 'stadium', diff: 0.7, playerTeam: ['rattata', 'pikachu', 'charizard', 'blastoise', 'venusaur', 'gengar'], cpuTeam: [], onEnd: () => {} });
  check('FFA has 6 fighters', gFfa.sides.length === 6 && gFfa.ffa);
  gFfa.sides[0].ai = new AI(gFfa.sides[0], 0.7);
  let ft = 0;
  while (!gFfa.ended && ft < 600) { gFfa.update(1 / 60); gFfa.render(); ft += 1 / 60; }
  check('FFA ends with one winner', gFfa.ended && gFfa.livingSides().length <= 1);
  const rF = gFfa.result();
  check('FFA result ranking', rF.ffa && rF.ranking.length === 6 && rF.winnerName);
}
abilityTests();
runSim(${parseInt(process.argv[2] || '20', 10)});
`;
vm.runInContext(code, sandbox);
