'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const Input = { down: new Set(), pressed: new Set() };
let game = null;

const UI = {
  team: loadTeam(),
  progress: parseInt(localStorage.getItem('pa_progress') || '0', 10),
  arena: 'frost',
  diff: 0.55,
  cpuTeam: loadCpuTeam(),
  editTarget: 'player',
  last: null, // 마지막 배틀 설정 (다시하기용)
  typeFilter: null,
  search: '',
  hudSig: {},
  bossEntry: null,
};

function loadTeam() {
  let team = ['pikachu', 'charizard', 'greninja', 'shedinja', 'lucario', 'rayquaza'].map(k => normalizeEntry(k));
  try {
    const t = JSON.parse(localStorage.getItem('pa_team'));
    if (Array.isArray(t) && t.length) {
      const parsed = t.map(normalizeEntry).filter(Boolean).slice(0, TEAM_SIZE);
      if (parsed.length) team = parsed;
    }
  } catch (e) { /* 기본 팀 사용 */ }
  return team;
}
function saveTeam() { localStorage.setItem('pa_team', JSON.stringify(UI.team)); }
function loadCpuTeam() {
  try {
    const t = JSON.parse(localStorage.getItem('pa_cpu_team'));
    if (Array.isArray(t) && t.length) {
      const parsed = t.map(normalizeEntry).filter(Boolean).slice(0, TEAM_SIZE);
      if (parsed.length >= 1) return parsed;
    }
  } catch (e) { /* 무작위 상대 */ }
  return randomTeam();
}
function saveCpuTeam() { localStorage.setItem('pa_cpu_team', JSON.stringify(UI.cpuTeam)); }
function roster() { return UI.editTarget === 'cpu' ? UI.cpuTeam : UI.team; }
function setRoster(team) { if (UI.editTarget === 'cpu') UI.cpuTeam = team; else UI.team = team; }
function openTeam(target, returnTo) {
  UI.editTarget = target === 'cpu' ? 'cpu' : 'player';
  UI.returnTo = returnTo || null;
  show('team');
}
function teamIndex(key) { return roster().findIndex(e => entryKey(e) === key); }
function teamNeedsFull() { return UI.returnTo === 'ffa' || UI.returnTo === 'challenge'; }

function randomTeam(exclude = []) {
  const ex = exclude.map(entryKey);
  const pool = POKEMON.filter(p => !p.egg && !ex.includes(p.key)).map(p => p.key);
  const out = [];
  while (out.length < TEAM_SIZE) {
    const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    out.push(normalizeEntry({ key: k, moves: randomMoves(POKEMON_BY_KEY[k]) }));
  }
  return out;
}

function typeBadge(t) {
  return `<span class="tbadge" style="background:${TYPES[t].color}">${TYPES[t].ko}</span>`;
}
function shownForm(sp, entry) {
  if (entry && typeof entry !== 'string' && sp.megas && sp.megas[entry.mega | 0]) return sp.megas[entry.mega | 0];
  return sp.primal || sp.crown || sp;
}
function eggNameQuery(q) {
  const s = q.toLowerCase().replace(/\s+/g, '');
  return s.includes('omega') || q.includes('오메가');
}
function matchesDex(sp) {
  const view = shownForm(sp);
  const q = UI.search.trim();
  if (sp.egg) return eggNameQuery(q);
  if (UI.typeFilter && !view.types.includes(UI.typeFilter)) return false;
  if (!q) return true;
  return sp.name.includes(q) || view.name.includes(q) || sp.key.includes(q.toLowerCase());
}
function spriteImg(id, cls = '') {
  const img = document.createElement('img');
  if (cls) img.className = cls;
  img.alt = '';
  img.draggable = false;
  setSprite(img, id, false);
  return img;
}

/* ---------------- 화면 전환 ---------------- */
function show(name) {
  $$('.screen').forEach(el => el.classList.add('hidden'));
  if (name) $('#screen-' + name).classList.remove('hidden');
  if (name === 'menu') buildMenu();
  if (name === 'team') buildTeam();
  if (name === 'pre') buildPre();
  if (name === 'ffa') buildFfa();
  if (name === 'boss') buildBoss();
  if (name === 'challenge') buildChallenge();
}

function backToMenu() {
  if (game) { game.destroy(); game = null; }
  $('#hud').classList.add('hidden');
  $('#ffaBoard').classList.add('hidden');
  $('#bossBar').classList.add('hidden');
  document.body.classList.remove('mode-ffa');
  $('#overlay-pause').classList.add('hidden');
  $('#overlay-result').classList.add('hidden');
  drawArena($('#bg').getContext('2d'), ARENAS[UI.arena]);
  show('menu');
}

document.addEventListener('click', e => {
  Sound.init();
  const go = e.target.closest('[data-go]');
  if (go) {
    Sound.play('select');
    if (go.dataset.go === 'team') openTeam('player');
    else show(go.dataset.go);
  }
});

/* ---------------- 메인 메뉴 ---------------- */
function buildMenu() {
  const box = $('#menuMons');
  box.innerHTML = '';
  for (const k of randomTeam()) box.appendChild(spriteImg(POKEMON_BY_KEY[entryKey(k)].id));
  $('#btnMute').textContent = Sound.muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐';
}
$('#btnMute').onclick = () => { Sound.toggle(); buildMenu(); };

/* ---------------- 팀 편성 ---------------- */
let detailKey = null;

function buildTeam() {
  const chips = $('#typeChips');
  chips.innerHTML = '';
  for (const t of Object.keys(TYPES)) {
    if (t === 'none') continue;
    const c = document.createElement('span');
    c.className = 'chip' + (UI.typeFilter === t ? ' on' : '');
    c.style.background = TYPES[t].color;
    c.textContent = TYPES[t].ko;
    c.onclick = () => { UI.typeFilter = UI.typeFilter === t ? null : t; buildTeam(); };
    chips.appendChild(c);
  }
  $('#dexSearch').value = UI.search;
  $('#teamTitle').textContent = UI.editTarget === 'cpu' ? '상대 팀 편성' : '팀 편성';
  $('#teamHint').textContent = teamNeedsFull()
    ? '6마리를 고르세요. 상세 창에서 기술을 랜덤으로 뽑고, 메가진화 폼을 고를 수 있습니다.'
    : (UI.returnTo === 'boss'
      ? '보스전은 1~6마리면 됩니다. 전설 한 마리가 체력을 크게 늘린 채 나옵니다.'
      : (UI.editTarget === 'cpu'
      ? '빠른 배틀 상대는 1~6마리면 됩니다. 기술과 메가진화 폼도 여기서 정합니다.'
      : '빠른 배틀은 1~6마리면 됩니다. 대난투와 챌린지는 6마리가 필요합니다.'));
  renderSlots();
  renderGrid();
  const keep = detailKey && POKEMON_BY_KEY[detailKey] && matchesDex(POKEMON_BY_KEY[detailKey]);
  const first = POKEMON.find(matchesDex);
  renderDetail(keep ? detailKey : (first && first.key) || (roster()[0] && entryKey(roster()[0])) || POKEMON[0].key);
}

function renderSlots() {
  const box = $('#teamSlots');
  box.innerHTML = '';
  for (let i = 0; i < TEAM_SIZE; i++) {
    const e = roster()[i];
    const el = document.createElement('div');
    el.className = 'slot' + (e ? ' filled' : '');
    if (e) {
      const sp = POKEMON_BY_KEY[e.key];
      const view = shownForm(sp, e);
      el.innerHTML = `<span class="num">${i + 1}</span><span class="x">✕</span>` +
        (sp.megas ? '<span class="mega-tag">Mega</span>' : '') +
        (sp.primal ? '<span class="primal-tag">원시</span>' : '');
      el.appendChild(spriteImg(view.id));
      const nm = document.createElement('div');
      nm.textContent = view.name;
      el.appendChild(nm);
      el.onclick = () => { roster().splice(i, 1); Sound.play('back'); renderSlots(); renderGrid(); renderDetail(sp.key); };
      el.onmouseenter = () => renderDetail(sp.key);
    } else {
      el.innerHTML = `<span class="num">${i + 1}</span>비어 있음`;
    }
    box.appendChild(el);
  }
  $('#btnTeamDone').disabled = roster().length < (teamNeedsFull() ? TEAM_SIZE : 1);
}

function renderGrid() {
  const grid = $('#dexGrid');
  grid.innerHTML = '';
  for (const sp of POKEMON) {
    if (!matchesDex(sp)) continue;
    const idx = teamIndex(sp.key);
    const view = shownForm(sp);
    const el = document.createElement('div');
    el.className = 'dex' + (idx >= 0 ? ' picked' : '');
    const pic = document.createElement('div');
    pic.className = 'pic';
    pic.appendChild(spriteImg(view.id));
    el.appendChild(pic);
    el.insertAdjacentHTML('beforeend', `<div class="nm">${view.name}</div><div>${view.types.map(typeBadge).join('')}</div>` +
      (idx >= 0 ? `<div class="order">${idx + 1}</div>` : '') +
      (sp.legend ? '<div class="legend">전설</div>' : '') +
      (sp.egg ? '<div class="egg">비밀</div>' : '') +
      (sp.megas ? '<div class="mega">Mega</div>' : '') +
      (sp.primal ? '<div class="primal">원시</div>' : '') +
      (sp.fixedLevel ? `<div class="lv100">Lv.${sp.fixedLevel}</div>` : ''));
    if (sp.legend) el.classList.add('is-legend');
    el.onmouseenter = () => renderDetail(sp.key);
    el.onclick = () => {
      const i = teamIndex(sp.key);
      if (i >= 0) roster().splice(i, 1);
      else if (roster().length < TEAM_SIZE) roster().push(normalizeEntry(sp.key));
      else return;
      Sound.play('select');
      renderSlots();
      renderGrid();
      renderDetail(sp.key);
    };
    grid.appendChild(el);
  }
}

function renderDetail(key) {
  if (key && typeof key !== 'string') key = entryKey(key);
  detailKey = key;
  const sp = POKEMON_BY_KEY[key];
  if (!sp) return;
  const ti = teamIndex(key);
  const entry = ti >= 0 ? roster()[ti] : normalizeEntry(key);
  const form = ti >= 0 && sp.megas ? sp.megas[entry.mega] : null;
  const view = form || sp.primal || sp.crown || sp;
  const lv = sp.fixedLevel || 50;
  const st = calcStats(view, lv);
  const labels = ['HP', '공격', '방어', '특공', '특방', '스피드'];
  const vals = [st.hp, st.atk, st.def, st.spa, st.spd, st.spe];
  const ab = ABILITIES[view.ability];
  const moveIds = entry.moves;
  const box = $('#dexDetail');
  const megaBtns = (sp.megas || []).map((f, i) =>
    `<button class="small mega-btn${entry.mega === i ? ' on' : ''}" data-mega="${i}">${f.suffix ? '메가 ' + f.suffix : '메가진화'}</button>`
  ).join('');
  box.innerHTML = `
    <div class="dd-head">
      <div class="pic"></div>
      <div>
        <div class="dd-no">No.${String(sp.id).padStart(4, '0')} · Lv.${lv}${sp.megas ? ' · 메가진화 가능' : ''}${sp.primal ? ' · 원시회귀' : ''}</div>
        <div class="dd-name">${view.name}${sp.legend ? ' <span class="legend-tag">전설</span>' : ''}${sp.megas ? ' <span class="mega-tag">Mega</span>' : ''}${sp.primal ? ' <span class="primal-tag">원시</span>' : ''}</div>
        <div>${view.types.map(typeBadge).join('')}</div>
      </div>
    </div>
    <div class="dd-ability"><b>특성 · ${ab.name}</b>${ab.desc}</div>
    ${megaBtns ? `<div class="mega-row">${megaBtns}<span class="hint" style="margin:0">배틀에서 R키. 팀당 1회</span></div>` : ''}
    <div class="stats">${labels.map((l, i) => {
      const pct = Math.min(100, view.base[i] / 180 * 100);
      const col = view.base[i] >= 110 ? '#4ade80' : view.base[i] >= 80 ? '#facc15' : '#fb923c';
      return `<span>${l}</span><b>${vals[i]}</b><div class="bar"><i style="width:${Math.max(pct, 1)}%;background:${col}"></i></div>`;
    }).join('')}</div>
    <div class="dd-moves-head"><span>기술 4개</span>${ti >= 0 ? '<button class="small" id="btnAllMoves">기술 랜덤</button>' : ''}</div>
    <div class="dd-moves">${moveIds.map((id, i) => {
      const mv = MOVES[id];
      return `<div class="dd-move" style="--tc:${TYPES[mv.type].color}" data-slot="${i}"><b>${mv.name}${ti >= 0 ? ' <span class="reroll">↻</span>' : ''}</b>` +
        `<span>${TYPES[mv.type].ko} · ${KIND_KO[mv.kind]} · 위력 ${mv.power} · PP ${mv.pp}</span></div>`;
    }).join('')}</div>`;
  box.querySelector('.pic').appendChild(spriteImg(view.id));
  if (ti >= 0) {
    box.querySelectorAll('.mega-btn').forEach(b => {
      b.onclick = () => { roster()[ti].mega = +b.dataset.mega; Sound.play('select'); renderSlots(); renderDetail(key); };
    });
    const all = box.querySelector('#btnAllMoves');
    if (all) all.onclick = () => { roster()[ti].moves = randomMoves(sp); Sound.play('select'); renderDetail(key); };
    box.querySelectorAll('.dd-move').forEach(el => {
      el.onclick = () => {
        roster()[ti].moves = rerollMove(sp, roster()[ti].moves, +el.dataset.slot);
        Sound.play('select');
        renderDetail(key);
      };
    });
  }
}

$('#dexSearch').addEventListener('input', e => {
  UI.search = e.target.value;
  renderGrid();
  if (!(detailKey && POKEMON_BY_KEY[detailKey] && matchesDex(POKEMON_BY_KEY[detailKey]))) {
    const first = POKEMON.find(matchesDex);
    if (first) renderDetail(first.key);
  }
});
$('#btnRandomTeam').onclick = () => { setRoster(randomTeam()); Sound.play('select'); renderSlots(); renderGrid(); };
$('#btnClearTeam').onclick = () => { setRoster([]); Sound.play('back'); renderSlots(); renderGrid(); };
$('#btnTeamDone').onclick = () => {
  if (roster().length < (teamNeedsFull() ? TEAM_SIZE : 1)) return;
  if (UI.editTarget === 'cpu') saveCpuTeam();
  else saveTeam();
  Sound.play('select');
  const back = UI.returnTo || 'menu';
  UI.editTarget = 'player';
  UI.returnTo = null;
  show(back);
};

/* ---------------- 빠른 배틀 ---------------- */
const DIFFS = [[0.3, '쉬움', '느긋한 상대'], [0.6, '보통', '적당히 피하고 노린다'], [0.92, '어려움', '회피와 예측 사격의 달인']];

function teamPreview(box, keys) {
  box.innerHTML = '';
  for (const k of keys) {
    const sp = POKEMON_BY_KEY[entryKey(k)];
    const view = shownForm(sp, k);
    const el = document.createElement('div');
    el.className = 'tp';
    const pic = document.createElement('div');
    pic.className = 'pic';
    pic.appendChild(spriteImg(view.id));
    el.appendChild(pic);
    el.insertAdjacentHTML('beforeend', `<div class="nm">${view.name}</div><div>${view.types.map(typeBadge).join('')}</div>`);
    box.appendChild(el);
  }
}

function buildPre() {
  const cards = $('#arenaCards');
  cards.innerHTML = '';
  for (const [key, A] of Object.entries(ARENAS)) {
    const el = document.createElement('div');
    el.className = 'arena-card' + (UI.arena === key ? ' on' : '');
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    drawArena(cv.getContext('2d'), A);
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<div class="info"><b>${A.ko}</b><small>${A.desc}</small></div>`);
    el.onclick = () => { UI.arena = key; Sound.play('select'); drawArena($('#bg').getContext('2d'), A); buildPre(); };
    cards.appendChild(el);
  }
  const db = $('#diffBtns');
  db.innerHTML = '';
  for (const [v, label, desc] of DIFFS) {
    const b = document.createElement('button');
    b.className = Math.abs(UI.diff - v) < 0.05 ? 'on' : '';
    b.innerHTML = `${label} <small style="opacity:.7;font-weight:400">· ${desc}</small>`;
    b.onclick = () => { UI.diff = v; Sound.play('select'); buildPre(); };
    db.appendChild(b);
  }
  teamPreview($('#myPreview'), UI.team);
  teamPreview($('#cpuPreview'), UI.cpuTeam);
}

$('#btnReroll').onclick = () => { UI.cpuTeam = randomTeam(); saveCpuTeam(); Sound.play('select'); buildPre(); };
$('#btnEditTeam').onclick = () => openTeam('player', 'pre');
$('#btnEditCpu').onclick = () => openTeam('cpu', 'pre');
$('#btnStart').onclick = () => {
  if (!UI.team.length) { openTeam('player', 'pre'); return; }
  if (!UI.cpuTeam.length) { openTeam('cpu', 'pre'); return; }
  startBattle({ mode: 'quick', arena: UI.arena, diff: UI.diff, playerTeam: UI.team.slice(), cpuTeam: UI.cpuTeam.slice(), cpuLevel: 50, cpuName: 'CPU TRAINER' });
};
$('#btnWatch').onclick = () => startWatch();

function fillArenaCards(box, rebuild) {
  box.innerHTML = '';
  for (const [key, A] of Object.entries(ARENAS)) {
    const el = document.createElement('div');
    el.className = 'arena-card' + (UI.arena === key ? ' on' : '');
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    drawArena(cv.getContext('2d'), A);
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<div class="info"><b>${A.ko}</b><small>${A.desc}</small></div>`);
    el.onclick = () => { UI.arena = key; Sound.play('select'); drawArena($('#bg').getContext('2d'), A); rebuild(); };
    box.appendChild(el);
  }
}
function fillDiffBtns(box, rebuild) {
  box.innerHTML = '';
  for (const [v, label, desc] of DIFFS) {
    const b = document.createElement('button');
    b.className = Math.abs(UI.diff - v) < 0.05 ? 'on' : '';
    b.innerHTML = `${label} <small style="opacity:.7;font-weight:400">· ${desc}</small>`;
    b.onclick = () => { UI.diff = v; Sound.play('select'); rebuild(); };
    box.appendChild(b);
  }
}

function buildFfa() {
  fillArenaCards($('#ffaArenaCards'), buildFfa);
  fillDiffBtns($('#ffaDiffBtns'), buildFfa);
  teamPreview($('#ffaPreview'), UI.team);
}
$('#btnEditFfaTeam').onclick = () => openTeam('player', 'ffa');
$('#btnFfaStart').onclick = () => {
  if (UI.team.length !== TEAM_SIZE) { openTeam('player', 'ffa'); return; }
  startBattle({ mode: 'ffa', ffa: true, arena: UI.arena, diff: UI.diff, playerTeam: UI.team.slice(), cpuTeam: [], cpuName: '대난투' });
};
$('#btnFfaWatch').onclick = () => {
  const playerTeam = UI.team.length === TEAM_SIZE ? UI.team.slice() : randomTeam();
  startBattle({ mode: 'ffa', ffa: true, watch: true, arena: UI.arena, diff: UI.diff, playerTeam, cpuTeam: [], cpuName: '대난투' });
};

function legendChoices() { return POKEMON.filter(p => p.legend && !p.egg); }
function rollBoss(except) {
  const pool = legendChoices().filter(p => p.key !== except);
  const sp = pool[Math.floor(Math.random() * pool.length)];
  return normalizeEntry(sp.key);
}
function buildBoss() {
  if (!UI.bossEntry) UI.bossEntry = rollBoss();
  fillArenaCards($('#bossArenaCards'), buildBoss);
  fillDiffBtns($('#bossDiffBtns'), buildBoss);
  teamPreview($('#bossMyPreview'), UI.team);
  teamPreview($('#bossPreview'), [UI.bossEntry]);
}
$('#btnEditBossTeam').onclick = () => openTeam('player', 'boss');
$('#btnRerollBoss').onclick = () => {
  UI.bossEntry = rollBoss(entryKey(UI.bossEntry));
  Sound.play('select');
  buildBoss();
};
$('#btnBossStart').onclick = () => {
  if (!UI.team.length) { openTeam('player', 'boss'); return; }
  startBattle({
    mode: 'boss', boss: true, hpMult: 10,
    arena: UI.arena, diff: UI.diff,
    playerTeam: UI.team.slice(), cpuTeam: [UI.bossEntry],
    cpuLevel: 60, cpuName: 'BOSS',
  });
};

function startWatch() {
  const playerTeam = UI.team.length ? UI.team.slice() : randomTeam();
  startBattle({ mode: 'quick', watch: true, arena: UI.arena, diff: UI.diff, playerTeam, cpuTeam: UI.cpuTeam.slice(), cpuLevel: 50, cpuName: 'CPU TRAINER' });
}

/* ---------------- 챌린지 ---------------- */
function buildChallenge() {
  const list = $('#trainerList');
  list.innerHTML = '';
  TRAINERS.forEach((tr, i) => {
    const locked = i > UI.progress, cleared = i < UI.progress;
    const el = document.createElement('div');
    el.className = 'trainer' + (locked ? ' locked' : '') + (cleared ? ' cleared' : '');
    el.innerHTML = `<div class="idx">${cleared ? '✔' : i + 1}</div>
      <div class="who"><b>${tr.name}</b><small>${tr.title} · ${ARENAS[tr.arena].ko} · Lv.${tr.level}</small></div>
      <div class="mons"></div><div></div>`;
    const mons = el.querySelector('.mons');
    for (const k of tr.team) mons.appendChild(spriteImg(shownForm(POKEMON_BY_KEY[entryKey(k)]).id));
    const b = document.createElement('button');
    b.textContent = locked ? '잠김' : cleared ? '재도전' : '도전!';
    b.className = !locked && !cleared ? 'primary' : '';
    b.disabled = locked;
    b.onclick = () => startChallenge(i);
    el.lastElementChild.appendChild(b);
    list.appendChild(el);
  });
}

function startChallenge(i) {
  if (UI.team.length !== TEAM_SIZE) { openTeam('player', 'challenge'); return; }
  const tr = TRAINERS[i];
  startBattle({ mode: 'challenge', stage: i, arena: tr.arena, diff: tr.diff, playerTeam: UI.team.slice(), cpuTeam: tr.team.slice(), cpuLevel: tr.level, cpuName: tr.name });
}

$('#btnResetProgress').onclick = () => {
  if (!confirm('챌린지 진행 상황을 초기화할까요?')) return;
  UI.progress = 0;
  localStorage.setItem('pa_progress', '0');
  buildChallenge();
};

/* ---------------- 배틀 ---------------- */
function startBattle(cfg) {
  Sound.init();
  if (game) game.destroy();
  UI.last = cfg;
  show(null);
  $('#overlay-result').classList.add('hidden');
  $('#overlay-pause').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  const A = ARENAS[cfg.arena];
  $('#hudArena').textContent = A.name;
  $('#hudMode').textContent = cfg.boss ? 'BOSS BATTLE'
    : cfg.ffa ? (cfg.watch ? 'FFA SPECTATE' : 'BATTLE ROYALE')
    : cfg.mode === 'challenge' ? `CHALLENGE ${cfg.stage + 1} / ${TRAINERS.length}`
    : cfg.watch ? 'SPECTATE' : 'QUICK BATTLE';
  document.body.classList.toggle('mode-ffa', !!cfg.ffa);
  $('#ffaBoard').classList.toggle('hidden', !cfg.ffa);
  $('#bossBar').classList.toggle('hidden', !cfg.boss);
  game = new Game({ ...cfg, onEnd: showResult });
  UI.hudSig = {};
  buildMoveBar();
}

function setPaused(p) {
  if (!game || game.ended) return;
  game.paused = p;
  $('#overlay-pause').classList.toggle('hidden', !p);
}
$('#abMega').onclick = () => { if (game && !game.paused) { const p = game.playerSide(); if (p) p.megaEvolve(); } };
$('#btnPause').onclick = () => setPaused(true);
$('#btnResume').onclick = () => setPaused(false);
$('#btnRestart').onclick = () => startBattle(UI.last);
$('#btnQuit').onclick = () => backToMenu();

function fmtTime(t) {
  const s = Math.floor(t);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function showResult(r) {
  const cfg = UI.last;
  const ov = $('#overlay-result');
  ov.classList.remove('hidden');
  const title = $('#resTitle');
  if (r.ffa) {
    title.textContent = cfg.watch || !r.win ? `${r.winnerName} 우승!` : '우승!';
    title.className = r.win || cfg.watch ? 'win' : 'lose';
    $('#resSub').textContent = r.win ? '난투에서 마지막까지 남았습니다!' : cfg.watch ? '관전 종료' : '다른 포켓몬이 우승했습니다.';
    $('#resStats').className = 'ffa-rank';
    $('#resStats').innerHTML = r.ranking.map(x =>
      `<div class="${x.place === 1 ? 'p1' : ''}"><span>${x.place}위 · ${x.name}</span><b>KO ${x.ko} · ${x.dealt}</b></div>`
    ).join('');
    const btns = $('#resBtns');
    btns.innerHTML = '';
    const add = (label, fn, primary) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = 'big' + (primary ? ' primary' : '');
      b.onclick = () => { Sound.play('select'); fn(); };
      btns.appendChild(b);
    };
    add('다시 하기', () => startBattle(cfg), true);
    add('팀 편성', () => { backToMenu(); openTeam('player', 'ffa'); });
    add('메뉴로', backToMenu);
    return;
  }
  $('#resStats').className = '';
  title.textContent = cfg.watch ? (r.win ? 'CPU 1 승리!' : 'CPU 2 승리!') : r.win ? '승리!' : '패배...';
  title.className = r.win || cfg.watch ? 'win' : 'lose';
  let sub = cfg.watch ? '관전 종료' : r.win ? '멋진 배틀이었어요!' : '다시 도전해 보세요!';
  if (cfg.mode === 'boss' && r.win) {
    const bossName = game && game.sides[1] ? game.sides[1].team[0].sp.name : POKEMON_BY_KEY[entryKey(cfg.cpuTeam[0])].name;
    sub = `${bossName}${josa(bossName, '을', '를')} 쓰러뜨렸습니다!`;
  }
  if (cfg.mode === 'challenge' && r.win) {
    if (cfg.stage >= UI.progress) {
      UI.progress = Math.min(TRAINERS.length, cfg.stage + 1);
      localStorage.setItem('pa_progress', String(UI.progress));
    }
    sub = cfg.stage === TRAINERS.length - 1 ? '🏆 챔피언을 쓰러뜨렸습니다! 당신이 새로운 챔피언!' : `${cfg.cpuName}에게 승리했습니다!`;
  }
  $('#resSub').textContent = sub;
  $('#resStats').innerHTML = `
    <div><small>배틀 시간</small><b>${fmtTime(r.time)}</b></div>
    <div><small>쓰러뜨린 포켓몬</small><b>${r.ko} / ${cfg.cpuTeam.length}</b></div>
    <div><small>준 데미지</small><b>${r.dealt}</b></div>
    <div><small>받은 데미지</small><b>${r.taken}</b></div>`;
  const btns = $('#resBtns');
  btns.innerHTML = '';
  const add = (label, fn, primary) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'big' + (primary ? ' primary' : '');
    b.onclick = () => { Sound.play('select'); fn(); };
    btns.appendChild(b);
  };
  if (cfg.mode === 'challenge') {
    if (r.win && cfg.stage < TRAINERS.length - 1) add('다음 상대', () => startChallenge(cfg.stage + 1), true);
    add(r.win ? '다시 하기' : '재도전', () => startBattle(cfg), !r.win);
    add('챌린지 목록', () => { backToMenu(); show('challenge'); });
  } else if (cfg.mode === 'boss') {
    add('다시 하기', () => startBattle(cfg), true);
    add('다른 보스', () => {
      UI.bossEntry = rollBoss(entryKey(cfg.cpuTeam[0]));
      startBattle({ ...cfg, cpuTeam: [UI.bossEntry] });
    });
    add('팀 편성', () => { backToMenu(); openTeam('player', 'boss'); });
  } else {
    add('다시 하기', () => startBattle(cfg), true);
    add('새 상대와 배틀', () => { UI.cpuTeam = randomTeam(); saveCpuTeam(); startBattle({ ...cfg, cpuTeam: UI.cpuTeam.slice() }); });
    add('팀 편성', () => { backToMenu(); openTeam('player', 'pre'); });
  }
  add('메뉴로', backToMenu);
}

/* ---------------- HUD ---------------- */
function buildMoveBar() {
  const tb = $('#teamBar');
  tb.innerHTML = '';
  if (game.ffa) {
    game.sides.forEach((s, i) => {
      const m = s.team[0];
      const el = document.createElement('div');
      el.className = 'tm' + (i === 0 && !game.opts.watch ? ' active' : '');
      el.style.borderColor = FFA_COLORS[i % FFA_COLORS.length];
      const img = spriteImg((m.sp && m.sp.id) || m.baseSp.id);
      img.dataset.id = String(m.sp.id);
      el.appendChild(img);
      el.insertAdjacentHTML('beforeend', `<span class="k">${i + 1}</span><div class="mini"><i></i></div>`);
      tagTeamSlot(el);
      tb.appendChild(el);
    });
    return;
  }
  game.sides[0].team.forEach((m, i) => {
    const el = document.createElement('div');
    el.className = 'tm';
    const img = spriteImg((m.sp && m.sp.id) || m.baseSp.id);
    img.dataset.id = String(m.sp.id);
    el.appendChild(img);
    el.insertAdjacentHTML('beforeend', `<span class="k">${i + 1}</span><div class="mini"><i></i></div>`);
    tagTeamSlot(el);
    el.onclick = () => { if (game) game.sides[0].requestSwitch(i); };
    tb.appendChild(el);
  });
}

function cardHTML(side, label) {
  const m = side.mon;
  const st = m.status ? `<span class="st-badge" style="background:${STATUS[m.status].color}">${STATUS[m.status].ko}</span>` : '';
  const balls = side.team.map(x => `<span class="ball${x.fainted ? ' out' : ''}"></span>`).join('');
  const mega = m.megaed ? ' <span class="mega-tag">Mega</span>' : m.sp.primaled ? ' <span class="primal-tag">원시</span>' : '';
  const boss = m.boss ? ' <span class="boss-tag">BOSS</span>' : '';
  return `<div class="card-top"><span>${label}</span><span class="abil-name">${ABILITIES[m.ability].name} · Lv. ${m.level}</span></div>
    <div class="card-name"><span class="nm">${m.sp.name}</span>${boss}${mega}${m.sp.types.map(typeBadge).join('')}${st}</div>
    <div class="hpbar"><div class="hplag"></div><div class="hpfill"></div></div>
    <div class="card-bot"><span class="hptext"></span><span class="balls">${balls}</span></div>`;
}

function hpColor(r) { return r > 0.5 ? '#4ade80' : r > 0.2 ? '#facc15' : '#ef4444'; }

function setText(el, text) {
  if (!el || el._tx === text) return;
  el._tx = text;
  el.textContent = text;
}
function setCss(el, prop, val) {
  if (!el || el['_c' + prop] === val) return;
  el['_c' + prop] = val;
  el.style[prop] = val;
}
function tagTeamSlot(el) {
  el._img = el.querySelector('img');
  el._bar = el.querySelector('.mini i');
}

const HUD = {};
function bindHUD() {
  HUD.timer = $('#timer');
  HUD.weather = $('#hudWeather');
  HUD.cardP = $('#cardP');
  HUD.cardC = $('#cardC');
  HUD.moveBar = $('#moveBar');
  HUD.teamBar = $('#teamBar');
  HUD.dodge = document.querySelector('#abDodge .cdov');
  HUD.sw = document.querySelector('#abSwitch .cdov');
  HUD.mega = $('#abMega');
  HUD.megaLabel = HUD.mega.querySelector('span');
  HUD.ffa = $('#ffaBoard');
}

function updateCard(el, side, label, sigKey) {
  const m = side.mon;
  const sig = `${side.active}|${m.status}|${m.ability}|${m.sp.key}|${m.megaed}|${side.team.map(x => x.fainted ? 1 : 0).join('')}`;
  if (UI.hudSig[sigKey] !== sig) {
    UI.hudSig[sigKey] = sig;
    el.innerHTML = cardHTML(side, label);
    el.classList.toggle('is-boss', !!m.boss);
    el._fill = el.querySelector('.hpfill');
    el._lag = el.querySelector('.hplag');
    el._hp = el.querySelector('.hptext');
  }
  const r = m.hp / m.maxHp;
  const w = (r * 100) + '%';
  setCss(el._fill, 'width', w);
  setCss(el._fill, 'background', hpColor(r));
  setCss(el._lag, 'width', w);
  setText(el._hp, `${m.hp} / ${m.maxHp} HP`);
}

function updateFfaBoard() {
  const box = HUD.ffa;
  if (UI.hudSig.ffaN !== game.sides.length) {
    UI.hudSig.ffaN = game.sides.length;
    box.innerHTML = game.sides.map((s, i) =>
      `<div class="ffa-card" style="border-color:${FFA_COLORS[i % FFA_COLORS.length]}">
        <div class="fc-top"><span>${i === 0 && !game.opts.watch ? 'YOU' : '#' + (i + 1)}</span><span class="abil-name"></span></div>
        <div class="fc-name"></div>
        <div class="hpbar"><div class="hplag"></div><div class="hpfill"></div></div>
      </div>`
    ).join('');
    [...box.children].forEach(el => {
      el._abil = el.querySelector('.abil-name');
      el._name = el.querySelector('.fc-name');
      el._fill = el.querySelector('.hpfill');
      el._lag = el.querySelector('.hplag');
    });
  }
  [...box.children].forEach((el, i) => {
    const s = game.sides[i], m = s.mon;
    el.classList.toggle('you', i === (game.playerIdx || 0) && !game.opts.watch);
    el.classList.toggle('out', m.fainted);
    setText(el._abil, `${ABILITIES[m.ability].name} · Lv.${m.level}`);
    setText(el._name, m.sp.name);
    const r = m.maxHp ? m.hp / m.maxHp : 0;
    const w = (r * 100) + '%';
    setCss(el._fill, 'width', w);
    setCss(el._fill, 'background', hpColor(r));
    setCss(el._lag, 'width', w);
  });
}

function updateHUD() {
  if (!game) return;
  const p = game.playerSide() || game.sides[0];
  const left = Math.max(0, TIME_LIMIT - game.time);
  setText(HUD.timer, fmtTime(Math.ceil(left)));
  HUD.timer.classList.toggle('urgent', left < 30);
  const w = game.weather, wNow = game.weatherNow();
  const wName = w ? (w.primal ? WEATHER[w.type].primalKo : WEATHER[w.type].ko) : '';
  setText(HUD.weather, w ? `${wName}${w.primal ? '' : ' ' + Math.ceil(w.t) + '초'}${wNow ? '' : game.hasDeltaStream() ? ' (델타스트림)' : ' (에어록)'}` : '');
  setCss(HUD.weather, 'color', w ? WEATHER[w.type].color : '');
  if (game.ffa) updateFfaBoard();
  else {
    updateCard(HUD.cardP, p, UI.last.watch ? 'CPU 1' : 'PLAYER', 'p');
    updateCard(HUD.cardC, game.sides[1], game.boss ? 'BOSS' : (UI.last.cpuName || 'CPU TRAINER'), 'c');
    if (game.boss) {
      const boss = game.sides[1].mon;
      const phase = boss.phase2 ? ' · 폭주' : boss.phase1 ? ' · 분노' : '';
      setText($('#bossName'), boss.sp.name + phase);
      const r = boss.maxHp ? boss.hp / boss.maxHp : 0;
      const w = (r * 100) + '%';
      setCss($('#bossFill'), 'width', w);
      setCss($('#bossFill'), 'background', hpColor(r));
      setCss($('#bossLag'), 'width', w);
      setText($('#bossHp'), `${boss.hp} / ${boss.maxHp}`);
    }
  }

  const keys = ['J', 'K', 'L', 'I'];
  const mb = HUD.moveBar;
  const msig = `${p.active}|${p.mon.sp.key}|${p.mon.moves.map(sl => sl.id).join(',')}`;
  if (UI.hudSig.moves !== msig) {
    UI.hudSig.moves = msig;
    mb.innerHTML = '';
    p.mon.moves.forEach((sl, i) => {
      const el = document.createElement('div');
      el.className = 'move';
      el.innerHTML = `<div class="key">${keys[i]}</div><div class="mname"></div>
        <div class="minfo"><span class="mtype"></span><span class="pp"></span></div><div class="cdov"></div><div class="cdtext"></div>`;
      el._name = el.querySelector('.mname');
      el._type = el.querySelector('.mtype');
      el._pp = el.querySelector('.pp');
      el._cd = el.querySelector('.cdov');
      el._cdtext = el.querySelector('.cdtext');
      el.onclick = () => { if (game) (game.playerSide() || game.sides[0]).useMove(i); };
      mb.appendChild(el);
    });
  }
  [...mb.children].forEach((el, i) => {
    const sl = p.mon.moves[i];
    const struggle = sl.pp <= 0;
    const mv = MOVES[struggle ? 'struggle' : sl.id];
    const tc = TYPES[mv.type].color;
    if (el._tc !== tc) { el._tc = tc; el.style.setProperty('--tc', tc); }
    el.classList.toggle('struggle', struggle);
    setText(el._name, mv.name);
    setText(el._type, `${TYPES[mv.type].ko} · ${KIND_KO[mv.kind]} · ${mv.power}`);
    const ppText = struggle ? 'PP 없음' : `PP ${sl.pp}/${sl.maxPp}`;
    const ppClass = 'pp' + (struggle ? ' zero' : sl.pp <= sl.maxPp * 0.25 ? ' low' : '');
    setText(el._pp, ppText);
    if (el._pp._cls !== ppClass) { el._pp._cls = ppClass; el._pp.className = ppClass; }
    const cd = struggle ? Math.max(0, p.struggleCd) : Math.max(0, sl.cd);
    setCss(el._cd, 'height', (cd > 0 ? Math.min(1, cd / mv.cd) * 100 : 0) + '%');
    setText(el._cdtext, cd > 0.05 ? cd.toFixed(1) : '');
  });

  [...HUD.teamBar.children].forEach((el, i) => {
    const side = game.ffa ? game.sides[i] : null;
    const m = game.ffa ? side.team[0] : p.team[i];
    if (!m) return;
    el.classList.toggle('active', game.ffa ? (i === (game.playerIdx || 0) && !game.opts.watch) : i === p.active);
    el.classList.toggle('fainted', m.fainted);
    const img = el._img;
    const id = String(m.sp.id);
    if (img && img.dataset.id !== id) { img.dataset.id = id; setSprite(img, m.sp.id, false); }
    const r = m.maxHp ? m.hp / m.maxHp : 0;
    setCss(el._bar, 'width', r * 100 + '%');
    setCss(el._bar, 'background', hpColor(r));
  });

  setCss(HUD.dodge, 'height', Math.max(0, p.dodgeCd / 0.9) * 100 + '%');
  setCss(HUD.sw, 'height', Math.max(0, p.switchCd / 3.5) * 100 + '%');
  const can = p.canMega();
  HUD.mega.classList.toggle('off', !can);
  HUD.mega.classList.toggle('ready', can);
  setText(HUD.megaLabel, p.mon.megaed ? '메가' : can ? '메가' : game.megaOK[p.idx] ? '메가' : '사용함');
}

/* ---------------- 입력 ---------------- */
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  Sound.init();
  if (!Input.down.has(e.code)) Input.pressed.add(e.code);
  Input.down.add(e.code);
  if (game) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if ((e.code === 'Escape' || e.code === 'KeyP') && !game.ended) setPaused(!game.paused);
  }
});
addEventListener('keyup', e => Input.down.delete(e.code));
addEventListener('blur', () => { Input.down.clear(); if (game && !game.ended) setPaused(true); });

/* ---------------- 화면 맞춤 & 루프 ---------------- */
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  $('#stage').style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);
fit();

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;
  if (game) {
    if (!game.paused) game.update(dt);
    game.render();
    updateHUD();
  }
  Input.pressed.clear();
  requestAnimationFrame(frame);
}

bindHUD();
drawArena($('#bg').getContext('2d'), ARENAS[UI.arena]);

show('menu');
if (location.hash === '#watch') startWatch();
requestAnimationFrame(frame);
