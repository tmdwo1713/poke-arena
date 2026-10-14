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
  r = hit('pikachu', 'shedinja', 'thunderbolt'); r.g.applyStatus(r.d, 'psn'); for (let i = 0; i < 240; i++) r.g.update(1 / 60);
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
  const rowlet = makeMon('rowlet', 50);
  check('Rowlet is lv100', rowlet.level === 100 && rowlet.sp.name === '나몰빼미' && rowlet.ability === 'overgrow' && rowlet.sp.types[0] === 'grass' && rowlet.sp.types[1] === 'flying');
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
  check('Teammate can still Gigantamax', gZ.sides[0].gmaxEvolve() && gZ.sides[0].mon.sp.id === 10199 && gZ.sides[0].mon.maxHp === pHp * 2 && gZ.gmaxOK[0] === false && gZ.sides[0].mon.dmax !== true);
  check('Gigantamax Pikachu uses G-Max Volt Crash', battleMove(gZ.sides[0].mon, 'thunderbolt').name === '거다이만뢰' && battleMove(gZ.sides[0].mon, 'irontail').name === '다이스틸' && battleMove(gZ.sides[0].mon, 'hypnosis').name === '다이월');
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
  check('Clefable has no Gigantamax form', !gmaxFormOf(POKEMON_BY_KEY.clefable) && gmaxFormOf(POKEMON_BY_KEY.snorlax));
  const gDmax = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['clefable'], cpuTeam: ['snorlax'], onEnd: () => {} });
  gDmax.state = 'fight';
  const dHp = gDmax.sides[0].mon.maxHp;
  const dId = gDmax.sides[0].mon.sp.id;
  check('Dynamax doubles HP without changing species', gDmax.sides[0].gmaxEvolve() && gDmax.sides[0].mon.dmax === true && !gDmax.sides[0].mon.gmax && gDmax.sides[0].mon.maxHp === dHp * 2 && gDmax.sides[0].mon.sp.id === dId && gDmax.gmaxOK[0] === false);
  const maxWater = battleMove(gDmax.sides[0].mon, 'surf');
  const maxGuard = battleMove(gDmax.sides[0].mon, 'hypnosis');
  const plain = battleMove({ dmax: false }, 'surf');
  check('Dynamax turns moves into Max Moves', maxWater.name === '다이스트림' && maxWater.type === 'water' && maxWater.power === 130 && maxWater.maxEffect === 'rain' && maxGuard.name === '다이월' && maxGuard.kind === 'guard' && plain.name === '파도타기');
  gDmax.sides[0].mon.moves[0] = { id: 'flamethrower', pp: 15, maxPp: 15, cd: 0 };
  check('Max Flare sets the sun', gDmax.sides[0].useMove(0) && gDmax.weather && gDmax.weather.type === 'sun');
  const gEnd = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['clefable'], cpuTeam: ['snorlax'], onEnd: () => {} });
  gEnd.state = 'fight';
  const eHp = gEnd.sides[0].mon.maxHp;
  gEnd.sides[0].gmaxEvolve();
  gEnd.sides[0].mon.hp = eHp;
  gEnd.sides[0].mon.giantT = 0.02;
  gEnd.sides[0].update(0.05);
  check('Dynamax ends after its timer', gEnd.sides[0].mon.dmax !== true && gEnd.sides[0].mon.maxHp === eHp && gEnd.sides[0].mon.hp === Math.round(eHp * 0.5) && battleMove(gEnd.sides[0].mon, 'surf').name === '파도타기' && gEnd.sides[0].canMega() === false);
  const gPika = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['pikachu'], cpuTeam: ['snorlax'], onEnd: () => {} });
  gPika.state = 'fight';
  const pkHp = gPika.sides[0].mon.maxHp;
  gPika.sides[0].gmaxEvolve();
  gPika.sides[0].mon.hp = pkHp;
  gPika.sides[0].mon.giantT = 0.02;
  gPika.sides[0].update(0.05);
  check('Gigantamax ends and restores the form', gPika.sides[0].mon.gmax !== true && gPika.sides[0].mon.sp.id === 25 && gPika.sides[0].mon.maxHp === pkHp && battleMove(gPika.sides[0].mon, 'thunderbolt').name === MOVES.thunderbolt.name);
  const gLax = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['snorlax'], cpuTeam: ['pikachu'], onEnd: () => {} });
  gLax.state = 'fight';
  check('Snorlax still Gigantamaxes', gLax.sides[0].gmaxEvolve() && gLax.sides[0].mon.gmax && !gLax.sides[0].mon.dmax && gLax.sides[0].mon.sp.id === 10206 && battleMove(gLax.sides[0].mon, 'bodyslam').name === '거다이재생' && battleMove(gLax.sides[0].mon, 'surf').name === '다이스트림' && battleMove(gLax.sides[0].mon, 'bodyslam').maxEffect === 'heal');
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
  const gGl = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['glalie'], cpuTeam: ['pikachu'], onEnd: () => {} });
  gGl.state = 'fight';
  check('Glalie can Mega with Refrigerate', gGl.sides[0].megaEvolve() && gGl.sides[0].mon.sp.id === 10074 && gGl.sides[0].mon.ability === 'refrigerate' && attackType(gGl.sides[0].mon, MOVES.quickattack) === 'ice');
  check('Missing classic megas', ['sableye', 'camerupt', 'banette', 'diancie'].every(k => POKEMON_BY_KEY[k].megas && POKEMON_BY_KEY[k].megas[0].id));
  check('Sableye mega id', POKEMON_BY_KEY.sableye.megas[0].id === 10066 && POKEMON_BY_KEY.camerupt.megas[0].id === 10087 && POKEMON_BY_KEY.banette.megas[0].id === 10056 && POKEMON_BY_KEY.diancie.megas[0].id === 10075);
  const gDr = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['drednaw'], cpuTeam: ['pikachu'], onEnd: () => {} });
  gDr.state = 'fight';
  check('Drednaw Gigantamax uses Stonesurge', gDr.sides[0].gmaxEvolve() && gDr.sides[0].mon.sp.id === 10214 && battleMove(gDr.sides[0].mon, 'liquidation').name === '거다이암진' && battleMove(gDr.sides[0].mon, 'stoneedge').name === '다이록');
  const gMe = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['melmetal'], cpuTeam: ['pikachu'], onEnd: () => {} });
  gMe.state = 'fight';
  check('Melmetal Gigantamax uses Meltdown', gMe.sides[0].gmaxEvolve() && gMe.sides[0].mon.sp.id === 10208 && battleMove(gMe.sides[0].mon, 'doubleironbash').name === '거다이융격' && battleMove(gMe.sides[0].mon, 'earthquake').name === '다이아스');
  check('Lycanroc forms', POKEMON_BY_KEY.lycanroc.name === '루가루암' && POKEMON_BY_KEY.lycanroc.id === 745 && POKEMON_BY_KEY.lycanrocmidnight.name === '루가루암(한밤중)' && POKEMON_BY_KEY.lycanrocmidnight.id === 10126 && POKEMON_BY_KEY.lycanrocdusk.name === '루가루암(황혼)' && POKEMON_BY_KEY.lycanrocdusk.id === 10152 && POKEMON_BY_KEY.lycanrocmidnight.ability === 'noguard' && POKEMON_BY_KEY.lycanrocdusk.ability === 'toughclaws');
  check('Z-A megas for existing species', POKEMON_BY_KEY.meganium.megas[0].id === 10282 && POKEMON_BY_KEY.clefable.megas[0].types.includes('flying') && POKEMON_BY_KEY.raichu.megas.length === 2 && POKEMON_BY_KEY.raichu.megas[1].id === 10305 && POKEMON_BY_KEY.garchomp.megas[1].id === 10309 && POKEMON_BY_KEY.absol.megas[1].id === 10307 && POKEMON_BY_KEY.baxcalibur.megas[0].id === 10325 && POKEMON_BY_KEY.zygarde.megas[0].base[0] === 216);
  check('Lycanroc learns Accelerock and Counter', POKEMON_BY_KEY.lycanroc.moves.includes('accelerock') && POKEMON_BY_KEY.lycanrocmidnight.moves.includes('counter') && MOVES.accelerock.type === 'rock' && MOVES.counter.counter === 2 && moveText(MOVES.accelerock).includes('바위') && moveText(MOVES.icywind).includes('스피드'));
  check('New gmax and mega species', POKEMON_BY_KEY.butterfree.megas[0].id === 10198 && GMAX_MOVES.butterfree.name === '거다고혹' && POKEMON_BY_KEY.eevee.megas[0].id === 10205 && POKEMON_BY_KEY.meowth.megas[0].id === 10200 && POKEMON_BY_KEY.beedrill.megas[0].id === 10090 && POKEMON_BY_KEY.duraludon.megas[0].gmax && GMAX_MOVES.duraludon.name === '거다이감쇠' && POKEMON_BY_KEY.golisopod.moves.includes('firstimpression') && POKEMON_BY_KEY.flapple.moves.includes('gravapple'));
  const gCt = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['lycanrocmidnight'], cpuTeam: ['snorlax'], onEnd: () => {} });
  gCt.state = 'fight';
  gCt.sides[1].iframes = 0;
  check('Counter stance is armed', gCt.sides[0].useMove(0) && gCt.sides[0].counterT > 0);
  const hp0 = gCt.sides[0].mon.hp;
  gCt.applyHit(gCt.sides[1], gCt.sides[1].mon, gCt.sides[0], MOVES.bodyslam, [-1, 0], 3);
  check('Counter returns physical damage', gCt.sides[1].mon.hp < gCt.sides[1].mon.maxHp && gCt.sides[0].mon.hp < hp0);
  const gBf = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['butterfree'], cpuTeam: ['pikachu'], onEnd: () => {} });
  gBf.state = 'fight';
  check('Butterfree Gigantamax befuddles', gBf.sides[0].gmaxEvolve() && battleMove(gBf.sides[0].mon, 'bugbuzz').name === '거다고혹' && battleMove(gBf.sides[0].mon, 'bugbuzz').maxEffect === 'befuddle');
  check('Cinderace signature is Pyro Ball and G-Max Fireball', POKEMON_BY_KEY.cinderace.moves[0] === 'pyroball' && MOVES.pyroball.name === '파이로볼' && GMAX_MOVES.cinderace.name === '거다이화염구' && POKEMON_BY_KEY.rillaboom.moves[0] === 'drumbeating' && GMAX_MOVES.rillaboom.name === '거다이난타' && POKEMON_BY_KEY.melmetal.moves[0] === 'doubleironbash' && MOVES.magicpowder.powder && MOVES.topsyturvy.invert);
  check('Zygarde learns signature moves', POKEMON_BY_KEY.zygarde.ability === 'powerconstruct' && POKEMON_BY_KEY.zygarde.moves[0] === 'thousandarrows' && MOVES.thousandarrows.name === '사우전드애로' && MOVES.coreenforcer.name === '코어퍼니셔' && POKEMON_BY_KEY.zygarde.completeForm.id === 10120);
  const gZy = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['zygarde'], cpuTeam: ['charizard'], onEnd: () => {} });
  gZy.state = 'fight';
  gZy.sides[1].iframes = 0;
  const flyHp = gZy.sides[1].mon.hp;
  gZy.applyHit(gZy.sides[0], gZy.sides[0].mon, gZy.sides[1], MOVES.thousandarrows, [1, 0], 8);
  check('Thousand Arrows grounds Flying', gZy.sides[1].mon.hp < flyHp && gZy.sides[1].mon.grounded === true);
  gZy.sides[1].acted = true;
  gZy.applyHit(gZy.sides[0], gZy.sides[0].mon, gZy.sides[1], MOVES.coreenforcer, [1, 0], 9);
  check('Core Enforcer removes an ability already used', gZy.sides[1].mon.ability === 'suppressed' && ABILITIES.suppressed.name === '특성 없음');
  const zy = gZy.sides[0].mon;
  const zyMax = zy.maxHp;
  zy.hp = Math.floor(zyMax / 2) + 1;
  gZy.sides[0].iframes = 0;
  gZy.applyHit(gZy.sides[1], gZy.sides[1].mon, gZy.sides[0], Object.assign({}, MOVES.earthquake, { power: 400 }), [-1, 0], 10);
  check('Zygarde becomes Complete Form at half HP', zy.complete === true && zy.sp.id === 10120 && zy.sp.name === '지가르데(퍼펙트폼)' && zy.maxHp > zyMax && zy.hp > 0);
  const gKnock = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['zygarde'], cpuTeam: ['charizard'], onEnd: () => {} });
  gKnock.state = 'fight';
  gKnock.sides[0].iframes = 0;
  const knockMax = gKnock.sides[0].mon.maxHp;
  gKnock.applyHit(gKnock.sides[1], gKnock.sides[1].mon, gKnock.sides[0], Object.assign({}, MOVES.earthquake, { power: 999 }), [-1, 0], 11);
  check('Power Construct survives a hit through half HP', gKnock.sides[0].mon.complete === true && gKnock.sides[0].mon.sp.id === 10120 && gKnock.sides[0].mon.hp > 0 && gKnock.sides[0].mon.maxHp > knockMax && !gKnock.sides[0].mon.fainted);
  const ubKeys = ['nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon'];
  check('Ultra Beasts are in the dex', ubKeys.every(k => POKEMON_BY_KEY[k] && POKEMON_BY_KEY[k].legend && POKEMON_BY_KEY[k].ability === 'beastboost') && POKEMON_BY_KEY.nihilego.name === '텅비드' && POKEMON_BY_KEY.blacephalon.name === '두파팡' && POKEMON_BY_KEY.blacephalon.moves[0] === 'mindblown' && MOVES.mindblown.name === '마인드블로');
  const gUb = new Game({ arena: 'stadium', diff: 0.5, playerTeam: ['kartana'], cpuTeam: ['shedinja'], onEnd: () => {} });
  gUb.state = 'fight';
  gUb.sides[1].lastHitBy = gUb.sides[0];
  gUb.faint(gUb.sides[1]);
  check('Beast Boost raises Kartana attack', gUb.sides[0].mon.atkMod === 1.5 && gUb.sides[0].mon.speMod === 1);
}
abilityTests();
runSim(${parseInt(process.argv[2] || '20', 10)});
`;
vm.runInContext(code, sandbox);
