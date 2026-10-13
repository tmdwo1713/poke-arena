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
    style: { setProperty: noop }, className: '', classList: { add: noop, remove: noop, toggle: noop }, dataset: {}, textContent: '', innerHTML: '', children: [],
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
  const ome = makeMon('omegamon', 50);
  check('Omegamon is fire/ice', ome.sp.types[0] === 'fire' && ome.sp.types[1] === 'ice');
  check('Grey Sword is fire', MOVES.greysword.type === 'fire');
  check('Fire is neutral on fire/ice', typeEffect('fire', ['fire', 'ice']) === 1);
  const gO = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['omegamon'], cpuTeam: ['charizard'], onEnd: () => {} });
  gO.state = 'fight';
  check('Omegamon starts as the normal form', gO.sides[0].mon.sp.id === 90001 && gO.sides[0].mon.sp.name === '오메가몬');
  check('Omegamon X gains All Delete', gO.sides[0].megaEvolve() && gO.sides[0].mon.sp.id === 90002 && gO.sides[0].mon.sp.name === '오메가몬X' && gO.sides[0].mon.moves.some(sl => sl.id === 'alldelete') && !gO.sides[0].mon.moves.some(sl => sl.id === 'icebeam'));
  check('Base Necrozma is hidden', POKEMON_BY_KEY.necrozma.hidden === true);
  const dusk = makeMon('necrozmadusk', 50);
  check('Dusk Mane starts as itself', dusk.sp.id === 10155 && dusk.sp.name === '네크로즈마(황혼의 갈기)');
  const gN = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['necrozmadusk'], cpuTeam: ['snorlax'], onEnd: () => {} });
  gN.state = 'fight';
  check('Dusk Mane becomes Ultra Necrozma', gN.sides[0].megaEvolve() && gN.sides[0].mon.sp.id === 10157 && gN.sides[0].mon.sp.name === '울트라네크로즈마' && gN.sides[0].mon.ability === 'neuroforce' && gN.sides[0].mon.sp.types[0] === 'psychic' && gN.sides[0].mon.sp.types[1] === 'dragon');
  const dawn = makeMon('necrozmadawn', 50);
  const gD = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['necrozmadawn'], cpuTeam: ['snorlax'], onEnd: () => {} });
  gD.state = 'fight';
  check('Dawn Wings starts unfused', dawn.sp.id === 10156);
  check('Dawn Wings becomes Ultra Necrozma', gD.sides[0].megaEvolve() && gD.sides[0].mon.sp.id === 10157 && gD.sides[0].mon.ability === 'neuroforce');
  const gAr = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['arceus'], cpuTeam: ['blastoise'], onEnd: () => {} });
  gAr.state = 'fight';
  gAr.sides[1].iframes = 0;
  check('Arceus starts normal', gAr.sides[0].mon.sp.id === 493 && gAr.sides[0].mon.ability === 'multitype');
  check('Arceus equips the Legend Plate', gAr.sides[0].megaEvolve() && gAr.sides[0].mon.ability === 'legendplate' && gAr.sides[0].mon.sp.name === '아르세우스(레전드플레이트)');
  gAr.performMove(gAr.sides[0], 'flamethrower');
  check('Legend Plate matches the move', gAr.sides[0].mon.sp.types[0] === 'fire' && gAr.sides[0].mon.sp.id === '493-fire');
  gAr.sides[0].gcd = 0;
  gAr.performMove(gAr.sides[0], 'judgment');
  check('Judgment aims at the weakness', gAr.sides[0].mon.sp.types[0] === 'electric' && gAr.sides[0].mon.sp.id === '493-electric');
  const before = gAr.sides[1].mon.hp;
  gAr.applyHit(gAr.sides[0], gAr.sides[0].mon, gAr.sides[1], MOVES.judgment, [1, 0], 91);
  check('Judgment with the plate is super effective', gAr.sides[1].mon.hp < before);
  const forms = POKEMON_BY_KEY.greninja.megas;
  check('Greninja has mega and Ash', forms.length === 2 && forms[1].name === '지우개굴닌자' && forms[1].ability === 'battlebond');
  const gA = new Game({ arena: 'stadium', diff: 0.5, playerTeam: [{ key: 'greninja', mega: 1 }], cpuTeam: ['pikachu'], onEnd: () => {} });
  gA.state = 'fight';
  check('Ash-Greninja evolves', gA.sides[0].megaEvolve() && gA.sides[0].mon.sp.id === 10117 && gA.sides[0].mon.ability === 'battlebond');
  const zard = POKEMON_BY_KEY.charizard;
  check('Charizard mega and Gigantamax are separate', megaForms(zard).length === 2 && megaForms(zard)[0].id === 10034 && gmaxFormOf(zard).id === 10196);
  const gZ = new Game({ arena: 'stadium', diff: 0.5, playerTeam: [{ key: 'charizard' }, { key: 'pikachu' }], cpuTeam: ['snorlax'], onEnd: () => {} });
  gZ.state = 'fight';
  const zHp = gZ.sides[0].mon.maxHp;
  check('Charizard starts normal', gZ.sides[0].mon.sp.id === 6);
  check('Mega does not spend Gigantamax', gZ.sides[0].megaEvolve() && gZ.sides[0].mon.sp.id === 10034 && gZ.megaOK[0] === false && gZ.gmaxOK[0] === true && gZ.sides[0].mon.maxHp !== zHp * 2);
  check('Same Pokemon cannot Gigantamax after mega', gZ.sides[0].canGmax() === false);
  gZ.sides[0].active = 1;
  const pHp = gZ.sides[0].mon.maxHp;
  check('Teammate can still Gigantamax', gZ.sides[0].gmaxEvolve() && gZ.sides[0].mon.sp.id === 10199 && gZ.sides[0].mon.maxHp === pHp * 2 && gZ.gmaxOK[0] === false);
  const gS = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['snorlax'], cpuTeam: ['pikachu'], onEnd: () => {} });
  gS.state = 'fight';
  check('Snorlax Z-Move once', gS.sides[0].useZ() && gS.zOK[0] === false && gS.sides[0].canZ() === false);
  const gW = new Game({ arena: 'stadium', diff: 0.5, watch: true, playerTeam: [{ key: 'charizard', limit: 'mega' }], cpuTeam: [{ key: 'pikachu', limit: 'z' }], onEnd: () => {} });
  gW.state = 'fight';
  check('CPU watch Charizard is mega only', gW.sides[0].canMega() === true && gW.sides[0].canGmax() === false);
  check('CPU watch Pikachu is Z only', gW.sides[1].canZ() === true && gW.sides[1].canGmax() === false);
  const gPlay = new Game({ arena: 'stadium', diff: 0.5, playerTeam: [{ key: 'charizard', limit: 'mega' }], cpuTeam: ['snorlax'], onEnd: () => {} });
  gPlay.state = 'fight';
  check('Player ignores the CPU-only limit', gPlay.sides[0].canMega() === true && gPlay.sides[0].canGmax() === true);
  check('Sirfetchd and Dracovish exist', POKEMON_BY_KEY.sirfetchd.name === '창파나이트' && MOVES.meteorassault.name === '스타어설트' && POKEMON_BY_KEY.dracovish.name === '어래곤' && MOVES.fishiousrend.name === '아가미물기' && MOVES.fishiousrend.first && MOVES.fishiousrend.bite);
  check('Ash Pikachu has 10,000,000 Volt Thunderbolt', POKEMON_BY_KEY.ashpikachu.name === '지우피카츄' && Z_MOVES.ashpikachu === 'tenmillionvolt' && MOVES.tenmillionvolt.name === '1000만볼트' && MOVES.tenmillionvolt.z && Z_MOVES.pikachu === 'catastropika');
  check('Eternatus can Gigantamax', gmaxFormOf(POKEMON_BY_KEY.eternatus).id === 10190 && gmaxFormOf(POKEMON_BY_KEY.eternatus).name === '거다이맥스무한다이노');
  const tapuKeys = ['tapukoko', 'tapulele', 'tapubulu', 'tapufini'];
  const tapuNames = ['카푸꼬꼬꼭', '카푸나비나', '카푸브루루', '카푸느지느'];
  check('Tapus share Natures Madness and Guardian of Alola', tapuKeys.every((k, i) => POKEMON_BY_KEY[k] && POKEMON_BY_KEY[k].legend && POKEMON_BY_KEY[k].name === tapuNames[i] && POKEMON_BY_KEY[k].moves.includes('naturesmadness') && Z_MOVES[k] === 'guardianofalola') && MOVES.naturesmadness.name === '자연의분노' && MOVES.naturesmadness.halfHp && MOVES.guardianofalola.name === '알로라의수호자' && MOVES.guardianofalola.hpRatio === 0.75 && MOVES.guardianofalola.z);
  const gKoko = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['tapukoko'], cpuTeam: ['snorlax'], onEnd: () => {} });
  check('Tapu Koko sets Electric Terrain', gKoko.terrain && gKoko.terrain.type === 'electric' && POKEMON_BY_KEY.tapukoko.ability === 'electricsurge');
  const gFini = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['tapufini'], cpuTeam: ['snorlax'], onEnd: () => {} });
  check('Tapu Fini sets Misty Terrain', gFini.terrain && gFini.terrain.type === 'misty' && POKEMON_BY_KEY.tapulele.ability === 'psychicsurge' && POKEMON_BY_KEY.tapubulu.ability === 'grassysurge');
  const addedMons = { clefable: '픽시', serperior: '샤로다', cetitan: '우락고래', archaludon: '브리두라스', raikou: '라이코', jirachi: '지라치', terrakion: '테라키온', marshadow: '마샤도', zeraora: '제라오라', melmetal: '멜메탈', ogerpon: '오거폰', calyrexshadow: '버드렉스(흑마 탄 모습)' };
  check('Added finals and legends', Object.entries(addedMons).every(([k, n]) => POKEMON_BY_KEY[k] && POKEMON_BY_KEY[k].name === n && POKEMON_BY_KEY[k].ability));
  check('Added beasts and swords are legendary', ['raikou', 'entei', 'suicune', 'cobalion', 'terrakion', 'virizion', 'ogerpon', 'calyrexice'].every(k => POKEMON_BY_KEY[k].legend));
  const gRain = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['politoed'], cpuTeam: ['snorlax'], onEnd: () => {} });
  check('Politoed sets rain', gRain.weather && gRain.weather.type === 'rain');
  const gH = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['breloom'], cpuTeam: ['pikachu'], onEnd: () => {} });
  const rolls = {};
  for (let i = 0; i < 400; i++) {
    const n = gH.shotCount(MOVES.bulletseed, { ability: '' });
    rolls[n] = (rolls[n] || 0) + 1;
  }
  check('Bullet Seed rolls 2 to 5', [2, 3, 4, 5].every(k => rolls[k] > 0) && !rolls[1] && !rolls[6]);
  check('Three shots are more common than five', rolls[3] > rolls[5] && rolls[2] > rolls[4]);
  check('Skill Link fires 5 seeds', gH.shotCount(MOVES.bulletseed, { ability: 'skilllink' }) === 5);
  check('Battle Bond shuriken is 3', gH.shotCount(MOVES.watershuriken, { ability: 'battlebond' }) === 3);
  check('Dragon Darts stays 2', gH.shotCount(MOVES.dragondarts, { ability: '' }) === 2);
}
abilityTests();
runSim(${parseInt(process.argv[2] || '20', 10)});
`;
vm.runInContext(code, sandbox);
