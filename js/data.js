'use strict';

const TYPES = {
  normal:   { ko: '노말',   color: '#a8a77a' },
  fire:     { ko: '불꽃',   color: '#ee8130' },
  water:    { ko: '물',     color: '#6390f0' },
  electric: { ko: '전기',   color: '#f7d02c' },
  grass:    { ko: '풀',     color: '#7ac74c' },
  ice:      { ko: '얼음',   color: '#96d9d6' },
  fighting: { ko: '격투',   color: '#c22e28' },
  poison:   { ko: '독',     color: '#a33ea1' },
  ground:   { ko: '땅',     color: '#e2bf65' },
  flying:   { ko: '비행',   color: '#a98ff3' },
  psychic:  { ko: '에스퍼', color: '#f95587' },
  bug:      { ko: '벌레',   color: '#a6b91a' },
  rock:     { ko: '바위',   color: '#b6a136' },
  ghost:    { ko: '고스트', color: '#735797' },
  dragon:   { ko: '드래곤', color: '#6f35fc' },
  dark:     { ko: '악',     color: '#705746' },
  steel:    { ko: '강철',   color: '#b7b7ce' },
  fairy:    { ko: '페어리', color: '#d685ad' },
  none:     { ko: '???',    color: '#888888' },
};

// 공격 타입 -> { 방어 타입: 배율 } (1배는 생략)
const TYPE_CHART = {
  normal:   { rock: .5, ghost: 0, steel: .5 },
  fire:     { fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5, steel: 2, fairy: .5 },
  water:    { fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 },
  electric: { water: 2, electric: .5, grass: .5, ground: 0, flying: 2, dragon: .5 },
  grass:    { fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5, steel: .5 },
  ice:      { fire: .5, water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2, steel: .5 },
  fighting: { normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: .5 },
  poison:   { grass: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: .5, poison: 2, flying: 0, bug: .5, rock: 2, steel: 2 },
  flying:   { electric: .5, grass: 2, fighting: 2, bug: 2, rock: .5, steel: .5 },
  psychic:  { fighting: 2, poison: 2, psychic: .5, dark: 0, steel: .5 },
  bug:      { fire: .5, grass: 2, fighting: .5, poison: .5, flying: .5, psychic: 2, ghost: .5, dark: 2, steel: .5, fairy: .5 },
  rock:     { fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2, steel: .5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: .5 },
  dragon:   { dragon: 2, steel: .5, fairy: 0 },
  dark:     { fighting: .5, psychic: 2, ghost: 2, dark: .5, fairy: .5 },
  steel:    { fire: .5, water: .5, electric: .5, ice: 2, rock: 2, steel: .5, fairy: 2 },
  fairy:    { fire: .5, fighting: 2, poison: .5, dragon: 2, dark: 2, steel: .5 },
  none:     {},
};

function typeEffect(atkType, defTypes) {
  let m = 1;
  for (const t of defTypes) {
    const v = TYPE_CHART[atkType] && TYPE_CHART[atkType][t];
    if (v !== undefined) m *= v;
  }
  return m;
}

// 레전드플레이트: 심판의뭉치는 상대에게 가장 잘 통하는 타입으로 맞춘다.
function bestPlateType(defTypes) {
  let best = 'normal', score = -1;
  for (const t of Object.keys(TYPES)) {
    if (t === 'none') continue;
    const eff = typeEffect(t, defTypes);
    if (eff > score) { score = eff; best = t; }
  }
  return best;
}
function plateAttackType(srcMon, mv, defMon) {
  if (!srcMon || srcMon.ability !== 'legendplate' || !mv || mv.type === 'none') return null;
  if (mv.id === 'judgment') return defMon ? bestPlateType(defMon.sp.types) : (srcMon.sp.plate || 'normal');
  return mv.type;
}
const ARCEUS_SPRITE = {
  normal: '493', fire: '493-fire', water: '493-water', electric: '493-electric', grass: '493-grass',
  ice: '493-ice', fighting: '493-fighting', poison: '493-poison', ground: '493-ground', flying: '493-flying',
  psychic: '493-psychic', bug: '493-bug', rock: '493-rock', ghost: '493-ghost', dragon: '493-dragon',
  dark: '493-dark', steel: '493-steel', fairy: '493-fairy',
};

const STATUS = {
  brn: { ko: '화상', color: '#f08030' },
  par: { ko: '마비', color: '#e8b800' },
  frz: { ko: '얼음', color: '#58b8c8' },
  psn: { ko: '독',   color: '#a040a0' },
};

/*
  kind:
    proj   - 투사체 (speed, r, range, count, spread, homing, multiHit)
    beam   - 차지 후 직선 광선 (charge, width, length)
    melee  - 근접 베기 (reach, arc)
    dash   - 돌진 (dist, speed)
    nova   - 자신 주위 범위 (radius)
    target - 상대 위치에 예고 후 낙하 (delay, radius)
  flags:
    sig    - 전용기 (랜덤 기술 뽑기에 나오지 않음)
    punch / bite / pulse / ball - 철주먹·옹골찬턱·메가런처·방탄 판정
    facade - 자신이 상태이상이면 위력 2배,  hex - 상대가 상태이상이면 위력 2배
    useDef - 공격 대신 방어로 데미지 계산,  targetDef - 상대의 특방 대신 방어로 계산
*/
const MOVES = {
  // 노말
  quickattack:  { name: '전광석화',     type: 'normal',   cat: 'phy', power: 40,  pp: 30, cd: 1.0, kind: 'dash',  dist: 170, speed: 1100, priority: true },
  extremespeed: { name: '신속',         type: 'normal',   cat: 'phy', power: 80,  pp: 10, cd: 2.2, kind: 'dash',  dist: 260, speed: 1400, priority: true, sig: true },
  bodyslam:     { name: '누르기',       type: 'normal',   cat: 'phy', power: 85,  pp: 15, cd: 2.0, kind: 'dash',  dist: 160, speed: 800, status: ['par', .3], kb: 420 },
  gigaimpact:   { name: '기가임팩트',   type: 'normal',   cat: 'phy', power: 150, pp: 5,  cd: 6.0, kind: 'dash',  dist: 230, speed: 900, kb: 560, selfStun: .8 },
  hyperbeam:    { name: '파괴광선',     type: 'normal',   cat: 'spe', power: 150, pp: 5,  cd: 6.0, kind: 'beam',  charge: .8, width: 34, length: 820, selfStun: .8 },
  swift:        { name: '스피드스타',   type: 'normal',   cat: 'spe', power: 30,  pp: 20, cd: 1.3, kind: 'proj',  speed: 520, r: 9, range: 520, count: 3, spread: .3, homing: 3, multiHit: true, fx: 'star' },
  takedown:     { name: '돌진',         type: 'normal',   cat: 'phy', power: 90,  pp: 15, cd: 2.0, kind: 'dash',  dist: 190, speed: 900, recoil: .25 },
  doubleedge:   { name: '이판사판태클', type: 'normal',   cat: 'phy', power: 120, pp: 15, cd: 3.0, kind: 'dash',  dist: 240, speed: 1000, recoil: .33 },
  facade:       { name: '객기',         type: 'normal',   cat: 'phy', power: 70,  pp: 20, cd: 1.3, kind: 'melee', reach: 66, arc: 1.5, facade: true },
  hypervoice:   { name: '하이퍼보이스', type: 'normal',   cat: 'spe', power: 90,  pp: 10, cd: 2.4, kind: 'nova',  radius: 150, sound: true },
  triattack:    { name: '트라이어택',   type: 'normal',   cat: 'spe', power: 80,  pp: 10, cd: 1.7, kind: 'proj',  speed: 600, r: 13, range: 540, status: ['tri', .2], fx: 'star' },
  struggle:     { name: '발버둥',       type: 'none',     cat: 'phy', power: 50,  pp: 0,  cd: 1.0, kind: 'melee', reach: 62, arc: 1.8, recoil: .25 },
  judgment:     { name: '심판의뭉치',   type: 'normal',   cat: 'spe', power: 100, pp: 10, cd: 2.8, kind: 'target', delay: .65, radius: 110, sig: true },

  // 강철
  irontail:     { name: '아이언테일',   type: 'steel',    cat: 'phy', power: 100, pp: 10, cd: 2.2, kind: 'melee', reach: 72, arc: 1.6 },
  flashcannon:  { name: '러스터캐논',   type: 'steel',    cat: 'spe', power: 80,  pp: 10, cd: 1.6, kind: 'proj',  speed: 620, r: 14, range: 520 },
  bulletpunch:  { name: '불릿펀치',     type: 'steel',    cat: 'phy', power: 40,  pp: 30, cd: 0.8, kind: 'dash',  dist: 140, speed: 1300, punch: true, priority: true },
  ironhead:     { name: '아이언헤드',   type: 'steel',    cat: 'phy', power: 80,  pp: 15, cd: 1.8, kind: 'dash',  dist: 170, speed: 950, flinch: true },
  meteormash:   { name: '코멧펀치',     type: 'steel',    cat: 'phy', power: 90,  pp: 10, cd: 1.8, kind: 'melee', reach: 76, arc: 1.4, punch: true },
  heavyslam:    { name: '헤비봄버',     type: 'steel',    cat: 'phy', power: 100, pp: 10, cd: 2.4, kind: 'dash',  dist: 190, speed: 850, kb: 520 },
  steelbeam:    { name: '스틸빔',       type: 'steel',    cat: 'spe', power: 140, pp: 5,  cd: 4.5, kind: 'beam',  charge: .55, width: 36, length: 700, recoil: .5 },
  behemothblade:{ name: '거수참',       type: 'steel',    cat: 'phy', power: 100, pp: 5,  cd: 1.8, kind: 'melee', reach: 92, arc: 2.0, sig: true },
  behemothbash: { name: '거수탄',       type: 'steel',    cat: 'phy', power: 100, pp: 5,  cd: 1.8, kind: 'dash',  dist: 230, speed: 1050, kb: 520, sig: true },

  // 불꽃
  flamethrower: { name: '화염방사',     type: 'fire',     cat: 'spe', power: 90,  pp: 15, cd: 1.6, kind: 'proj',  speed: 520, r: 14, range: 420, status: ['brn', .1], fx: 'flame' },
  fireblast:    { name: '불대문자',     type: 'fire',     cat: 'spe', power: 110, pp: 5,  cd: 3.5, kind: 'proj',  speed: 460, r: 26, range: 580, status: ['brn', .25], fx: 'flame' },
  mindblown:    { name: '마인드블로',   type: 'fire',     cat: 'spe', power: 150, pp: 5,  cd: 3.2, kind: 'nova', radius: 170, recoil: .5, sig: true },
  overheat:     { name: '오버히트',     type: 'fire',     cat: 'spe', power: 130, pp: 5,  cd: 4.5, kind: 'proj',  speed: 480, r: 24, range: 560, fx: 'flame' },
  heatwave:     { name: '열풍',         type: 'fire',     cat: 'spe', power: 95,  pp: 10, cd: 2.6, kind: 'nova',  radius: 140, status: ['brn', .1] },
  blazekick:    { name: '블레이즈킥',   type: 'fire',     cat: 'phy', power: 85,  pp: 10, cd: 1.6, kind: 'melee', reach: 72, arc: 1.5, status: ['brn', .1] },
  flareblitz:   { name: '플레어드라이브', type: 'fire',   cat: 'phy', power: 120, pp: 10, cd: 3.0, kind: 'dash',  dist: 260, speed: 1000, recoil: .33, status: ['brn', .1] },
  firepunch:    { name: '불꽃펀치',     type: 'fire',     cat: 'phy', power: 75,  pp: 15, cd: 1.2, kind: 'melee', reach: 66, arc: 1.4, status: ['brn', .1], punch: true },
  firefang:     { name: '불꽃엄니',     type: 'fire',     cat: 'phy', power: 65,  pp: 15, cd: 1.1, kind: 'melee', reach: 60, arc: 1.4, status: ['brn', .1], bite: true },
  sacredfire:   { name: '성스러운불꽃', type: 'fire',     cat: 'phy', power: 100, pp: 5,  cd: 2.4, kind: 'proj',  speed: 560, r: 20, range: 540, status: ['brn', .5], fx: 'flame', sig: true },
  blueflare:    { name: '푸른불꽃',     type: 'fire',     cat: 'spe', power: 130, pp: 5,  cd: 4.0, kind: 'beam',  charge: .6, width: 40, length: 720, status: ['brn', .2], sig: true },

  // 비행
  airslash:     { name: '에어슬래시',   type: 'flying',   cat: 'spe', power: 75,  pp: 15, cd: 1.4, kind: 'proj',  speed: 720, r: 12, range: 520, flinch: true, fx: 'crescent' },
  hurricane:    { name: '폭풍',         type: 'flying',   cat: 'spe', power: 110, pp: 8,  cd: 3.5, kind: 'target', delay: .7, radius: 88 },
  aircutter:    { name: '에어커터',     type: 'flying',   cat: 'spe', power: 60,  pp: 25, cd: 1.1, kind: 'proj',  speed: 720, r: 10, range: 460, count: 2, spread: .2, critBoost: true, fx: 'crescent' },
  wingattack:   { name: '날개치기',     type: 'flying',   cat: 'phy', power: 60,  pp: 25, cd: 1.0, kind: 'melee', reach: 66, arc: 1.8 },
  bravebird:    { name: '브레이브버드', type: 'flying',   cat: 'phy', power: 120, pp: 10, cd: 3.0, kind: 'dash',  dist: 260, speed: 1150, recoil: .33 },
  drillpeck:    { name: '회전부리',     type: 'flying',   cat: 'phy', power: 80,  pp: 20, cd: 1.6, kind: 'dash',  dist: 200, speed: 1050 },
  acrobatics:   { name: '애크러뱃',     type: 'flying',   cat: 'phy', power: 55,  pp: 15, cd: 1.0, kind: 'dash',  dist: 220, speed: 1300 },
  aeroblast:    { name: '에어로블라스트', type: 'flying', cat: 'spe', power: 100, pp: 5,  cd: 2.6, kind: 'beam',  charge: .35, width: 32, length: 660, critBoost: true, sig: true },
  dragonascent: { name: '화룡점정',     type: 'flying',   cat: 'phy', power: 120, pp: 5,  cd: 3.0, kind: 'dash',  dist: 290, speed: 1250, sig: true },

  // 드래곤
  dragonclaw:   { name: '드래곤크루',   type: 'dragon',   cat: 'phy', power: 80,  pp: 15, cd: 1.3, kind: 'melee', reach: 72, arc: 1.6 },
  dragonrush:   { name: '드래곤다이브', type: 'dragon',   cat: 'phy', power: 100, pp: 10, cd: 2.6, kind: 'dash',  dist: 240, speed: 1000, flinch: true },
  outrage:      { name: '역린',         type: 'dragon',   cat: 'phy', power: 120, pp: 8,  cd: 3.2, kind: 'nova',  radius: 115 },
  coreenforcer: { name: '코어퍼니셔',   type: 'dragon',   cat: 'spe', power: 100, pp: 10, cd: 2.0, kind: 'beam', charge: .25, width: 36, length: 700, suppress: true, sig: true },
  dragondarts:  { name: '드래곤애로우', type: 'dragon',   cat: 'phy', power: 50,  pp: 10, cd: 1.3, kind: 'proj',  speed: 820, r: 9, range: 540, count: 2, spread: .12, multiHit: true },
  dragonpulse:  { name: '용의파동',     type: 'dragon',   cat: 'spe', power: 85,  pp: 10, cd: 1.6, kind: 'proj',  speed: 600, r: 15, range: 560, pulse: true },
  dracometeor:  { name: '용성군',       type: 'dragon',   cat: 'spe', power: 130, pp: 5,  cd: 4.5, kind: 'target', delay: .8, radius: 100, fx: 'rock', dropSelf: ['spa'] },
  roaroftime:   { name: '시간의포효',   type: 'dragon',   cat: 'spe', power: 150, pp: 5,  cd: 6.0, kind: 'beam',  charge: .7, width: 46, length: 860, selfStun: .8, sig: true },
  spacialrend:  { name: '공간절단',     type: 'dragon',   cat: 'spe', power: 100, pp: 5,  cd: 2.4, kind: 'target', delay: .45, radius: 72, critBoost: true, sig: true },

  // 물
  hydropump:    { name: '하이드로펌프', type: 'water',    cat: 'spe', power: 110, pp: 5,  cd: 3.5, kind: 'beam',  charge: .45, width: 30, length: 580 },
  surf:         { name: '파도타기',     type: 'water',    cat: 'spe', power: 90,  pp: 10, cd: 2.8, kind: 'nova',  radius: 155 },
  scald:        { name: '열탕',         type: 'water',    cat: 'spe', power: 80,  pp: 15, cd: 1.6, kind: 'proj',  speed: 560, r: 14, range: 520, status: ['brn', .3] },
  waterpulse:   { name: '물의파동',     type: 'water',    cat: 'spe', power: 60,  pp: 20, cd: 1.1, kind: 'proj',  speed: 640, r: 13, range: 540, pulse: true },
  waterfall:    { name: '폭포오르기',   type: 'water',    cat: 'phy', power: 80,  pp: 15, cd: 1.8, kind: 'dash',  dist: 200, speed: 950, flinch: true },
  aquajet:      { name: '아쿠아제트',   type: 'water',    cat: 'phy', power: 40,  pp: 20, cd: 0.8, kind: 'dash',  dist: 170, speed: 1300, priority: true },
  liquidation:  { name: '아쿠아브레이크', type: 'water',  cat: 'phy', power: 85,  pp: 10, cd: 1.4, kind: 'melee', reach: 70, arc: 1.6 },
  crabhammer:   { name: '집게햄머',     type: 'water',    cat: 'phy', power: 100, pp: 10, cd: 2.0, kind: 'melee', reach: 66, arc: 1.3, critBoost: true },
  watershuriken:{ name: '물수리검',     type: 'water',    cat: 'spe', power: 30,  pp: 20, cd: 1.0, kind: 'proj',  speed: 820, r: 9, range: 540, count: 3, spread: .16, multiHit: true, rollHits: true, fx: 'star', bond: true, sig: true },
  originpulse:  { name: '근원의파동',   type: 'water',    cat: 'spe', power: 110, pp: 10, cd: 3.0, kind: 'proj',  speed: 620, r: 12, range: 540, count: 5, spread: .45, pulse: true, sig: true },

  // 얼음
  icebeam:      { name: '냉동빔',       type: 'ice',      cat: 'spe', power: 90,  pp: 10, cd: 1.8, kind: 'proj',  speed: 700, r: 10, range: 560, status: ['frz', .1] },
  blizzard:     { name: '눈보라',       type: 'ice',      cat: 'spe', power: 110, pp: 5,  cd: 3.5, kind: 'target', delay: .8, radius: 96, status: ['frz', .15] },
  icywind:      { name: '얼다바람',     type: 'ice',      cat: 'spe', power: 55,  pp: 15, cd: 1.2, kind: 'proj',  speed: 640, r: 10, range: 480, count: 3, spread: .25, drop: ['spe'] },
  freezedry:    { name: '프리즈드라이', type: 'ice',      cat: 'spe', power: 70,  pp: 20, cd: 1.5, kind: 'proj',  speed: 700, r: 10, range: 540, status: ['frz', .1], freezeDry: true },
  icefang:      { name: '얼음엄니',     type: 'ice',      cat: 'phy', power: 65,  pp: 15, cd: 1.1, kind: 'melee', reach: 60, arc: 1.4, status: ['frz', .1], bite: true },
  icepunch:     { name: '냉동펀치',     type: 'ice',      cat: 'phy', power: 75,  pp: 15, cd: 1.2, kind: 'melee', reach: 66, arc: 1.4, status: ['frz', .1], punch: true },
  iceshard:     { name: '얼음뭉치',     type: 'ice',      cat: 'phy', power: 40,  pp: 30, cd: 0.7, kind: 'proj',  speed: 920, r: 8, range: 420, priority: true },
  iciclecrash:  { name: '고드름떨구기', type: 'ice',      cat: 'phy', power: 85,  pp: 10, cd: 2.4, kind: 'target', delay: .55, radius: 60, flinch: true },

  // 전기
  thunderbolt:  { name: '10만볼트',     type: 'electric', cat: 'spe', power: 90,  pp: 15, cd: 1.4, kind: 'proj',  speed: 640, r: 10, range: 520, status: ['par', .1], fx: 'bolt' },
  thunder:      { name: '번개',         type: 'electric', cat: 'spe', power: 110, pp: 8,  cd: 3.5, kind: 'target', delay: .75, radius: 70, status: ['par', .3], fx: 'bolt' },
  discharge:    { name: '방전',         type: 'electric', cat: 'spe', power: 80,  pp: 15, cd: 2.4, kind: 'nova',  radius: 140, status: ['par', .3] },
  electroball:  { name: '일렉트릭볼',   type: 'electric', cat: 'spe', power: 80,  pp: 10, cd: 1.5, kind: 'proj',  speed: 620, r: 15, range: 540, ball: true, fx: 'bolt' },
  wildcharge:   { name: '와일드볼트',   type: 'electric', cat: 'phy', power: 90,  pp: 15, cd: 2.2, kind: 'dash',  dist: 220, speed: 1050, recoil: .25 },
  thunderpunch: { name: '번개펀치',     type: 'electric', cat: 'phy', power: 75,  pp: 15, cd: 1.2, kind: 'melee', reach: 66, arc: 1.4, status: ['par', .1], punch: true },
  thunderfang:  { name: '번개엄니',     type: 'electric', cat: 'phy', power: 65,  pp: 15, cd: 1.1, kind: 'melee', reach: 60, arc: 1.4, status: ['par', .1], bite: true },
  nuzzle:       { name: '볼부비부비',   type: 'electric', cat: 'phy', power: 20,  pp: 20, cd: 2.5, kind: 'dash',  dist: 150, speed: 1100, status: ['par', 1] },
  boltstrike:   { name: '뇌격',         type: 'electric', cat: 'phy', power: 130, pp: 5,  cd: 3.5, kind: 'dash',  dist: 250, speed: 1100, status: ['par', .2], sig: true },

  // 풀
  razorleaf:    { name: '잎날가르기',   type: 'grass',    cat: 'phy', power: 35,  pp: 25, cd: 1.0, kind: 'proj',  speed: 660, r: 9, range: 460, count: 2, spread: .2, multiHit: true, fx: 'leaf' },
  leafblade:    { name: '리프블레이드', type: 'grass',    cat: 'phy', power: 90,  pp: 15, cd: 1.4, kind: 'melee', reach: 76, arc: 1.6 },
  petalblizzard:{ name: '꽃보라',       type: 'grass',    cat: 'phy', power: 90,  pp: 15, cd: 2.4, kind: 'nova',  radius: 135 },
  woodhammer:   { name: '우드해머',     type: 'grass',    cat: 'phy', power: 120, pp: 15, cd: 3.0, kind: 'dash',  dist: 240, speed: 1000, recoil: .33 },
  powerwhip:    { name: '파워휩',       type: 'grass',    cat: 'phy', power: 120, pp: 10, cd: 3.0, kind: 'melee', reach: 86, arc: 1.6 },
  seedbomb:     { name: '씨폭탄',       type: 'grass',    cat: 'phy', power: 80,  pp: 15, cd: 1.4, kind: 'proj',  speed: 560, r: 13, range: 480, ball: true },
  solarbeam:    { name: '솔라빔',       type: 'grass',    cat: 'spe', power: 120, pp: 8,  cd: 4.0, kind: 'beam',  charge: 1.0, width: 42, length: 840 },
  energyball:   { name: '에너지볼',     type: 'grass',    cat: 'spe', power: 90,  pp: 10, cd: 1.6, kind: 'proj',  speed: 520, r: 16, range: 540, ball: true },
  leafstorm:    { name: '리프스톰',     type: 'grass',    cat: 'spe', power: 130, pp: 5,  cd: 4.0, kind: 'proj',  speed: 600, r: 11, range: 520, count: 5, spread: .6, fx: 'leaf' },
  gigadrain:    { name: '기가드레인',   type: 'grass',    cat: 'spe', power: 75,  pp: 10, cd: 1.6, kind: 'proj',  speed: 560, r: 14, range: 520, drain: .5, fx: 'leaf' },

  // 독
  sludgebomb:   { name: '오물폭탄',     type: 'poison',   cat: 'spe', power: 90,  pp: 10, cd: 1.7, kind: 'proj',  speed: 520, r: 16, range: 520, status: ['psn', .3], ball: true },
  sludgewave:   { name: '오물웨이브',   type: 'poison',   cat: 'spe', power: 95,  pp: 10, cd: 2.6, kind: 'nova',  radius: 150, status: ['psn', .1] },
  poisonjab:    { name: '독찌르기',     type: 'poison',   cat: 'phy', power: 80,  pp: 20, cd: 1.4, kind: 'melee', reach: 68, arc: 1.5, status: ['psn', .3] },
  gunkshot:     { name: '더스트슈트',   type: 'poison',   cat: 'phy', power: 120, pp: 5,  cd: 3.5, kind: 'proj',  speed: 560, r: 18, range: 500, status: ['psn', .3] },

  // 고스트
  shadowball:   { name: '섀도볼',       type: 'ghost',    cat: 'spe', power: 80,  pp: 15, cd: 1.5, kind: 'proj',  speed: 560, r: 16, range: 540, ball: true },
  hex:          { name: '병상첨병',     type: 'ghost',    cat: 'spe', power: 65,  pp: 10, cd: 1.3, kind: 'proj',  speed: 560, r: 14, range: 520, hex: true },
  shadowclaw:   { name: '섀도크루',     type: 'ghost',    cat: 'phy', power: 70,  pp: 15, cd: 1.1, kind: 'melee', reach: 70, arc: 1.6 },
  shadowsneak:  { name: '야습',         type: 'ghost',    cat: 'phy', power: 40,  pp: 30, cd: 0.9, kind: 'dash',  dist: 190, speed: 1300, priority: true },
  phantomforce: { name: '고스트다이브', type: 'ghost',    cat: 'phy', power: 90,  pp: 10, cd: 2.6, kind: 'dash',  dist: 260, speed: 900, phase: true },
  poltergeist:  { name: '폴터가이스트', type: 'ghost',    cat: 'phy', power: 110, pp: 5,  cd: 3.0, kind: 'target', delay: .6, radius: 60 },
  shadowforce:  { name: '섀도다이브',   type: 'ghost',    cat: 'phy', power: 120, pp: 5,  cd: 3.5, kind: 'dash',  dist: 290, speed: 900, phase: true, sig: true },

  // 악
  darkpulse:    { name: '악의파동',     type: 'dark',     cat: 'spe', power: 80,  pp: 15, cd: 2.2, kind: 'nova',  radius: 145, flinch: true, pulse: true, sound: true },
  nightdaze:    { name: '나이트버스트', type: 'dark',     cat: 'spe', power: 85,  pp: 10, cd: 1.6, kind: 'proj',  speed: 600, r: 15, range: 540 },
  bite:         { name: '물기',         type: 'dark',     cat: 'phy', power: 60,  pp: 25, cd: 1.0, kind: 'melee', reach: 58, arc: 1.4, flinch: true, bite: true },
  crunch:       { name: '깨물어부수기', type: 'dark',     cat: 'phy', power: 80,  pp: 15, cd: 1.4, kind: 'melee', reach: 62, arc: 1.4, bite: true },
  nightslash:   { name: '깜짝베기',     type: 'dark',     cat: 'phy', power: 70,  pp: 15, cd: 1.0, kind: 'melee', reach: 76, arc: 2.0, critBoost: true },
  suckerpunch:  { name: '기습',         type: 'dark',     cat: 'phy', power: 70,  pp: 5,  cd: 1.2, kind: 'dash',  dist: 170, speed: 1350, priority: true, sucker: true },
  knockoff:     { name: '탁쳐서떨구기', type: 'dark',     cat: 'phy', power: 75,  pp: 20, cd: 1.4, kind: 'melee', reach: 66, arc: 1.5 },

  // 에스퍼
  psychic:      { name: '사이코키네시스', type: 'psychic', cat: 'spe', power: 90, pp: 10, cd: 1.8, kind: 'target', delay: .45, radius: 56 },
  psybeam:      { name: '환상빔',       type: 'psychic',  cat: 'spe', power: 65,  pp: 20, cd: 1.4, kind: 'beam',  charge: .25, width: 22, length: 520 },
  psyshock:     { name: '사이코쇼크',   type: 'psychic',  cat: 'spe', power: 80,  pp: 10, cd: 1.6, kind: 'proj',  speed: 600, r: 14, range: 540, targetDef: true },
  futuresight:  { name: '미래예지',     type: 'psychic',  cat: 'spe', power: 120, pp: 10, cd: 4.0, kind: 'target', delay: 1.6, radius: 80 },
  zenheadbutt:  { name: '사념의박치기', type: 'psychic',  cat: 'phy', power: 80,  pp: 15, cd: 1.8, kind: 'dash',  dist: 180, speed: 950, flinch: true },
  psychocut:    { name: '사이코커터',   type: 'psychic',  cat: 'phy', power: 70,  pp: 20, cd: 1.2, kind: 'melee', reach: 76, arc: 1.6, critBoost: true },
  psychicfangs: { name: '사이코팽',     type: 'psychic',  cat: 'phy', power: 85,  pp: 10, cd: 1.5, kind: 'melee', reach: 62, arc: 1.4, bite: true },
  lusterpurge:  { name: '라스트버지',   type: 'psychic',  cat: 'spe', power: 95,  pp: 5,  cd: 1.8, kind: 'proj',  speed: 620, r: 16, range: 560, sig: true },
  mistball:     { name: '미스트볼',     type: 'psychic',  cat: 'spe', power: 95,  pp: 5,  cd: 1.8, kind: 'proj',  speed: 520, r: 18, range: 560, ball: true, sig: true },

  // 격투
  aurasphere:   { name: '파동탄',       type: 'fighting', cat: 'spe', power: 80,  pp: 20, cd: 1.6, kind: 'proj',  speed: 520, r: 14, range: 600, homing: 3, pulse: true, ball: true },
  focusblast:   { name: '기합구슬',     type: 'fighting', cat: 'spe', power: 120, pp: 5,  cd: 3.8, kind: 'proj',  speed: 420, r: 20, range: 560, ball: true },
  closecombat:  { name: '인파이트',     type: 'fighting', cat: 'phy', power: 120, pp: 5,  cd: 3.0, kind: 'melee', reach: 72, arc: 1.8 },
  crosschop:    { name: '크로스촙',     type: 'fighting', cat: 'phy', power: 100, pp: 5,  cd: 2.2, kind: 'melee', reach: 72, arc: 1.5, critBoost: true },
  dynamicpunch: { name: '폭발펀치',     type: 'fighting', cat: 'phy', power: 100, pp: 5,  cd: 2.8, kind: 'melee', reach: 66, arc: 1.3, flinch: true, kb: 520, punch: true },
  highjumpkick: { name: '무릎차기',     type: 'fighting', cat: 'phy', power: 130, pp: 10, cd: 3.0, kind: 'dash',  dist: 220, speed: 1100, crash: .5 },
  drainpunch:   { name: '드레인펀치',   type: 'fighting', cat: 'phy', power: 75,  pp: 10, cd: 1.6, kind: 'melee', reach: 66, arc: 1.4, drain: .5, punch: true },
  machpunch:    { name: '마하펀치',     type: 'fighting', cat: 'phy', power: 40,  pp: 30, cd: 0.8, kind: 'dash',  dist: 150, speed: 1300, punch: true, priority: true },
  sacredsword:  { name: '성스러운칼',   type: 'fighting', cat: 'phy', power: 90,  pp: 15, cd: 1.6, kind: 'melee', reach: 80, arc: 1.6 },
  bodypress:    { name: '바디프레스',   type: 'fighting', cat: 'phy', power: 80,  pp: 10, cd: 1.8, kind: 'dash',  dist: 180, speed: 900, useDef: true, kb: 420 },
  superpower:   { name: '엄청난힘',     type: 'fighting', cat: 'phy', power: 120, pp: 5,  cd: 3.0, kind: 'melee', reach: 72, arc: 1.7, kb: 480, dropSelf: ['atk', 'def'] },
  hammerarm:    { name: '암해머',       type: 'fighting', cat: 'phy', power: 100, pp: 10, cd: 2.2, kind: 'melee', reach: 66, arc: 1.4, punch: true },
  lowkick:      { name: '안다리걸기',   type: 'fighting', cat: 'phy', power: 60,  pp: 20, cd: 1.0, kind: 'melee', reach: 60, arc: 1.8 },
  aerialace:    { name: '제비반환',     type: 'flying',   cat: 'phy', power: 60,  pp: 20, cd: 1.0, kind: 'dash',  dist: 200, speed: 1400, priority: true },
  aquatail:     { name: '아쿠아테일',   type: 'water',    cat: 'phy', power: 90,  pp: 10, cd: 1.8, kind: 'melee', reach: 76, arc: 1.8 },
  grassknot:    { name: '풀묶기',       type: 'grass',    cat: 'spe', power: 80,  pp: 20, cd: 1.6, kind: 'target', delay: .4, radius: 50 },
  extrasensory: { name: '신통력',       type: 'psychic',  cat: 'spe', power: 90,  pp: 20, cd: 1.8, kind: 'proj',  speed: 620, r: 14, range: 540, flinch: true },
  psystrike:    { name: '사이코브레이크', type: 'psychic', cat: 'spe', power: 100, pp: 10, cd: 2.0, kind: 'proj', speed: 640, r: 18, range: 580, targetDef: true, sig: true },

  // 땅
  earthquake:   { name: '지진',         type: 'ground',   cat: 'phy', power: 100, pp: 10, cd: 3.0, kind: 'nova',  radius: 175 },
  thousandarrows:{ name: '사우전드애로', type: 'ground', cat: 'phy', power: 90, pp: 10, cd: 1.8, kind: 'proj', speed: 720, r: 12, range: 560, smackDown: true, sig: true },
  thousandwaves:{ name: '사우전드웨이브', type: 'ground', cat: 'phy', power: 90, pp: 10, cd: 2.2, kind: 'nova', radius: 150, trap: true, sig: true },
  landswrath:   { name: '그라운드포스', type: 'ground',   cat: 'phy', power: 90, pp: 10, cd: 2.4, kind: 'nova', radius: 160, sig: true },
  bulldoze:     { name: '땅고르기',     type: 'ground',   cat: 'phy', power: 60,  pp: 20, cd: 1.8, kind: 'nova',  radius: 150, drop: ['spe'] },
  drillrun:     { name: '드릴라이너',   type: 'ground',   cat: 'phy', power: 80,  pp: 10, cd: 1.6, kind: 'dash',  dist: 200, speed: 1050, critBoost: true },
  highhorsepower:{ name: '10만마력',    type: 'ground',   cat: 'phy', power: 95,  pp: 10, cd: 2.0, kind: 'dash',  dist: 210, speed: 1000 },
  earthpower:   { name: '대지의힘',     type: 'ground',   cat: 'spe', power: 90,  pp: 10, cd: 2.0, kind: 'target', delay: .5, radius: 65, fx: 'rock' },
  mudbomb:      { name: '진흙폭탄',     type: 'ground',   cat: 'spe', power: 65,  pp: 10, cd: 1.3, kind: 'proj',  speed: 520, r: 16, range: 500, ball: true },
  scorchingsands:{ name: '열사의대지',  type: 'ground',   cat: 'spe', power: 70,  pp: 10, cd: 1.5, kind: 'proj',  speed: 560, r: 14, range: 520, status: ['brn', .3] },
  precipiceblades:{ name: '단애의칼',   type: 'ground',   cat: 'phy', power: 120, pp: 10, cd: 3.0, kind: 'target', delay: .6, radius: 95, fx: 'rock', sig: true },

  // 바위
  stoneedge:    { name: '스톤에지',     type: 'rock',     cat: 'phy', power: 100, pp: 5,  cd: 2.6, kind: 'proj',  speed: 720, r: 13, range: 520, critBoost: true, fx: 'rock' },
  rockslide:    { name: '스톤샤워',     type: 'rock',     cat: 'phy', power: 75,  pp: 10, cd: 2.2, kind: 'target', delay: .65, radius: 82, flinch: true, fx: 'rock' },
  rockblast:    { name: '락블레스트',   type: 'rock',     cat: 'phy', power: 25,  pp: 10, cd: 1.5, kind: 'proj',  speed: 680, r: 10, range: 480, count: 4, spread: .35, multiHit: true, rollHits: true, fx: 'rock' },
  headsmash:    { name: '양날박치기',   type: 'rock',     cat: 'phy', power: 150, pp: 5,  cd: 4.0, kind: 'dash',  dist: 260, speed: 1000, recoil: .5, kb: 560 },
  powergem:     { name: '파워젬',       type: 'rock',     cat: 'spe', power: 80,  pp: 20, cd: 1.5, kind: 'proj',  speed: 620, r: 13, range: 540, fx: 'rock' },

  // 벌레
  xscissor:     { name: '시저크로스',   type: 'bug',      cat: 'phy', power: 80,  pp: 15, cd: 1.2, kind: 'melee', reach: 72, arc: 1.8 },
  leechlife:    { name: '흡혈',         type: 'bug',      cat: 'phy', power: 80,  pp: 10, cd: 1.5, kind: 'melee', reach: 64, arc: 1.4, drain: .5 },
  megahorn:     { name: '메가혼',       type: 'bug',      cat: 'phy', power: 120, pp: 10, cd: 3.0, kind: 'dash',  dist: 220, speed: 1000 },
  uturn:        { name: '유턴',         type: 'bug',      cat: 'phy', power: 70,  pp: 20, cd: 1.4, kind: 'dash',  dist: 200, speed: 1100, pivot: true },
  bugbuzz:      { name: '벌레의야단법석', type: 'bug',    cat: 'spe', power: 90,  pp: 10, cd: 2.4, kind: 'nova',  radius: 145, sound: true },
  signalbeam:   { name: '시그널빔',     type: 'bug',      cat: 'spe', power: 75,  pp: 15, cd: 1.6, kind: 'beam',  charge: .3, width: 24, length: 560 },

  // 페어리
  moonblast:    { name: '문포스',       type: 'fairy',    cat: 'spe', power: 95,  pp: 15, cd: 1.8, kind: 'proj',  speed: 500, r: 18, range: 560 },
  dazzlinggleam:{ name: '매지컬샤인',   type: 'fairy',    cat: 'spe', power: 80,  pp: 10, cd: 2.2, kind: 'nova',  radius: 150 },
  drainingkiss: { name: '드레인키스',   type: 'fairy',    cat: 'spe', power: 50,  pp: 10, cd: 1.2, kind: 'proj',  speed: 520, r: 14, range: 480, drain: .75 },
  playrough:    { name: '치근거리기',   type: 'fairy',    cat: 'phy', power: 90,  pp: 10, cd: 1.6, kind: 'melee', reach: 68, arc: 1.6 },
  spiritbreak:  { name: '소울브레이크', type: 'fairy',    cat: 'phy', power: 75,  pp: 15, cd: 1.3, kind: 'melee', reach: 68, arc: 1.5, drop: ['spa'] },
  superfang:    { name: '분노의앞니',   type: 'normal',   cat: 'phy', power: 1,   pp: 10, cd: 2.8, kind: 'melee', reach: 58, arc: 1.4, bite: true, halfHp: true },
  hypnosis:     { name: '최면술',       type: 'psychic',  cat: 'spe', power: 0,   pp: 20, cd: 3.5, kind: 'target', delay: .5, radius: 48, status: ['frz', 1], statusOnly: true },
  iciclespear:  { name: '고드름침',     type: 'ice',      cat: 'phy', power: 25,  pp: 30, cd: 1.4, kind: 'proj',  speed: 780, r: 8, range: 460, count: 5, spread: .4, multiHit: true, rollHits: true },
  bulletseed:   { name: '씨기관총',     type: 'grass',    cat: 'phy', power: 25,  pp: 30, cd: 1.4, kind: 'proj',  speed: 780, r: 8, range: 480, count: 5, spread: .35, multiHit: true, rollHits: true, fx: 'leaf' },
  rocktomb:     { name: '암석봉인',     type: 'rock',     cat: 'phy', power: 60,  pp: 15, cd: 1.4, kind: 'proj',  speed: 560, r: 14, range: 480, fx: 'rock', drop: ['spe'] },
  seismictoss:  { name: '지구던지기',   type: 'fighting', cat: 'phy', power: 1,   pp: 20, cd: 1.8, kind: 'melee', reach: 66, arc: 1.5, levelDmg: true },
  voltswitch:   { name: '볼트체인지',   type: 'electric', cat: 'spe', power: 70,  pp: 20, cd: 1.6, kind: 'proj',  speed: 640, r: 12, range: 520, fx: 'bolt' },
  gyroball:     { name: '자이로볼',     type: 'steel',    cat: 'phy', power: 80,  pp: 5,  cd: 2.0, kind: 'dash',  dist: 180, speed: 900, ball: true },
  heatcrash:    { name: '히트스탬프',   type: 'fire',     cat: 'phy', power: 80,  pp: 10, cd: 2.0, kind: 'dash',  dist: 190, speed: 950, kb: 480 },
  spiritshackle:{ name: '그림자꿰매기', type: 'ghost',    cat: 'phy', power: 80,  pp: 10, cd: 1.8, kind: 'proj',  speed: 620, r: 12, range: 520 },
  grassyglide:  { name: '그래스슬라이더', type: 'grass',  cat: 'phy', power: 70,  pp: 20, cd: 1.2, kind: 'dash',  dist: 200, speed: 1200, terrainDash: 'grassy', priority: true },
  snipeshot:    { name: '스나이프샷',   type: 'water',    cat: 'spe', power: 80,  pp: 15, cd: 1.6, kind: 'proj',  speed: 780, r: 10, range: 620, critBoost: true },
  mysticalfire: { name: '매지컬플레임', type: 'fire',     cat: 'spe', power: 75,  pp: 10, cd: 1.5, kind: 'proj',  speed: 560, r: 14, range: 520, fx: 'flame', drop: ['spa'] },
  darkestlariat:{ name: 'DD래리어트',   type: 'dark',     cat: 'phy', power: 85,  pp: 10, cd: 1.6, kind: 'melee', reach: 70, arc: 1.6 },
  kowtowcleave: { name: '무릎꿇기베기', type: 'dark',     cat: 'phy', power: 85,  pp: 10, cd: 1.5, kind: 'melee', reach: 76, arc: 1.8, critBoost: true },
  boomburst:    { name: '폭음파',       type: 'normal',   cat: 'spe', power: 140, pp: 10, cd: 4.0, kind: 'nova',  radius: 170, sound: true },
  vcreate:      { name: 'V제너레이트',  type: 'fire',     cat: 'phy', power: 180, pp: 5,  cd: 4.5, kind: 'dash',  dist: 240, speed: 1100, recoil: .33, kb: 560, sig: true },
  fusionflare:  { name: '크로스플레임', type: 'fire',     cat: 'spe', power: 100, pp: 5,  cd: 2.2, kind: 'proj',  speed: 560, r: 16, range: 540, fx: 'flame', sig: true },
  fusionbolt:   { name: '크로스썬더',   type: 'electric', cat: 'phy', power: 100, pp: 5,  cd: 2.2, kind: 'dash',  dist: 220, speed: 1050, sig: true },
  glaciate:     { name: '얼음숨결',     type: 'ice',      cat: 'spe', power: 65,  pp: 10, cd: 1.4, kind: 'proj',  speed: 520, r: 14, range: 480, drop: ['spe'], sig: true },
  sunsteelstrike:{ name: '메테오드라이브', type: 'steel', cat: 'phy', power: 100, pp: 5,  cd: 2.2, kind: 'dash',  dist: 240, speed: 1100, ignoresAbility: true, sig: true },
  moongeistbeam:{ name: '섀도레이',     type: 'ghost',    cat: 'spe', power: 100, pp: 5,  cd: 2.4, kind: 'beam',  charge: .35, width: 28, length: 700, ignoresAbility: true, sig: true },
  prismaticlaser:{ name: '프리즘레이저', type: 'psychic', cat: 'spe', power: 160, pp: 10, cd: 5.5, kind: 'beam',  charge: .7, width: 36, length: 780, selfStun: .6, sig: true },
  photongeyser: { name: '포톤가이저',   type: 'psychic',  cat: 'spe', power: 100, pp: 5,  cd: 2.2, kind: 'beam',  charge: .25, width: 30, length: 680, sig: true },
  oblivionwing: { name: '데스윙',       type: 'flying',   cat: 'spe', power: 80,  pp: 10, cd: 1.8, kind: 'proj',  speed: 640, r: 14, range: 540, drain: .75, sig: true },
  flowertrick:  { name: '트릭플라워',   type: 'grass',    cat: 'phy', power: 70,  pp: 10, cd: 1.3, kind: 'proj',  speed: 700, r: 12, range: 480, alwaysCrit: true, fx: 'leaf', sig: true },
  makeitrain:   { name: '골드러시',     type: 'steel',    cat: 'spe', power: 120, pp: 5,  cd: 3.0, kind: 'proj',  speed: 600, r: 14, range: 540, sig: true },
  gigatonhammer:{ name: '거대망치',     type: 'steel',    cat: 'phy', power: 160, pp: 5,  cd: 4.5, kind: 'melee', reach: 88, arc: 1.8, kb: 520, sig: true },
  wickedblow:   { name: '암흑강타',     type: 'dark',     cat: 'phy', power: 80,  pp: 5,  cd: 1.6, kind: 'melee', reach: 70, arc: 1.4, alwaysCrit: true, punch: true, sig: true },
  surgingstrikes:{ name: '수류연타',    type: 'water',    cat: 'phy', power: 25,  pp: 5,  cd: 1.5, kind: 'proj',  speed: 780, r: 8, range: 420, count: 3, spread: .12, multiHit: true, alwaysCrit: true, punch: true, sig: true },
  secretsword:  { name: '신비의칼',     type: 'fighting', cat: 'spe', power: 85,  pp: 10, cd: 1.6, kind: 'proj',  speed: 700, r: 10, range: 540, sig: true },
  electrodrift: { name: '일렉트로드리프트', type: 'electric', cat: 'spe', power: 100, pp: 5, cd: 2.2, kind: 'dash', dist: 260, speed: 1200, sig: true },
  dynamaxcannon:{ name: '다이맥스포',   type: 'dragon',   cat: 'spe', power: 100, pp: 5,  cd: 2.4, kind: 'beam',  charge: .3, width: 40, length: 760, sig: true },
  greysword:    { name: '그레이소드',   type: 'fire',     cat: 'phy', power: 100, pp: 8,  cd: 1.7, kind: 'melee', reach: 92, arc: 1.7, kb: 420, sig: true },
  alldelete:    { name: '올 딜리트',    type: 'fire',     cat: 'spe', power: 150, pp: 5,  cd: 5.0, kind: 'beam',  charge: .5, width: 42, length: 740, ignoresAbility: true, sig: true },
  garurucannon: { name: '가루루포',     type: 'ice',      cat: 'spe', power: 110, pp: 8,  cd: 2.2, kind: 'beam',  charge: .3, width: 26, length: 640, sig: true },
  gaiaforce:    { name: '가이아포스',   type: 'fire',     cat: 'spe', power: 130, pp: 5,  cd: 3.2, kind: 'proj',  speed: 500, r: 28, range: 620, status: ['brn', .2], fx: 'flame', sig: true, note: '워그레이몬의 전용기. 대기의 에너지를 한 점에 모아 쏘는 고열 에너지탄.' },
  seolleongpo:  { name: '썰렁포',       type: 'ice',      cat: 'spe', power: 120, pp: 5,  cd: 2.8, kind: 'beam',  charge: .4, width: 42, length: 700, status: ['frz', .2], sig: true, note: '메탈가루몬의 전용기. 절대영도의 숨결로 상대를 얼린다.' },
  glaciallance: { name: '블리자드랜스', type: 'ice', cat: 'phy', power: 130, pp: 5, cd: 2.8, kind: 'dash', dist: 280, speed: 1080, kb: 500, sig: true, note: '블리자포스와 백마 버드렉스의 전용기. 얼음 창을 꽂으며 들이받는다.' },
  astralbarrage:{ name: '아스트랄비트', type: 'ghost', cat: 'spe', power: 120, pp: 5, cd: 2.4, kind: 'proj', speed: 680, r: 12, range: 560, count: 5, spread: 0.42, sig: true, note: '레이스포스와 흑마 버드렉스의 전용기. 유령 탄막을 쏟고, 그중 한 발이 맞는다.' },
  meteorassault:{ name: '스타어설트', type: 'fighting', cat: 'phy', power: 150, pp: 5, cd: 4.2, kind: 'melee', reach: 96, arc: 1.4, kb: 520, selfStun: .85, sig: true },
  fishiousrend: { name: '아가미물기', type: 'water', cat: 'phy', power: 85, pp: 10, cd: 1.6, kind: 'dash', dist: 230, speed: 1100, kb: 420, bite: true, first: true, sig: true },
  catastropika: { name: '필살피카슛', type: 'electric', cat: 'phy', power: 210, pp: 1, cd: 0, kind: 'dash', dist: 280, speed: 1400, kb: 640, z: true, zfx: 'pika' },
  tenmillionvolt:{ name: '1000만볼트', type: 'electric', cat: 'spe', power: 195, pp: 1, cd: 0, kind: 'beam', charge: .75, width: 64, length: 800, critBoost: true, fx: 'bolt', z: true, zfx: 'volt' },
  pulverizingpancake: { name: '판케익부수기', type: 'normal', cat: 'phy', power: 210, pp: 1, cd: 0, kind: 'dash', dist: 240, speed: 780, kb: 700, selfStun: .55, z: true, zfx: 'pancake' },
  letsnuggleforever: { name: '투게더폴', type: 'fairy', cat: 'phy', power: 190, pp: 1, cd: 0, kind: 'melee', reach: 96, arc: 2.4, kb: 480, z: true, zfx: 'hug' },
  sinisterarrowraid: { name: '섀도애로우즈스트라이크', type: 'ghost', cat: 'phy', power: 180, pp: 1, cd: 0, kind: 'proj', speed: 920, r: 16, range: 680, count: 9, spread: 0.5, homing: 5, fx: 'arrow', z: true, zfx: 'arrow' },
  maliciousmoonsault: { name: '하이퍼다크크러셔', type: 'dark', cat: 'phy', power: 180, pp: 1, cd: 0, kind: 'dash', dist: 260, speed: 1100, kb: 560, z: true, zfx: 'moonsault' },
  oceanicoperetta: { name: '해원의아리아', type: 'water', cat: 'spe', power: 195, pp: 1, cd: 0, kind: 'target', delay: .85, radius: 130, z: true, zfx: 'aria' },
  clangoroussoulblaze: { name: '브레이징소울비트', type: 'dragon', cat: 'spe', power: 185, pp: 1, cd: 0, kind: 'nova', radius: 170, z: true, zfx: 'scales' },
  genesissupernova: { name: '오리진즈슈퍼노바', type: 'psychic', cat: 'spe', power: 185, pp: 1, cd: 0, kind: 'nova', radius: 180, z: true, zfx: 'nova' },
  searingsunrazesmash: { name: '선샤인스매셔', type: 'steel', cat: 'phy', power: 200, pp: 1, cd: 0, kind: 'dash', dist: 280, speed: 1300, kb: 620, ignoresAbility: true, z: true, zfx: 'sun' },
  menacingmoonrazemaelstrom: { name: '문라이트블래스터', type: 'ghost', cat: 'spe', power: 200, pp: 1, cd: 0, kind: 'beam', charge: .65, width: 48, length: 760, ignoresAbility: true, z: true, zfx: 'moon' },
  lightthatburnsthesky: { name: '하늘을태우는멸망의빛', type: 'psychic', cat: 'spe', power: 200, pp: 1, cd: 0, kind: 'beam', charge: .7, width: 72, length: 840, ignoresAbility: true, bestStat: true, z: true, zfx: 'prism', note: '울트라네크로즈마의 Z기술. 공격과 특수공격 중 높은 쪽으로 때리고, 상대의 특성을 무시한다.' },
  naturesmadness: { name: '자연의분노', type: 'fairy', cat: 'spe', power: 1, pp: 10, cd: 2.2, kind: 'proj', speed: 620, r: 16, range: 520, halfHp: true, sig: true },
  guardianofalola: { name: '알로라의수호자', type: 'fairy', cat: 'spe', power: 1, pp: 1, cd: 0, kind: 'target', delay: .95, radius: 140, hpRatio: 0.75, z: true, zfx: 'guardian' },

  accelerock:  { name: '액셀록', type: 'rock', cat: 'phy', power: 40, pp: 20, cd: 0.7, kind: 'dash', dist: 190, speed: 1500, priority: true, sig: true, note: '바위 선공기. 전광석화보다 빠르게 파고든다.' },
  counter:     { name: '카운터', type: 'fighting', cat: 'sta', power: 0, pp: 20, cd: 3.4, kind: 'guard', guard: 1.15, counter: 2, statusOnly: true, note: '잠시 자세를 잡는다. 그 사이 물리 공격을 받으면 받은 데미지의 2배를 되돌린다.' },
  protect:     { name: '방어', type: 'normal', cat: 'sta', power: 0, pp: 10, cd: 4, kind: 'guard', guard: 1.2, protect: true, statusOnly: true, note: '잠시 모든 공격을 막는다. 노가드, 그리고 방어를 뚫는 특성의 접촉 기술은 막지 못한다.' },
  metronome:   { name: '손가락흔들기', type: 'normal', cat: 'sta', power: 0, pp: 10, cd: 2.6, kind: 'self', metronome: true, statusOnly: true, note: '손가락을 흔들어 아무 기술이나 하나를 쓴다. Z기술은 나오지 않는다.' },
  payday:      { name: '고양이돈받기', type: 'normal', cat: 'phy', power: 40, pp: 20, cd: 1.1, kind: 'proj', speed: 640, r: 10, range: 480, payday: true, sig: true, note: '동전을 던진다. 맞히면 이 기술의 PP를 1 돌려받는다.' },
  fakeout:     { name: '속이다', type: 'normal', cat: 'phy', power: 40, pp: 10, cd: 2.4, kind: 'melee', reach: 64, arc: 1.6, flinch: true, priority: true, opening: 6, sig: true, note: '나온 뒤 6초 안에만 맞는다. 맞히면 상대가 움찔해 행동이 끊긴다.' },
  sleeppowder: { name: '수면가루', type: 'grass', cat: 'sta', power: 0, pp: 15, cd: 3.6, kind: 'target', delay: .55, radius: 52, status: ['frz', 1], statusOnly: true, note: '가루를 뿌린다. 맞으면 얼어붙어 잠시 움직이지 못한다.' },
  quiverdance: { name: '나비춤', type: 'bug', cat: 'sta', power: 0, pp: 10, cd: 4.2, kind: 'self', boosts: ['spa', 'spd', 'spe'], statusOnly: true, sig: true, note: '춤을 춘다. 특수공격, 특수방어, 스피드가 오른다.' },
  fellstinger: { name: '마지막일침', type: 'bug', cat: 'phy', power: 50, pp: 15, cd: 1.5, kind: 'dash', dist: 180, speed: 1100, onko: 'atk', sig: true, note: '상대를 쓰러뜨리면 공격이 크게 오른다.' },
  noretreat:   { name: '배수의진', type: 'fighting', cat: 'sta', power: 0, pp: 5, cd: 5, kind: 'self', boosts: ['atk', 'def', 'spa', 'spd', 'spe'], trapSelf: true, statusOnly: true, sig: true, note: '공격·방어·특공·특방·스피드가 오르지만, 잠시 교체할 수 없다.' },
  firstimpression: { name: '만나자마자', type: 'bug', cat: 'phy', power: 90, pp: 10, cd: 2.2, kind: 'dash', dist: 230, speed: 1400, priority: true, opening: 6, sig: true, note: '나온 뒤 6초 안에만 맞는다. 타이밍이 지나면 빗나간다.' },
  gravapple:   { name: '사과산탄', type: 'grass', cat: 'phy', power: 80, pp: 10, cd: 1.6, kind: 'proj', speed: 620, r: 16, range: 500, ball: true, drop: ['def'], sig: true, note: '사과를 던져 맞히면 상대의 방어가 떨어진다.' },
  appleacid:   { name: '사과산', type: 'grass', cat: 'spe', power: 80, pp: 10, cd: 1.6, kind: 'proj', speed: 560, r: 14, range: 520, drop: ['spd'], sig: true, note: '산을 뿌려 맞히면 상대의 특수방어가 떨어진다.' },
  overdrive:   { name: '오버드라이브', type: 'electric', cat: 'spe', power: 80, pp: 10, cd: 2.2, kind: 'nova', radius: 150, sound: true, sig: true, note: '큰 소리의 전기 충격을 주위에 퍼뜨린다.' },
  firelash:    { name: '불꽃채찍', type: 'fire', cat: 'phy', power: 80, pp: 15, cd: 1.5, kind: 'melee', reach: 78, arc: 1.5, drop: ['def'], sig: true, note: '채찍처럼 후려 맞히면 상대의 방어가 떨어진다.' },
  tarshot:     { name: '타르샷', type: 'rock', cat: 'sta', power: 0, pp: 15, cd: 3.2, kind: 'proj', speed: 640, r: 12, range: 500, statusOnly: true, drop: ['spe'], tar: true, sig: true, note: '상대의 스피드를 떨어뜨리고, 8초 동안 불꽃 기술을 더 강하게 받게 한다.' },
  decorate:    { name: '데코레이션', type: 'fairy', cat: 'sta', power: 0, pp: 10, cd: 4, kind: 'self', boosts: ['atk', 'spa'], statusOnly: true, sig: true, note: '이 게임에서는 자신의 공격과 특수공격이 오른다.' },
  pyroball:    { name: '파이로볼', type: 'fire', cat: 'phy', power: 120, pp: 5, cd: 2.6, kind: 'proj', speed: 700, r: 16, range: 560, ball: true, status: ['brn', .1], fx: 'flame', sig: true, note: '불꽃 공을 찬다. 10% 확률로 화상.' },
  drumbeating: { name: '드럼어택', type: 'grass', cat: 'phy', power: 80, pp: 10, cd: 1.8, kind: 'nova', radius: 140, drop: ['spe'], sig: true, note: '북을 쳐 맞히면 상대의 스피드가 떨어진다.' },
  doubleironbash: { name: '더블아이언', type: 'steel', cat: 'phy', power: 60, pp: 5, cd: 1.6, kind: 'melee', reach: 72, arc: 1.5, count: 2, multiHit: true, punch: true, flinch: 0.3, sig: true, note: '강철 주먹을 두 번 날린다. 각각 30% 확률로 움찔하게 한다.' },
  volttackle:  { name: '볼트태클', type: 'electric', cat: 'phy', power: 120, pp: 15, cd: 2.8, kind: 'dash', dist: 240, speed: 1100, recoil: .33, status: ['par', .1], sig: true, note: '전기 몸으로 들이받는다. 준 피해의 33%를 받고, 10% 확률로 마비.' },
  icehammer:   { name: '아이스해머', type: 'ice', cat: 'phy', power: 100, pp: 10, cd: 2.4, kind: 'melee', reach: 74, arc: 1.5, punch: true, dropSelf: ['spe'], sig: true, note: '얼음 망치를 휘두른다. 자신의 스피드가 떨어진다.' },
  mortalspin:  { name: '킬러스핀', type: 'poison', cat: 'phy', power: 30, pp: 15, cd: 1.4, kind: 'nova', radius: 120, status: ['psn', 1], clearHazard: true, sig: true, note: '독 회전. 맞히면 독을 걸고, 필드의 거다이맥스 여파를 걷어 낸다.' },
  spicyextract:{ name: '스파이시익스트랙트', type: 'grass', cat: 'sta', power: 0, pp: 15, cd: 3.2, kind: 'proj', speed: 620, r: 12, range: 480, statusOnly: true, drop: ['def'], boostFoe: ['atk'], sig: true, note: '상대의 방어를 떨어뜨리고 공격을 올린다.' },
  magicpowder: { name: '매직파우더', type: 'psychic', cat: 'sta', power: 0, pp: 15, cd: 3.4, kind: 'target', delay: .5, radius: 48, statusOnly: true, powder: true, sig: true, note: '8초 동안 상대를 에스퍼 타입으로 만든다.' },
  topsyturvy:  { name: '뒤집어엎기', type: 'dark', cat: 'sta', power: 0, pp: 10, cd: 3.2, kind: 'target', delay: .4, radius: 48, statusOnly: true, invert: true, sig: true, note: '상대의 능력 변화를 반대로 뒤집는다.' },
};

// 다이맥스 기술. 공격 기술은 타입별로 바뀌고, 변화 기술은 다이월이 된다.
const MAX_BY_TYPE = {
  normal:   { name: '다이아택',   effect: null },
  fire:     { name: '다이번',     effect: 'sun' },
  water:    { name: '다이스트림', effect: 'rain' },
  electric: { name: '다이썬더',   effect: 'electric' },
  grass:    { name: '다이그래스', effect: 'grassy' },
  ice:      { name: '다이아이스', effect: 'snow' },
  fighting: { name: '다이너클',   effect: 'atk' },
  poison:   { name: '다이애시드', effect: 'spa' },
  ground:   { name: '다이아스',   effect: 'spd' },
  flying:   { name: '다이제트',   effect: 'spe' },
  psychic:  { name: '다이사이코', effect: 'psychic' },
  bug:      { name: '다이웜',     effect: 'spddown' },
  rock:     { name: '다이록',     effect: 'sand' },
  ghost:    { name: '다이할로우', effect: 'defdown' },
  dragon:   { name: '다이돌핀',   effect: 'atkdown' },
  dark:     { name: '다이아크',   effect: 'spadown' },
  steel:    { name: '다이스틸',   effect: 'def' },
  fairy:    { name: '다이페어리', effect: 'misty' },
};
function maxMovePower(power, type) {
  const low = type === 'fighting' || type === 'poison';
  if (power >= 150) return low ? 100 : 150;
  if (power >= 110) return low ? 95 : 140;
  if (power >= 75) return low ? 90 : 130;
  if (power >= 65) return low ? 85 : 120;
  if (power >= 55) return low ? 80 : 110;
  if (power >= 45) return low ? 75 : 100;
  return low ? 70 : 90;
}
// 전용 거다이맥스 기술. 그 타입의 다이맥스 기술 대신 나간다.
const GMAX_MOVES = {
  venusaur:     { type: 'grass',    name: '거다이편달',   effect: 'hazard' },
  charizard:    { type: 'fire',     name: '거다이옥염',   effect: 'hazard' },
  blastoise:    { type: 'water',    name: '거다이포격',   effect: 'hazard' },
  pikachu:      { type: 'electric', name: '거다이만뢰',   effect: 'par' },
  gengar:       { type: 'ghost',    name: '거다이환영',   effect: 'trap' },
  machamp:      { type: 'fighting', name: '거다이회심격', effect: 'crit' },
  kingler:      { type: 'water',    name: '거다이포말',   effect: 'spedown' },
  lapras:       { type: 'ice',      name: '거다이선율',   effect: 'veil' },
  snorlax:      { type: 'normal',   name: '거다이재생',   effect: 'heal' },
  rillaboom:    { type: 'grass',    name: '거다이난타',   effect: 'ignore', ignoresAbility: true },
  cinderace:    { type: 'fire',     name: '거다이화염구', effect: 'ignore', ignoresAbility: true },
  inteleon:     { type: 'water',    name: '거다이저격',   effect: 'ignore', ignoresAbility: true },
  corviknight:  { type: 'flying',   name: '거다이풍격',   effect: 'clear' },
  hatterene:    { type: 'fairy',    name: '거다이천벌',   effect: 'confuse' },
  grimmsnarl:   { type: 'dark',     name: '거다이수마',   effect: 'yawn' },
  urshifu:      { type: 'dark',     name: '거다이일격',   effect: 'sure', pierceGuard: true },
  urshifurapid: { type: 'water',    name: '거다이연격',   effect: 'sure', pierceGuard: true },
  drednaw:      { type: 'water',    name: '거다이암진' },
  melmetal:     { type: 'steel',    name: '거다이융격' },
  butterfree:   { type: 'bug',      name: '거다고혹',   effect: 'befuddle' },
  meowth:       { type: 'normal',   name: '거다이금화', effect: 'confuse' },
  eevee:        { type: 'normal',   name: '거다이포옹', effect: 'atkdown' },
  garbodor:     { type: 'poison',   name: '거다이악취', effect: 'psn' },
  orbeetle:     { type: 'psychic',  name: '거다이천도', effect: 'spedown' },
  coalossal:    { type: 'rock',     name: '거다이분석', effect: 'hazard' },
  flapple:      { type: 'grass',    name: '거다이산격', effect: 'defdown' },
  appletun:     { type: 'grass',    name: '거다이감로', effect: 'cure' },
  sandaconda:   { type: 'ground',   name: '거다이사진', effect: 'trap' },
  toxtricity:   { type: 'electric', name: '거다이감전', effect: 'stunshock' },
  toxtricitylow:{ type: 'electric', name: '거다이감전', effect: 'stunshock' },
  centiskorch:  { type: 'fire',     name: '거다이백화', effect: 'hazard' },
  alcremie:     { type: 'fairy',    name: '거다이단원', effect: 'heal' },
  copperajah:   { type: 'steel',    name: '거다이강철진', effect: 'hazard' },
  duraludon:    { type: 'dragon',   name: '거다이감쇠', effect: 'pp' },
};

const STAT_KO = { atk: '공격', def: '방어', spa: '특수공격', spd: '특수방어', spe: '스피드' };
const STATUS_KO = { brn: '화상', par: '마비', frz: '얼음', psn: '독', tri: '화상·마비·얼음 중 하나' };
const MAX_EFFECT_KO = {
  sun: '쾌청을 깐다. 불꽃이 세지고 물이 약해진다',
  rain: '비를 내리게 한다. 물이 세지고 불꽃이 약해진다',
  sand: '모래바람을 일으킨다',
  snow: '눈을 내리게 한다',
  electric: '일렉트릭필드를 깐다',
  psychic: '사이코필드를 깐다',
  grassy: '그래스필드를 깐다',
  misty: '미스트필드를 깐다',
  atk: '자신의 공격이 오른다', def: '자신의 방어가 오른다', spa: '자신의 특수공격이 오른다', spe: '자신의 스피드가 오른다', spd: '자신의 특수방어가 오른다',
  atkdown: '상대의 공격이 떨어진다', defdown: '상대의 방어가 떨어진다', spadown: '상대의 특수공격이 떨어진다', spddown: '상대의 특수방어가 떨어진다', spedown: '상대의 스피드가 떨어진다',
  hazard: '같은 타입이 아닌 상대에게 한동안 지속 피해를 준다',
  crit: '급소에 맞히기 쉬워진다',
  heal: '자신의 HP를 회복한다',
  veil: '잠시 받는 데미지가 절반이 된다',
  trap: '상대가 잠시 교체할 수 없다',
  confuse: '상대를 혼란에 빠뜨린다',
  yawn: '상대를 졸게 한 뒤 잠들게 한다',
  clear: '필드 효과를 걷어 낸다',
  par: '상대를 반드시 마비시킨다',
  ignore: '상대의 특성을 무시하고 때린다',
  sure: '방어와 회피를 뚫고 맞힌다',
  befuddle: '독·마비·얼음 중 하나를 건다',
  stunshock: '독 또는 마비를 건다',
  psn: '상대를 독에 걸리게 한다',
  cure: '자신의 HP를 회복하고 상태이상을 낫게 한다',
  pp: '상대 기술의 PP를 깎는다',
};
function moveText(mv) {
  if (!mv) return '';
  if (mv.max) {
    if (mv.kind === 'guard' && !mv.maxEffect) return '공격을 잠시 막아 낸다.';
    const extra = mv.maxEffect && MAX_EFFECT_KO[mv.maxEffect];
    return extra ? extra + '.' : '다이맥스 기술.';
  }
  if (mv.note) return mv.note;
  const bits = [];
  if (mv.priority) bits.push('빠르게 나간다');
  if (mv.opening) bits.push('나온 직후에만 성공한다');
  if (mv.sucker) bits.push('상대가 기술을 쓰는 중에만 맞는다');
  if (mv.first) bits.push('자신이 더 빠르면 위력이 2배');
  if (mv.counter) bits.push('물리 공격을 받으면 ' + mv.counter + '배로 되돌린다');
  if (mv.boosts) bits.push(mv.boosts.map(s => STAT_KO[s]).join('·') + ' 상승');
  if (mv.drop) bits.push('맞히면 상대의 ' + mv.drop.map(s => STAT_KO[s]).join('·') + ' 하락');
  if (mv.dropSelf) bits.push('쓰면 자신의 ' + mv.dropSelf.map(s => STAT_KO[s]).join('·') + ' 하락');
  if (mv.onko) bits.push('쓰러뜨리면 자신의 ' + STAT_KO[mv.onko] + '이 크게 오른다');
  if (mv.status) bits.push(Math.round(mv.status[1] * 100) + '% 확률로 ' + (STATUS_KO[mv.status[0]] || '상태이상'));
  if (mv.flinch) bits.push('맞히면 상대가 움찔한다');
  if (mv.recoil) bits.push('준 데미지의 ' + Math.round(mv.recoil * 100) + '%를 자신이 받는다');
  if (mv.crash) bits.push('빗나가면 최대 HP의 ' + Math.round(mv.crash * 100) + '%를 잃는다');
  if (mv.drain) bits.push('준 데미지의 ' + Math.round(mv.drain * 100) + '%만큼 회복한다');
  if (mv.critBoost) bits.push('급소에 맞기 쉽다');
  if (mv.alwaysCrit) bits.push('항상 급소에 맞는다');
  if (mv.facade) bits.push('자신이 상태이상이면 위력이 2배');
  if (mv.hex) bits.push('상대가 상태이상이면 위력이 2배');
  if (mv.halfHp) bits.push('상대의 남은 HP를 절반 깎는다');
  if (mv.hpRatio) bits.push('상대의 남은 HP를 크게 깎는다');
  if (mv.selfStun) bits.push('쓰고 나면 잠시 굳는다');
  if (mv.charge) bits.push('발사 전에 조준한다');
  if (mv.multiHit || (mv.count && mv.count > 1)) bits.push((mv.rollHits ? '2~5발' : (mv.count || 2) + '발') + ' 나간다');
  if (mv.sound) bits.push('소리로 공격한다');
  if (mv.payday) bits.push('맞히면 PP를 1 돌려받는다');
  if (mv.tar) bits.push('상대가 잠시 불꽃에 약해진다');
  if (mv.powder) bits.push('상대를 잠시 에스퍼 타입으로 만든다');
  if (mv.invert) bits.push('상대의 능력 변화를 뒤집는다');
  if (mv.boostFoe) bits.push('상대의 ' + mv.boostFoe.map(s => STAT_KO[s]).join('·') + ' 상승');
  if (mv.smackDown) bits.push('비행과 부유를 무시하고, 맞으면 땅에 내려앉는다');
  if (mv.trap) bits.push('맞으면 한동안 교체할 수 없다');
  if (mv.suppress) bits.push('이미 기술을 쓴 상대의 특성을 지운다');
  if (mv.terrainDash) bits.push('그래스필드에서는 더 빠르게 미끄러진다');
  if (mv.pivot) bits.push('맞힌 뒤 다른 포켓몬으로 돌아간다');
  if (mv.protect) bits.push('잠시 모든 공격을 막는다');
  if (mv.ignoresAbility) bits.push('상대의 특성을 무시한다');
  if (mv.freezeDry) bits.push('물 타입에게 효과가 굉장하다');
  if (!bits.length && mv.power > 0) bits.push(mv.cat === 'phy' ? '물리 공격' : '특수 공격');
  if (!bits.length) bits.push('변화 기술');
  return bits.join('. ') + '.';
}
function battleMove(mon, id) {
  const base = MOVES[id];
  if (!base || !mon || !(mon.dmax || mon.gmax) || id === 'struggle' || base.z) return base;
  if (!base.power || base.statusOnly) {
    return {
      id: base.id, name: '다이월', type: 'normal', cat: 'sta', power: 0, cd: Math.max(base.cd || 1, 2.2),
      kind: 'guard', guard: 1.15, max: true,
    };
  }
  const type = base.type === 'none' ? 'normal' : base.type;
  const gmax = mon.gmax && mon.baseSp && GMAX_MOVES[mon.baseSp.key];
  const info = (gmax && gmax.type === type) ? gmax : (MAX_BY_TYPE[type] || MAX_BY_TYPE.normal);
  const mv = {
    ...base,
    name: info.name,
    type,
    power: maxMovePower(base.power, type),
    max: true,
    maxEffect: info.effect,
    ignoresAbility: !!info.ignoresAbility,
    pierceGuard: !!info.pierceGuard,
    status: info.effect === 'par' ? ['par', 1] : null,
    statusOnly: false,
    recoil: 0,
    selfStun: 0,
    halfHp: false,
    hpRatio: 0,
    flinch: false,
    drain: 0,
    count: 1,
    rollHits: false,
    multiHit: false,
    cd: Math.max(base.cd || 1, 1.35),
  };
  if (mv.kind === 'beam' && mv.width) mv.width = Math.round(mv.width * 1.25);
  if (mv.kind === 'nova' && mv.radius) mv.radius = Math.round(mv.radius * 1.2);
  if (mv.kind === 'melee' && mv.reach) mv.reach = Math.round(mv.reach * 1.15);
  if (mv.kind === 'proj' && mv.r) mv.r = Math.round(mv.r * 1.35);
  if (mv.kind === 'target' && mv.radius) mv.radius = Math.round(mv.radius * 1.15);
  return mv;
}

// 전용 Z기술. 메가·거다이맥스와 따로, 팀당 1번.
const Z_MOVES = {
  pikachu: 'catastropika',
  ashpikachu: 'tenmillionvolt',
  snorlax: 'pulverizingpancake',
  mimikyu: 'letsnuggleforever',
  decidueye: 'sinisterarrowraid',
  incineroar: 'maliciousmoonsault',
  primarina: 'oceanicoperetta',
  kommoo: 'clangoroussoulblaze',
  mew: 'genesissupernova',
  solgaleo: 'searingsunrazesmash',
  necrozmadusk: 'searingsunrazesmash',
  lunala: 'menacingmoonrazemaelstrom',
  necrozmadawn: 'menacingmoonrazemaelstrom',
  tapukoko: 'guardianofalola',
  tapulele: 'guardianofalola',
  tapubulu: 'guardianofalola',
  tapufini: 'guardianofalola',
};
// 워그레이몬 + 메탈가루몬이 같은 팀에 있으면 Z키로 레벨 100 오메가몬이 된다.
const JOGRESS = { wargreymon: 'metalgarurumon', metalgarurumon: 'wargreymon' };
function jogressPartner(side) {
  if (!side || !side.mon || !side.mon.baseSp) return null;
  const need = JOGRESS[side.mon.baseSp.key];
  if (!need || side.mon.transformed) return null;
  for (let i = 0; i < side.team.length; i++) {
    if (i === side.active) continue;
    const m = side.team[i];
    if (m && !m.fainted && m.baseSp && m.baseSp.key === need && !m.transformed) return m;
  }
  return null;
}
function zMoveId(mon) {
  if (!mon || !mon.baseSp) return null;
  if (mon.megaed && mon.sp && mon.sp.id === 10157) return 'lightthatburnsthesky';
  return Z_MOVES[mon.baseSp.key] || null;
}

const ABILITIES = {
  wonderguard:  { name: '불가사의부적', desc: '효과가 굉장한(약점) 공격만 받는다. 타입 없는 발버둥과 공격 외 데미지(상태이상·용암·모래바람·까칠한피부)는 막지 못한다.' },
  moldbreaker:  { name: '틀깨기',       desc: '상대의 특성을 무시하고 공격한다. 불가사의부적도 뚫는다.' },
  turboblaze:   { name: '터보블레이즈', desc: '상대의 특성을 무시하고 공격한다.' },
  teravolt:     { name: '테라볼티지',   desc: '상대의 특성을 무시하고 공격한다.' },
  levitate:     { name: '부유',         desc: '땅 타입 기술을 받지 않고 용암 위도 떠서 지나간다.' },
  blaze:        { name: '맹화',         desc: 'HP가 1/3 이하일 때 불꽃 기술 위력 1.5배.' },
  torrent:      { name: '급류',         desc: 'HP가 1/3 이하일 때 물 기술 위력 1.5배.' },
  overgrow:     { name: '심록',         desc: 'HP가 1/3 이하일 때 풀 기술 위력 1.5배.' },
  static:       { name: '정전기',       desc: '근접·돌진 공격을 한 상대를 30% 확률로 마비시킨다.' },
  voltabsorb:   { name: '축전',         desc: '전기 기술을 맞으면 데미지 대신 HP를 25% 회복한다.' },
  waterabsorb:  { name: '저수',         desc: '물 기술을 맞으면 데미지 대신 HP를 25% 회복한다.' },
  flashfire:    { name: '타오르는불꽃', desc: '불꽃 기술을 받지 않고, 맞으면 자신의 불꽃 기술 위력이 1.5배가 된다.' },
  intimidate:   { name: '위협',         desc: '등장할 때 상대의 공격을 2/3로 낮춘다 (상대가 교체할 때까지).' },
  multiscale:   { name: '멀티스케일',   desc: 'HP가 가득 찼을 때 받는 데미지가 절반.' },
  thickfat:     { name: '두꺼운지방',   desc: '불꽃·얼음 기술 데미지가 절반.' },
  pressure:     { name: '프레셔',       desc: '상대가 기술을 쓸 때 PP를 1 더 소모시킨다.' },
  powerconstruct:{ name: '스웜체인지',   desc: 'HP가 절반 이하가 되면 한 번 퍼펙트폼으로 변한다. 쓰러뜨릴 공격이어도 변하며, 늘어난 최대 HP만큼 체력이 채워진다.' },
  suppressed:   { name: '특성 없음',   desc: '특성이 지워진 상태다.' },
  airlock:      { name: '에어록',       desc: '필드에 있는 동안 날씨의 효과가 사라진다.' },
  speedboost:   { name: '가속',         desc: '필드에 있는 동안 점점 빨라진다 (최대 +50%).' },
  technician:   { name: '테크니션',     desc: '위력 60 이하 기술의 위력이 1.5배.' },
  serenegrace:  { name: '하늘의은총',   desc: '기술의 상태이상 추가효과 확률이 2배.' },
  magicguard:   { name: '매직가드',     desc: '공격 외의 데미지(화상·독·용암·모래바람·반동)를 받지 않는다.' },
  disguise:     { name: '탈',           desc: '배틀 중 처음 받는 공격 1번을 대신 맞고, 최대 HP의 1/8만 잃는다.' },
  innerfocus:   { name: '정신력',       desc: '공격에 맞아도 풀죽어 굳지 않는다.' },
  clearbody:    { name: '클리어바디',   desc: '위협으로 공격이 떨어지지 않는다.' },
  roughskin:    { name: '까칠한피부',   desc: '근접·돌진 공격을 한 상대에게 최대 HP 1/8 데미지.' },
  protean:      { name: '변환자재',     desc: '모든 기술에 자속 보정(1.5배)이 붙는다.' },
  libero:       { name: '리베로',       desc: '모든 기술에 자속 보정(1.5배)이 붙는다.' },
  adaptability: { name: '적응력',       desc: '자속 보정이 1.5배에서 2배가 된다.' },
  superluck:    { name: '대운',         desc: '급소에 맞힐 확률이 올라간다.' },
  cursedbody:   { name: '저주받은바디', desc: '공격받으면 30% 확률로 그 기술의 쿨타임이 4초 늘어난다.' },
  noguard:      { name: '노가드',       desc: '자신의 공격은 상대의 회피(무적 시간)를 무시하고 맞는다.' },
  sandstream:   { name: '모래날림',     desc: '등장하면 25초간 모래바람. 바위·땅·강철 외에는 지속 데미지, 바위 타입은 특방 1.5배.' },
  drought:      { name: '가뭄',         desc: '등장하면 25초간 쾌청. 불꽃 1.5배, 물 0.5배, 솔라빔 즉시 발사.' },
  drizzle:      { name: '잔비',         desc: '등장하면 25초간 비. 물 1.5배, 불꽃 0.5배.' },
  electricsurge:{ name: '일렉트릭메이커', desc: '등장하면 25초간 일렉트릭필드. 땅에 있는 포켓몬의 전기 기술 위력 1.3배.' },
  psychicsurge: { name: '사이코메이커', desc: '등장하면 25초간 사이코필드. 땅에 있는 포켓몬의 에스퍼 기술 위력 1.3배.' },
  grassysurge:  { name: '그래스메이커', desc: '등장하면 25초간 그래스필드. 땅에 있는 포켓몬의 풀 기술 위력 1.3배.' },
  mistysurge:   { name: '미스트메이커', desc: '등장하면 25초간 미스트필드. 땅에 있는 포켓몬은 상태이상에 걸리지 않고, 드래곤 기술을 절반만 받는다.' },
  trace:        { name: '트레이스',     desc: '등장할 때 상대의 특성을 복사한다 (일부 특성 제외).' },
  synchronize:  { name: '싱크로',       desc: '상대 때문에 화상·마비·독에 걸리면 상대도 같은 상태가 된다.' },
  regenerator:  { name: '재생력',       desc: '교체로 물러나면 HP를 1/3 회복한다.' },
  multitype:    { name: '멀티타입',     desc: '상태이상에 걸리지 않는다.' },
  legendplate:  { name: '레전드플레이트', desc: '기술을 쓰면 그 타입으로 변한다. 심판의뭉치는 상대 약점에 맞춰지고, 상태이상에 걸리지 않는다.' },
  neuroforce:   { name: '브레인포스',   desc: '효과가 굉장한 기술의 위력이 1.25배.' },
  lightningrod: { name: '피뢰침',       desc: '전기 기술을 받지 않고, 맞으면 특공이 1.5배가 된다.' },
  motordrive:   { name: '전기엔진',     desc: '전기 기술을 받지 않고, 맞으면 스피드가 올라간다.' },
  sapsipper:    { name: '초식',         desc: '풀 기술을 받지 않고, 맞으면 공격이 1.5배가 된다.' },
  bulletproof:  { name: '방탄',         desc: '구슬·폭탄 계열 기술(섀도볼, 에너지볼, 파동탄 등)을 받지 않는다.' },
  sheerforce:   { name: '우격다짐',     desc: '추가효과(상태이상·풀죽음)가 있는 기술의 위력이 1.3배, 대신 추가효과가 사라진다.' },
  sturdy:       { name: '옹골참',       desc: 'HP가 가득 찼을 때 한 방에 쓰러질 공격을 받아도 HP 1로 버틴다.' },
  naturalcure:  { name: '자연회복',     desc: '교체로 물러나면 상태이상이 낫는다.' },
  scrappy:      { name: '배짱',         desc: '노말·격투 기술이 고스트 타입에게도 맞는다.' },
  magicbounce:  { name: '매직미러',     desc: '상대 기술의 상태이상 추가효과를 그대로 되돌려 보낸다.' },
  pixilate:     { name: '페어리스킨',   desc: '노말 기술이 페어리 타입이 되고 위력이 1.2배.' },
  aerilate:     { name: '스카이스킨',   desc: '노말 기술이 비행 타입이 되고 위력이 1.2배.' },
  dragonize:    { name: '드래곤스킨',   desc: '노말 기술이 드래곤 타입이 되고 위력이 1.2배.' },
  refrigerate:  { name: '프리즈스킨',   desc: '노말 기술이 얼음 타입이 되고 위력이 1.2배.' },
  swarm:        { name: '벌레의알림',   desc: 'HP가 1/3 이하일 때 벌레 기술 위력 1.5배.' },
  moxie:        { name: '자기과신',     desc: '상대를 쓰러뜨리면 공격이 오른다.' },
  chillingneigh:{ name: '백의울음',     desc: '상대를 쓰러뜨리면 공격이 오른다.' },
  grimneigh:    { name: '흑의울음',     desc: '상대를 쓰러뜨리면 특수공격이 오른다.' },
  beastboost:   { name: '비스트부스트', desc: '상대를 쓰러뜨리면 가장 높은 능력이 오른다.' },
  berserk:      { name: '분노의경혈',   desc: 'HP가 절반 이하가 되면 특수공격이 오른다.' },
  poisonpoint:  { name: '독가시',       desc: '근접·돌진 공격을 한 상대를 30% 확률로 독에 걸리게 한다.' },
  snowwarning:  { name: '눈퍼뜨리기',   desc: '등장하면 25초간 눈. 얼음 타입의 방어가 1.5배.' },
  stalwart:     { name: '굳건한신념',   desc: '기술을 끌어당기는 효과를 무시한다.' },
  infiltrator:  { name: '틈새포착',     desc: '빛의장막·리플렉터·신비의부적을 무시하고 공격한다.' },
  piercingdrill:{ name: '관통드릴',     desc: '방어하고 있는 상대에게도 접촉 기술이 맞는다.' },
  chlorophyll:  { name: '엽록소',       desc: '쾌청일 때 스피드 1.5배.' },
  swiftswim:    { name: '쓱쓱',         desc: '비가 올 때 스피드 1.5배.' },
  guts:         { name: '근성',         desc: '상태이상일 때 공격 1.5배. 화상으로 공격이 줄지 않는다.' },
  marvelscale:  { name: '이상한비늘',   desc: '상태이상일 때 방어 1.5배.' },
  flamebody:    { name: '불꽃몸',       desc: '근접·돌진 공격을 한 상대를 30% 확률로 화상 상태로 만든다.' },
  solidrock:    { name: '하드록',       desc: '효과가 굉장한 공격의 데미지를 0.75배로 줄인다.' },
  filter:       { name: '필터',         desc: '효과가 굉장한 공격의 데미지를 0.75배로 줄인다.' },
  mirrorarmor:  { name: '미러아머',     desc: '위협 등으로 능력이 떨어지면 상대에게 그대로 되돌린다.' },
  toughclaws:   { name: '단단한발톱',   desc: '근접·돌진 기술의 위력이 1.3배.' },
  megalauncher: { name: '메가런처',     desc: '파동 기술(파동탄·용의파동·악의파동 등)의 위력이 1.5배.' },
  strongjaw:    { name: '옹골찬턱',     desc: '물기 기술(물기·깨물어부수기·엄니 등)의 위력이 1.5배.' },
  ironfist:     { name: '철주먹',       desc: '펀치 기술의 위력이 1.2배.' },
  reckless:     { name: '이판사판',     desc: '반동이 있는 기술의 위력이 1.2배.' },
  shadowtag:    { name: '그림자밟기',   desc: '필드에 있는 동안 상대는 교체할 수 없다 (고스트 타입 제외).' },
  parentalbond: { name: '부자유친',     desc: '모든 공격이 두 번 맞는다 (두 번째는 위력 1/4).' },
  steadfast:    { name: '불굴의마음',   desc: '풀죽으면 스피드가 올라간다.' },
  insomnia:     { name: '불면',         desc: '잠들지 않는다. 이 게임에서는 얼음(행동불능) 상태가 되지 않는다.' },
  skilllink:    { name: '스킬링크',     desc: '2~5발로 쏘는 기술은 항상 5발이 나간다. 그 외 여러 발 기술은 2발 더 나간다.' },
  solarpower:   { name: '선파워',       desc: '쾌청일 때 특공 1.5배.' },
  sandforce:    { name: '모래의힘',     desc: '모래바람일 때 바위·땅·강철 기술 위력 1.3배. 모래바람 데미지를 받지 않는다.' },
  deltastream:  { name: '델타스트림',   desc: '필드에 있는 동안 날씨를 없애고, 비행 타입의 약점을 지워 준다.' },
  shellarmor:   { name: '조가비갑옷',   desc: '급소에 맞지 않는다.' },
  tangledfeet:  { name: '갈지자걸음',   desc: '상태이상일 때 회피 쿨타임이 절반이 된다.' },
  intrepidsword:{ name: '불요의검',     desc: '등장할 때 공격이 1.5배가 된다.' },
  dauntlessshield:{ name: '불굴의방패', desc: '등장할 때 방어가 1.5배가 된다.' },
  primordialsea:{ name: '시작의바다',   desc: '등장하면 큰비가 내린다. 불꽃 기술은 실패하고, 물 기술 위력이 1.5배가 된다. 일반 날씨로는 바뀌지 않는다.' },
  desolateland: { name: '끝의대지',     desc: '등장하면 큰가뭄이 된다. 물 기술은 실패하고, 불꽃 기술 위력이 1.5배가 된다. 일반 날씨로는 바뀌지 않는다.' },
  hugepower:    { name: '천하장사',     desc: '공격이 2배가 된다.' },
  auraguard:    { name: '오라가드',     desc: '접촉 기술(근접·돌진)의 데미지가 절반이 된다.' },
  fullmetalbody:{ name: '메탈프로텍트', desc: '위협으로 공격이 떨어지지 않는다.' },
  shadowshield: { name: '스펙터가드',   desc: 'HP가 가득 찼을 때 받는 데미지가 절반.' },
  prismarmor:   { name: '프리즘아머',   desc: '효과가 굉장한 공격의 데미지를 0.75배로 줄인다.' },
  fairyaura:    { name: '페어리오라',   desc: '필드의 페어리 기술 위력이 1.33배.' },
  darkaura:     { name: '다크오라',     desc: '필드의 악 기술 위력이 1.33배.' },
  orichalcumpulse:{ name: '진홍빛고동', desc: '등장하면 25초간 쾌청. 쾌청일 때 공격 1.3배.' },
  hadronengine: { name: '하드론엔진',   desc: '전기 특수 기술의 위력이 1.3배.' },
  royalknight:  { name: '로열나이트',   desc: '불꽃·얼음 기술의 위력이 1.3배.' },
  battlebond:   { name: '유대변화',     desc: '물수리검의 위력이 올라간다.' },
  tabletsofruin:{ name: '재앙의목간',   desc: '자신 외 포켓몬의 공격을 0.75배로 낮춘다.' },
  swordofruin:  { name: '재앙의검',     desc: '자신 외 포켓몬의 방어를 0.75배로 낮춘다.' },
  vesselofruin: { name: '재앙의그릇',   desc: '자신 외 포켓몬의 특수공격을 0.75배로 낮춘다.' },
  beadsofruin:  { name: '재앙의구슬',   desc: '자신 외 포켓몬의 특수방어를 0.75배로 낮춘다.' },
  goodasgold:   { name: '황금몸',       desc: '상태이상만 거는 기술을 받지 않는다.' },
  thermalexchange:{ name: '열교환',     desc: '불꽃 기술을 맞으면 공격이 오르고, 화상에 걸리지 않는다.' },
  justified:    { name: '정의의마음',   desc: '악 기술을 맞으면 공격이 오른다.' },
  limber:       { name: '유연',         desc: '마비 상태가 되지 않는다.' },
  defiant:      { name: '오기',         desc: '위협으로 능력이 떨어질 때 공격이 크게 오른다.' },
  baddreams:    { name: '나이트메어',   desc: '얼음 상태인 상대에게 2초마다 최대 HP의 1/8 피해.' },
  contrary:     { name: '심술꾸러기',   desc: '위협으로 공격이 떨어질 때 오히려 공격이 오른다.' },
  prankster:    { name: '짓궂은마음',   desc: '상태이상만 거는 기술의 낙하가 빨라진다.' },
  unseenfist:   { name: '보이지않는주먹', desc: '방어 중인 상대에게도 접촉 기술이 맞는다.' },
  imposter:     { name: '괴짜',         desc: '등장하면 상대 포켓몬으로 변신한다. 타입·능력·특성·기술(PP 5)을 복사하고 HP만 자신의 것을 쓴다.' },
};

// 종족값: [HP, 공격, 방어, 특공, 특방, 스피드]
// extra: 랜덤 기술 뽑기에 추가로 나오는 기술
const POKEMON = [
  { id: 19,  key: 'rattata',   name: '꼬렛',       types: ['normal'],            base: [30, 56, 35, 25, 35, 72],     moves: ['hyperbeam', 'quickattack', 'crunch', 'facade'], extra: ['irontail', 'suckerpunch', 'shadowclaw'], fixedLevel: 100 },
  { id: 25,  key: 'pikachu',   name: '피카츄',     types: ['electric'],          base: [35, 55, 40, 50, 50, 90],     moves: ['volttackle', 'thunderbolt', 'quickattack', 'thunder'], extra: ['irontail'] },
  { id: 10094, key: 'ashpikachu', name: '지우피카츄', types: ['electric'],       base: [35, 55, 40, 50, 50, 90],     moves: ['thunderbolt', 'quickattack', 'irontail', 'thunder'], extra: ['wildcharge'],fixedLevel: 100 },
  { id: 6,   key: 'charizard', name: '리자몽',     types: ['fire', 'flying'],    base: [78, 84, 78, 109, 85, 100],   moves: ['flamethrower', 'airslash', 'dragonclaw', 'fireblast'], extra: ['earthquake', 'solarbeam', 'dragonpulse'] },
  { id: 9,   key: 'blastoise', name: '거북왕',     types: ['water'],             base: [79, 83, 100, 85, 105, 78],   moves: ['hydropump', 'surf', 'icebeam', 'bite'], extra: ['aurasphere', 'darkpulse', 'dragonpulse', 'flashcannon'] },
  { id: 3,   key: 'venusaur',  name: '이상해꽃',   types: ['grass', 'poison'],   base: [80, 82, 83, 100, 100, 80],   moves: ['razorleaf', 'sludgebomb', 'solarbeam', 'petalblizzard'], extra: ['earthquake', 'earthpower'] },
  { id: 94,  key: 'gengar',    name: '팬텀',       types: ['ghost', 'poison'],   base: [60, 65, 60, 130, 75, 110],   moves: ['shadowball', 'sludgebomb', 'darkpulse', 'thunderbolt'], extra: ['focusblast', 'dazzlinggleam', 'icywind'] },
  { id: 448, key: 'lucario',   name: '루카리오',   types: ['fighting', 'steel'], base: [70, 110, 70, 115, 70, 90],   moves: ['aurasphere', 'closecombat', 'flashcannon', 'extremespeed'], extra: ['darkpulse', 'dragonpulse', 'psychic', 'crunch'] },
  { id: 445, key: 'garchomp',  name: '한카리아스', types: ['dragon', 'ground'],  base: [108, 130, 95, 80, 85, 102],  moves: ['dragonclaw', 'earthquake', 'dragonrush', 'stoneedge'], extra: ['firefang', 'poisonjab', 'ironhead'] },
  { id: 130, key: 'gyarados',  name: '갸라도스',   types: ['water', 'flying'],   base: [95, 125, 79, 60, 100, 81],   moves: ['waterfall', 'crunch', 'icefang', 'hyperbeam'], extra: ['earthquake', 'bravebird', 'outrage'] },
  { id: 149, key: 'dragonite', name: '망나뇽',     types: ['dragon', 'flying'],  base: [91, 134, 95, 100, 100, 80],  moves: ['dragonclaw', 'extremespeed', 'hurricane', 'hyperbeam'], extra: ['earthquake', 'firepunch', 'thunderpunch', 'icepunch'] },
  { id: 143, key: 'snorlax',   name: '잠만보',     types: ['normal'],            base: [160, 110, 65, 65, 110, 30],  moves: ['bodyslam', 'earthquake', 'crunch', 'gigaimpact'], extra: ['icepunch', 'firepunch', 'heavyslam'] },
  { id: 430, key: 'honchkrow', name: '돈크로우',   types: ['dark', 'flying'],    base: [100, 125, 52, 105, 52, 71],  moves: ['bravebird', 'nightslash', 'suckerpunch', 'heatwave'], extra: ['darkpulse', 'airslash'] },
  { id: 658, key: 'greninja',  name: '개굴닌자',   types: ['water', 'dark'],     base: [72, 95, 67, 103, 71, 122],   moves: ['watershuriken', 'darkpulse', 'nightslash', 'icebeam'], extra: ['uturn', 'gunkshot', 'icywind'] },
  { id: 131, key: 'lapras',    name: '라프라스',   types: ['water', 'ice'],      base: [130, 85, 80, 85, 95, 60],    moves: ['icebeam', 'surf', 'blizzard', 'thunderbolt'], extra: ['psychic', 'bodyslam'] },
  { id: 65,  key: 'alakazam',  name: '후딘',       types: ['psychic'],           base: [55, 50, 45, 135, 95, 120],   moves: ['psychic', 'psybeam', 'shadowball', 'energyball'], extra: ['focusblast', 'dazzlinggleam'] },
  { id: 68,  key: 'machamp',   name: '괴력몬',     types: ['fighting'],          base: [90, 130, 80, 65, 85, 55],    moves: ['crosschop', 'dynamicpunch', 'stoneedge', 'icepunch'], extra: ['knockoff', 'thunderpunch', 'firepunch'] },
  { id: 248, key: 'tyranitar', name: '마기라스',   types: ['rock', 'dark'],      base: [100, 134, 110, 95, 100, 61], moves: ['stoneedge', 'crunch', 'earthquake', 'rockslide'], extra: ['icepunch', 'firepunch', 'darkpulse'] },
  { id: 212, key: 'scizor',    name: '핫삼',       types: ['bug', 'steel'],      base: [70, 130, 100, 55, 80, 65],   moves: ['bulletpunch', 'xscissor', 'ironhead', 'quickattack'], extra: ['knockoff', 'nightslash', 'aerialace'] },
  { id: 257, key: 'blaziken',  name: '번치코',     types: ['fire', 'fighting'],  base: [80, 120, 70, 110, 70, 80],   moves: ['blazekick', 'highjumpkick', 'flareblitz', 'flamethrower'], extra: ['thunderpunch', 'stoneedge', 'focusblast'] },
  { id: 254, key: 'sceptile',  name: '나무킹',     types: ['grass'],             base: [70, 85, 65, 105, 85, 120],   moves: ['leafblade', 'energyball', 'leafstorm', 'dragonclaw'], extra: ['dragonpulse', 'earthquake', 'focusblast'] },
  { id: 260, key: 'swampert',  name: '대짱이',     types: ['water', 'ground'],   base: [100, 110, 90, 85, 90, 60],   moves: ['waterfall', 'earthquake', 'surf', 'icepunch'], extra: ['stoneedge', 'hammerarm'] },
  { id: 282, key: 'gardevoir', name: '가디안',     types: ['psychic', 'fairy'],  base: [68, 65, 65, 125, 115, 80],   moves: ['moonblast', 'psychic', 'dazzlinggleam', 'shadowball'], extra: ['hypervoice', 'focusblast', 'thunderbolt'] },
  { id: 376, key: 'metagross', name: '메타그로스', types: ['steel', 'psychic'],  base: [80, 135, 130, 95, 90, 70],   moves: ['meteormash', 'zenheadbutt', 'earthquake', 'bulletpunch'], extra: ['icepunch', 'thunderpunch', 'psychicfangs'] },
  { id: 135, key: 'jolteon',   name: '쥬피썬더',   types: ['electric'],          base: [65, 65, 60, 110, 95, 130],   moves: ['thunderbolt', 'thunder', 'shadowball', 'quickattack'], extra: ['hypervoice'] },
  { id: 59,  key: 'arcanine',  name: '윈디',       types: ['fire'],              base: [90, 110, 80, 100, 80, 95],   moves: ['flareblitz', 'extremespeed', 'flamethrower', 'crunch'], extra: ['wildcharge', 'closecombat'] },
  { id: 778, key: 'mimikyu',   name: '따라큐',     types: ['ghost', 'fairy'],    base: [55, 90, 80, 50, 105, 96],    moves: ['shadowclaw', 'playrough', 'shadowsneak', 'drainpunch'], extra: ['woodhammer', 'xscissor'] },
  { id: 468, key: 'togekiss',  name: '토게키스',   types: ['fairy', 'flying'],   base: [85, 50, 95, 120, 115, 80],   moves: ['airslash', 'dazzlinggleam', 'moonblast', 'aurasphere'], extra: ['flamethrower', 'triattack'] },
  { id: 461, key: 'weavile',   name: '포푸니라',   types: ['dark', 'ice'],       base: [70, 120, 65, 45, 85, 125],   moves: ['iceshard', 'nightslash', 'iciclecrash', 'shadowclaw'], extra: ['poisonjab', 'lowkick'] },
  { id: 292, key: 'shedinja',  name: '껍질몬',     types: ['bug', 'ghost'],      base: [1, 90, 45, 30, 30, 40],      moves: ['shadowclaw', 'xscissor', 'shadowsneak', 'leechlife'], fixedHp: 1 },
  { id: 530, key: 'excadrill', name: '몰드류',     types: ['ground', 'steel'],   base: [110, 135, 60, 50, 65, 88],   moves: ['drillrun', 'earthquake', 'ironhead', 'rockslide'], extra: ['xscissor', 'poisonjab'] },

  // 새로 추가된 포켓몬 (최종 진화형 위주)
  { id: 26,  key: 'raichu',    name: '라이츄',     types: ['electric'],          base: [60, 90, 55, 90, 80, 110],    moves: ['thunderbolt', 'wildcharge', 'focusblast', 'quickattack'], extra: ['grassknot', 'surf'] },
  { id: 417, key: 'pachirisu', name: '파치리스',   types: ['electric'],          base: [60, 45, 70, 45, 90, 95],     moves: ['nuzzle', 'thunderbolt', 'uturn', 'quickattack'], extra: ['swift', 'superfang'] },
  { id: 479, key: 'rotom',     name: '로토무',     types: ['electric', 'ghost'], base: [50, 50, 77, 95, 77, 91],     moves: ['thunderbolt', 'shadowball', 'discharge', 'hex'], extra: ['electroball', 'darkpulse'] },
  { id: 132, key: 'ditto',     name: '메타몽',     types: ['normal'],            base: [48, 48, 48, 48, 48, 48],     moves: ['quickattack', 'bodyslam', 'swift', 'takedown'], fixedPool: true },
  { id: 18,  key: 'pidgeot',   name: '피죤투',     types: ['normal', 'flying'],  base: [83, 80, 75, 70, 70, 101],    moves: ['hurricane', 'bravebird', 'quickattack', 'doubleedge'], extra: ['heatwave', 'uturn'] },
  { id: 38,  key: 'ninetales', name: '나인테일',   types: ['fire'],              base: [73, 76, 75, 81, 100, 100],   moves: ['flamethrower', 'solarbeam', 'overheat', 'hex'], extra: ['energyball', 'psyshock', 'darkpulse'] },
  { id: 34,  key: 'nidoking',  name: '니드킹',     types: ['poison', 'ground'],  base: [81, 102, 77, 85, 75, 85],    moves: ['earthpower', 'sludgewave', 'icebeam', 'thunderbolt'], extra: ['megahorn', 'poisonjab', 'flamethrower', 'focusblast'] },
  { id: 76,  key: 'golem',     name: '딱구리',     types: ['rock', 'ground'],    base: [80, 120, 130, 55, 65, 45],   moves: ['earthquake', 'stoneedge', 'headsmash', 'rockblast'], extra: ['firepunch', 'heavyslam'] },
  { id: 80,  key: 'slowbro',   name: '야도란',     types: ['water', 'psychic'],  base: [95, 75, 110, 100, 80, 30],   moves: ['scald', 'psychic', 'icebeam', 'futuresight'], extra: ['fireblast', 'flamethrower', 'psyshock'] },
  { id: 121, key: 'starmie',   name: '아쿠스타',   types: ['water', 'psychic'],  base: [60, 75, 85, 100, 85, 115],   moves: ['hydropump', 'psyshock', 'thunderbolt', 'icebeam'], extra: ['powergem', 'dazzlinggleam'] },
  { id: 115, key: 'kangaskhan',name: '캥카',       types: ['normal'],            base: [105, 95, 80, 40, 80, 90],    moves: ['doubleedge', 'facade', 'suckerpunch', 'earthquake'], extra: ['crunch', 'drainpunch', 'firepunch', 'icepunch'] },
  { id: 127, key: 'pinsir',    name: '쁘사이저',   types: ['bug'],               base: [65, 125, 100, 55, 70, 85],   moves: ['xscissor', 'closecombat', 'doubleedge', 'earthquake'], extra: ['quickattack', 'stoneedge', 'knockoff'] },
  { id: 142, key: 'aerodactyl',name: '프테라',     types: ['rock', 'flying'],    base: [80, 105, 65, 60, 75, 130],   moves: ['stoneedge', 'bravebird', 'earthquake', 'icefang'], extra: ['firefang', 'crunch', 'aquatail'] },
  { id: 134, key: 'vaporeon',  name: '샤미드',     types: ['water'],             base: [130, 65, 60, 110, 95, 65],   moves: ['scald', 'hydropump', 'icebeam', 'hypervoice'], extra: ['shadowball'] },
  { id: 136, key: 'flareon',   name: '부스터',     types: ['fire'],              base: [65, 130, 60, 95, 110, 65],   moves: ['flareblitz', 'firefang', 'facade', 'quickattack'], extra: ['superpower', 'doubleedge'] },
  { id: 196, key: 'espeon',    name: '에브이',     types: ['psychic'],           base: [65, 65, 60, 130, 95, 110],   moves: ['psychic', 'psyshock', 'dazzlinggleam', 'shadowball'], extra: ['futuresight'] },
  { id: 197, key: 'umbreon',   name: '블래키',     types: ['dark'],              base: [95, 65, 110, 60, 130, 65],   moves: ['knockoff', 'suckerpunch', 'darkpulse', 'bite'], extra: ['facade'] },
  { id: 470, key: 'leafeon',   name: '리피아',     types: ['grass'],             base: [65, 110, 130, 60, 65, 95],   moves: ['leafblade', 'xscissor', 'knockoff', 'quickattack'], extra: ['doubleedge'] },
  { id: 700, key: 'sylveon',   name: '님피아',     types: ['fairy'],             base: [95, 65, 65, 110, 130, 60],   moves: ['hypervoice', 'moonblast', 'drainingkiss', 'psyshock'], extra: ['shadowball', 'swift'] },
  { id: 181, key: 'ampharos',  name: '전룡',       types: ['electric'],          base: [90, 75, 85, 115, 90, 55],    moves: ['thunderbolt', 'discharge', 'dragonpulse', 'powergem'], extra: ['focusblast', 'thunderpunch'] },
  { id: 157, key: 'typhlosion',name: '블레이범',   types: ['fire'],              base: [78, 84, 78, 109, 85, 100],   moves: ['flamethrower', 'focusblast', 'scorchingsands', 'overheat'], extra: ['shadowball', 'thunderpunch'] },
  { id: 160, key: 'feraligatr',name: '장크로다일', types: ['water'],             base: [85, 105, 100, 79, 83, 78],   moves: ['liquidation', 'crunch', 'icepunch', 'aquajet'], extra: ['earthquake', 'dragonclaw'] },
  { id: 214, key: 'heracross', name: '헤라크로스', types: ['bug', 'fighting'],   base: [80, 125, 75, 40, 95, 85],    moves: ['megahorn', 'closecombat', 'rockblast', 'facade'], extra: ['stoneedge', 'knockoff', 'earthquake'] },
  { id: 208, key: 'steelix',   name: '강철톤',     types: ['steel', 'ground'],   base: [75, 85, 200, 55, 65, 30],    moves: ['heavyslam', 'earthquake', 'stoneedge', 'bodypress'], extra: ['crunch', 'firefang'] },
  { id: 230, key: 'kingdra',   name: '킹드라',     types: ['water', 'dragon'],   base: [75, 95, 95, 95, 95, 85],     moves: ['hydropump', 'dracometeor', 'icebeam', 'waterfall'], extra: ['dragonpulse', 'outrage'] },
  { id: 229, key: 'houndoom',  name: '헬가',       types: ['dark', 'fire'],      base: [75, 90, 50, 110, 80, 95],    moves: ['darkpulse', 'flamethrower', 'sludgebomb', 'suckerpunch'], extra: ['solarbeam', 'fireblast'] },
  { id: 227, key: 'skarmory',  name: '무장조',     types: ['steel', 'flying'],   base: [65, 80, 140, 40, 70, 70],    moves: ['bravebird', 'ironhead', 'drillpeck', 'bodypress'], extra: ['knockoff'] },
  { id: 373, key: 'salamence', name: '보만다',     types: ['dragon', 'flying'],  base: [95, 135, 80, 110, 80, 100],  moves: ['dragonclaw', 'dracometeor', 'earthquake', 'doubleedge'], extra: ['flamethrower', 'fireblast', 'hydropump'] },
  { id: 306, key: 'aggron',    name: '보스로라',   types: ['steel', 'rock'],     base: [70, 110, 180, 60, 60, 50],   moves: ['heavyslam', 'headsmash', 'earthquake', 'bodypress'], extra: ['icepunch', 'firepunch'] },
  { id: 359, key: 'absol',     name: '앱솔',       types: ['dark'],              base: [65, 130, 60, 75, 60, 75],    moves: ['nightslash', 'psychocut', 'suckerpunch', 'playrough'], extra: ['megahorn', 'firefang'] },
  { id: 330, key: 'flygon',    name: '플라이곤',   types: ['ground', 'dragon'],  base: [80, 100, 80, 80, 80, 100],   moves: ['earthquake', 'dragonclaw', 'uturn', 'firepunch'], extra: ['stoneedge', 'dracometeor'] },
  { id: 350, key: 'milotic',   name: '밀로틱',     types: ['water'],             base: [95, 60, 79, 100, 125, 81],   moves: ['scald', 'hydropump', 'icebeam', 'dragonpulse'], extra: ['hypnosis', 'hypervoice'] },
  { id: 319, key: 'sharpedo',  name: '샤크니아',   types: ['water', 'dark'],     base: [70, 120, 40, 95, 40, 95],    moves: ['crunch', 'waterfall', 'psychicfangs', 'icefang'], extra: ['aquajet', 'closecombat'] },
  { id: 334, key: 'altaria',   name: '파비코리',   types: ['dragon', 'flying'],  base: [75, 70, 90, 70, 105, 80],    moves: ['hypervoice', 'dragonpulse', 'airslash', 'flamethrower'], extra: ['moonblast', 'dazzlinggleam', 'doubleedge'] },
  { id: 392, key: 'infernape', name: '초염몽',     types: ['fire', 'fighting'],  base: [76, 104, 71, 104, 71, 108],  moves: ['machpunch', 'closecombat', 'flareblitz', 'thunderpunch'], extra: ['firepunch', 'uturn', 'stoneedge'] },
  { id: 395, key: 'empoleon',  name: '엠페르트',   types: ['water', 'steel'],    base: [84, 86, 88, 111, 101, 60],   moves: ['hydropump', 'flashcannon', 'icebeam', 'aquajet'], extra: ['grassknot'] },
  { id: 389, key: 'torterra',  name: '토대부기',   types: ['grass', 'ground'],   base: [95, 109, 105, 75, 85, 56],   moves: ['woodhammer', 'earthquake', 'stoneedge', 'crunch'], extra: ['rockslide'] },
  { id: 405, key: 'luxray',    name: '렌트라',     types: ['electric'],          base: [80, 120, 79, 95, 79, 70],    moves: ['wildcharge', 'crunch', 'icefang', 'thunderfang'], extra: ['firefang', 'superpower'] },
  { id: 398, key: 'staraptor', name: '찌르호크',   types: ['normal', 'flying'],  base: [85, 120, 70, 50, 60, 100],   moves: ['bravebird', 'doubleedge', 'closecombat', 'uturn'], extra: ['quickattack'] },
  { id: 466, key: 'electivire',name: '에레키블',   types: ['electric'],          base: [75, 123, 67, 95, 85, 95],    moves: ['wildcharge', 'thunderpunch', 'icepunch', 'crosschop'], extra: ['earthquake', 'firepunch'] },
  { id: 467, key: 'magmortar', name: '마그마번',   types: ['fire'],              base: [75, 95, 67, 125, 95, 83],    moves: ['flamethrower', 'fireblast', 'thunderbolt', 'focusblast'], extra: ['psychic', 'hyperbeam'] },
  { id: 464, key: 'rhyperior', name: '거대코뿌리', types: ['ground', 'rock'],    base: [115, 140, 130, 55, 55, 40],  moves: ['earthquake', 'stoneedge', 'rockblast', 'megahorn'], extra: ['icepunch', 'firepunch', 'thunderpunch'] },
  { id: 407, key: 'roserade',  name: '로즈레이드', types: ['grass', 'poison'],   base: [60, 70, 65, 125, 105, 90],   moves: ['gigadrain', 'sludgebomb', 'leafstorm', 'shadowball'], extra: ['dazzlinggleam'] },
  { id: 612, key: 'haxorus',   name: '액스라이즈', types: ['dragon'],            base: [76, 147, 90, 60, 70, 97],    moves: ['dragonclaw', 'outrage', 'earthquake', 'poisonjab'], extra: ['closecombat', 'irontail'] },
  { id: 635, key: 'hydreigon', name: '삼삼드래',   types: ['dark', 'dragon'],    base: [92, 105, 90, 125, 90, 98],   moves: ['darkpulse', 'dracometeor', 'flamethrower', 'earthpower'], extra: ['dragonpulse', 'uturn', 'focusblast'] },
  { id: 637, key: 'volcarona', name: '불카모스',   types: ['bug', 'fire'],       base: [85, 60, 65, 135, 105, 100],  moves: ['bugbuzz', 'fireblast', 'heatwave', 'gigadrain'], extra: ['psychic', 'hurricane'] },
  { id: 609, key: 'chandelure',name: '샹델라',     types: ['ghost', 'fire'],     base: [60, 55, 90, 145, 90, 80],    moves: ['shadowball', 'flamethrower', 'overheat', 'energyball'], extra: ['psychic', 'darkpulse'] },
  { id: 534, key: 'conkeldurr',name: '노보청',     types: ['fighting'],          base: [105, 140, 95, 55, 65, 45],   moves: ['drainpunch', 'machpunch', 'facade', 'knockoff'], extra: ['icepunch', 'stoneedge'] },
  { id: 553, key: 'krookodile',name: '악비아르',   types: ['ground', 'dark'],    base: [95, 117, 80, 65, 70, 92],    moves: ['earthquake', 'knockoff', 'stoneedge', 'crunch'], extra: ['closecombat', 'gunkshot'] },
  { id: 701, key: 'hawlucha',  name: '루차불',     types: ['fighting', 'flying'],base: [78, 92, 75, 74, 63, 118],    moves: ['highjumpkick', 'acrobatics', 'bravebird', 'poisonjab'], extra: ['stoneedge', 'xscissor'] },
  { id: 706, key: 'goodra',    name: '미끄래곤',   types: ['dragon'],            base: [90, 100, 70, 110, 150, 80],  moves: ['dracometeor', 'sludgebomb', 'fireblast', 'thunderbolt'], extra: ['icebeam', 'earthquake', 'powerwhip'] },
  { id: 727, key: 'incineroar',name: '어흥염',     types: ['fire', 'dark'],      base: [95, 115, 90, 80, 90, 60],    moves: ['flareblitz', 'knockoff', 'firefang', 'uturn'], extra: ['closecombat', 'crosschop'] },
  { id: 730, key: 'primarina', name: '누리레느',   types: ['water', 'fairy'],    base: [80, 74, 74, 126, 116, 60],   moves: ['moonblast', 'hydropump', 'icebeam', 'drainingkiss'], extra: ['psychic', 'energyball'] },
  { id: 784, key: 'kommoo',    name: '짜랑고우거', types: ['dragon', 'fighting'],base: [75, 110, 125, 100, 105, 85], moves: ['closecombat', 'dragonclaw', 'drainpunch', 'poisonjab'], extra: ['ironhead', 'earthquake'] },
  { id: 815, key: 'cinderace', name: '에이스번',   types: ['fire'],              base: [80, 116, 75, 65, 75, 119],   moves: ['pyroball', 'flareblitz', 'highjumpkick', 'uturn'], extra: ['suckerpunch', 'ironhead', 'gunkshot'] },
  { id: 887, key: 'dragapult', name: '드래펄트',   types: ['dragon', 'ghost'],   base: [88, 120, 75, 100, 75, 142],  moves: ['dragondarts', 'phantomforce', 'uturn', 'suckerpunch'], extra: ['shadowball', 'dracometeor', 'fireblast'] },
  { id: 823, key: 'corviknight',name: '아머까오',  types: ['flying', 'steel'],   base: [98, 87, 105, 53, 85, 67],    moves: ['bravebird', 'ironhead', 'bodypress', 'drillpeck'], extra: ['uturn', 'knockoff'] },
  { id: 31,  key: 'nidoqueen', name: '니드퀸',     types: ['poison', 'ground'],  base: [90, 92, 87, 75, 85, 76],     moves: ['earthpower', 'sludgebomb', 'icebeam', 'thunderbolt'], extra: ['poisonjab', 'fireblast', 'stoneedge'] },
  { id: 91,  key: 'cloyster',  name: '파르셀',     types: ['water', 'ice'],      base: [50, 95, 180, 85, 45, 70],    moves: ['iciclespear', 'rockblast', 'icebeam', 'hydropump'], extra: ['iciclecrash', 'liquidation'] },
  { id: 89,  key: 'muk',       name: '질뻐기',     types: ['poison'],            base: [105, 105, 75, 65, 100, 50],  moves: ['gunkshot', 'poisonjab', 'shadowsneak', 'firepunch'], extra: ['icepunch', 'thunderpunch', 'knockoff'] },
  { id: 99,  key: 'kingler',   name: '킹크랩',     types: ['water'],             base: [55, 130, 115, 50, 50, 75],   moves: ['crabhammer', 'liquidation', 'xscissor', 'knockoff'], extra: ['rockslide', 'superpower'] },
  { id: 128, key: 'tauros',    name: '켄타로스',   types: ['normal'],            base: [75, 100, 95, 40, 70, 110],   moves: ['doubleedge', 'earthquake', 'closecombat', 'ironhead'], extra: ['stoneedge', 'zenheadbutt'] },
  { id: 110, key: 'weezing',   name: '또도가스',   types: ['poison'],            base: [65, 90, 120, 85, 70, 60],    moves: ['sludgebomb', 'flamethrower', 'thunderbolt', 'shadowball'], extra: ['fireblast', 'darkpulse'] },
  { id: 471, key: 'glaceon',   name: '글레이시아', types: ['ice'],               base: [65, 60, 130, 130, 95, 65],   moves: ['icebeam', 'freezedry', 'shadowball', 'blizzard'], extra: ['hypervoice', 'waterpulse'] },
  { id: 169, key: 'crobat',    name: '크로뱃',     types: ['poison', 'flying'],  base: [85, 90, 80, 70, 80, 130],    moves: ['bravebird', 'poisonjab', 'uturn', 'crosschop'], extra: ['heatwave', 'gunkshot'] },
  { id: 199, key: 'slowking',  name: '야도킹',     types: ['water', 'psychic'],  base: [95, 75, 80, 100, 110, 30],    moves: ['scald', 'psychic', 'flamethrower', 'icebeam'], extra: ['psyshock', 'fireblast', 'surf'] },
  { id: 462, key: 'magnezone', name: '자포코일',   types: ['electric', 'steel'], base: [70, 70, 115, 130, 90, 60],    moves: ['thunderbolt', 'flashcannon', 'bodypress', 'discharge'], extra: ['steelbeam', 'triattack'] },
  { id: 474, key: 'porygonz',  name: '폴리곤Z',    types: ['normal'],            base: [85, 80, 70, 135, 75, 90],    moves: ['triattack', 'shadowball', 'thunderbolt', 'icebeam'], extra: ['psychic', 'darkpulse', 'hyperbeam'] },
  { id: 477, key: 'dusknoir',  name: '야느와르몽', types: ['ghost'],             base: [45, 100, 135, 65, 135, 45],  moves: ['poltergeist', 'shadowsneak', 'icepunch', 'earthquake'], extra: ['drainpunch', 'firepunch'] },
  { id: 478, key: 'froslass',  name: '눈여아',     types: ['ice', 'ghost'],      base: [70, 80, 70, 80, 70, 110],    moves: ['icebeam', 'shadowball', 'thunderbolt', 'hex'], extra: ['blizzard', 'psychic'] },
  { id: 475, key: 'gallade',   name: '엘레이드',   types: ['psychic', 'fighting'], base: [68, 125, 65, 65, 115, 80], moves: ['closecombat', 'psychocut', 'leafblade', 'nightslash'], extra: ['earthquake', 'poisonjab', 'zenheadbutt'] },
  { id: 454, key: 'toxicroak', name: '독개굴',     types: ['poison', 'fighting'], base: [83, 106, 65, 86, 65, 85],   moves: ['poisonjab', 'drainpunch', 'suckerpunch', 'icepunch'], extra: ['earthquake', 'gunkshot'] },
  { id: 286, key: 'breloom',   name: '버섯모',     types: ['grass', 'fighting'], base: [60, 130, 80, 60, 60, 70],    moves: ['machpunch', 'bulletseed', 'rocktomb', 'drainpunch'], extra: ['stoneedge', 'poisonjab'] },
  { id: 472, key: 'gliscor',   name: '글라이온',   types: ['ground', 'flying'],  base: [75, 95, 125, 45, 75, 95],    moves: ['earthquake', 'uturn', 'knockoff', 'bravebird'], extra: ['stoneedge', 'poisonjab', 'nightslash'] },
  { id: 242, key: 'blissey',   name: '해피너스',   types: ['normal'],            base: [255, 10, 10, 75, 135, 55],   moves: ['seismictoss', 'flamethrower', 'icebeam', 'thunderbolt'], extra: ['psychic', 'shadowball'] },
  { id: 297, key: 'hariyama',  name: '하리뭉',     types: ['fighting'],          base: [144, 120, 60, 40, 60, 50],   moves: ['closecombat', 'knockoff', 'icepunch', 'bulletpunch'], extra: ['earthquake', 'stoneedge'] },
  { id: 303, key: 'mawile',    name: '입치트',     types: ['steel', 'fairy'],    base: [50, 85, 85, 55, 55, 50],     moves: ['playrough', 'ironhead', 'suckerpunch', 'thunderpunch'], extra: ['icepunch', 'crunch'] },
  { id: 310, key: 'manectric', name: '썬더라이',   types: ['electric'],          base: [70, 75, 60, 105, 60, 105],   moves: ['thunderbolt', 'overheat', 'voltswitch', 'flamethrower'], extra: ['wildcharge'] },
  { id: 450, key: 'hippowdon', name: '하마돈',     types: ['ground'],            base: [108, 112, 118, 68, 72, 47],  moves: ['earthquake', 'stoneedge', 'crunch', 'icefang'], extra: ['ironhead'] },
  { id: 452, key: 'drapion',   name: '드래피온',   types: ['poison', 'dark'],    base: [70, 90, 110, 60, 75, 95],    moves: ['knockoff', 'poisonjab', 'earthquake', 'nightslash'], extra: ['aquatail', 'icefang'] },
  { id: 571, key: 'zoroark',   name: '조로아크',   types: ['dark'],              base: [60, 105, 60, 120, 60, 105],  moves: ['nightdaze', 'flamethrower', 'focusblast', 'uturn'], extra: ['darkpulse', 'sludgebomb', 'shadowball'] },
  { id: 598, key: 'ferrothorn',name: '너트령',     types: ['grass', 'steel'],    base: [74, 94, 131, 54, 116, 20],   moves: ['powerwhip', 'gyroball', 'ironhead', 'bodypress'], extra: ['knockoff', 'thunder'] },
  { id: 620, key: 'mienshao',  name: '비조도',     types: ['fighting'],          base: [65, 125, 60, 95, 60, 105],   moves: ['highjumpkick', 'uturn', 'knockoff', 'poisonjab'], extra: ['stoneedge', 'drainpunch'] },
  { id: 623, key: 'golurk',    name: '골루그',     types: ['ground', 'ghost'],   base: [89, 124, 80, 55, 80, 55],    moves: ['earthquake', 'poltergeist', 'dynamicpunch', 'icepunch'], extra: ['heatcrash', 'stoneedge'] },
  { id: 628, key: 'braviary',  name: '워글',       types: ['normal', 'flying'],  base: [100, 123, 75, 57, 75, 80],   moves: ['bravebird', 'closecombat', 'doubleedge', 'uturn'], extra: ['ironhead', 'heatwave'] },
  { id: 652, key: 'chesnaught',name: '브리가론',   types: ['grass', 'fighting'], base: [88, 107, 122, 74, 75, 64],   moves: ['woodhammer', 'drainpunch', 'bodypress', 'earthquake'], extra: ['stoneedge'] },
  { id: 655, key: 'delphox',   name: '마폭시',     types: ['fire', 'psychic'],   base: [75, 69, 72, 114, 100, 104],  moves: ['fireblast', 'psychic', 'dazzlinggleam', 'shadowball'], extra: ['overheat', 'psyshock', 'grassknot'] },
  { id: 663, key: 'talonflame',name: '파이어로',   types: ['fire', 'flying'],    base: [78, 81, 71, 74, 69, 126],    moves: ['bravebird', 'flareblitz', 'uturn', 'overheat'], extra: ['heatwave'] },
  { id: 681, key: 'aegislash', name: '킬가르도',   types: ['steel', 'ghost'],    base: [60, 50, 140, 50, 140, 60],   moves: ['shadowball', 'flashcannon', 'shadowsneak', 'sacredsword'], extra: ['ironhead'] },
  { id: 715, key: 'noivern',   name: '음번',       types: ['flying', 'dragon'],  base: [85, 70, 80, 97, 80, 123],    moves: ['dracometeor', 'hurricane', 'flamethrower', 'uturn'], extra: ['airslash', 'dragonpulse', 'boomburst'] },
  { id: 722, key: 'rowlet',    name: '나몰빼미',   types: ['grass', 'flying'],   base: [68, 55, 55, 50, 50, 42],     moves: ['leafblade', 'bravebird', 'suckerpunch', 'razorleaf'], extra: ['energyball', 'solarbeam', 'shadowball', 'gigadrain', 'acrobatics'], fixedLevel: 100 },
  { id: 724, key: 'decidueye', name: '모크나이퍼', types: ['grass', 'ghost'],    base: [78, 107, 75, 100, 100, 70],  moves: ['spiritshackle', 'leafblade', 'suckerpunch', 'uturn'], extra: ['bravebird', 'shadowsneak'] },
  { id: 748, key: 'toxapex',   name: '더시마사리', types: ['poison', 'water'],   base: [50, 63, 152, 53, 142, 35],   moves: ['scald', 'sludgebomb', 'knockoff', 'icebeam'] },
  { id: 812, key: 'rillaboom', name: '고릴타',     types: ['grass'],             base: [100, 125, 90, 60, 70, 85],   moves: ['drumbeating', 'grassyglide', 'woodhammer', 'knockoff'], extra: ['uturn', 'superpower', 'drainpunch'] },
  { id: 818, key: 'inteleon',  name: '인텔리레온', types: ['water'],             base: [70, 85, 65, 125, 65, 120],   moves: ['snipeshot', 'icebeam', 'darkpulse', 'uturn'], extra: ['hydropump', 'airslash'] },
  { id: 858, key: 'hatterene', name: '브리무음',   types: ['psychic', 'fairy'],  base: [57, 90, 95, 136, 103, 29],   moves: ['magicpowder', 'psychic', 'dazzlinggleam', 'mysticalfire'], extra: ['shadowball', 'psyshock'] },
  { id: 861, key: 'grimmsnarl',name: '오롱털',     types: ['dark', 'fairy'],     base: [95, 120, 65, 95, 75, 60],    moves: ['spiritbreak', 'darkestlariat', 'suckerpunch', 'playrough'], extra: ['firepunch'] },
  { id: 983, key: 'kingambit', name: '대도각참',   types: ['dark', 'steel'],     base: [100, 135, 120, 60, 85, 50],  moves: ['kowtowcleave', 'ironhead', 'suckerpunch', 'knockoff'], extra: ['lowkick'] },
  { id: 184, key: 'azumarill', name: '마릴리',     types: ['water', 'fairy'],    base: [100, 50, 80, 60, 80, 50],    moves: ['playrough', 'liquidation', 'aquajet', 'doubleedge'], extra: ['knockoff'] },
  { id: 460, key: 'abomasnow', name: '눈설왕',     types: ['grass', 'ice'],      base: [90, 92, 75, 92, 85, 60],     moves: ['woodhammer', 'icebeam', 'earthquake', 'blizzard'], extra: ['gigaimpact'] },
  { id: 362, key: 'glalie',    name: '얼음귀신',   types: ['ice'],               base: [80, 80, 80, 80, 80, 80],     moves: ['icebeam', 'blizzard', 'crunch', 'earthquake'], extra: ['freezedry'] },
  { id: 428, key: 'lopunny',   name: '이어롭',     types: ['normal'],            base: [65, 76, 84, 54, 96, 105],    moves: ['doubleedge', 'highjumpkick', 'quickattack', 'drainpunch'], extra: ['firepunch', 'thunderpunch', 'icepunch'] },
  { id: 302, key: 'sableye',   name: '깜까미',     types: ['dark', 'ghost'],     base: [50, 75, 75, 65, 65, 50],     moves: ['knockoff', 'suckerpunch', 'shadowball', 'hypnosis'], extra: ['dazzlinggleam'] },
  { id: 998, key: 'baxcalibur',name: '드닐레이브', types: ['dragon', 'ice'],     base: [115, 145, 92, 75, 86, 87],   moves: ['iciclecrash', 'earthquake', 'outrage', 'dragonclaw'], extra: ['icebeam'] },
  { id: 908, key: 'meowscarada', name: '마스카나', types: ['grass', 'dark'],     base: [76, 110, 70, 81, 70, 123],   moves: ['flowertrick', 'knockoff', 'uturn', 'playrough'], extra: ['darkpulse'] },
  { id: 911, key: 'skeledirge',name: '라우드본',   types: ['fire', 'ghost'],     base: [104, 75, 100, 110, 75, 66],  moves: ['flamethrower', 'shadowball', 'overheat', 'hex'], extra: ['solarbeam'] },
  { id: 914, key: 'quaquaval', name: '웨이니발',   types: ['water', 'fighting'], base: [85, 120, 80, 85, 75, 85],    moves: ['liquidation', 'closecombat', 'aquajet', 'icepunch'], extra: ['bravebird'] },
  { id: 865, key: 'sirfetchd', name: '창파나이트', types: ['fighting'],          base: [62, 135, 95, 68, 82, 65],    moves: ['meteorassault', 'leafblade', 'bravebird', 'closecombat'], extra: ['knockoff', 'nightslash', 'poisonjab'] },
  { id: 882, key: 'dracovish', name: '어래곤',     types: ['water', 'dragon'],   base: [90, 90, 100, 70, 80, 75],    moves: ['fishiousrend', 'crunch', 'outrage', 'icefang'], extra: ['psychicfangs', 'earthquake', 'liquidation', 'dragonclaw'] },
  { id: 745, key: 'lycanroc',  name: '루가루암',   types: ['rock'],              base: [75, 115, 65, 55, 65, 112],   moves: ['accelerock', 'stoneedge', 'crunch', 'playrough'], extra: ['counter', 'firefang', 'drillrun', 'rockslide'] },
  { id: 10126, key: 'lycanrocmidnight', name: '루가루암(한밤중)', types: ['rock'], base: [85, 115, 75, 55, 75, 82], moves: ['counter', 'stoneedge', 'crunch', 'suckerpunch'], extra: ['accelerock', 'psychicfangs', 'thunderfang', 'closecombat'] },
  { id: 10152, key: 'lycanrocdusk', name: '루가루암(황혼)', types: ['rock'],     base: [75, 117, 65, 55, 65, 110],   moves: ['accelerock', 'stoneedge', 'closecombat', 'drillrun'], extra: ['counter', 'playrough', 'firefang', 'crunch'] },
  { id: 12,  key: 'butterfree', name: '버터플',   types: ['bug', 'flying'],     base: [60, 45, 50, 90, 80, 70],     moves: ['bugbuzz', 'airslash', 'psychic', 'sleeppowder'], extra: ['energyball', 'shadowball', 'quiverdance'] },
  { id: 52,  key: 'meowth',    name: '냐옹',       types: ['normal'],            base: [40, 45, 35, 40, 40, 90],     moves: ['payday', 'fakeout', 'playrough', 'nightslash'], extra: ['aerialace', 'thunderbolt', 'uturn'] },
  { id: 133, key: 'eevee',     name: '이브이',     types: ['normal'],            base: [55, 55, 50, 45, 65, 55],     moves: ['quickattack', 'doubleedge', 'irontail', 'shadowball'], extra: ['crunch', 'bodyslam', 'hypervoice'] },
  { id: 15,  key: 'beedrill',  name: '독침붕',     types: ['bug', 'poison'],     base: [65, 90, 40, 45, 80, 75],     moves: ['megahorn', 'poisonjab', 'xscissor', 'fellstinger'], extra: ['drillrun', 'uturn'] },
  { id: 308, key: 'medicham',  name: '요가램',     types: ['fighting', 'psychic'], base: [60, 60, 75, 60, 75, 80],   moves: ['highjumpkick', 'closecombat', 'zenheadbutt', 'icepunch'], extra: ['firepunch', 'thunderpunch'] },
  { id: 531, key: 'audino',    name: '다부니',     types: ['normal'],            base: [103, 60, 86, 60, 86, 50],    moves: ['hypervoice', 'dazzlinggleam', 'thunderbolt', 'icebeam'], extra: ['flamethrower', 'shadowball'] },
  { id: 71,  key: 'victreebel', name: '우츠보트', types: ['grass', 'poison'],   base: [80, 105, 65, 100, 70, 70],   moves: ['powerwhip', 'sludgebomb', 'suckerpunch', 'leafblade'], extra: ['sleeppowder', 'energyball'] },
  { id: 545, key: 'scolipede', name: '펜드라',     types: ['bug', 'poison'],     base: [60, 100, 89, 55, 69, 112],   moves: ['megahorn', 'poisonjab', 'earthquake', 'rockslide'], extra: ['xscissor', 'uturn'] },
  { id: 668, key: 'pyroar',    name: '화염레오',   types: ['fire', 'normal'],    base: [86, 68, 72, 109, 66, 106],   moves: ['flamethrower', 'hypervoice', 'darkpulse', 'wildcharge'], extra: ['overheat', 'solarbeam'] },
  { id: 670, key: 'floette',   name: '플라엣',     types: ['fairy'],             base: [54, 45, 47, 75, 98, 52],     moves: ['moonblast', 'dazzlinggleam', 'psychic', 'energyball'], extra: ['drainingkiss'] },
  { id: 687, key: 'malamar',   name: '칼라마네로', types: ['dark', 'psychic'],   base: [86, 92, 88, 68, 75, 73],     moves: ['topsyturvy', 'knockoff', 'psychic', 'superpower'], extra: ['nightslash', 'psychocut'] },
  { id: 689, key: 'barbaracle', name: '거북손데스', types: ['rock', 'water'],    base: [72, 105, 115, 54, 86, 68],   moves: ['stoneedge', 'liquidation', 'crosschop', 'earthquake'], extra: ['poisonjab', 'xscissor'] },
  { id: 691, key: 'dragalge',  name: '드래캄',     types: ['poison', 'dragon'],  base: [65, 75, 90, 97, 123, 44],    moves: ['sludgebomb', 'dracometeor', 'hydropump', 'thunderbolt'], extra: ['dragonpulse'] },
  { id: 780, key: 'drampa',    name: '할비롱',     types: ['normal', 'dragon'],  base: [78, 60, 85, 135, 91, 36],    moves: ['hypervoice', 'dragonpulse', 'flamethrower', 'icebeam'], extra: ['energyball', 'thunderbolt'] },
  { id: 870, key: 'falinks',   name: '대여르',     types: ['fighting'],          base: [65, 100, 100, 70, 60, 75],   moves: ['closecombat', 'noretreat', 'megahorn', 'ironhead'], extra: ['rockslide', 'poisonjab'] },
  { id: 358, key: 'chimecho',  name: '치렁',       types: ['psychic'],           base: [75, 50, 80, 95, 90, 65],     moves: ['psychic', 'dazzlinggleam', 'shadowball', 'thunderbolt'], extra: ['energyball'] },
  { id: 678, key: 'meowstic',  name: '냐오닉스',   types: ['psychic'],           base: [74, 48, 76, 83, 81, 104],    moves: ['psychic', 'dazzlinggleam', 'shadowball', 'thunderbolt'], extra: ['energyball', 'fakeout'] },
  { id: 740, key: 'crabominable', name: '모단단게', types: ['fighting', 'ice'],  base: [97, 132, 77, 62, 67, 43],    moves: ['icehammer', 'closecombat', 'earthquake', 'icepunch'], extra: ['crabhammer', 'drainpunch', 'thunderpunch'] },
  { id: 768, key: 'golisopod', name: '갑주무사',   types: ['bug', 'water'],      base: [75, 125, 140, 60, 90, 40],   moves: ['firstimpression', 'liquidation', 'closecombat', 'leechlife'], extra: ['aquajet', 'knockoff'] },
  { id: 952, key: 'scovillain', name: '스코빌런', types: ['grass', 'fire'],     base: [65, 108, 65, 108, 65, 75],   moves: ['spicyextract', 'flamethrower', 'energyball', 'overheat'], extra: ['solarbeam', 'crunch', 'fireblast'] },
  { id: 970, key: 'glimmora',  name: '킬라플로르', types: ['rock', 'poison'],    base: [83, 55, 90, 130, 81, 86],    moves: ['mortalspin', 'powergem', 'sludgebomb', 'earthpower'], extra: ['dazzlinggleam', 'energyball'] },
  { id: 978, key: 'tatsugiri', name: '싸리용',     types: ['dragon', 'water'],   base: [68, 50, 60, 120, 95, 82],    moves: ['dragonpulse', 'hydropump', 'icywind', 'dazzlinggleam'], extra: ['dracometeor'] },
  { id: 569, key: 'garbodor',  name: '더스트나',   types: ['poison'],            base: [80, 95, 82, 60, 82, 75],     moves: ['gunkshot', 'poisonjab', 'earthquake', 'seedbomb'], extra: ['rockslide'] },
  { id: 826, key: 'orbeetle',  name: '이올브',     types: ['bug', 'psychic'],    base: [60, 45, 110, 80, 120, 90],   moves: ['psychic', 'bugbuzz', 'energyball', 'shadowball'], extra: ['dazzlinggleam'] },
  { id: 839, key: 'coalossal', name: '석탄산',     types: ['rock', 'fire'],      base: [110, 80, 120, 80, 90, 30],   moves: ['flareblitz', 'stoneedge', 'earthquake', 'tarshot'], extra: ['fireblast', 'heatcrash'] },
  { id: 841, key: 'flapple',   name: '애프룡',     types: ['grass', 'dragon'],   base: [70, 110, 80, 95, 60, 70],    moves: ['gravapple', 'outrage', 'acrobatics', 'uturn'], extra: ['dragonrush', 'seedbomb'] },
  { id: 842, key: 'appletun',  name: '단지래플',   types: ['grass', 'dragon'],   base: [110, 85, 80, 100, 80, 30],   moves: ['appleacid', 'dragonpulse', 'energyball', 'earthquake'], extra: ['dracometeor'] },
  { id: 844, key: 'sandaconda', name: '사다이사', types: ['ground'],            base: [72, 107, 125, 65, 70, 71],   moves: ['earthquake', 'stoneedge', 'crunch', 'rockslide'], extra: ['outrage', 'bulldoze'] },
  { id: 849, key: 'toxtricity', name: '스트린더', types: ['electric', 'poison'], base: [75, 98, 70, 114, 70, 75],   moves: ['overdrive', 'boomburst', 'drainpunch', 'poisonjab'], extra: ['wildcharge', 'sludgebomb'] },
  { id: 10184, key: 'toxtricitylow', name: '스트린더(로우)', types: ['electric', 'poison'], base: [75, 98, 70, 114, 70, 75], moves: ['overdrive', 'boomburst', 'drainpunch', 'sludgebomb'], extra: ['wildcharge', 'poisonjab'] },
  { id: 851, key: 'centiskorch', name: '다태우지네', types: ['fire', 'bug'],     base: [100, 115, 65, 90, 90, 65],   moves: ['firelash', 'xscissor', 'crunch', 'flareblitz'], extra: ['leechlife', 'thunderfang'] },
  { id: 869, key: 'alcremie',  name: '마휘핑',     types: ['fairy'],             base: [65, 60, 75, 110, 121, 64],   moves: ['decorate', 'dazzlinggleam', 'moonblast', 'psychic'], extra: ['drainingkiss'] },
  { id: 879, key: 'copperajah', name: '대왕끼리동', types: ['steel'],            base: [122, 130, 69, 80, 69, 30],   moves: ['heavyslam', 'earthquake', 'stoneedge', 'ironhead'], extra: ['playrough', 'superpower'] },
  { id: 884, key: 'duraludon', name: '두랄루돈',   types: ['steel', 'dragon'],   base: [70, 95, 115, 120, 50, 85],   moves: ['flashcannon', 'dracometeor', 'thunderbolt', 'stoneedge'], extra: ['dragonpulse'] },
  { id: 979, key: 'annihilape',name: '저승갓숭',   types: ['fighting', 'ghost'], base: [110, 115, 80, 50, 90, 90],   moves: ['closecombat', 'shadowclaw', 'drainpunch', 'earthquake'], extra: ['icepunch'] },
  { id: 1000,key: 'gholdengo', name: '타부자고',   types: ['steel', 'ghost'],    base: [87, 60, 95, 133, 91, 84],    moves: ['makeitrain', 'shadowball', 'dazzlinggleam', 'thunderbolt'], extra: ['focusblast'] },
  { id: 959, key: 'tinkaton',  name: '두드리짱',   types: ['fairy', 'steel'],    base: [85, 75, 77, 70, 105, 94],    moves: ['gigatonhammer', 'playrough', 'knockoff', 'ironhead'], extra: ['flashcannon'] },
  { id: 937, key: 'ceruledge', name: '파라블레이즈', types: ['fire', 'ghost'],   base: [75, 125, 80, 60, 100, 85],   moves: ['flareblitz', 'shadowclaw', 'closecombat', 'shadowsneak'], extra: ['ironhead'] },
  { id: 936, key: 'armarouge', name: '카디나르마', types: ['fire', 'psychic'],   base: [85, 60, 100, 125, 80, 75],   moves: ['flamethrower', 'psychic', 'aurasphere', 'flashcannon'], extra: ['overheat'] },

  // 최종 진화체
  { id: 36,  key: 'clefable',  name: '픽시',       types: ['fairy'],             base: [95, 70, 73, 95, 90, 60],     moves: ['moonblast', 'dazzlinggleam', 'flamethrower', 'icebeam'], extra: ['thunderbolt', 'shadowball'] },
  { id: 78,  key: 'rapidash',  name: '날쌩마',     types: ['fire'],              base: [65, 100, 70, 80, 80, 105],   moves: ['flareblitz', 'wildcharge', 'highjumpkick', 'megahorn'], extra: ['doubleedge'] },
  { id: 103, key: 'exeggutor', name: '나시',       types: ['grass', 'psychic'],  base: [95, 95, 85, 125, 75, 55],    moves: ['psychic', 'leafstorm', 'energyball', 'sludgebomb'], extra: ['woodhammer'] },
  { id: 106, key: 'hitmonlee', name: '시라소몬',   types: ['fighting'],          base: [50, 120, 53, 35, 110, 87],   moves: ['highjumpkick', 'closecombat', 'stoneedge', 'doubleedge'], extra: ['earthquake'] },
  { id: 107, key: 'hitmonchan',name: '홍수몬',     types: ['fighting'],          base: [50, 105, 79, 35, 110, 76],   moves: ['machpunch', 'drainpunch', 'thunderpunch', 'icepunch'], extra: ['firepunch'] },
  { id: 237, key: 'hitmontop', name: '카포에라',   types: ['fighting'],          base: [50, 95, 95, 35, 110, 70],    moves: ['machpunch', 'closecombat', 'bulletpunch', 'earthquake'], extra: ['stoneedge'] },
  { id: 141, key: 'kabutops',  name: '투구푸스',   types: ['rock', 'water'],     base: [60, 115, 105, 65, 70, 80],   moves: ['liquidation', 'stoneedge', 'xscissor', 'aquajet'], extra: ['lowkick'] },
  { id: 62,  key: 'poliwrath', name: '강챙이',     types: ['water', 'fighting'], base: [90, 95, 95, 70, 90, 70],     moves: ['waterfall', 'closecombat', 'drainpunch', 'icepunch'], extra: ['earthquake'] },
  { id: 73,  key: 'tentacruel',name: '독파리',     types: ['water', 'poison'],   base: [80, 70, 65, 80, 120, 100],   moves: ['sludgebomb', 'hydropump', 'icebeam', 'hex'], extra: ['dazzlinggleam'] },
  { id: 51,  key: 'dugtrio',   name: '닥트리오',   types: ['ground'],            base: [35, 100, 50, 50, 70, 120],   moves: ['earthquake', 'stoneedge', 'suckerpunch', 'nightslash'], extra: ['rockslide'] },
  { id: 28,  key: 'sandslash', name: '고지',       types: ['ground'],            base: [75, 100, 110, 45, 55, 65],   moves: ['earthquake', 'knockoff', 'stoneedge', 'poisonjab'], extra: ['xscissor'] },
  { id: 45,  key: 'vileplume', name: '라플레시아', types: ['grass', 'poison'],   base: [75, 80, 85, 110, 90, 50],    moves: ['gigadrain', 'sludgebomb', 'moonblast', 'energyball'], extra: ['earthpower'] },
  { id: 55,  key: 'golduck',   name: '골덕',       types: ['water'],             base: [80, 82, 78, 95, 80, 85],     moves: ['hydropump', 'icebeam', 'psychic', 'crosschop'], extra: ['focusblast'] },
  { id: 97,  key: 'hypno',     name: '슬리퍼',     types: ['psychic'],           base: [85, 73, 70, 73, 115, 67],    moves: ['psychic', 'shadowball', 'focusblast', 'dazzlinggleam'], extra: ['thunderbolt'] },
  { id: 57,  key: 'primeape',  name: '성원숭',     types: ['fighting'],          base: [65, 105, 60, 60, 70, 95],    moves: ['closecombat', 'earthquake', 'uturn', 'icepunch'], extra: ['stoneedge'] },
  { id: 122, key: 'mrmime',    name: '마임맨',     types: ['psychic', 'fairy'],  base: [40, 45, 65, 100, 120, 90],   moves: ['psychic', 'dazzlinggleam', 'focusblast', 'shadowball'], extra: ['thunderbolt'] },
  { id: 24,  key: 'arbok',     name: '아보크',     types: ['poison'],            base: [60, 95, 69, 65, 79, 80],     moves: ['gunkshot', 'earthquake', 'crunch', 'suckerpunch'], extra: ['icefang'] },
  { id: 87,  key: 'dewgong',   name: '쥬레곤',     types: ['water', 'ice'],      base: [90, 70, 80, 70, 95, 70],     moves: ['icebeam', 'surf', 'liquidation', 'blizzard'], extra: ['drillrun'] },
  { id: 101, key: 'electrode', name: '붐볼',       types: ['electric'],          base: [60, 50, 70, 80, 80, 150],    moves: ['thunderbolt', 'voltswitch', 'signalbeam', 'hypervoice'], extra: ['thunder'] },
  { id: 139, key: 'omastar',   name: '암스타',     types: ['rock', 'water'],     base: [70, 60, 125, 115, 70, 55],   moves: ['hydropump', 'icebeam', 'earthpower', 'powergem'], extra: ['scald'] },
  { id: 154, key: 'meganium',  name: '메가니움',   types: ['grass'],             base: [80, 82, 100, 83, 100, 80],   moves: ['energyball', 'gigadrain', 'earthquake', 'dragonpulse'], extra: ['dazzlinggleam'] },
  { id: 171, key: 'lanturn',   name: '랜턴',       types: ['water', 'electric'], base: [125, 58, 58, 76, 76, 67],    moves: ['thunderbolt', 'scald', 'icebeam', 'voltswitch'], extra: ['dazzlinggleam'] },
  { id: 178, key: 'xatu',      name: '네이티오',   types: ['psychic', 'flying'], base: [65, 75, 70, 95, 70, 95],     moves: ['psychic', 'airslash', 'heatwave', 'uturn'], extra: ['dazzlinggleam'] },
  { id: 186, key: 'politoed',  name: '왕구리',     types: ['water'],             base: [90, 75, 75, 90, 100, 70],    moves: ['hydropump', 'icebeam', 'focusblast', 'hypervoice'], extra: ['scald'] },
  { id: 195, key: 'quagsire',  name: '누오',       types: ['water', 'ground'],   base: [95, 85, 85, 65, 65, 35],     moves: ['earthquake', 'waterfall', 'icebeam', 'stoneedge'], extra: ['sludgebomb'] },
  { id: 205, key: 'forretress',name: '쏘콘',       types: ['bug', 'steel'],      base: [75, 90, 140, 60, 60, 40],    moves: ['gyroball', 'ironhead', 'earthquake', 'bodypress'], extra: ['voltswitch'] },
  { id: 210, key: 'granbull',  name: '그랑블루',   types: ['fairy'],             base: [90, 120, 75, 60, 60, 45],    moves: ['playrough', 'crunch', 'closecombat', 'earthquake'], extra: ['firefang'] },
  { id: 232, key: 'donphan',   name: '코리갑',     types: ['ground'],            base: [90, 120, 120, 60, 60, 50],   moves: ['earthquake', 'knockoff', 'stoneedge', 'playrough'], extra: ['icefang'] },
  { id: 272, key: 'ludicolo',  name: '로파파',     types: ['water', 'grass'],    base: [80, 70, 70, 90, 100, 70],    moves: ['hydropump', 'energyball', 'icebeam', 'gigadrain'], extra: ['focusblast'] },
  { id: 275, key: 'shiftry',   name: '다탱구',     types: ['grass', 'dark'],     base: [90, 100, 60, 90, 60, 80],    moves: ['leafblade', 'knockoff', 'suckerpunch', 'darkpulse'], extra: ['heatwave'] },
  { id: 277, key: 'swellow',   name: '스왈로',     types: ['normal', 'flying'],  base: [60, 85, 60, 75, 50, 125],    moves: ['bravebird', 'facade', 'uturn', 'doubleedge'], extra: ['heatwave'] },
  { id: 279, key: 'pelipper',  name: '패리퍼',     types: ['water', 'flying'],   base: [60, 50, 100, 95, 70, 65],    moves: ['hydropump', 'hurricane', 'icebeam', 'uturn'], extra: ['scald'] },
  { id: 291, key: 'ninjask',   name: '아이스크',   types: ['bug', 'flying'],     base: [61, 90, 45, 50, 50, 160],    moves: ['xscissor', 'aerialace', 'uturn', 'nightslash'], extra: ['leechlife'] },
  { id: 295, key: 'exploud',   name: '폭음룡',     types: ['normal'],            base: [104, 91, 63, 91, 73, 68],    moves: ['boomburst', 'fireblast', 'icebeam', 'extrasensory'], extra: ['earthquake'] },
  { id: 323, key: 'camerupt',  name: '폭타',       types: ['fire', 'ground'],    base: [70, 100, 70, 105, 75, 40],   moves: ['flamethrower', 'earthpower', 'earthquake', 'stoneedge'], extra: ['fireblast'] },
  { id: 342, key: 'crawdaunt', name: '가재장군',   types: ['water', 'dark'],     base: [63, 120, 85, 90, 55, 55],    moves: ['crabhammer', 'knockoff', 'aquajet', 'closecombat'], extra: ['crunch'] },
  { id: 354, key: 'banette',   name: '다크펫',     types: ['ghost'],             base: [64, 115, 65, 83, 63, 65],    moves: ['shadowclaw', 'suckerpunch', 'poltergeist', 'knockoff'], extra: ['thunderbolt'] },
  { id: 365, key: 'walrein',   name: '씨카이저',   types: ['ice', 'water'],      base: [110, 80, 90, 95, 90, 65],    moves: ['icebeam', 'surf', 'earthquake', 'crunch'], extra: ['blizzard'] },
  { id: 409, key: 'rampardos', name: '램펄드',     types: ['rock'],              base: [97, 165, 60, 65, 50, 58],    moves: ['headsmash', 'earthquake', 'stoneedge', 'zenheadbutt'], extra: ['firepunch'] },
  { id: 419, key: 'floatzel',  name: '플로젤',     types: ['water'],             base: [85, 105, 55, 85, 50, 115],   moves: ['liquidation', 'icepunch', 'crunch', 'aquajet'], extra: ['focusblast'] },
  { id: 423, key: 'gastrodon', name: '트리토돈',   types: ['water', 'ground'],   base: [111, 83, 68, 92, 82, 39],    moves: ['scald', 'earthpower', 'icebeam', 'earthquake'], extra: ['stoneedge'] },
  { id: 424, key: 'ambipom',   name: '겟핸보숭',   types: ['normal'],            base: [75, 100, 66, 60, 66, 115],   moves: ['doubleedge', 'uturn', 'knockoff', 'acrobatics'], extra: ['lowkick'] },
  { id: 429, key: 'mismagius', name: '무우마직',   types: ['ghost'],             base: [60, 60, 60, 105, 105, 105],  moves: ['shadowball', 'dazzlinggleam', 'thunderbolt', 'energyball'], extra: ['mysticalfire'] },
  { id: 437, key: 'bronzong',  name: '동탁군',     types: ['steel', 'psychic'],  base: [67, 89, 116, 79, 116, 33],   moves: ['flashcannon', 'psychic', 'earthquake', 'bodypress'], extra: ['zenheadbutt'] },
  { id: 442, key: 'spiritomb', name: '화강돌',     types: ['ghost', 'dark'],     base: [50, 92, 108, 92, 108, 35],   moves: ['shadowball', 'darkpulse', 'suckerpunch', 'psychic'], extra: ['hypnosis'] },
  { id: 465, key: 'tangrowth', name: '덩쿠림보',   types: ['grass'],             base: [100, 100, 125, 110, 50, 50], moves: ['powerwhip', 'knockoff', 'earthquake', 'gigadrain'], extra: ['sludgebomb'] },
  { id: 469, key: 'yanmega',   name: '메가자리',   types: ['bug', 'flying'],     base: [86, 76, 86, 116, 56, 95],    moves: ['bugbuzz', 'airslash', 'uturn', 'psychic'], extra: ['shadowball'] },
  { id: 473, key: 'mamoswine', name: '맘모꾸리',   types: ['ice', 'ground'],     base: [110, 130, 80, 70, 60, 80],   moves: ['earthquake', 'iciclecrash', 'icefang', 'stoneedge'], extra: ['knockoff'] },
  { id: 497, key: 'serperior', name: '샤로다',     types: ['grass'],             base: [75, 75, 95, 75, 95, 113],    moves: ['leafstorm', 'energyball', 'dragonpulse', 'knockoff'], extra: ['dazzlinggleam'] },
  { id: 500, key: 'emboar',    name: '염무왕',     types: ['fire', 'fighting'],  base: [110, 123, 65, 100, 65, 65],  moves: ['flareblitz', 'closecombat', 'wildcharge', 'headsmash'], extra: ['earthquake'] },
  { id: 503, key: 'samurott',  name: '대검귀',     types: ['water'],             base: [95, 100, 85, 108, 70, 70],   moves: ['liquidation', 'megahorn', 'aquajet', 'icebeam'], extra: ['earthquake'] },
  { id: 526, key: 'gigalith',  name: '기가이어스', types: ['rock'],              base: [85, 135, 130, 60, 80, 25],   moves: ['stoneedge', 'earthquake', 'bodypress', 'heavyslam'], extra: ['rockslide'] },
  { id: 547, key: 'whimsicott',name: '엘풍',       types: ['grass', 'fairy'],    base: [60, 67, 85, 77, 75, 116],    moves: ['energyball', 'moonblast', 'uturn', 'dazzlinggleam'], extra: ['hypnosis'] },
  { id: 555, key: 'darmanitan',name: '불비달마',   types: ['fire'],              base: [105, 140, 55, 30, 55, 95],   moves: ['flareblitz', 'earthquake', 'stoneedge', 'uturn'], extra: ['firepunch'] },
  { id: 560, key: 'scrafty',   name: '곤율거니',   types: ['dark', 'fighting'],  base: [65, 90, 115, 45, 115, 58],   moves: ['knockoff', 'drainpunch', 'crunch', 'highjumpkick'], extra: ['poisonjab'] },
  { id: 579, key: 'reuniclus', name: '란쿨루스',   types: ['psychic'],           base: [110, 65, 75, 125, 85, 30],   moves: ['psychic', 'focusblast', 'shadowball', 'energyball'], extra: ['thunderbolt'] },
  { id: 584, key: 'vanilluxe', name: '배바닐라',   types: ['ice'],               base: [71, 95, 85, 110, 95, 79],    moves: ['blizzard', 'icebeam', 'hypervoice', 'shadowball'], extra: ['freezedry'] },
  { id: 591, key: 'amoonguss', name: '뽀록나',     types: ['grass', 'poison'],   base: [114, 85, 70, 85, 80, 30],    moves: ['gigadrain', 'sludgebomb', 'energyball', 'hex'], extra: ['bodypress'] },
  { id: 593, key: 'jellicent', name: '탱탱겔',     types: ['water', 'ghost'],    base: [100, 60, 70, 85, 105, 60],   moves: ['scald', 'shadowball', 'icebeam', 'hex'], extra: ['energyball'] },
  { id: 604, key: 'eelektross',name: '저리더프',   types: ['electric'],          base: [85, 115, 80, 105, 80, 50],   moves: ['wildcharge', 'thunderbolt', 'drainpunch', 'flamethrower'], extra: ['dragonclaw'] },
  { id: 621, key: 'druddigon', name: '크리만',     types: ['dragon'],            base: [77, 120, 90, 60, 90, 48],    moves: ['outrage', 'dragonclaw', 'earthquake', 'crunch'], extra: ['firepunch'] },
  { id: 675, key: 'pangoro',   name: '부란다',     types: ['fighting', 'dark'],  base: [95, 124, 78, 69, 71, 58],    moves: ['knockoff', 'drainpunch', 'crunch', 'closecombat'], extra: ['icepunch'] },
  { id: 693, key: 'clawitzer', name: '블로스터',   types: ['water'],             base: [71, 73, 88, 120, 89, 59],    moves: ['hydropump', 'darkpulse', 'aurasphere', 'icebeam'], extra: ['dragonpulse'] },
  { id: 697, key: 'tyrantrum', name: '견고라스',   types: ['rock', 'dragon'],    base: [82, 121, 119, 69, 59, 71],   moves: ['headsmash', 'outrage', 'crunch', 'earthquake'], extra: ['stoneedge'] },
  { id: 713, key: 'avalugg',   name: '크레베이스', types: ['ice'],               base: [95, 117, 184, 44, 46, 28],   moves: ['bodypress', 'iciclecrash', 'earthquake', 'crunch'], extra: ['stoneedge'] },
  { id: 834, key: 'drednaw',   name: '갈가부기',   types: ['water', 'rock'],     base: [90, 115, 90, 48, 68, 74],    moves: ['liquidation', 'stoneedge', 'crunch', 'earthquake'], extra: ['icefang'] },
  { id: 862, key: 'obstagoon', name: '가로막구리', types: ['dark', 'normal'],    base: [93, 90, 101, 60, 81, 95],    moves: ['knockoff', 'facade', 'closecombat', 'suckerpunch'], extra: ['icepunch'] },
  { id: 956, key: 'espathra',  name: '클레스퍼트라', types: ['psychic'],         base: [95, 60, 60, 101, 60, 105],   moves: ['psychic', 'dazzlinggleam', 'shadowball', 'uturn'], extra: ['energyball'] },
  { id: 967, key: 'cyclizar',  name: '모토마',     types: ['dragon', 'normal'],  base: [70, 95, 65, 85, 65, 121],    moves: ['dragonclaw', 'doubleedge', 'uturn', 'knockoff'], extra: ['dracometeor'] },
  { id: 975, key: 'cetitan',   name: '우락고래',   types: ['ice'],               base: [170, 113, 65, 45, 55, 73],   moves: ['iciclecrash', 'earthquake', 'liquidation', 'playrough'], extra: ['icebeam'] },
  { id: 1018,key: 'archaludon',name: '브리두라스', types: ['steel', 'dragon'],   base: [90, 105, 130, 125, 65, 85],  moves: ['flashcannon', 'dragonpulse', 'bodypress', 'dracometeor'], extra: ['thunderbolt'] },

  // 전설·환상의 포켓몬
  { id: 892, key: 'urshifu',   name: '우라오스(일격)', types: ['fighting', 'dark'], base: [100, 130, 100, 63, 60, 97], moves: ['wickedblow', 'closecombat', 'suckerpunch', 'ironhead'], extra: ['poisonjab'], legend: true },
  { id: 10191, key: 'urshifurapid', name: '우라오스(연격)', types: ['fighting', 'water'], base: [100, 130, 100, 63, 60, 97], moves: ['surgingstrikes', 'closecombat', 'aquajet', 'icepunch'], extra: ['uturn'], legend: true },
  { id: 150, key: 'mewtwo',    name: '뮤츠',       types: ['psychic'],           base: [106, 110, 90, 154, 90, 130], moves: ['psychic', 'shadowball', 'aurasphere', 'icebeam'], extra: ['psystrike', 'fireblast', 'thunderbolt', 'focusblast', 'drainpunch'], legend: true },
  { id: 384, key: 'rayquaza',  name: '레쿠쟈',     types: ['dragon', 'flying'],  base: [105, 150, 90, 150, 90, 95],  moves: ['outrage', 'extremespeed', 'airslash', 'hyperbeam'], extra: ['dragonascent', 'earthquake', 'dracometeor', 'vcreate'], legend: true },
  { id: 144, key: 'articuno',  name: '프리져',     types: ['ice', 'flying'],     base: [90, 85, 100, 95, 125, 85],   moves: ['icebeam', 'blizzard', 'hurricane', 'airslash'], extra: ['freezedry'], legend: true },
  { id: 145, key: 'zapdos',    name: '썬더',       types: ['electric', 'flying'], base: [90, 90, 85, 125, 90, 100],  moves: ['thunderbolt', 'thunder', 'hurricane', 'airslash'], extra: ['heatwave'], legend: true },
  { id: 146, key: 'moltres',   name: '파이어',     types: ['fire', 'flying'],    base: [90, 100, 90, 125, 85, 90],   moves: ['flamethrower', 'fireblast', 'hurricane', 'airslash'], extra: ['solarbeam'], legend: true },
  { id: 151, key: 'mew',       name: '뮤',         types: ['psychic'],           base: [100, 100, 100, 100, 100, 100], moves: ['psychic', 'aurasphere', 'flamethrower', 'icebeam'], extra: ['thunderbolt', 'shadowball', 'energyball', 'surf', 'earthquake', 'dazzlinggleam'], legend: true },
  { id: 249, key: 'lugia',     name: '루기아',     types: ['psychic', 'flying'], base: [106, 90, 130, 90, 154, 110], moves: ['aeroblast', 'psychic', 'icebeam', 'thunder'], extra: ['earthpower', 'surf'], legend: true },
  { id: 250, key: 'hooh',      name: '칠색조',     types: ['fire', 'flying'],    base: [106, 130, 90, 110, 154, 90], moves: ['sacredfire', 'bravebird', 'earthquake', 'extremespeed'], extra: ['thunderpunch', 'solarbeam'], legend: true },
  { id: 380, key: 'latias',    name: '라티아스',   types: ['dragon', 'psychic'], base: [80, 80, 90, 110, 130, 110],  moves: ['mistball', 'dragonpulse', 'psychic', 'thunderbolt'], extra: ['surf', 'icebeam', 'dracometeor'], legend: true },
  { id: 381, key: 'latios',    name: '라티오스',   types: ['dragon', 'psychic'], base: [80, 90, 80, 130, 110, 110],  moves: ['lusterpurge', 'dragonpulse', 'psychic', 'surf'], extra: ['thunderbolt', 'icebeam', 'dracometeor'], legend: true },
  { id: 382, key: 'kyogre',    name: '가이오가',   types: ['water'],             base: [100, 100, 90, 150, 140, 90], moves: ['originpulse', 'icebeam', 'thunder', 'surf'], extra: ['scald'], legend: true },
  { id: 383, key: 'groudon',   name: '그란돈',     types: ['ground'],            base: [100, 150, 140, 100, 90, 90], moves: ['precipiceblades', 'earthquake', 'stoneedge', 'firepunch'], extra: ['solarbeam', 'fireblast', 'thunderpunch'], legend: true },
  { id: 483, key: 'dialga',    name: '디아루가',   types: ['steel', 'dragon'],   base: [100, 120, 120, 150, 100, 90], moves: ['roaroftime', 'flashcannon', 'dragonpulse', 'fireblast'], extra: ['thunderbolt', 'earthpower'], legend: true },
  { id: 484, key: 'palkia',    name: '펄기아',     types: ['water', 'dragon'],   base: [90, 120, 100, 150, 120, 100], moves: ['spacialrend', 'hydropump', 'dragonpulse', 'thunder'], extra: ['fireblast', 'earthpower'], legend: true },
  { id: 487, key: 'giratina',  name: '기라티나',   types: ['ghost', 'dragon'],   base: [150, 100, 120, 100, 120, 90], moves: ['shadowforce', 'dragonclaw', 'shadowball', 'earthquake'], extra: ['aurasphere', 'dragonpulse'], legend: true },
  { id: 493, key: 'arceus',    name: '아르세우스', types: ['normal'],            base: [120, 120, 120, 120, 120, 120], moves: ['judgment', 'extremespeed', 'earthquake', 'shadowclaw'], extra: ['flamethrower', 'icebeam', 'thunderbolt', 'stoneedge', 'dragonclaw'], legend: true },
  { id: 643, key: 'reshiram',  name: '레시라무',   types: ['dragon', 'fire'],    base: [100, 120, 100, 150, 120, 90], moves: ['blueflare', 'dragonpulse', 'flamethrower', 'earthpower'], extra: ['extrasensory', 'focusblast'], legend: true },
  { id: 644, key: 'zekrom',    name: '제크로무',   types: ['dragon', 'electric'], base: [100, 150, 120, 120, 100, 90], moves: ['boltstrike', 'dragonclaw', 'outrage', 'crunch'], extra: ['earthquake', 'focusblast'], legend: true },
  { id: 888, key: 'zacian',    name: '자시안',     types: ['fairy'],             base: [92, 130, 115, 80, 115, 138], moves: ['behemothblade', 'playrough', 'sacredsword', 'crunch'], extra: ['closecombat', 'wildcharge', 'quickattack'], legend: true },
  { id: 889, key: 'zamazenta', name: '자마젠타',   types: ['fighting'],          base: [92, 130, 115, 80, 115, 138], moves: ['behemothbash', 'closecombat', 'crunch', 'bodypress'], extra: ['playrough', 'wildcharge', 'icefang'], legend: true },
  { id: 646, key: 'kyurem',    name: '큐레무',     types: ['dragon', 'ice'],     base: [125, 130, 90, 130, 90, 95],  moves: ['glaciate', 'dracometeor', 'earthpower', 'dragonpulse'], extra: ['icebeam', 'focusblast'], legend: true },
  { id: 10022, key: 'kyuremblack', name: '블랙큐레무', types: ['dragon', 'ice'], base: [125, 170, 100, 120, 90, 95], moves: ['fusionbolt', 'dragonclaw', 'outrage', 'icebeam'], extra: ['earthquake', 'stoneedge'], legend: true },
  { id: 10023, key: 'kyuremwhite', name: '화이트큐레무', types: ['dragon', 'ice'], base: [125, 120, 90, 170, 100, 95], moves: ['fusionflare', 'dragonpulse', 'icebeam', 'dracometeor'], extra: ['earthpower', 'focusblast'], legend: true },
  { id: 791, key: 'solgaleo',  name: '솔가레오',   types: ['psychic', 'steel'],  base: [137, 137, 107, 113, 89, 97], moves: ['sunsteelstrike', 'flareblitz', 'earthquake', 'stoneedge'], extra: ['psychic', 'flashcannon'], legend: true },
  { id: 792, key: 'lunala',    name: '루나아라',   types: ['psychic', 'ghost'],  base: [137, 113, 89, 137, 107, 97], moves: ['moongeistbeam', 'moonblast', 'shadowball', 'psychic'], extra: ['icebeam', 'heatwave'], legend: true },
  { id: 800, key: 'necrozma',  name: '네크로즈마', types: ['psychic'],           base: [97, 107, 101, 127, 89, 79],  moves: ['prismaticlaser', 'photongeyser', 'heatwave', 'earthquake'], extra: ['flashcannon', 'darkpulse'], legend: true, hidden: true },
  { id: 10155, key: 'necrozmadusk', name: '네크로즈마(황혼의 갈기)', types: ['psychic', 'steel'], base: [97, 157, 127, 113, 109, 77], moves: ['sunsteelstrike', 'earthquake', 'outrage', 'stoneedge'], extra: ['photongeyser', 'flashcannon'], legend: true },
  { id: 10156, key: 'necrozmadawn', name: '네크로즈마(새벽의 날개)', types: ['psychic', 'ghost'], base: [97, 113, 109, 157, 127, 77], moves: ['moongeistbeam', 'moonblast', 'psychic', 'heatwave'], extra: ['photongeyser', 'shadowball'], legend: true },
  { id: 716, key: 'xerneas',   name: '제르네아스', types: ['fairy'],             base: [126, 131, 95, 131, 98, 99],  moves: ['moonblast', 'dazzlinggleam', 'thunderbolt', 'focusblast'], extra: ['playrough', 'closecombat'], legend: true },
  { id: 717, key: 'yveltal',   name: '이벨타르',   types: ['dark', 'flying'],    base: [126, 131, 95, 131, 98, 99],  moves: ['oblivionwing', 'darkpulse', 'hurricane', 'suckerpunch'], extra: ['heatwave', 'focusblast'], legend: true },
  { id: 485, key: 'heatran',   name: '히드런',     types: ['fire', 'steel'],     base: [91, 90, 106, 130, 106, 77],  moves: ['flamethrower', 'earthpower', 'flashcannon', 'stoneedge'], extra: ['fireblast', 'darkpulse'], legend: true },
  { id: 10021, key: 'landorus', name: '랜드로스(영물)', types: ['ground', 'flying'], base: [89, 145, 90, 105, 80, 91], moves: ['earthquake', 'stoneedge', 'outrage', 'uturn'], extra: ['superpower', 'rockslide'], legend: true },
  { id: 491, key: 'darkrai',   name: '다크라이',   types: ['dark'],              base: [70, 90, 90, 135, 90, 125],   moves: ['darkpulse', 'icebeam', 'thunderbolt', 'hypnosis'], extra: ['focusblast', 'sludgebomb'], legend: true },
  { id: 488, key: 'cresselia', name: '크레세리아', types: ['psychic'],           base: [120, 70, 110, 75, 120, 85],  moves: ['psychic', 'moonblast', 'icebeam', 'thunderbolt'], extra: ['psyshock'], legend: true },
  { id: 647, key: 'keldeo',    name: '케르디오',   types: ['water', 'fighting'], base: [91, 72, 90, 129, 90, 108],   moves: ['secretsword', 'hydropump', 'aurasphere', 'icebeam'], extra: ['closecombat'], legend: true },
  { id: 1007, key: 'koraidon', name: '코라이돈',   types: ['fighting', 'dragon'], base: [100, 135, 115, 85, 100, 135], moves: ['closecombat', 'outrage', 'flareblitz', 'earthquake'], extra: ['dragonclaw', 'wildcharge'], legend: true },
  { id: 1008, key: 'miraidon', name: '미라이돈',   types: ['electric', 'dragon'], base: [100, 85, 100, 135, 115, 135], moves: ['electrodrift', 'dracometeor', 'thunderbolt', 'overheat'], extra: ['flashcannon', 'dazzlinggleam'], legend: true },
  { id: 890, key: 'eternatus', name: '무한다이노', types: ['poison', 'dragon'],  base: [140, 85, 95, 145, 95, 130],  moves: ['dynamaxcannon', 'sludgebomb', 'flamethrower', 'dracometeor'], extra: ['flashcannon'], legend: true },
  { id: 905, key: 'enamorus',  name: '러브로스',   types: ['fairy', 'flying'],   base: [74, 115, 70, 135, 80, 106],  moves: ['moonblast', 'playrough', 'hurricane', 'earthpower'], extra: ['dazzlinggleam', 'mysticalfire'], legend: true },
  { id: 1001, key: 'wochien',  name: '총지엔',     types: ['dark', 'grass'],     base: [85, 85, 100, 95, 135, 70],   moves: ['energyball', 'darkpulse', 'knockoff', 'bodypress'], extra: ['gigaimpact'], legend: true },
  { id: 1002, key: 'chienpao', name: '파오젠',     types: ['dark', 'ice'],       base: [80, 120, 80, 90, 65, 135],   moves: ['iciclecrash', 'crunch', 'iceshard', 'suckerpunch'], extra: ['icebeam'], legend: true },
  { id: 1003, key: 'tinglu',   name: '딩루',       types: ['dark', 'ground'],    base: [155, 110, 125, 55, 80, 45],  moves: ['earthquake', 'heavyslam', 'stoneedge', 'bodypress'], extra: ['crunch'], legend: true },
  { id: 1004, key: 'chiyu',    name: '위유이',     types: ['dark', 'fire'],      base: [55, 80, 80, 135, 120, 100],  moves: ['flamethrower', 'darkpulse', 'overheat', 'fireblast'], extra: ['psychic'], legend: true },
  { id: 785, key: 'tapukoko',  name: '카푸꼬꼬꼭', types: ['electric', 'fairy'], base: [70, 115, 85, 95, 75, 130],   moves: ['naturesmadness', 'wildcharge', 'bravebird', 'uturn'], extra: ['thunderbolt', 'dazzlinggleam', 'playrough', 'thunder'], legend: true },
  { id: 786, key: 'tapulele',  name: '카푸나비나', types: ['psychic', 'fairy'],  base: [70, 85, 75, 130, 115, 95],   moves: ['naturesmadness', 'moonblast', 'psychic', 'focusblast'], extra: ['psyshock', 'shadowball', 'dazzlinggleam'], legend: true },
  { id: 787, key: 'tapubulu',  name: '카푸브루루', types: ['grass', 'fairy'],    base: [70, 130, 115, 85, 95, 75],   moves: ['naturesmadness', 'woodhammer', 'playrough', 'superpower'], extra: ['stoneedge', 'grassyglide', 'megahorn'], legend: true },
  { id: 788, key: 'tapufini',  name: '카푸느지느', types: ['water', 'fairy'],    base: [70, 75, 115, 95, 130, 85],   moves: ['naturesmadness', 'moonblast', 'scald', 'icebeam'], extra: ['hydropump', 'dazzlinggleam', 'shadowball'], legend: true },
  { id: 243, key: 'raikou',    name: '라이코',     types: ['electric'],          base: [90, 85, 75, 115, 100, 115],  moves: ['thunderbolt', 'thunder', 'shadowball', 'extrasensory'], extra: ['voltswitch', 'crunch'], legend: true },
  { id: 244, key: 'entei',     name: '앤테이',     types: ['fire'],              base: [115, 115, 85, 90, 75, 100],  moves: ['sacredfire', 'flareblitz', 'extremespeed', 'stoneedge'], extra: ['crunch', 'ironhead'], legend: true },
  { id: 245, key: 'suicune',   name: '스이쿤',     types: ['water'],             base: [100, 75, 115, 90, 115, 85],  moves: ['scald', 'icebeam', 'extrasensory', 'hydropump'], extra: ['shadowball'], legend: true },
  { id: 251, key: 'celebi',    name: '세레비',     types: ['psychic', 'grass'],  base: [100, 100, 100, 100, 100, 100], moves: ['psychic', 'energyball', 'dazzlinggleam', 'shadowball'], extra: ['earthpower'], legend: true },
  { id: 377, key: 'regirock',  name: '레지락',     types: ['rock'],              base: [80, 100, 200, 50, 100, 50],  moves: ['stoneedge', 'earthquake', 'bodypress', 'heavyslam'], extra: ['superpower'], legend: true },
  { id: 378, key: 'regice',    name: '레지아이스', types: ['ice'],               base: [80, 50, 100, 100, 200, 50],  moves: ['icebeam', 'blizzard', 'thunderbolt', 'focusblast'], extra: ['flashcannon'], legend: true },
  { id: 379, key: 'registeel', name: '레지스틸',   types: ['steel'],             base: [80, 75, 150, 75, 150, 50],   moves: ['flashcannon', 'ironhead', 'bodypress', 'earthquake'], extra: ['thunderbolt'], legend: true },
  { id: 385, key: 'jirachi',   name: '지라치',     types: ['steel', 'psychic'],  base: [100, 100, 100, 100, 100, 100], moves: ['ironhead', 'psychic', 'thunderbolt', 'dazzlinggleam'], extra: ['uturn'], legend: true },
  { id: 386, key: 'deoxys',    name: '테오키스',   types: ['psychic'],           base: [50, 150, 50, 150, 50, 150],  moves: ['psychic', 'extremespeed', 'shadowball', 'focusblast'], extra: ['icebeam', 'thunderbolt'], legend: true },
  { id: 480, key: 'uxie',      name: '유크시',     types: ['psychic'],           base: [75, 75, 130, 75, 130, 95],   moves: ['psychic', 'thunderbolt', 'energyball', 'shadowball'], extra: ['uturn'], legend: true },
  { id: 481, key: 'mesprit',   name: '엠라이트',   types: ['psychic'],           base: [80, 105, 105, 105, 105, 80], moves: ['psychic', 'dazzlinggleam', 'thunderbolt', 'icebeam'], extra: ['energyball'], legend: true },
  { id: 482, key: 'azelf',     name: '아그논',     types: ['psychic'],           base: [75, 125, 70, 125, 70, 115],  moves: ['psychic', 'flamethrower', 'fireblast', 'uturn'], extra: ['extrasensory'], legend: true },
  { id: 638, key: 'cobalion',  name: '코바르온',   types: ['steel', 'fighting'], base: [91, 90, 129, 90, 72, 108],   moves: ['sacredsword', 'ironhead', 'closecombat', 'voltswitch'], extra: ['stoneedge'], legend: true },
  { id: 639, key: 'terrakion', name: '테라키온',   types: ['rock', 'fighting'],  base: [91, 129, 90, 72, 90, 108],   moves: ['closecombat', 'stoneedge', 'earthquake', 'sacredsword'], extra: ['rockslide'], legend: true },
  { id: 640, key: 'virizion',  name: '비리디온',   types: ['grass', 'fighting'], base: [91, 90, 72, 90, 129, 108],   moves: ['leafblade', 'closecombat', 'sacredsword', 'stoneedge'], extra: ['energyball'], legend: true },
  { id: 641, key: 'tornadus',  name: '토네로스',   types: ['flying'],            base: [79, 115, 70, 125, 80, 111],  moves: ['hurricane', 'airslash', 'heatwave', 'uturn'], extra: ['extrasensory', 'focusblast'], legend: true },
  { id: 642, key: 'thundurus', name: '볼트로스',   types: ['electric', 'flying'], base: [79, 115, 70, 125, 80, 111], moves: ['thunderbolt', 'thunder', 'focusblast', 'uturn'], extra: ['heatwave'], legend: true },
  { id: 648, key: 'meloetta',  name: '메로엣타',   types: ['normal', 'psychic'], base: [100, 77, 77, 128, 128, 90],  moves: ['hypervoice', 'psychic', 'focusblast', 'shadowball'], extra: ['dazzlinggleam'], legend: true },
  { id: 649, key: 'genesect',  name: '게노세크트', types: ['bug', 'steel'],      base: [71, 120, 95, 120, 95, 99],   moves: ['flashcannon', 'bugbuzz', 'flamethrower', 'icebeam'], extra: ['thunderbolt', 'uturn'], legend: true },
  { id: 718, key: 'zygarde',   name: '지가르데',   types: ['dragon', 'ground'],  base: [108, 100, 121, 81, 95, 95],  moves: ['thousandarrows', 'coreenforcer', 'outrage', 'extremespeed'], extra: ['thousandwaves', 'landswrath', 'earthquake', 'dragonclaw', 'stoneedge'], legend: true },
  { id: 719, key: 'diancie',   name: '디안시',     types: ['rock', 'fairy'],     base: [50, 100, 150, 100, 150, 50], moves: ['moonblast', 'powergem', 'earthpower', 'bodypress'], extra: ['dazzlinggleam'], legend: true },
  { id: 720, key: 'hoopa',     name: '후파',       types: ['psychic', 'ghost'],  base: [80, 110, 60, 150, 130, 70],  moves: ['psychic', 'shadowball', 'focusblast', 'thunderbolt'], extra: ['darkpulse'], legend: true },
  { id: 721, key: 'volcanion', name: '볼케니온',   types: ['fire', 'water'],     base: [80, 110, 120, 130, 90, 70],  moves: ['flamethrower', 'hydropump', 'earthpower', 'flashcannon'], extra: ['overheat'], legend: true },
  { id: 793, key: 'nihilego',  name: '텅비드',     types: ['rock', 'poison'],    base: [109, 53, 47, 127, 131, 103], moves: ['powergem', 'sludgewave', 'thunderbolt', 'dazzlinggleam'], extra: ['earthpower', 'psychic'], legend: true },
  { id: 794, key: 'buzzwole',  name: '매시붕',     types: ['bug', 'fighting'],   base: [107, 139, 139, 53, 53, 79],  moves: ['leechlife', 'closecombat', 'icepunch', 'earthquake'], extra: ['poisonjab', 'stoneedge'], legend: true },
  { id: 795, key: 'pheromosa', name: '페로코체',   types: ['bug', 'fighting'],   base: [71, 137, 37, 137, 37, 151],  moves: ['highjumpkick', 'uturn', 'icebeam', 'poisonjab'], extra: ['bugbuzz', 'closecombat'], legend: true },
  { id: 796, key: 'xurkitree', name: '전수목',     types: ['electric'],          base: [83, 89, 71, 173, 71, 83],    moves: ['thunderbolt', 'energyball', 'dazzlinggleam', 'thunder'], extra: ['voltswitch', 'focusblast'], legend: true },
  { id: 797, key: 'celesteela', name: '철화구야',  types: ['steel', 'flying'],   base: [97, 101, 103, 107, 101, 61], moves: ['flashcannon', 'airslash', 'earthquake', 'flamethrower'], extra: ['heavyslam', 'ironhead'], legend: true },
  { id: 798, key: 'kartana',   name: '종이신도',   types: ['grass', 'steel'],    base: [59, 181, 131, 59, 31, 109],  moves: ['leafblade', 'sacredsword', 'knockoff', 'nightslash'], extra: ['ironhead', 'xscissor'], legend: true },
  { id: 799, key: 'guzzlord',  name: '악식킹',     types: ['dark', 'dragon'],    base: [223, 101, 53, 97, 53, 43],   moves: ['crunch', 'outrage', 'darkpulse', 'earthquake'], extra: ['heavyslam', 'dragonpulse'], legend: true },
  { id: 803, key: 'poipole',   name: '베베놈',     types: ['poison'],            base: [67, 73, 67, 73, 67, 73],     moves: ['sludgewave', 'poisonjab', 'darkpulse', 'uturn'], extra: ['gunkshot'], legend: true },
  { id: 804, key: 'naganadel', name: '아고용',     types: ['poison', 'dragon'],  base: [73, 73, 73, 127, 73, 121],   moves: ['sludgewave', 'dracometeor', 'flamethrower', 'uturn'], extra: ['dragonpulse', 'fireblast'], legend: true },
  { id: 805, key: 'stakataka', name: '차곡차곡',   types: ['rock', 'steel'],     base: [61, 131, 211, 53, 101, 13],  moves: ['bodypress', 'earthquake', 'stoneedge', 'heavyslam'], extra: ['ironhead', 'rockslide'], legend: true },
  { id: 806, key: 'blacephalon', name: '두파팡',   types: ['fire', 'ghost'],     base: [53, 127, 53, 151, 79, 107],  moves: ['mindblown', 'fireblast', 'shadowball', 'psychic'], extra: ['overheat', 'dazzlinggleam'], legend: true },
  { id: 801, key: 'magearna',  name: '마기아나',   types: ['steel', 'fairy'],    base: [80, 95, 115, 130, 115, 65],  moves: ['flashcannon', 'moonblast', 'aurasphere', 'focusblast'], extra: ['thunderbolt'], legend: true },
  { id: 802, key: 'marshadow', name: '마샤도',     types: ['fighting', 'ghost'], base: [90, 125, 80, 90, 90, 125],   moves: ['closecombat', 'shadowsneak', 'icepunch', 'suckerpunch'], extra: ['poltergeist'], legend: true },
  { id: 807, key: 'zeraora',   name: '제라오라',   types: ['electric'],          base: [88, 112, 75, 102, 80, 143],  moves: ['wildcharge', 'closecombat', 'thunderpunch', 'drainpunch'], extra: ['playrough'], legend: true },
  { id: 809, key: 'melmetal',  name: '멜메탈',     types: ['steel'],             base: [135, 143, 143, 80, 65, 34],  moves: ['doubleironbash', 'heavyslam', 'earthquake', 'thunderpunch'], extra: ['icepunch', 'superpower'], legend: true },
  { id: 896, key: 'glastrier', name: '블리자포스', types: ['ice'],               base: [100, 145, 130, 65, 110, 30], moves: ['glaciallance', 'closecombat', 'highhorsepower', 'bodypress'], extra: ['iciclecrash', 'zenheadbutt'], legend: true },
  { id: 897, key: 'spectrier', name: '레이스포스', types: ['ghost'],             base: [100, 65, 60, 145, 80, 130],  moves: ['astralbarrage', 'shadowball', 'psychic', 'drainingkiss'], extra: ['hex', 'darkpulse'], legend: true },
  { id: 10193, key: 'calyrexice', name: '버드렉스(백마 탄 모습)', types: ['psychic', 'ice'], base: [100, 165, 150, 85, 130, 50], moves: ['glaciallance', 'closecombat', 'highhorsepower', 'bodypress'], extra: ['iciclecrash', 'zenheadbutt'], legend: true },
  { id: 10194, key: 'calyrexshadow', name: '버드렉스(흑마 탄 모습)', types: ['psychic', 'ghost'], base: [100, 85, 80, 165, 100, 150], moves: ['astralbarrage', 'shadowball', 'energyball', 'psyshock'], extra: ['psychic', 'dazzlinggleam'], legend: true },
  { id: 1016, key: 'fezandipiti', name: '기로치',  types: ['poison', 'fairy'],   base: [88, 91, 82, 70, 125, 99],    moves: ['moonblast', 'playrough', 'heatwave', 'uturn'], extra: ['gunkshot'], legend: true },
  { id: 1017, key: 'ogerpon',  name: '오거폰',     types: ['grass'],             base: [80, 120, 84, 60, 96, 110],   moves: ['woodhammer', 'playrough', 'knockoff', 'uturn'], extra: ['superpower'], legend: true },
  { id: 90003, key: 'wargreymon', name: '워그레이몬', types: ['fire', 'dragon'], base: [104, 140, 105, 80, 100, 115], moves: ['gaiaforce', 'flareblitz', 'outrage', 'extremespeed'], extra: ['closecombat', 'dragonclaw', 'firepunch', 'earthquake'], legend: true, draw: 0.62 },
  { id: 90004, key: 'metalgarurumon', name: '메탈가루몬', types: ['ice', 'steel'], base: [104, 95, 120, 145, 100, 110], moves: ['seolleongpo', 'flashcannon', 'blizzard', 'icefang'], extra: ['freezedry', 'thunderbolt', 'darkpulse', 'icebeam'], legend: true, draw: 0.62 },

  // 이스터에그. 도감에는 숨겨 두고, 메뉴에서 비밀 입력을 하면 풀린다.
  { id: 90001, key: 'omegamon', name: '오메가몬', types: ['fire', 'ice'], base: [108, 130, 120, 130, 115, 97], moves: ['greysword', 'garurucannon', 'extremespeed', 'icebeam'], fixedPool: true, egg: true },
];

const POKEMON_ABILITY = {
  rattata: 'moldbreaker', pikachu: 'static', ashpikachu: 'static', charizard: 'blaze', blastoise: 'torrent', venusaur: 'overgrow', gengar: 'cursedbody',
  mewtwo: 'pressure', lucario: 'innerfocus', garchomp: 'roughskin', gyarados: 'intimidate', dragonite: 'multiscale',
  snorlax: 'thickfat', honchkrow: 'superluck', greninja: 'protean', lapras: 'waterabsorb',
  alakazam: 'magicguard', machamp: 'noguard', tyranitar: 'sandstream', scizor: 'technician', blaziken: 'speedboost',
  sceptile: 'overgrow', swampert: 'torrent', gardevoir: 'trace', metagross: 'clearbody', rayquaza: 'airlock',
  jolteon: 'voltabsorb', arcanine: 'flashfire', mimikyu: 'disguise', togekiss: 'serenegrace', weavile: 'pressure',
  shedinja: 'wonderguard', excadrill: 'moldbreaker',
  raichu: 'lightningrod', pachirisu: 'voltabsorb', rotom: 'levitate', ditto: 'imposter', pidgeot: 'tangledfeet',
  ninetales: 'drought', nidoking: 'sheerforce', golem: 'sturdy', slowbro: 'regenerator', starmie: 'naturalcure',
  kangaskhan: 'scrappy', pinsir: 'moldbreaker', aerodactyl: 'pressure', vaporeon: 'waterabsorb', flareon: 'flashfire',
  espeon: 'magicbounce', umbreon: 'synchronize', leafeon: 'chlorophyll', sylveon: 'pixilate', ampharos: 'static',
  typhlosion: 'flashfire', feraligatr: 'sheerforce', heracross: 'guts', steelix: 'sturdy', kingdra: 'swiftswim',
  houndoom: 'flashfire', skarmory: 'sturdy', salamence: 'intimidate', aggron: 'sturdy', absol: 'superluck',
  flygon: 'levitate', milotic: 'marvelscale', sharpedo: 'roughskin', altaria: 'naturalcure', infernape: 'ironfist',
  empoleon: 'torrent', torterra: 'overgrow', luxray: 'intimidate', staraptor: 'reckless', electivire: 'motordrive',
  magmortar: 'flamebody', rhyperior: 'solidrock', roserade: 'technician', haxorus: 'moldbreaker', hydreigon: 'levitate',
  volcarona: 'flamebody', chandelure: 'flashfire', conkeldurr: 'guts', krookodile: 'intimidate', hawlucha: 'moldbreaker',
  goodra: 'sapsipper', incineroar: 'intimidate', primarina: 'torrent', kommoo: 'bulletproof', cinderace: 'libero',
  dragapult: 'clearbody', corviknight: 'mirrorarmor',
  nidoqueen: 'sheerforce', cloyster: 'skilllink', muk: 'regenerator', kingler: 'sheerforce', tauros: 'intimidate',
  weezing: 'levitate', glaceon: 'clearbody', crobat: 'innerfocus', slowking: 'regenerator', magnezone: 'sturdy',
  porygonz: 'adaptability', dusknoir: 'pressure', froslass: 'cursedbody', gallade: 'innerfocus', toxicroak: 'waterabsorb',
  breloom: 'technician', gliscor: 'magicguard', blissey: 'naturalcure', hariyama: 'guts', mawile: 'intimidate',
  manectric: 'lightningrod', hippowdon: 'sandstream', drapion: 'shellarmor', zoroark: 'disguise', ferrothorn: 'roughskin',
  mienshao: 'regenerator', golurk: 'noguard', braviary: 'sheerforce', chesnaught: 'bulletproof', delphox: 'blaze',
  talonflame: 'flamebody', aegislash: 'filter', noivern: 'clearbody', rowlet: 'overgrow', decidueye: 'overgrow', toxapex: 'regenerator',
  rillaboom: 'overgrow', inteleon: 'torrent', hatterene: 'magicbounce', grimmsnarl: 'intimidate', kingambit: 'innerfocus',
  articuno: 'pressure', zapdos: 'static', moltres: 'pressure', mew: 'synchronize', lugia: 'multiscale',
  hooh: 'regenerator', latias: 'levitate', latios: 'levitate', kyogre: 'drizzle', groudon: 'drought',
  dialga: 'pressure', palkia: 'pressure', giratina: 'pressure', arceus: 'multitype', reshiram: 'turboblaze', zekrom: 'teravolt',
  zacian: 'intrepidsword', zamazenta: 'dauntlessshield',
  azumarill: 'hugepower', abomasnow: 'snowwarning', glalie: 'innerfocus', lopunny: 'limber', sableye: 'prankster',
  baxcalibur: 'thermalexchange', meowscarada: 'protean', skeledirge: 'blaze', quaquaval: 'torrent', annihilape: 'defiant',
  gholdengo: 'goodasgold', tinkaton: 'moldbreaker', ceruledge: 'flashfire', armarouge: 'flashfire',
  sirfetchd: 'steadfast', dracovish: 'strongjaw',
  lycanroc: 'steadfast', lycanrocmidnight: 'noguard', lycanrocdusk: 'toughclaws',
  butterfree: 'serenegrace', meowth: 'technician', eevee: 'adaptability', beedrill: 'swarm', medicham: 'hugepower',
  audino: 'regenerator', victreebel: 'chlorophyll', scolipede: 'speedboost', pyroar: 'moxie', floette: 'naturalcure',
  malamar: 'contrary', barbaracle: 'toughclaws', dragalge: 'adaptability', drampa: 'sapsipper', falinks: 'shellarmor',
  chimecho: 'levitate', meowstic: 'prankster', crabominable: 'ironfist', golisopod: 'shellarmor', scovillain: 'chlorophyll',
  glimmora: 'poisonpoint', tatsugiri: 'regenerator', garbodor: 'poisonpoint', orbeetle: 'swarm', coalossal: 'flashfire',
  flapple: 'overgrow', appletun: 'thickfat', sandaconda: 'sandstream', toxtricity: 'technician', toxtricitylow: 'technician',
  centiskorch: 'flashfire', alcremie: 'insomnia', copperajah: 'sheerforce', duraludon: 'stalwart',
  urshifu: 'unseenfist', urshifurapid: 'unseenfist',
  kyurem: 'pressure', kyuremblack: 'teravolt', kyuremwhite: 'turboblaze',
  solgaleo: 'fullmetalbody', lunala: 'shadowshield', necrozma: 'prismarmor', necrozmadusk: 'prismarmor', necrozmadawn: 'prismarmor',
  xerneas: 'fairyaura', yveltal: 'darkaura', heatran: 'flashfire', landorus: 'intimidate', darkrai: 'baddreams',
  cresselia: 'levitate', keldeo: 'justified', koraidon: 'orichalcumpulse', miraidon: 'hadronengine', eternatus: 'pressure',
  enamorus: 'contrary', wochien: 'tabletsofruin', chienpao: 'swordofruin', tinglu: 'vesselofruin', chiyu: 'beadsofruin',
  tapukoko: 'electricsurge', tapulele: 'psychicsurge', tapubulu: 'grassysurge', tapufini: 'mistysurge',
  clefable: 'magicguard', rapidash: 'flashfire', exeggutor: 'chlorophyll', hitmonlee: 'reckless', hitmonchan: 'ironfist',
  hitmontop: 'technician', kabutops: 'swiftswim', poliwrath: 'waterabsorb', tentacruel: 'clearbody', dugtrio: 'sandforce',
  sandslash: 'sandforce', vileplume: 'chlorophyll', golduck: 'swiftswim', hypno: 'insomnia', primeape: 'defiant',
  mrmime: 'filter', arbok: 'intimidate', dewgong: 'thickfat', electrode: 'static', omastar: 'shellarmor',
  meganium: 'overgrow', lanturn: 'voltabsorb', xatu: 'synchronize', politoed: 'drizzle', quagsire: 'waterabsorb',
  forretress: 'sturdy', granbull: 'intimidate', donphan: 'sturdy', ludicolo: 'swiftswim', shiftry: 'chlorophyll',
  swellow: 'guts', pelipper: 'drizzle', ninjask: 'speedboost', exploud: 'scrappy', camerupt: 'solidrock',
  crawdaunt: 'adaptability', banette: 'cursedbody', walrein: 'thickfat', rampardos: 'moldbreaker', floatzel: 'swiftswim',
  gastrodon: 'sandforce', ambipom: 'technician', mismagius: 'levitate', bronzong: 'levitate', spiritomb: 'pressure',
  tangrowth: 'regenerator', yanmega: 'speedboost', mamoswine: 'thickfat', serperior: 'contrary', emboar: 'blaze',
  samurott: 'torrent', gigalith: 'sturdy', whimsicott: 'prankster', darmanitan: 'sheerforce', scrafty: 'intimidate',
  reuniclus: 'magicguard', vanilluxe: 'snowwarning', amoonguss: 'regenerator', jellicent: 'waterabsorb', eelektross: 'levitate',
  druddigon: 'roughskin', pangoro: 'ironfist', clawitzer: 'megalauncher', tyrantrum: 'strongjaw', avalugg: 'sturdy',
  drednaw: 'strongjaw', obstagoon: 'guts', espathra: 'speedboost', cyclizar: 'regenerator', cetitan: 'thickfat',
  archaludon: 'sturdy',
  raikou: 'pressure', entei: 'pressure', suicune: 'pressure', celebi: 'naturalcure',
  regirock: 'clearbody', regice: 'clearbody', registeel: 'clearbody', jirachi: 'serenegrace', deoxys: 'pressure',
  uxie: 'levitate', mesprit: 'levitate', azelf: 'levitate', cobalion: 'justified', terrakion: 'justified', virizion: 'justified',
  tornadus: 'prankster', thundurus: 'prankster', meloetta: 'serenegrace', genesect: 'pressure', zygarde: 'powerconstruct',
  diancie: 'clearbody', hoopa: 'pressure', volcanion: 'waterabsorb',
  nihilego: 'beastboost', buzzwole: 'beastboost', pheromosa: 'beastboost', xurkitree: 'beastboost', celesteela: 'beastboost',
  kartana: 'beastboost', guzzlord: 'beastboost', poipole: 'beastboost', naganadel: 'beastboost', stakataka: 'beastboost', blacephalon: 'beastboost',
  magearna: 'clearbody', marshadow: 'technician',
  zeraora: 'voltabsorb', melmetal: 'ironfist', glastrier: 'chillingneigh', spectrier: 'grimneigh',
  calyrexice: 'chillingneigh', calyrexshadow: 'grimneigh', fezandipiti: 'technician', ogerpon: 'defiant',
  wargreymon: 'toughclaws', metalgarurumon: 'clearbody',
  omegamon: 'royalknight',
};
for (const p of POKEMON) p.ability = POKEMON_ABILITY[p.key];

const POKEMON_BY_KEY = Object.fromEntries(POKEMON.map(p => [p.key, p]));
const TEAM_SIZE = 6;

// 메가진화 (배틀당 1번, R키). id는 PokeAPI 폼 번호
const GMAX_HINT = '배틀에서 G키로 거다이맥스. HP가 2배가 되고 30초 뒤에 원래 비율로 돌아온다. 팀당 1회. 메가와는 따로다';
function gmaxForm(id) {
  return { id, suffix: 'gmax', label: '거다이맥스', hud: '거대', tag: '거대', gmax: true, hint: GMAX_HINT };
}
const MEGA_DATA = {
  venusaur:   [{ id: 10033, types: ['grass', 'poison'],   base: [80, 100, 123, 122, 120, 80],  ability: 'thickfat' }, gmaxForm(10195)],
  charizard:  [{ id: 10034, suffix: 'X', types: ['fire', 'dragon'], base: [78, 130, 111, 130, 85, 100], ability: 'toughclaws' },
               { id: 10035, suffix: 'Y', types: ['fire', 'flying'], base: [78, 104, 78, 159, 115, 100], ability: 'drought' },
               gmaxForm(10196)],
  blastoise:  [{ id: 10036, types: ['water'],             base: [79, 103, 120, 135, 115, 78],  ability: 'megalauncher' }, gmaxForm(10197)],
  pikachu:    [gmaxForm(10199)],
  alakazam:   [{ id: 10037, types: ['psychic'],           base: [55, 50, 65, 175, 105, 150],   ability: 'trace' }],
  gengar:     [{ id: 10038, types: ['ghost', 'poison'],   base: [60, 65, 80, 170, 95, 130],    ability: 'shadowtag' }, gmaxForm(10202)],
  kangaskhan: [{ id: 10039, types: ['normal'],            base: [105, 125, 100, 60, 100, 100], ability: 'parentalbond' }],
  pinsir:     [{ id: 10040, types: ['bug', 'flying'],     base: [65, 155, 120, 65, 90, 105],   ability: 'aerilate' }],
  gyarados:   [{ id: 10041, types: ['water', 'dark'],     base: [95, 155, 109, 70, 130, 81],   ability: 'moldbreaker' }],
  aerodactyl: [{ id: 10042, types: ['rock', 'flying'],    base: [80, 135, 85, 70, 95, 150],    ability: 'toughclaws' }],
  mewtwo:     [{ id: 10043, suffix: 'X', types: ['psychic', 'fighting'], base: [106, 190, 100, 154, 100, 130], ability: 'steadfast' },
               { id: 10044, suffix: 'Y', types: ['psychic'], base: [106, 150, 70, 194, 120, 140], ability: 'insomnia' }],
  ampharos:   [{ id: 10045, types: ['electric', 'dragon'], base: [90, 95, 105, 165, 110, 45],  ability: 'moldbreaker' }],
  scizor:     [{ id: 10046, types: ['bug', 'steel'],      base: [70, 150, 140, 65, 100, 75],   ability: 'technician' }],
  heracross:  [{ id: 10047, types: ['bug', 'fighting'],   base: [80, 185, 115, 40, 105, 75],   ability: 'skilllink' }],
  houndoom:   [{ id: 10048, types: ['dark', 'fire'],      base: [75, 90, 90, 140, 90, 115],    ability: 'solarpower' }],
  tyranitar:  [{ id: 10049, types: ['rock', 'dark'],      base: [100, 164, 150, 95, 120, 71],  ability: 'sandstream' }],
  blaziken:   [{ id: 10050, types: ['fire', 'fighting'],  base: [80, 160, 80, 130, 80, 100],   ability: 'speedboost' }],
  gardevoir:  [{ id: 10051, types: ['psychic', 'fairy'],  base: [68, 85, 65, 165, 135, 100],   ability: 'pixilate' }],
  aggron:     [{ id: 10053, types: ['steel'],             base: [70, 140, 230, 60, 80, 50],    ability: 'filter' }],
  absol:      [{ id: 10057, types: ['dark'],              base: [65, 150, 60, 115, 60, 115],   ability: 'magicbounce' },
               { id: 10307, suffix: 'Z', types: ['dark', 'ghost'], base: [65, 154, 60, 75, 60, 151], ability: 'superluck' }],
  garchomp:   [{ id: 10058, types: ['dragon', 'ground'],  base: [108, 170, 115, 120, 95, 92],  ability: 'sandforce' },
               { id: 10309, suffix: 'Z', types: ['dragon'], base: [108, 130, 85, 141, 85, 151], ability: 'levitate' }],
  lucario:    [{ id: 10059, types: ['fighting', 'steel'], base: [70, 145, 88, 140, 70, 112],   ability: 'adaptability' },
               { id: 10310, suffix: 'Z', types: ['fighting', 'steel'], base: [70, 100, 70, 164, 70, 151], ability: 'auraguard' }],
  latias:     [{ id: 10062, types: ['dragon', 'psychic'], base: [80, 100, 120, 140, 150, 110], ability: 'levitate' }],
  latios:     [{ id: 10063, types: ['dragon', 'psychic'], base: [80, 130, 100, 160, 120, 110], ability: 'levitate' }],
  swampert:   [{ id: 10064, types: ['water', 'ground'],   base: [100, 150, 110, 95, 110, 70],  ability: 'swiftswim' }],
  sceptile:   [{ id: 10065, types: ['grass', 'dragon'],   base: [70, 110, 75, 145, 85, 145],   ability: 'lightningrod' }],
  altaria:    [{ id: 10067, types: ['dragon', 'fairy'],   base: [75, 110, 110, 110, 105, 80],  ability: 'pixilate' }],
  sharpedo:   [{ id: 10070, types: ['water', 'dark'],     base: [70, 140, 70, 110, 65, 105],   ability: 'strongjaw' }],
  slowbro:    [{ id: 10071, types: ['water', 'psychic'],  base: [95, 75, 180, 130, 80, 30],    ability: 'shellarmor' }],
  steelix:    [{ id: 10072, types: ['steel', 'ground'],   base: [75, 125, 230, 55, 95, 30],    ability: 'sandforce' }],
  pidgeot:    [{ id: 10073, types: ['normal', 'flying'],  base: [83, 80, 80, 135, 80, 121],    ability: 'noguard' }],
  metagross:  [{ id: 10076, types: ['steel', 'psychic'],  base: [80, 145, 150, 105, 110, 110], ability: 'toughclaws' }],
  rayquaza:   [{ id: 10079, types: ['dragon', 'flying'],  base: [105, 180, 100, 180, 100, 115], ability: 'deltastream' }],
  salamence:  [{ id: 10089, types: ['dragon', 'flying'],  base: [95, 145, 130, 120, 90, 120],  ability: 'aerilate' }],
  gallade:    [{ id: 10068, types: ['psychic', 'fighting'], base: [68, 165, 95, 65, 115, 110], ability: 'innerfocus' }],
  mawile:     [{ id: 10052, types: ['steel', 'fairy'],    base: [50, 105, 125, 55, 95, 50],  ability: 'hugepower' }],
  manectric:  [{ id: 10055, types: ['electric'],          base: [70, 75, 80, 135, 80, 135],  ability: 'intimidate' }],
  // 레전즈 Z-A. id는 PokeAPI 포켓몬 번호
  starmie:    [{ id: 10280, types: ['water', 'psychic'],   base: [60, 100, 105, 130, 105, 120], ability: 'hugepower' }],
  dragonite:  [{ id: 10281, types: ['dragon', 'flying'],  base: [91, 124, 115, 145, 125, 100], ability: 'multiscale' }],
  feraligatr: [{ id: 10283, types: ['water', 'dragon'],   base: [85, 160, 125, 89, 93, 78],    ability: 'dragonize' }],
  skarmory:   [{ id: 10284, types: ['steel', 'flying'],   base: [65, 140, 110, 40, 100, 110], ability: 'stalwart' }],
  froslass:   [{ id: 10285, types: ['ice', 'ghost'],      base: [70, 80, 70, 140, 100, 120],  ability: 'snowwarning' }],
  excadrill:  [{ id: 10287, types: ['ground', 'steel'],   base: [110, 165, 100, 65, 65, 103], ability: 'piercingdrill' }],
  chandelure: [{ id: 10291, types: ['ghost', 'fire'],     base: [60, 75, 110, 175, 110, 90],  ability: 'infiltrator' }],
  chesnaught: [{ id: 10292, types: ['grass', 'fighting'], base: [88, 137, 172, 74, 115, 44],  ability: 'bulletproof' }],
  delphox:    [{ id: 10293, types: ['fire', 'psychic'],    base: [75, 69, 72, 159, 125, 134],  ability: 'levitate' }],
  greninja:   [{ id: 10294, types: ['water', 'dark'],     base: [72, 125, 77, 133, 81, 142],  ability: 'protean' },
               { id: 10117, suffix: 'ash', label: '지우개굴닌자', hud: '지우', tag: '지우', name: '지우개굴닌자', types: ['water', 'dark'], base: [72, 145, 67, 153, 71, 132], ability: 'battlebond' }],
  omegamon:   [{ id: 90002, suffix: 'X', label: 'X진화', hud: 'X진화', tag: 'X', name: '오메가몬X', types: ['fire', 'ice'], base: [108, 155, 130, 155, 125, 112], ability: 'royalknight', gainMove: 'alldelete', battleOnly: true }],
  necrozmadusk: [{ id: 10157, name: '울트라네크로즈마', label: '울트라진화', hud: '울트라', tag: '울트라', types: ['psychic', 'dragon'], base: [97, 167, 97, 167, 97, 129], ability: 'neuroforce', battleOnly: true, hint: '배틀에서 R키로 울트라네크로즈마가 된다. 그 상태의 Z기술은 하늘을태우는멸망의빛. 팀당 1회' }],
  necrozmadawn: [{ id: 10157, name: '울트라네크로즈마', label: '울트라진화', hud: '울트라', tag: '울트라', types: ['psychic', 'dragon'], base: [97, 167, 97, 167, 97, 129], ability: 'neuroforce', battleOnly: true, hint: '배틀에서 R키로 울트라네크로즈마가 된다. 그 상태의 Z기술은 하늘을태우는멸망의빛. 팀당 1회' }],
  arceus:    [{ id: 493, name: '아르세우스(레전드플레이트)', label: '레전드플레이트', hud: '레전드', tag: '레전드', types: ['normal'], base: [120, 120, 120, 120, 120, 120], ability: 'legendplate', battleOnly: true, hint: '배틀에서 R키로 레전드플레이트를 장착한다. 기술을 쓰면 그 타입으로 변하고, 심판의뭉치는 상대 약점에 맞춘다. 팀당 1회' }],
  hawlucha:   [{ id: 10300, types: ['fighting', 'flying'], base: [78, 137, 100, 74, 93, 118], ability: 'noguard' }],
  staraptor:  [{ id: 10308, types: ['fighting', 'flying'], base: [85, 140, 100, 60, 90, 110], ability: 'contrary' }],
  abomasnow:  [{ id: 10060, types: ['grass', 'ice'],       base: [90, 132, 105, 132, 105, 30], ability: 'snowwarning' }],
  lopunny:    [{ id: 10088, types: ['normal', 'fighting'], base: [65, 136, 94, 54, 96, 135], ability: 'scrappy' }],
  machamp:    [gmaxForm(10201)],
  kingler:    [gmaxForm(10203)],
  lapras:     [gmaxForm(10204)],
  snorlax:    [gmaxForm(10206)],
  rillaboom:  [gmaxForm(10209)],
  cinderace:  [gmaxForm(10210)],
  inteleon:   [gmaxForm(10211)],
  corviknight:[gmaxForm(10212)],
  hatterene:  [gmaxForm(10221)],
  grimmsnarl: [gmaxForm(10222)],
  urshifu:    [gmaxForm(10226)],
  urshifurapid:[gmaxForm(10227)],
  eternatus:  [gmaxForm(10190)],
  glalie:     [{ id: 10074, types: ['ice'],              base: [80, 120, 80, 120, 80, 100],   ability: 'refrigerate' }],
  sableye:    [{ id: 10066, types: ['dark', 'ghost'],     base: [50, 85, 125, 85, 115, 20],    ability: 'magicbounce' }],
  camerupt:   [{ id: 10087, types: ['fire', 'ground'],    base: [70, 120, 100, 145, 105, 20],  ability: 'sheerforce' }],
  banette:    [{ id: 10056, types: ['ghost'],             base: [64, 165, 75, 93, 83, 75],     ability: 'prankster' }],
  diancie:    [{ id: 10075, types: ['rock', 'fairy'],     base: [50, 160, 110, 160, 110, 110], ability: 'magicbounce' }],
  meganium:   [{ id: 10282, types: ['grass', 'fairy'],    base: [80, 92, 115, 143, 115, 80],   ability: 'drought' }],
  emboar:     [{ id: 10286, types: ['fire', 'fighting'],  base: [110, 148, 75, 110, 110, 75],  ability: 'moldbreaker' }],
  scrafty:    [{ id: 10289, types: ['dark', 'fighting'],  base: [65, 130, 135, 55, 135, 68],   ability: 'intimidate' }],
  eelektross: [{ id: 10290, types: ['electric'],          base: [85, 145, 80, 135, 90, 80],    ability: 'levitate' }],
  clefable:   [{ id: 10278, types: ['fairy', 'flying'],   base: [95, 80, 93, 135, 110, 70],    ability: 'magicbounce' }],
  zygarde:    [{ id: 10301, types: ['dragon', 'ground'],  base: [216, 70, 91, 216, 85, 100],   ability: 'pressure' }],
  raichu:     [{ id: 10304, suffix: 'X', types: ['electric'], base: [60, 135, 95, 90, 95, 110], ability: 'electricsurge' },
               { id: 10305, suffix: 'Y', types: ['electric'], base: [60, 100, 55, 160, 80, 130], ability: 'noguard' }],
  golurk:     [{ id: 10313, types: ['ground', 'ghost'],   base: [89, 159, 105, 70, 105, 55],   ability: 'unseenfist' }],
  heatran:    [{ id: 10311, types: ['fire', 'steel'],     base: [91, 120, 106, 175, 141, 67],  ability: 'flashfire' }],
  darkrai:    [{ id: 10312, types: ['dark'],              base: [70, 120, 130, 165, 130, 85],  ability: 'baddreams' }],
  magearna:   [{ id: 10317, types: ['steel', 'fairy'],    base: [80, 125, 115, 170, 115, 95],  ability: 'clearbody' }],
  zeraora:    [{ id: 10319, types: ['electric'],          base: [88, 157, 75, 147, 80, 153],   ability: 'voltabsorb' }],
  baxcalibur: [{ id: 10325, types: ['dragon', 'ice'],     base: [115, 175, 117, 105, 101, 87], ability: 'thermalexchange' }],
  drednaw:    [gmaxForm(10214)],
  melmetal:   [gmaxForm(10208)],
  beedrill:   [{ id: 10090, types: ['bug', 'poison'],     base: [65, 150, 40, 15, 80, 145],    ability: 'adaptability' }],
  medicham:   [{ id: 10054, types: ['fighting', 'psychic'], base: [60, 100, 85, 80, 85, 100],  ability: 'hugepower' }],
  audino:     [{ id: 10069, types: ['normal', 'fairy'],   base: [103, 60, 126, 80, 126, 50],   ability: 'regenerator' }],
  victreebel: [{ id: 10279, types: ['grass', 'poison'],   base: [80, 125, 85, 135, 95, 70],    ability: 'roughskin' }],
  scolipede:  [{ id: 10288, types: ['bug', 'poison'],     base: [60, 140, 149, 75, 99, 62],    ability: 'shellarmor' }],
  pyroar:     [{ id: 10295, types: ['fire', 'normal'],    base: [86, 88, 92, 129, 86, 126],    ability: 'flashfire' }],
  floette:    [{ id: 10296, types: ['fairy'],             base: [74, 85, 87, 155, 148, 102],   ability: 'fairyaura' }],
  malamar:    [{ id: 10297, types: ['dark', 'psychic'],   base: [86, 102, 88, 98, 120, 88],    ability: 'contrary' }],
  barbaracle: [{ id: 10298, types: ['rock', 'fighting'],  base: [72, 140, 130, 64, 106, 88],   ability: 'toughclaws' }],
  dragalge:   [{ id: 10299, types: ['poison', 'dragon'],  base: [65, 85, 105, 132, 163, 44],   ability: 'regenerator' }],
  drampa:     [{ id: 10302, types: ['normal', 'dragon'],  base: [78, 85, 110, 160, 116, 36],   ability: 'berserk' }],
  falinks:    [{ id: 10303, types: ['fighting'],          base: [65, 135, 135, 70, 65, 100],   ability: 'defiant' }],
  chimecho:   [{ id: 10306, types: ['psychic', 'steel'],  base: [75, 50, 110, 135, 120, 65],   ability: 'levitate' }],
  meowstic:   [{ id: 10314, types: ['psychic'],           base: [74, 48, 76, 143, 101, 124],   ability: 'trace' }],
  crabominable: [{ id: 10315, types: ['fighting', 'ice'], base: [97, 157, 122, 62, 107, 33],  ability: 'ironfist' }],
  golisopod:  [{ id: 10316, types: ['bug', 'steel'],      base: [75, 150, 175, 70, 120, 40],   ability: 'toughclaws' }],
  scovillain: [{ id: 10320, types: ['grass', 'fire'],     base: [65, 138, 85, 138, 85, 75],    ability: 'flashfire' }],
  glimmora:   [{ id: 10321, types: ['rock', 'poison'],    base: [83, 90, 105, 150, 96, 101],   ability: 'adaptability' }],
  tatsugiri:  [{ id: 10322, types: ['dragon', 'water'],   base: [68, 65, 90, 135, 125, 92],    ability: 'regenerator' }],
  butterfree: [gmaxForm(10198)],
  meowth:     [gmaxForm(10200)],
  eevee:      [gmaxForm(10205)],
  garbodor:   [gmaxForm(10207)],
  orbeetle:   [gmaxForm(10213)],
  coalossal:  [gmaxForm(10215)],
  flapple:    [gmaxForm(10216)],
  appletun:   [gmaxForm(10217)],
  sandaconda: [gmaxForm(10218)],
  toxtricity: [gmaxForm(10219)],
  toxtricitylow: [gmaxForm(10228)],
  centiskorch:[gmaxForm(10220)],
  alcremie:   [gmaxForm(10223)],
  copperajah: [gmaxForm(10224)],
  duraludon:  [gmaxForm(10225)],
};
for (const [key, list] of Object.entries(MEGA_DATA)) {
  const sp = POKEMON_BY_KEY[key];
  sp.megas = list.map(f => ({
    ...sp, ...f, megas: null, mega: true,
    key: `${key}-mega${f.suffix ? '-' + f.suffix.toLowerCase() : ''}`,
    name: f.name || (f.gmax ? `거다이맥스${sp.name}` : `메가${sp.name}${f.suffix || ''}`),
    label: f.label || (f.suffix ? '메가 ' + f.suffix : '메가진화'),
    hud: f.hud || '메가',
  }));
}
POKEMON_BY_KEY.zygarde.completeForm = {
  id: 10120, name: '지가르데(퍼펙트폼)', types: ['dragon', 'ground'],
  base: [216, 100, 121, 91, 95, 85], ability: 'powerconstruct',
};

// 자시안·자마젠타는 등장하면 자동으로 검왕·방패왕 폼이 된다
const CROWN_DATA = {
  zacian:    { id: 10188, name: '자시안(검왕)',   types: ['fairy', 'steel'],    base: [92, 150, 115, 80, 115, 148], item: '녹슨 검' },
  zamazenta: { id: 10189, name: '자마젠타(방패왕)', types: ['fighting', 'steel'], base: [92, 120, 140, 80, 140, 128], item: '녹슨 방패' },
};
for (const [key, f] of Object.entries(CROWN_DATA)) {
  const sp = POKEMON_BY_KEY[key];
  sp.crown = { ...sp, ...f, crowned: true, key: key + '-crowned', crown: null };
}

const PRIMAL_DATA = {
  kyogre:  { id: 10077, name: '원시가이오가', types: ['water'],           base: [100, 150, 90, 180, 160, 90], ability: 'primordialsea' },
  groudon: { id: 10078, name: '원시그란돈',   types: ['ground', 'fire'],  base: [100, 180, 160, 150, 90, 90], ability: 'desolateland' },
};
for (const [key, f] of Object.entries(PRIMAL_DATA)) {
  const sp = POKEMON_BY_KEY[key];
  sp.primal = { ...sp, ...f, primaled: true, key: key + '-primal', primal: null, crown: null, megas: null };
}

/* ---------------- 랜덤 기술 뽑기 ---------------- */
const UNIVERSAL_MOVES = { phy: ['gigaimpact', 'facade'], spe: ['hyperbeam'], sta: ['protect', 'metronome'] };
const poolCache = {};

// 배울 수 있는 기술: 기본 기술 + extra + 자기 타입(메가 폼 타입 포함)의 일반 기술 + 범용기
function movePool(sp) {
  if (poolCache[sp.key]) return poolCache[sp.key];
  const set = new Set(sp.moves);
  if (!sp.fixedPool) {
    for (const id of sp.extra || []) if (MOVES[id]) set.add(id);
    const [, a, , sa] = sp.base;
    const cats = a >= sa * 1.2 ? ['phy'] : sa >= a * 1.2 ? ['spe'] : ['phy', 'spe'];
    const types = new Set(sp.types);
    for (const f of sp.megas || []) f.types.forEach(t => types.add(t));
    if (sp.crown) sp.crown.types.forEach(t => types.add(t));
    if (sp.primal) sp.primal.types.forEach(t => types.add(t));
    for (const [id, mv] of Object.entries(MOVES)) {
      if (mv.sig || mv.z || id === 'struggle') continue;
      if (types.has(mv.type) && cats.includes(mv.cat)) set.add(id);
    }
    for (const c of cats) for (const id of UNIVERSAL_MOVES[c]) set.add(id);
    for (const id of UNIVERSAL_MOVES.sta) set.add(id);
  }
  return (poolCache[sp.key] = [...set]);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 무작위 4개. 자속 기술을 최소 1개(가능하면 2개) 넣는다
function randomMoves(sp) {
  const pool = shuffle(movePool(sp).slice());
  const out = pool.filter(id => sp.types.includes(MOVES[id].type)).slice(0, 2);
  for (const id of pool) {
    if (out.length >= 4) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// 한 칸만 다시 뽑기 (이미 가진 기술은 제외)
function rerollMove(sp, moves, i) {
  const cands = movePool(sp).filter(id => !moves.includes(id));
  if (!cands.length) return moves.slice();
  const out = moves.slice();
  out[i] = cands[Math.floor(Math.random() * cands.length)];
  return out;
}

function megaForms(sp) { return (sp && sp.megas || []).filter(f => !f.gmax); }
function gmaxFormOf(sp) { return (sp && sp.megas || []).find(f => f.gmax) || null; }

// CPU가 조종할 때 이 포켓몬이 쓸 수 있는 행동. 비어 있으면 가진 것을 모두 쓴다.
const BURST_LIMITS = [['', '제한 없음'], ['mega', '메가만'], ['gmax', '거대만'], ['z', 'Z만'], ['tera', '테라만']];
function burstLimit(v) { return BURST_LIMITS.some(([id]) => id === v) ? v : ''; }

// 팀 항목: 'pikachu' 같은 문자열 또는 { key, moves, mega, limit }
function entryKey(e) { return typeof e === 'string' ? e : e.key; }
function normalizeEntry(e) {
  const key = entryKey(e);
  const sp = POKEMON_BY_KEY[key];
  if (!sp) return null;
  const pool = movePool(sp);
  let moves = e && Array.isArray(e.moves) ? e.moves.filter(id => pool.includes(id)) : [];
  moves = [...new Set(moves)].slice(0, 4);
  if (moves.length < 4) moves = moves.concat(sp.moves.filter(id => !moves.includes(id))).slice(0, 4);
  const forms = megaForms(sp);
  const mega = forms.length ? Math.min(forms.length - 1, Math.max(0, (e && e.mega) | 0)) : 0;
  const tera = e && TYPES[e.tera] && e.tera !== 'none' ? e.tera : sp.types[0];
  return { key, moves, mega, limit: burstLimit(e && e.limit), tera };
}

/* ---------------- 스프라이트 ---------------- */
// 로컬에 있는 파일만 먼저 연다. 없는 번호까지 로컬을 치면 404를 기다린 뒤에야 원격 그림이 시작한다.
const SPRITE_REMOTE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const LOCAL_GIF = {
  front: new Set([6, 9, 25, 59, 135, 143, 212, 248, 254, 260, 282, 376, 384, 461, 468, 778]),
  back: new Set([6, 25, 59, 135, 143, 248, 254, 260, 282, 376, 384, 461, 468, 778]),
};
const spriteReady = new Map();

const LOCAL_PNG = new Set([10301]);
function spriteSources(id, back) {
  const dir = back ? 'back' : 'front';
  if (id >= 90000 || LOCAL_PNG.has(id)) return [`assets/sprites/${dir}/${id}.png?v=digi2`];
  const show = `${SPRITE_REMOTE}/other/showdown/${back ? 'back/' : ''}${id}.gif`;
  const srcs = [];
  if (LOCAL_GIF[dir].has(id)) srcs.push(`assets/sprites/${dir}/${id}.gif`);
  srcs.push(show);
  srcs.push(`${SPRITE_REMOTE}/${back ? 'back/' : ''}${id}.png`);
  return srcs;
}

// 이미지 소스를 순서대로 시도한다. 한 번 성공한 주소는 다음에 바로 쓴다.
function setSprite(img, id, back) {
  if (id >= 90000 || LOCAL_PNG.has(id)) img.classList.add('smooth', 'model');
  else img.classList.remove('smooth', 'model');
  img.decoding = 'async';
  const key = (back ? 'b' : 'f') + id;
  img.dataset.spriteKey = key;
  const known = spriteReady.get(key);
  const prevLoad = img.onload && !img.onload._sprite ? img.onload : null;
  const onload = function () {
    if (this.dataset.spriteKey === key) spriteReady.set(key, this.currentSrc || this.src);
    if (prevLoad) prevLoad.call(this);
  };
  onload._sprite = true;
  img.onload = onload;
  if (known) { img.src = known; return; }
  const srcs = spriteSources(id, back);
  let i = 0;
  img.onerror = () => { if (img.dataset.spriteKey === key && ++i < srcs.length) img.src = srcs[i]; };
  img.src = srcs[0];
}

// 다운로드 스크립트용: 모든 폼의 스프라이트 번호
function allSpriteIds() {
  const ids = [];
  for (const p of POKEMON) {
    if (p.id < 90000) ids.push(p.id);
    for (const f of p.megas || []) ids.push(f.id);
    if (p.crown) ids.push(p.crown.id);
    if (p.primal) ids.push(p.primal.id);
  }
  return ids;
}

// 플레이 영역: x 40~1240, y 92~628
const ARENA_BOUNDS = { x: 40, y: 92, w: 1200, h: 536 };

const ARENAS = {
  frost: {
    name: 'FROSTPEAK SUMMIT', ko: '프로스트피크 정상',
    floor: ['#cfe6f5', '#c3ddef'], line: 'rgba(255,255,255,.6)', accent: '#e8b64c',
    friction: 3.2, deco: 'frost', desc: '미끄러운 빙판. 관성이 크다.',
    rects: [{ x: 250, y: 300, w: 120, h: 90, kind: 'ice' }, { x: 910, y: 330, w: 120, h: 90, kind: 'ice' }],
    circles: [{ x: 640, y: 180, r: 26, kind: 'crystal' }, { x: 640, y: 560, r: 26, kind: 'crystal' }],
    hazards: [],
  },
  grove: {
    name: 'VERDANT GROVE', ko: '초록빛 숲',
    floor: ['#7fbf5a', '#76b553'], line: 'rgba(255,255,255,.18)', accent: '#f4e27a',
    friction: 12, deco: 'grove', desc: '나무 사이로 숨어 싸우는 숲.',
    rects: [],
    circles: [{ x: 360, y: 210, r: 34, kind: 'tree' }, { x: 920, y: 520, r: 34, kind: 'tree' },
              { x: 640, y: 360, r: 30, kind: 'tree' }, { x: 380, y: 520, r: 22, kind: 'bush' }, { x: 900, y: 200, r: 22, kind: 'bush' }],
    hazards: [],
  },
  crater: {
    name: 'MAGMA CRATER', ko: '마그마 분화구',
    floor: ['#5a4038', '#523a33'], line: 'rgba(255,140,60,.18)', accent: '#ff7a2a',
    friction: 12, deco: 'crater', desc: '용암 웅덩이에 들어가면 화상 피해.',
    rects: [{ x: 600, y: 120, w: 80, h: 60, kind: 'rock' }, { x: 600, y: 540, w: 80, h: 60, kind: 'rock' }],
    circles: [{ x: 420, y: 250, r: 26, kind: 'rock' }, { x: 860, y: 470, r: 26, kind: 'rock' }],
    hazards: [{ x: 640, y: 360, r: 70 }, { x: 330, y: 500, r: 46 }, { x: 950, y: 230, r: 46 }],
  },
  stadium: {
    name: 'NEON STADIUM', ko: '네온 스타디움',
    floor: ['#2a2350', '#262048'], line: 'rgba(120,220,255,.35)', accent: '#ff4fd8',
    friction: 12, deco: 'stadium', desc: '네온 기둥이 선 정규 경기장.',
    rects: [],
    circles: [{ x: 440, y: 230, r: 24, kind: 'pillar' }, { x: 840, y: 230, r: 24, kind: 'pillar' },
              { x: 440, y: 490, r: 24, kind: 'pillar' }, { x: 840, y: 490, r: 24, kind: 'pillar' }],
    hazards: [],
  },
};

const TRAINERS = [
  { name: '반바지 꼬마 민준', title: '견습 트레이너',  arena: 'grove',   level: 44, diff: 0.25, team: ['jolteon', 'pachirisu', 'raichu', 'pidgeot', 'leafeon', 'venusaur'] },
  { name: '얼음 관장 설화',   title: '프로스트 체육관', arena: 'frost',   level: 48, diff: 0.45, team: ['weavile', 'starmie', 'empoleon', 'kingdra', 'lapras', 'articuno'] },
  { name: '불꽃 관장 화랑',   title: '마그마 체육관',  arena: 'crater',  level: 50, diff: 0.6,  team: ['ninetales', 'infernape', 'volcarona', 'houndoom', 'charizard', 'groudon'] },
  { name: '사천왕 유령',      title: '사천왕',        arena: 'stadium', level: 52, diff: 0.72, team: ['shedinja', 'mimikyu', 'chandelure', 'dragapult', 'gengar', 'giratina'] },
  { name: '사천왕 용진',      title: '사천왕',        arena: 'crater',  level: 54, diff: 0.82, team: ['haxorus', 'hydreigon', 'garchomp', 'latios', 'salamence', 'rayquaza'] },
  { name: '챔피언 아우라',    title: '챔피언',        arena: 'stadium', level: 56, diff: 0.95, team: ['ditto', 'lucario', 'zamazenta', 'zacian', 'arceus', 'mewtwo'] },
];
