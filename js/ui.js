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
  doubles: localStorage.getItem('pa_doubles') === '1',
  cpuTeam: loadCpuTeam(),
  editTarget: 'player',
  last: null, // 마지막 배틀 설정 (다시하기용)
  typeFilter: null,
  formFilter: null,
  search: '',
  hudSig: {},
  bossEntry: null,
};

function loadTeam() {
  let team = ['pikachu', 'charizard', 'greninja', 'shedinja', 'lucario', 'rayquaza'].map(k => normalizeEntry(k));
  try {
    const t = JSON.parse(localStorage.getItem('pa_team'));
    if (Array.isArray(t) && t.length) {
      const parsed = t.map(normalizeEntry).filter(e => e && !POKEMON_BY_KEY[e.key].hidden).slice(0, TEAM_SIZE);
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
      const parsed = t.map(normalizeEntry).filter(e => e && !POKEMON_BY_KEY[e.key].hidden).slice(0, TEAM_SIZE);
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
  const pool = POKEMON.filter(p => !p.egg && !p.hidden && !ex.includes(p.key)).map(p => p.key);
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
  const forms = megaForms(sp);
  if (entry && typeof entry !== 'string' && forms.length) return forms[Math.min(forms.length - 1, entry.mega | 0)];
  return sp.primal || sp.crown || sp;
}
// 배틀에 나가기 전의 모습. X진화·울트라·레전드플레이트는 R키를 누른 뒤에만 바뀐다.
function sentForm(sp, entry) {
  const shown = shownForm(sp, entry);
  if (shown.battleOnly) return sp;
  return shown;
}
function dexQueryHit(sp, view, q) {
  if (!q) return false;
  const compact = q.toLowerCase().replace(/\s+/g, '');
  if (sp.egg && (compact.includes('digimon') || q.includes('디지몬'))) return true;
  const ql = q.toLowerCase();
  if (sp.name.includes(q) || view.name.includes(q) || sp.key.includes(ql)) return true;
  return (sp.megas || []).some(f => f.name.includes(q) || (f.label && f.label.includes(q)));
}
function matchesDex(sp) {
  if (sp.hidden) return false;
  const view = shownForm(sp);
  const q = UI.search.trim();
  if (UI.formFilter === 'mega' && !megaForms(sp).length) return false;
  if (UI.formFilter === 'gmax' && !gmaxFormOf(sp)) return false;
  if (UI.formFilter === 'z' && !Z_MOVES[sp.key] && !JOGRESS[sp.key]) return false;
  if (UI.formFilter === 'legend' && !sp.legend) return false;
  if (sp.egg && !dexQueryHit(sp, view, q)) return false;
  if (UI.typeFilter && !view.types.includes(UI.typeFilter)) return false;
  if (!q) return true;
  return dexQueryHit(sp, view, q);
}
function spriteImg(id, cls = '', lazy = false) {
  const img = document.createElement('img');
  if (cls) img.className = cls;
  if (lazy) img.loading = 'lazy';
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
  if (name === 'help') buildHelp();
  if (name === 'keys') buildKeys();
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
  for (const [id, label, color] of [['mega', '메가', '#c9a227'], ['gmax', '거다이', '#e3350d'], ['z', 'Z', '#5b4bff'], ['legend', '전설', '#f0b429']]) {
    const c = document.createElement('span');
    c.className = 'chip form' + (UI.formFilter === id ? ' on' : '');
    c.style.background = color;
    c.textContent = label;
    c.onclick = () => { UI.formFilter = UI.formFilter === id ? null : id; buildTeam(); };
    chips.appendChild(c);
  }
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
      ? '빠른 배틀 상대는 1~6마리면 됩니다. 기술, 메가 폼, CPU 제한도 여기서 정합니다.'
      : '빠른 배틀은 1~6마리면 됩니다. 대난투와 챌린지는 6마리가 필요합니다. CPU 제한은 CPU가 조종할 때만 적용됩니다.'));
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
      const view = sentForm(sp, e);
      const form = megaForms(sp)[e.mega | 0];
      el.innerHTML = `<span class="num">${i + 1}</span><span class="x">✕</span>` +
        (form && !form.battleOnly ? `<span class="mega-tag">${form.tag || 'Mega'}</span>` : '') +
        (e.limit ? `<span class="limit-tag">${BURST_LIMITS.find(([id]) => id === e.limit)[1]}</span>` : '') +
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
    pic.appendChild(spriteImg(view.id, '', true));
    el.appendChild(pic);
    el.insertAdjacentHTML('beforeend', `<div class="nm">${view.name}</div><div>${view.types.map(typeBadge).join('')}</div>` +
      (idx >= 0 ? `<div class="order">${idx + 1}</div>` : '') +
      (sp.legend ? '<div class="legend">전설</div>' : '') +
      (sp.egg ? '<div class="egg">비밀</div>' : '') +
      (sp.megas && megaForms(sp).length ? '<div class="mega">Mega</div>' : '') +
      (gmaxFormOf(sp) ? '<div class="mega">거대</div>' : '') +
      (Z_MOVES[sp.key] ? '<div class="mega">Z</div>' : '') +
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
  const forms = megaForms(sp);
  const form = ti >= 0 && forms.length ? forms[Math.min(forms.length - 1, entry.mega | 0)] : null;
  const view = sentForm(sp, ti >= 0 ? entry : null);
  const lv = sp.fixedLevel || 50;
  const st = calcStats(view, lv);
  const labels = ['HP', '공격', '방어', '특공', '특방', '스피드'];
  const vals = [st.hp, st.atk, st.def, st.spa, st.spd, st.spe];
  if (view.gmax) vals[0] *= 2;
  const ab = ABILITIES[view.ability];
  const gainedAt = form && form.gainMove ? entry.moves.findIndex(id => MOVES[id] && !MOVES[id].sig) : -1;
  const gainSlot = gainedAt >= 0 ? gainedAt : (form && form.gainMove ? entry.moves.length - 1 : -1);
  const moveIds = entry.moves.map((id, i) => i === gainSlot ? form.gainMove : id);
  const box = $('#dexDetail');
  const megaBtns = forms.map((f, i) =>
    `<button class="small mega-btn${entry.mega === i ? ' on' : ''}" data-mega="${i}">${f.label}</button>`
  ).join('');
  const notes = forms.map(f => f.label);
  if (gmaxFormOf(sp)) notes.push('거다이맥스');
  if (sp.completeForm) notes.push('퍼펙트폼');
  if (Z_MOVES[sp.key] || JOGRESS[sp.key]) notes.push('Z기술');
  const evoNote = notes.length ? ` · ${notes.join('·')} 가능` : '';
  const replaced = gainSlot >= 0 ? MOVES[entry.moves[gainSlot]] : null;
  const evoHint = [
    form && form.gainMove && replaced
      ? `R키로 ${form.label}. ${replaced.name} 칸이 ${MOVES[form.gainMove].name}로 바뀝니다. 팀당 메가 1회`
      : (form && form.hint) || (forms.length ? 'R키로 메가. 팀당 1회' : ''),
    gmaxFormOf(sp) ? `G키로 거다이맥스. HP 2배, 30초 뒤 원래 비율로 돌아온다. 기술은 다이맥스 기술로 바뀌고, 전용 기술은 ${GMAX_MOVES[sp.key] ? GMAX_MOVES[sp.key].name : '없음'}. 팀당 다이맥스와 합쳐 1회. 같은 포켓몬은 메가와 거다이맥스 중 하나만`
      : 'G키로 다이맥스. HP 2배, 30초 뒤 원래 비율로 돌아온다. 공격 기술은 타입별 다이맥스 기술로, 변화 기술은 다이월로 바뀐다. 팀당 거다이맥스와 합쳐 1회',
    Z_MOVES[sp.key] ? `Z키로 ${MOVES[Z_MOVES[sp.key]].name}${(sp.key === 'necrozmadusk' || sp.key === 'necrozmadawn') ? '. 울트라네크로즈마가 되면 하늘을태우는멸망의빛' : ''}. 팀당 1회` : '',
    JOGRESS[sp.key] ? `같은 파티에 ${POKEMON_BY_KEY[JOGRESS[sp.key]].name}가 있으면 Z키로 레벨 100 오메가몬이 된다. 남은 한 마리는 쓰러진다. 팀당 1회` : '',
    sp.completeForm ? `HP가 절반 이하가 되면 ${sp.completeForm.name}로 변한다` : '',
  ].filter(Boolean).join(' · ');
  box.innerHTML = `
    <div class="dd-head">
      <div class="pic"></div>
      <div>
        <div class="dd-no">No.${String(sp.id).padStart(4, '0')} · Lv.${lv}${evoNote}${sp.primal ? ' · 원시회귀' : ''}</div>
        <div class="dd-name">${view.name}${sp.legend ? ' <span class="legend-tag">전설</span>' : ''}${form && !form.battleOnly ? ` <span class="mega-tag">${form.tag || 'Mega'}</span>` : (!form && forms.length ? ' <span class="mega-tag">Mega</span>' : '')}${gmaxFormOf(sp) ? ' <span class="mega-tag">거대</span>' : ''}${(Z_MOVES[sp.key] || JOGRESS[sp.key]) ? ' <span class="mega-tag">Z</span>' : ''}${sp.primal ? ' <span class="primal-tag">원시</span>' : ''}</div>
        <div>${view.types.map(typeBadge).join('')}</div>
      </div>
    </div>
    <div class="dd-ability"><b>특성 · ${ab.name}</b>${ab.desc}</div>
    ${(megaBtns || evoHint) ? `<div class="mega-row">${megaBtns}<span class="hint" style="margin:0">${evoHint}</span></div>` : ''}
    ${ti >= 0 ? `<div class="mega-row">${BURST_LIMITS.map(([id, label]) => `<button class="small limit-btn${(entry.limit || '') === id ? ' on' : ''}" data-limit="${id}">${label}</button>`).join('')}<span class="hint" style="margin:0">CPU가 조종할 때만. 고른 행동만 메가·거다이맥스·Z·테라 중에서 씁니다.</span></div>` : ''}
    ${ti >= 0 ? `<div class="mega-row tera-row"><span class="hint" style="margin:0">테라타입 · T키, 팀당 1회</span>${Object.keys(TYPES).filter(t => t !== 'none').map(t => `<button class="small tera-btn${(entry.tera || sp.types[0]) === t ? ' on' : ''}" data-tera="${t}" style="--tc:${TYPES[t].color}">${TYPES[t].ko}</button>`).join('')}</div>` : ''}
    <div class="stats">${labels.map((l, i) => {
      const baseN = i === 0 && view.gmax ? view.base[i] * 2 : view.base[i];
      const pct = Math.min(100, baseN / 180 * 100);
      const col = baseN >= 110 ? '#4ade80' : baseN >= 80 ? '#facc15' : '#fb923c';
      return `<span>${l}</span><b>${vals[i]}</b><div class="bar"><i style="width:${Math.max(pct, 1)}%;background:${col}"></i></div>`;
    }).join('')}</div>
    <div class="dd-moves-head"><span>기술 4개</span>${ti >= 0 ? '<button class="small" id="btnAllMoves">기술 랜덤</button>' : ''}</div>
    <div class="dd-moves">${moveIds.map((id, i) => {
      const mv = MOVES[id];
      const locked = i === gainSlot;
      return `<div class="dd-move" style="--tc:${TYPES[mv.type].color}" data-slot="${i}"><b>${mv.name}${ti >= 0 && !locked ? ' <span class="reroll">↻</span>' : ''}</b>` +
        `<span>${TYPES[mv.type].ko} · ${KIND_KO[mv.kind] || '기술'} · 위력 ${mv.power}${mv.rollHits ? ' · 2~5발' : ''} · PP ${mv.pp}</span>` +
        `<span class="fx">${moveText(mv)}</span></div>`;
    }).join('')}</div>`;
  box.querySelector('.pic').appendChild(spriteImg(view.id));
  if (ti >= 0) {
    box.querySelectorAll('.mega-btn').forEach(b => {
      b.onclick = () => { roster()[ti].mega = +b.dataset.mega; Sound.play('select'); renderSlots(); renderDetail(key); };
    });
    box.querySelectorAll('.limit-btn').forEach(b => {
      b.onclick = () => { roster()[ti].limit = b.dataset.limit; Sound.play('select'); renderSlots(); renderDetail(key); };
    });
    box.querySelectorAll('.tera-btn').forEach(b => {
      b.onclick = () => { roster()[ti].tera = b.dataset.tera; Sound.play('select'); renderDetail(key); };
    });
    const all = box.querySelector('#btnAllMoves');
    if (all) all.onclick = () => { roster()[ti].moves = randomMoves(sp); Sound.play('select'); renderDetail(key); };
    box.querySelectorAll('.dd-move').forEach(el => {
      el.onclick = () => {
        if (+el.dataset.slot === gainSlot) return;
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
    const view = sentForm(sp, k);
    const el = document.createElement('div');
    el.className = 'tp';
    const pic = document.createElement('div');
    pic.className = 'pic';
    pic.appendChild(spriteImg(view.id));
    el.appendChild(pic);
    const limit = k && k.limit ? BURST_LIMITS.find(([id]) => id === k.limit) : null;
    el.insertAdjacentHTML('beforeend', `<div class="nm">${view.name}</div><div>${view.types.map(typeBadge).join('')}</div>${limit ? `<div class="nm">${limit[1]}</div>` : ''}`);
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
  const fmt = $('#fmtBtns');
  fmt.innerHTML = '';
  for (const [on, label, desc] of [[false, '싱글', '1마리씩'], [true, '더블', '최대 2마리']]) {
    const b = document.createElement('button');
    b.className = UI.doubles === on ? 'on' : '';
    b.innerHTML = `${label} <small style="opacity:.7;font-weight:400">· ${desc}</small>`;
    b.onclick = () => {
      UI.doubles = on;
      localStorage.setItem('pa_doubles', on ? '1' : '0');
      Sound.play('select');
      buildPre();
    };
    fmt.appendChild(b);
  }
  $('#preHint').textContent = UI.doubles
    ? '더블은 양쪽 1마리여도 시작할 수 있습니다. 2마리 이상이면 2마리씩 나와 같은 편으로 싸우고, 1번을 직접 조작합니다. 아래 팀 칸의 파트너를 누르면 그 포켓몬을 조작합니다. 메가·다이맥스·Z·테라는 편마다 1회입니다.'
    : 'CPU끼리 관전할 때 포켓몬마다 메가·거다이맥스·Z·테라 중 하나만 쓰게 하려면, 팀 편성 상세에서 CPU 제한을 고르세요. 직접 조작할 때는 제한되지 않습니다.';
}

$('#btnReroll').onclick = () => { UI.cpuTeam = randomTeam(); saveCpuTeam(); Sound.play('select'); buildPre(); };
$('#btnEditTeam').onclick = () => openTeam('player', 'pre');
$('#btnEditCpu').onclick = () => openTeam('cpu', 'pre');
function quickReady() {
  if (UI.team.length < 1) { openTeam('player', 'pre'); return false; }
  if (UI.cpuTeam.length < 1) { openTeam('cpu', 'pre'); return false; }
  return true;
}
$('#btnStart').onclick = () => {
  if (!quickReady()) return;
  startBattle({ mode: 'quick', doubles: UI.doubles, arena: UI.arena, diff: UI.diff, playerTeam: UI.team.slice(), cpuTeam: UI.cpuTeam.slice(), cpuLevel: 50, cpuName: 'CPU TRAINER' });
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

function legendChoices() { return POKEMON.filter(p => p.legend && !p.egg && !p.hidden); }
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
  if (!UI.cpuTeam.length) { UI.cpuTeam = randomTeam(); saveCpuTeam(); }
  startBattle({ mode: 'quick', doubles: UI.doubles, watch: true, arena: UI.arena, diff: UI.diff, playerTeam, cpuTeam: UI.cpuTeam.slice(), cpuLevel: 50, cpuName: 'CPU TRAINER' });
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
    : cfg.doubles ? (cfg.watch ? 'DOUBLE SPECTATE' : 'DOUBLE BATTLE')
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
function playerNow() {
  return game && !game.paused && !game.ended ? game.playerSide() : null;
}
$('#abDodge').onclick = () => { const p = playerNow(); if (p) p.dodge([p.input.x, p.input.y]); };
$('#abSwitch').onclick = () => { const p = playerNow(); if (p) p.requestSwitch(); };
$('#abMega').onclick = () => { const p = playerNow(); if (p) p.megaEvolve(); };
$('#abGmax').onclick = () => { const p = playerNow(); if (p) p.gmaxEvolve(); };
$('#abZ').onclick = () => { const p = playerNow(); if (p) p.useZ(); };
$('#abTera').onclick = () => { const p = playerNow(); if (p) p.terastallize(); };
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
    el.onclick = () => commandSlot(i);
    tb.appendChild(el);
  });
}

function commandSlot(i) {
  if (!game) return;
  const p = game.playerSide() || game.sides[0];
  const ally = game.sides.find(s => s.team === p.team && s !== p && s.active === i && !s.mon.fainted && s.faintT <= 0);
  if (ally && game.doubles && !game.opts.watch) game.focusSide(ally);
  else p.requestSwitch(i);
}
function allyOf(side) {
  if (!game || !game.doubles) return null;
  return game.sides.find(o => o !== side && o.party === side.party && !o.mon.fainted) || null;
}
function cardHTML(side, label) {
  const m = side.mon;
  const ally = allyOf(side);
  const partner = ally ? `<div class="partner">파트너 ${ally.mon.sp.name}</div>` : '';
  const st = m.status ? `<span class="st-badge" style="background:${STATUS[m.status].color}">${STATUS[m.status].ko}</span>` : '';
  const balls = side.team.map(x => `<span class="ball${x.fainted ? ' out' : ''}"></span>`).join('');
  const mega = m.megaed ? ` <span class="mega-tag">${m.sp.tag || 'Mega'}</span>` : m.sp.primaled ? ' <span class="primal-tag">원시</span>' : '';
  const tera = m.teraed ? ` <span class="mega-tag" style="background:${TYPES[m.teraType].color};color:#1a1208">테라</span>` : '';
  const boss = m.boss ? ' <span class="boss-tag">BOSS</span>' : '';
  return `<div class="card-top"><span>${label}</span><span class="abil-name">${(ABILITIES[m.ability] && ABILITIES[m.ability].name) || '특성 없음'} · Lv. ${m.level}</span></div>
    <div class="card-name"><span class="nm">${m.sp.name}</span>${boss}${mega}${tera}${battleTypes(m).map(typeBadge).join('')}${st}</div>
    <div class="hpbar"><div class="hplag"></div><div class="hpfill"></div></div>
    ${partner}
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
  HUD.dodgeKey = document.querySelector('#abDodge b');
  HUD.sw = document.querySelector('#abSwitch .cdov');
  HUD.swKey = document.querySelector('#abSwitch b');
  HUD.mega = $('#abMega');
  HUD.megaLabel = HUD.mega.querySelector('span');
  HUD.megaKey = HUD.mega.querySelector('b');
  HUD.gmax = $('#abGmax');
  HUD.gmaxLabel = HUD.gmax.querySelector('span');
  HUD.gmaxKey = HUD.gmax.querySelector('b');
  HUD.z = $('#abZ');
  HUD.zLabel = HUD.z.querySelector('span');
  HUD.zKey = HUD.z.querySelector('b');
  HUD.tera = $('#abTera');
  HUD.teraLabel = HUD.tera.querySelector('span');
  HUD.teraKey = HUD.tera.querySelector('b');
  HUD.ffa = $('#ffaBoard');
}

function updateCard(el, side, label, sigKey) {
  const m = side.mon;
  const ally = allyOf(side);
  const sig = `${side.active}|${m.status}|${m.ability}|${m.sp.key}|${battleTypes(m).join(',')}|${m.teraed ? 1 : 0}|${m.sp.id}|${m.megaed}|${side.team.map(x => x.fainted ? 1 : 0).join('')}|${ally ? ally.idx + ':' + ally.active + ':' + ally.mon.sp.key : ''}`;
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
    setText(el._abil, `${(ABILITIES[m.ability] && ABILITIES[m.ability].name) || '특성 없음'} · Lv.${m.level}`);
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
  const parts = [];
  if (w) {
    const wName = w.primal ? WEATHER[w.type].primalKo : WEATHER[w.type].ko;
    parts.push(`${wName}${w.primal ? '' : ' ' + Math.ceil(w.t) + '초'}${wNow ? '' : game.hasDeltaStream() ? ' (델타스트림)' : ' (에어록)'}`);
  }
  const tr = game.terrainNow();
  if (tr) parts.push(`${TERRAIN[tr].ko} ${Math.ceil(game.terrain.t)}초`);
  setText(HUD.weather, parts.join(' · '));
  setCss(HUD.weather, 'color', w ? WEATHER[w.type].color : (tr ? TERRAIN[tr].color : ''));
  if (game.ffa) updateFfaBoard();
  else {
    updateCard(HUD.cardP, p, UI.last.watch ? 'CPU 1' : 'PLAYER', 'p');
    const cpu = game.sides.find(s => s.party === 1 && game.targetable(s)) || game.sides.find(s => s.party === 1) || game.sides[1];
    updateCard(HUD.cardC, cpu, game.boss ? 'BOSS' : (UI.last.cpuName || 'CPU TRAINER'), 'c');
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

  const keys = [1, 2, 3, 4].map(i => Controls.label(Controls.codes('move' + i)[0]));
  const mb = HUD.moveBar;
  const msig = `${p.active}|${p.mon.sp.key}|${p.mon.dmax ? 1 : 0}|${p.mon.gmax ? 1 : 0}|${p.mon.moves.map(sl => sl.id).join(',')}|${keys.join(',')}`;
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
    const mv = battleMove(p.mon, struggle ? 'struggle' : sl.id);
    const judgmentPlate = !struggle && !mv.max && p.mon.ability === 'legendplate' && mv.id === 'judgment';
    const showType = judgmentPlate ? 'normal' : mv.type;
    const tc = judgmentPlate ? '#ffe14d' : TYPES[showType].color;
    if (el._tc !== tc) { el._tc = tc; el.style.setProperty('--tc', tc); }
    el.classList.toggle('struggle', struggle);
    setText(el._name, mv.name);
    const typeWord = judgmentPlate ? '약점맞춤' : TYPES[showType].ko;
    setText(el._type, `${typeWord} · ${KIND_KO[mv.kind] || '기술'} · ${mv.power}${mv.rollHits ? ' · 2~5발' : ''}`);
    if (el.title !== moveText(mv)) el.title = moveText(mv);
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
    const allySlots = !game.ffa && game.doubles ? game.sides.filter(s => s.team === p.team && s !== p && !s.mon.fainted).map(s => s.active) : [];
    el.classList.toggle('active', game.ffa ? (i === (game.playerIdx || 0) && !game.opts.watch) : i === p.active);
    el.classList.toggle('ally', allySlots.includes(i) && i !== p.active);
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
  setText(HUD.dodgeKey, Controls.primaryText('dodge'));
  setText(HUD.swKey, Controls.primaryText(['switchNext', 'switchPrev']));
  setText(HUD.megaKey, Controls.primaryText('mega'));
  setText(HUD.gmaxKey, Controls.primaryText('gmax'));
  setText(HUD.zKey, Controls.primaryText('zmove'));
  setText(HUD.teraKey, Controls.primaryText('tera'));
  const can = p.canMega();
  HUD.mega.classList.toggle('off', !can);
  HUD.mega.classList.toggle('ready', can);
  const picked = megaForms(p.mon.baseSp)[p.mon.megaIdx || 0];
  const evoWord = (picked && picked.hud) || '메가';
  const megaedHere = p.mon.megaed && !p.mon.gmax;
  setText(HUD.megaLabel, !megaedHere && !can && !game.megaOK[p.burstSlot()] ? '사용함' : evoWord);
  const canG = p.canGmax();
  HUD.gmax.classList.toggle('off', !canG);
  HUD.gmax.classList.toggle('ready', canG);
  const giant = p.mon.gmax || p.mon.dmax;
  const giantWord = gmaxFormOf(p.mon.baseSp) ? '거대' : '다이';
  const giantLeft = giant && p.mon.giantT > 0 ? ' ' + Math.ceil(p.mon.giantT) : '';
  setText(HUD.gmaxLabel, !giant && !canG && !game.gmaxOK[p.burstSlot()] ? '사용함' : giantWord + giantLeft);
  const gBtn = document.querySelector('#touchActs [data-act="gmax"]');
  if (gBtn) gBtn.textContent = giant ? giantWord + giantLeft : giantWord;
  const canZ = p.canZ();
  HUD.z.classList.toggle('off', !canZ);
  HUD.z.classList.toggle('ready', canZ);
  const hasZ = !!(Z_MOVES[p.mon.baseSp.key] || jogressPartner(p));
  setText(HUD.zLabel, p.mon.zUsed || (!canZ && !game.zOK[p.burstSlot()]) ? '사용함' : (hasZ ? 'Z기술' : '없음'));
  const canT = p.canTera();
  HUD.tera.classList.toggle('off', !canT);
  HUD.tera.classList.toggle('ready', canT);
  const teraWord = p.mon.teraed && TYPES[p.mon.teraType] ? TYPES[p.mon.teraType].ko : '테라';
  setText(HUD.teraLabel, p.mon.teraed || (!canT && !game.teraOK[p.burstSlot()]) ? (p.mon.teraed ? teraWord : '사용함') : '테라');
}

/* ---------------- 조작 설정 ---------------- */
let keyListen = null;
let keyMsg = '';

function openKeys(returnTo) {
  UI.keysReturn = returnTo;
  keyListen = null;
  keyMsg = '';
  if (returnTo === 'pause') $('#overlay-pause').classList.add('hidden');
  show('keys');
}
function closeKeys() {
  keyListen = null;
  const ret = UI.keysReturn || 'menu';
  UI.keysReturn = null;
  if (ret === 'pause' && game) {
    $$('.screen').forEach(el => el.classList.add('hidden'));
    $('#overlay-pause').classList.remove('hidden');
    return;
  }
  show(ret === 'pause' ? 'menu' : ret);
}
function buildHelp() {
  const rows = [
    { ids: ['up', 'left', 'down', 'right'], desc: '이동' },
    { ids: ['move1', 'move2', 'move3', 'move4'], desc: '기술 1~4 (상대를 자동 조준)' },
    { ids: ['dodge'], desc: '회피 구르기 (무적 시간 있음)' },
    { ids: ['switchNext', 'switchPrev'], desc: '다음 / 이전 포켓몬으로 교체. 하단 아이콘 클릭도 됩니다' },
    { ids: ['mega'], desc: '메가진화 (팀당 1회). 오메가몬은 X진화, 네크로즈마는 울트라, 아르세우스는 레전드플레이트' },
    { ids: ['gmax'], desc: '다이맥스 또는 거다이맥스 (팀당 합쳐 1회, 메가와 따로). HP가 2배가 되고 30초 뒤에 원래 비율로 돌아온다. 공격 기술은 다이맥스 기술로, 변화 기술은 다이월로 바뀐다. 거다이맥스는 전용 타입이면 거다이맥스 기술이 나간다' },
    { ids: ['zmove'], desc: '전용 Z기술 (팀당 1회). 메가·거다이맥스와 따로 쓸 수 있다' },
    { ids: ['tera'], desc: '테라스탈 (팀당 1회). 팀 편성에서 고른 테라타입이 되고, 그 타입 기술은 자속이다. 원래 타입과 같으면 자속이 2배' },
    { ids: ['pause'], desc: '일시정지' },
  ];
  $('#helpKeys').innerHTML = rows.map(r => {
    const keys = r.ids.flatMap(id => Controls.codes(id)).map(c => `<kbd>${Controls.label(c)}</kbd>`).join('');
    return `<tr><td>${keys}</td><td>${r.desc}</td></tr>`;
  }).join('');
}
function buildKeys() {
  const box = $('#keyRows');
  box.innerHTML = '';
  const groups = document.createElement('div');
  groups.className = 'key-groups';
  let section = null;
  let last = '';
  for (const a of Controls.actions) {
    if (a.group !== last) {
      last = a.group;
      section = document.createElement('section');
      section.innerHTML = `<h3>${a.group}</h3>`;
      groups.appendChild(section);
    }
    const row = document.createElement('div');
    row.className = 'key-row';
    const lab = document.createElement('div');
    lab.className = 'key-label';
    lab.textContent = a.label;
    row.appendChild(lab);
    for (let slot = 0; slot < 2; slot++) {
      const b = document.createElement('button');
      const code = Controls.binds[a.id][slot];
      const listening = keyListen && keyListen.id === a.id && keyListen.slot === slot;
      b.type = 'button';
      b.className = 'keycap' + (listening ? ' listen' : '') + (code ? '' : ' empty');
      b.textContent = listening ? '입력…' : (code ? Controls.label(code) : '없음');
      b.onclick = () => {
        keyListen = { id: a.id, slot };
        keyMsg = '';
        Sound.play('select');
        buildKeys();
      };
      row.appendChild(b);
    }
    section.appendChild(row);
  }
  box.appendChild(groups);
  $('#keysHint').textContent = keyListen
    ? '원하는 키를 누르세요. Delete는 이 칸을 지우고, Esc는 취소합니다. Esc 키 자체는 지정할 수 없습니다.'
    : (keyMsg || '칸을 누른 뒤 원하는 키를 누르세요. 동작마다 키가 두 개까지 있고, 같은 키는 한 곳에만 쓸 수 있습니다.');
}
$('#btnMenuKeys').onclick = () => { Sound.play('select'); openKeys('menu'); };
$('#btnHelpKeys').onclick = () => { Sound.play('select'); openKeys('help'); };
$('#btnPauseKeys').onclick = () => { Sound.play('select'); openKeys('pause'); };
$('#btnKeysDone').onclick = () => { Sound.play('select'); closeKeys(); };
$('#btnKeysReset').onclick = () => {
  Controls.reset();
  keyListen = null;
  keyMsg = '기본 키로 되돌렸습니다.';
  Sound.play('select');
  buildKeys();
};

/* ---------------- 입력 ---------------- */
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.target.tagName === 'INPUT') return;
  if (keyListen) {
    e.preventDefault();
    if (e.code === 'Escape') {
      keyListen = null;
      Sound.play('back');
    } else if (e.code === 'Backspace' || e.code === 'Delete') {
      const ok = Controls.clear(keyListen.id, keyListen.slot);
      keyMsg = ok ? '' : '동작마다 키는 하나 이상 남겨 두세요.';
      keyListen = null;
      Sound.play(ok ? 'select' : 'back');
    } else if (Controls.assign(keyListen.id, keyListen.slot, e.code)) {
      keyListen = null;
      keyMsg = '';
      Sound.play('select');
    } else {
      Sound.play('back');
      return;
    }
    buildKeys();
    return;
  }
  Sound.init();
  if (!Input.down.has(e.code)) Input.pressed.add(e.code);
  Input.down.add(e.code);
  const keysOpen = !$('#screen-keys').classList.contains('hidden');
  if (game && !keysOpen) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) || Controls.owns(e.code)) e.preventDefault();
    if (Controls.pressed('pause') && !game.ended) setPaused(!game.paused);
  }
});
addEventListener('keyup', e => Input.down.delete(e.code));
addEventListener('blur', () => { Input.down.clear(); if (game && !game.ended) setPaused(true); });

/* ---------------- 화면 맞춤 & 터치 ---------------- */
var TouchStick = { x: 0, y: 0 };
var TouchHold = [false, false, false, false];

function fit() {
  const vv = window.visualViewport;
  const vw = vv ? vv.width : innerWidth;
  const vh = vv ? vv.height : innerHeight;
  const s = Math.min(vw / W, vh / H);
  const mobile = vw < 900;
  document.body.classList.toggle('mobile-layout', mobile);
  const stage = $('#stage');
  const pf = $('#playfield');
  if (mobile) {
    stage.style.transform = 'none';
    const fieldW = W * s, fieldH = H * s;
    const left = (vv ? vv.offsetLeft : 0) + (vw - fieldW) / 2;
    const top = (vv ? vv.offsetTop : 0) + (vh - fieldH) / 2;
    pf.style.left = (left + fieldW / 2) + 'px';
    pf.style.top = (top + fieldH / 2) + 'px';
    pf.style.transform = `translate(-50%, -50%) scale(${s})`;
    document.documentElement.style.setProperty('--field-left', left + 'px');
    document.documentElement.style.setProperty('--field-top', top + 'px');
    document.documentElement.style.setProperty('--field-h', fieldH + 'px');
    document.documentElement.style.setProperty('--letter', Math.max(0, vh - (top + fieldH)) + 'px');
  } else {
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    pf.style.left = '0';
    pf.style.top = '0';
    pf.style.transform = 'none';
    const left = (vw - W * s) / 2, top = (vh - H * s) / 2;
    document.documentElement.style.setProperty('--field-left', left + 'px');
    document.documentElement.style.setProperty('--field-top', top + 'px');
    document.documentElement.style.setProperty('--field-h', (H * s) + 'px');
    document.documentElement.style.setProperty('--letter', '0px');
  }
  const touch = document.body.classList.contains('touch-ui') && document.body.classList.contains('in-battle');
  const letter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--letter')) || 0;
  document.body.classList.toggle('touch-dock', touch && mobile && letter >= 130);
  document.body.classList.toggle('touch-overlay', touch && (!mobile || letter < 130));
}
function syncTouchMode() {
  const on = !!(game && game.playerSide() && !game.ended && !game.paused);
  if (document.body.classList.contains('in-battle') === on) return;
  document.body.classList.toggle('in-battle', on);
  if (!on) TouchHold.fill(false);
  fit();
}
function bindTouch() {
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch-ui');
  addEventListener('touchstart', () => {
    if (!document.body.classList.contains('touch-ui')) {
      document.body.classList.add('touch-ui');
      fit();
    }
  }, { passive: true });

  const stick = $('#stick'), knob = $('#knob');
  let pid = null;
  const place = (x, y) => {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = x - cx, dy = y - cy;
    const max = r.width * 0.42;
    const dist = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(dist, max);
    const nx = dx / dist, ny = dy / dist;
    const mag = clamped / max;
    TouchStick.x = mag < 0.18 ? 0 : nx * mag;
    TouchStick.y = mag < 0.18 ? 0 : ny * mag;
    knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
  };
  const releaseStick = () => {
    pid = null;
    TouchStick.x = TouchStick.y = 0;
    knob.style.transform = '';
  };
  stick.addEventListener('pointerdown', e => {
    pid = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    place(e.clientX, e.clientY);
    e.preventDefault();
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === pid) place(e.clientX, e.clientY); });
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);

  $('#touchpad').addEventListener('pointerdown', e => {
    const btn = e.target.closest('[data-act], [data-move], [data-slot]');
    if (!btn) return;
    const p = playerNow();
    if (!p) return;
    e.preventDefault();
    if (btn.dataset.move != null) {
      TouchHold[+btn.dataset.move] = true;
      btn.setPointerCapture(e.pointerId);
    } else if (btn.dataset.act === 'dodge') p.dodge([TouchStick.x || p.input.x, TouchStick.y || p.input.y]);
    else if (btn.dataset.act === 'switch') p.requestSwitch();
    else if (btn.dataset.act === 'mega') p.megaEvolve();
    else if (btn.dataset.act === 'gmax') p.gmaxEvolve();
    else if (btn.dataset.act === 'z') p.useZ();
    else if (btn.dataset.act === 'tera') p.terastallize();
    else if (btn.dataset.slot != null) commandSlot(+btn.dataset.slot);
  });
  const clearMove = e => {
    const btn = e.target.closest ? e.target.closest('[data-move]') : null;
    if (btn) TouchHold[+btn.dataset.move] = false;
  };
  $('#touchpad').addEventListener('pointerup', clearMove);
  $('#touchpad').addEventListener('pointercancel', () => TouchHold.fill(false));
}
function updateTouchPad(p) {
  if (!document.body.classList.contains('touch-dock') || !p) return;
  const box = $('#touchMoves');
  if (box.childElementCount !== p.mon.moves.length) {
    box.innerHTML = p.mon.moves.map((_, i) => `<button type="button" data-move="${i}"><b></b><small></small></button>`).join('');
  }
  [...box.children].forEach((el, i) => {
    const sl = p.mon.moves[i];
    const mv = battleMove(p, sl && sl.pp <= 0 ? 'struggle' : sl.id);
    const name = el.querySelector('b'), sub = el.querySelector('small');
    if (name.textContent !== mv.name) name.textContent = mv.name;
    const pp = sl.pp <= 0 ? '발버둥' : `PP ${sl.pp}`;
    if (sub.textContent !== pp) sub.textContent = pp;
  });
  const team = $('#touchTeam');
  if (game.ffa) { if (team.innerHTML) team.innerHTML = ''; return; }
  if (team.childElementCount !== p.team.length) {
    team.innerHTML = p.team.map((_, i) => `<button type="button" data-slot="${i}">${i + 1}</button>`).join('');
  }
  [...team.children].forEach((el, i) => {
    el.classList.toggle('on', i === p.active);
    el.disabled = p.team[i].fainted;
  });
}

bindTouch();
addEventListener('resize', fit);
if (window.visualViewport) visualViewport.addEventListener('resize', fit);
fit();

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - lastT) / 1000);
  lastT = now;
  if (game) {
    if (!game.paused) game.update(dt);
    game.render();
    updateHUD();
    const touchSide = game.playerSide();
    if (touchSide) updateTouchPad(touchSide);
    syncTouchMode();
  } else if (document.body.classList.contains('in-battle')) syncTouchMode();
  Input.pressed.clear();
  requestAnimationFrame(frame);
}

bindHUD();
drawArena($('#bg').getContext('2d'), ARENAS[UI.arena]);

show('menu');
if (location.hash === '#watch') startWatch();
requestAnimationFrame(frame);
