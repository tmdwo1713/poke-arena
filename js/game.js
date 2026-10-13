'use strict';

const W = 1280, H = 720;
const SPRITE_SCALE = 1.6;
const DMG_SCALE = 0.38;
const TIME_LIMIT = 300;
const WEATHER_TIME = 25;
const MOLD_BREAKERS = ['moldbreaker', 'turboblaze', 'teravolt'];
const NO_TRACE = ['trace', 'wonderguard', 'disguise', 'multitype', 'imposter'];
const WEATHER = {
  sun:  { ko: '쾌청',     primalKo: '큰가뭄', start: '햇살이 강해졌다!',          primalStart: '햇살이 매우 강해졌다!',     color: '#ffb340' },
  rain: { ko: '비',       primalKo: '큰비',   start: '비가 내리기 시작했다!',     primalStart: '폭우가 쏟아지기 시작했다!', color: '#5aa0ff' },
  sand: { ko: '모래바람', primalKo: '모래바람', start: '모래바람이 불기 시작했다!', primalStart: '모래바람이 불기 시작했다!', color: '#d8b070' },
  snow: { ko: '눈',       primalKo: '눈',     start: '눈이 내리기 시작했다!',     primalStart: '눈이 내리기 시작했다!',     color: '#d7ecff' },
};
const FFA_COLORS = ['#4fb3ff', '#ff5a5a', '#4ade80', '#facc15', '#c084fc', '#fb923c'];
const FFA_SPAWNS = [
  [200, 150], [-200, 150], [200, -150], [-200, -150], [-160, 0], [160, 0],
];
for (const [id, mv] of Object.entries(MOVES)) mv.id = id;
const LIFT = 22; // 지면 좌표 기준, 몸통/투사체를 그릴 높이
const DEFAULT_KB = { proj: 220, beam: 320, melee: 300, dash: 360, nova: 320, target: 260 };
const STATUS_TIME = { brn: 6, psn: 8, par: 5, frz: 1.3 };
const STATUS_IMMUNE = { brn: ['fire'], par: ['electric'], frz: ['ice'], psn: ['poison', 'steel'] };
const KIND_KO = { proj: '투사체', beam: '광선', melee: '근접', dash: '돌진', nova: '광역', target: '낙하' };

const MOVE_KEYS = [['KeyJ', 'Digit1'], ['KeyK', 'Digit2'], ['KeyL', 'Digit3'], ['KeyI', 'Digit4']];
const DODGE_KEYS = ['Space', 'ShiftLeft', 'ShiftRight'];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function norm(x, y) {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? [x / l, y / l] : [0, 0];
}
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}
function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return a;
  return (c - 0xac00) % 28 ? a : b;
}

function calcStats(sp, level) {
  const [h, a, d, sa, sd, s] = sp.base;
  const f = b => Math.floor((2 * b + 31) * level / 100) + 5;
  return { hp: Math.floor((2 * h + 31) * level / 100) + level + 10, atk: f(a), def: f(d), spa: f(sa), spd: f(sd), spe: f(s) };
}

function makeMon(entry, level, opts = {}) {
  const n = normalizeEntry(entry);
  if (!n) throw new Error('unknown pokemon ' + JSON.stringify(entry));
  const baseSp = POKEMON_BY_KEY[n.key];
  if (baseSp.fixedLevel) level = baseSp.fixedLevel;
  const sp = baseSp.primal || baseSp.crown || baseSp;
  const ids = opts.randomize ? randomMoves(baseSp) : n.moves;
  const stats = calcStats(sp, level);
  if (baseSp.fixedHp) stats.hp = baseSp.fixedHp;
  const hpMult = opts.hpMult > 1 ? opts.hpMult : 1;
  const maxHp = Math.round(stats.hp * hpMult);
  return {
    baseSp, sp, level, stats, hp: maxHp, maxHp, hpMult,
    boss: hpMult > 1, phase1: false, phase2: false,
    moves: ids.map(id => ({ id, pp: MOVES[id].pp, maxPp: MOVES[id].pp, cd: 0 })),
    status: null, statusT: 0, fainted: false,
    ability: sp.ability, atkMod: 1, defMod: 1, speMod: 1, spaMod: 1,
    flashFire: false, disguiseBroken: false,
    megaIdx: n.mega || 0, megaed: false, transformed: false,
  };
}

function attackType(srcMon, mv) {
  if (mv.type === 'normal') {
    if (srcMon.ability === 'pixilate') return 'fairy';
    if (srcMon.ability === 'aerilate') return 'flying';
    if (srcMon.ability === 'dragonize') return 'dragon';
  }
  return mv.type;
}

// 공격 기술을 특성으로 완전히 막는지 판정 (막으면 특성 키 반환)
function abilityBlock(defAbility, mv, eff, atkType) {
  const t = atkType || mv.type;
  switch (defAbility) {
    case 'wonderguard': return t !== 'none' && eff <= 1 ? defAbility : null;
    case 'levitate': return t === 'ground' ? defAbility : null;
    case 'voltabsorb': case 'lightningrod': case 'motordrive': return t === 'electric' ? defAbility : null;
    case 'waterabsorb': return t === 'water' ? defAbility : null;
    case 'flashfire': return t === 'fire' ? defAbility : null;
    case 'sapsipper': return t === 'grass' ? defAbility : null;
    case 'bulletproof': return mv.ball ? defAbility : null;
  }
  return null;
}

function typeEffFor(srcMon, mv, defMon, game) {
  const atk = attackType(srcMon, mv);
  if (atk === 'none') return 1;
  let types = defMon.sp.types.slice();
  if (srcMon.ability === 'scrappy' && (atk === 'normal' || atk === 'fighting')) types = types.filter(t => t !== 'ghost');
  let eff = typeEffect(atk, types);
  if (mv.freezeDry && types.includes('water')) eff *= 4;
  if (game && game.hasDeltaStream() && types.includes('flying') && eff > 1 && ['electric', 'ice', 'rock'].includes(atk)) eff /= 2;
  return eff;
}

// AI용: 특성까지 고려한 실제 효과 배율 (0이면 통하지 않음)
function moveEffect(srcMon, mv, defMon, game) {
  const atk = attackType(srcMon, mv);
  const eff = typeEffFor(srcMon, mv, defMon, game);
  if (!MOLD_BREAKERS.includes(srcMon.ability) && abilityBlock(defMon.ability, mv, eff, atk)) return 0;
  return eff;
}

const radiusCache = {};

/* ------------------------------------------------------------------ */
/*  Side: 한쪽 트레이너(팀 + 필드 위의 활성 포켓몬)                      */
/* ------------------------------------------------------------------ */
class Side {
  constructor(game, idx, team, cpu, diff) {
    this.g = game;
    this.idx = idx;
    this.team = team;
    this.active = 0;
    const B = ARENA_BOUNDS;
    if (game.opts.ffa) {
      const sp = FFA_SPAWNS[idx] || [0, 0];
      this.x = B.x + B.w / 2 + sp[0];
      this.y = B.y + B.h / 2 + sp[1];
      this.face = norm(B.x + B.w / 2 - this.x, B.y + B.h / 2 - this.y);
    } else {
      this.x = idx === 0 ? B.x + 170 : B.x + B.w - 170;
      this.y = B.y + B.h / 2;
      this.face = [idx === 0 ? 1 : -1, 0];
    }
    this.vx = this.vy = this.kx = this.ky = 0;
    this.input = { x: 0, y: 0 };
    this.r = 22;
    this.dodgeT = 0; this.dodgeCd = 0; this.iframes = 0; this.dodgeDir = [0, 0];
    this.switchCd = 0; this.switching = 0; this.switchTo = -1; this.swapped = false;
    this.stun = 0; this.gcd = 0; this.struggleCd = 0;
    this.cast = null; this.dash = null;
    this.flash = 0; this.faintT = 0; this.hazardT = 0.25; this.dotT = 1;
    this.moving = false;
    this.ko = 0; this.dealt = 0;
    this.fieldT = 0;
    this.popT = {};

    this.elF = this.makeImg();
    this.elB = this.makeImg();
    this.back = false;
    this.applySprite();
    this.ai = cpu ? new AI(this, diff) : null;
  }

  makeImg() {
    const el = document.createElement('img');
    el.className = 'mon';
    el.draggable = false;
    el.alt = '';
    this.g.spriteLayer.appendChild(el);
    return el;
  }

  get mon() { return this.team[this.active]; }
  get foe() { return this.g.nearestFoe(this); }
  get el() { return this.back ? this.elB : this.elF; }
  aliveCount() { return this.team.filter(m => !m.fainted).length; }
  spriteScale() { return SPRITE_SCALE * (this.mon && this.mon.boss ? 1.75 : 1); }
  spriteH() { return (this.el.naturalHeight || 40) * this.spriteScale(); }

  applySprite() {
    const id = this.mon.sp.id;
    for (const [el, back] of [[this.elF, false], [this.elB, true]]) {
      el.onload = () => {
        const sc = this.spriteScale();
        el.style.width = el.naturalWidth * sc + 'px';
        el.style.height = el.naturalHeight * sc + 'px';
        if (!back && this.mon.sp.id === id) {
          const key = id + (this.mon.boss ? ':b' : '');
          radiusCache[key] = clamp(el.naturalWidth * sc * 0.27, 16, this.mon.boss ? 58 : 40);
          this.r = radiusCache[key];
        }
      };
      setSprite(el, id, back);
    }
    this.r = radiusCache[id] || 22;
  }

  speed() {
    let s = 140 + this.mon.stats.spe * 1.15 * (this.mon.speMod || 1);
    if (this.mon.status === 'par') s *= 0.55;
    if (this.mon.ability === 'speedboost') s *= 1 + Math.min(0.5, this.fieldT * 0.02);
    const w = this.g.weatherNow();
    if (this.mon.ability === 'chlorophyll' && w === 'sun') s *= 1.5;
    if (this.mon.ability === 'swiftswim' && w === 'rain') s *= 1.5;
    return s;
  }

  floats() {
    return this.mon.ability === 'levitate' || this.mon.sp.types.includes('fire');
  }

  canAct() {
    return this.g.state === 'fight' && this.faintT <= 0 && !this.mon.fainted && this.switching <= 0 &&
      this.stun <= 0 && !this.cast && !this.dash && this.dodgeT <= 0 && this.gcd <= 0;
  }

  useMove(i) {
    if (!this.canAct()) return false;
    const slot = this.mon.moves[i];
    if (!slot) return false;
    let id = slot.id;
    if (slot.pp <= 0) {
      if (this.struggleCd > 0) return false;
      id = 'struggle';
      this.struggleCd = MOVES.struggle.cd;
    } else {
      if (slot.cd > 0) return false;
      const f = this.foe;
      const pressure = f && this.g.targetable(f) && f.mon.ability === 'pressure';
      slot.pp = Math.max(0, slot.pp - (pressure ? 2 : 1));
      slot.cd = MOVES[id].cd;
    }
    this.gcd = 0.25;
    this.g.performMove(this, id);
    return true;
  }

  aim(mv) {
    const f = this.foe;
    if (!f) return this.face;
    let tx = f.x, ty = f.y;
    if (!this.ai) return norm(tx - this.x, ty - this.y);
    if (mv.kind === 'proj') {
      const t = Math.hypot(tx - this.x, ty - this.y) / mv.speed * this.ai.d;
      tx += f.vx * t;
      ty += f.vy * t;
    }
    const a = Math.atan2(ty - this.y, tx - this.x) + (1 - this.ai.d) * 0.35 * (Math.random() * 2 - 1);
    return [Math.cos(a), Math.sin(a)];
  }

  dodge(dir) {
    if (this.g.state !== 'fight' || this.dodgeCd > 0 || this.dodgeT > 0 || this.stun > 0 || this.dash ||
        this.switching > 0 || this.faintT > 0 || this.mon.fainted) return false;
    this.cast = null;
    let [dx, dy] = norm(dir[0], dir[1]);
    if (!dx && !dy) [dx, dy] = this.face;
    this.dodgeDir = [dx, dy];
    this.dodgeT = 0.2;
    this.iframes = 0.3;
    this.dodgeCd = this.mon.ability === 'tangledfeet' && this.mon.status ? 0.45 : 0.9;
    this.g.dust(this.x, this.y, 10);
    Sound.play('dodge');
    return true;
  }

  requestSwitch(to, dir = 1) {
    if (this.g.state !== 'fight' || this.switchCd > 0 || this.switching > 0 || this.faintT > 0 ||
        this.stun > 0 || this.dash || this.mon.fainted) return false;
    if (to === undefined) {
      const n = this.team.length;
      for (let k = 1; k < n; k++) {
        const i = (this.active + k * dir + n * k) % n;
        if (!this.team[i].fainted) { to = i; break; }
      }
    }
    if (to === undefined || to === this.active || !this.team[to] || this.team[to].fainted) return false;
    const f = this.foe;
    if (f && this.g.targetable(f) && f.switching <= 0 && f.mon.ability === 'shadowtag' && !this.mon.sp.types.includes('ghost')) {
      this.g.abilityPop(f, 'shadowtag');
      this.g.text(this.x, this.y - this.spriteH() - 20, '교체할 수 없다!', '#c9a0ff', 15, 1);
      return false;
    }
    this.cast = null;
    this.switching = 0.6;
    this.switchTo = to;
    this.swapped = false;
    this.switchCd = 3.5;
    Sound.play('switch');
    return true;
  }

  canMega() {
    return this.g.megaOK[this.idx] && this.mon.baseSp.megas && !this.mon.megaed && !this.mon.transformed &&
      this.faintT <= 0 && !this.mon.fainted && this.switching <= 0;
  }

  megaEvolve() {
    if (!this.canMega()) return false;
    const form = this.mon.baseSp.megas[this.mon.megaIdx || 0];
    const ratio = this.mon.hp / this.mon.maxHp;
    this.mon.sp = form;
    this.mon.ability = form.ability;
    this.mon.stats = calcStats(form, this.mon.level);
    this.mon.maxHp = Math.round(this.mon.stats.hp * (this.mon.hpMult || 1));
    this.mon.hp = Math.max(1, Math.round(this.mon.maxHp * ratio));
    this.mon.megaed = true;
    this.g.megaOK[this.idx] = false;
    this.applySprite();
    this.g.burst(this.x, this.y - LIFT, '#ffe14d', 24, 280);
    this.g.effects.push({ type: 'ring', x: this.x, y: this.y, r: 90, color: '#ffe14d', life: 0.55, max: 0.55 });
    this.g.banner(`${this.mon.sp.name}!`, true);
    Sound.play('super');
    this.g.onEntry(this);
    return true;
  }

  sendOut(idx) {
    const prev = this.mon;
    if (!prev.fainted && prev.ability === 'regenerator' && prev.hp < prev.maxHp) {
      prev.hp = Math.min(prev.maxHp, prev.hp + Math.round(prev.maxHp / 3));
    }
    if (!prev.fainted && prev.ability === 'naturalcure') prev.status = null;
    if (prev.transformed) {
      prev.sp = prev.baseSp.primal || prev.baseSp.crown || prev.baseSp;
      prev.stats = calcStats(prev.sp, prev.level);
      if (prev.baseSp.fixedHp) prev.stats.hp = prev.baseSp.fixedHp;
      prev.ability = prev.sp.ability;
      prev.moves = prev.origMoves;
      prev.transformed = false;
      prev.hp = Math.min(prev.hp, prev.maxHp);
    }
    prev.ability = prev.sp.ability;
    prev.atkMod = 1;
    prev.defMod = 1;
    prev.speMod = 1;
    prev.spaMod = 1;
    prev.flashFire = false;
    this.active = idx;
    this.cast = null;
    this.dash = null;
    this.stun = 0;
    this.kx = this.ky = 0;
    this.iframes = 0.5;
    this.back = false;
    this.applySprite();
    this.g.effects.push({ type: 'pokeball', x: this.x, y: this.y, life: 0.45, max: 0.45 });
    const name = this.mon.sp.name;
    if (this.g.ffa) this.g.banner(`${name} 등장!`);
    else this.g.banner(this.idx === 0 ? `가랏! ${name}!` : `상대는 ${name}${josa(name, '을', '를')} 내보냈다!`);
    this.g.onEntry(this);
  }

  update(dt) {
    const g = this.g;
    for (const mon of this.team) for (const sl of mon.moves) if (sl.cd > 0) sl.cd -= dt;
    this.dodgeCd -= dt; this.iframes -= dt; this.switchCd -= dt; this.gcd -= dt;
    this.struggleCd -= dt; this.flash -= dt;
    if (this.stun > 0) this.stun -= dt;

    if (this.faintT > 0) {
      this.faintT -= dt;
      if (this.faintT <= 0) {
        const next = this.team.findIndex(x => !x.fainted);
        if (next >= 0) this.sendOut(next);
      }
      return;
    }
    if (this.mon.fainted) return;

    if (this.switching > 0) {
      this.switching -= dt;
      if (!this.swapped && this.switching <= 0.3) {
        this.swapped = true;
        this.sendOut(this.switchTo);
      }
      this.vx *= 0.8; this.vy *= 0.8;
      return;
    }

    const m = this.mon;
    if (m.status) {
      m.statusT -= dt;
      if (m.status === 'brn' || m.status === 'psn') {
        this.dotT -= dt;
        if (this.dotT <= 0) {
          this.dotT = 1;
          g.damageSelf(this, Math.max(1, Math.round(m.maxHp * (m.status === 'brn' ? 0.03 : 0.035))), STATUS[m.status].color);
          if (m.fainted) return;
        }
      }
      if (m.statusT <= 0) m.status = null;
    }

    this.fieldT += dt;
    if (g.arena.hazards.length && !this.floats()) {
      const inLava = g.arena.hazards.some(h => Math.hypot(this.x - h.x, this.y - h.y) < h.r - 6);
      if (inLava && this.dodgeT <= 0) {
        this.hazardT -= dt;
        if (this.hazardT <= 0) {
          this.hazardT = 0.5;
          g.damageSelf(this, Math.max(1, Math.round(m.maxHp * 0.03)), '#ff7a2a');
          if (m.fainted) return;
          if (!m.status && Math.random() < 0.15) g.applyStatus(this, 'brn');
        }
      } else this.hazardT = 0.25;
    }

    if (this.ai) this.ai.update(dt);
    const [ix, iy] = norm(this.input.x, this.input.y);

    const canMove = this.stun <= 0 && !this.dash && this.dodgeT <= 0 && g.state === 'fight';
    let sp = this.speed();
    if (this.cast) sp *= this.cast.slow;
    const tx = canMove ? ix * sp : 0, ty = canMove ? iy * sp : 0;
    const fr = Math.min(1, g.arena.friction * dt);
    this.vx += (tx - this.vx) * fr;
    this.vy += (ty - this.vy) * fr;
    if (canMove && (ix || iy) && !this.cast) this.face = [ix, iy];
    this.moving = canMove && !!(ix || iy);

    let mvx = this.vx, mvy = this.vy;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      mvx = this.dodgeDir[0] * 640;
      mvy = this.dodgeDir[1] * 640;
      this.vx = mvx * 0.35;
      this.vy = mvy * 0.35;
    }
    if (this.dash) {
      mvx = this.dash.dir[0] * this.dash.speed;
      mvy = this.dash.dir[1] * this.dash.speed;
    }
    mvx += this.kx; mvy += this.ky;
    const kd = Math.exp(-7 * dt);
    this.kx *= kd; this.ky *= kd;

    this.x += mvx * dt;
    this.y += mvy * dt;
    const blocked = g.collide(this);
    if (blocked) { this.kx *= 0.5; this.ky *= 0.5; }

    if (this.dash) this.updateDash(dt, blocked);
    if (this.cast) {
      this.cast.t -= dt;
      if (this.cast.t <= 0) {
        const c = this.cast;
        this.cast = null;
        g.resolveCast(this, c);
      }
    }
  }

  updateDash(dt, blocked) {
    const d = this.dash;
    d.t -= dt;
    this.g.trail(this, d.mv);
    if (!d.hit) {
      for (const f of this.g.enemies(this)) {
        if (Math.hypot(f.x - this.x, f.y - this.y) < this.r + f.r + 6) {
          const res = this.g.applyHit(this, this.mon, f, d.mv, d.dir, d.seq);
          if (!this.dash) return;
          if (res !== 'miss') {
            d.hit = true;
            d.landed = true;
            if (res === 'hit' && d.mv.pivot) d.pivot = true;
            this.endDash();
            return;
          }
        }
      }
    }
    if (blocked || d.t <= 0) this.endDash();
  }

  endDash() {
    const d = this.dash;
    if (!d) return;
    this.dash = null;
    const back = d.landed ? -160 : 120;
    this.vx = d.dir[0] * back;
    this.vy = d.dir[1] * back;
    if (!d.landed && d.mv.crash && !this.mon.fainted) {
      this.g.text(this.x, this.y - this.spriteH() - 10, '빗나가서 넘어졌다!', '#ffb0b0', 15, 1);
      this.g.damageSelf(this, Math.round(this.mon.maxHp * d.mv.crash), '#ff6b6b');
    }
    if (d.mv.selfStun) this.stun = d.mv.selfStun;
    if (d.pivot && !this.mon.fainted && this.aliveCount() > 1) {
      this.g.text(this.x, this.y - this.spriteH() - 28, '유턴!', TYPES.bug.color, 16, 0.8);
      this.requestSwitch();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  CPU AI                                                              */
/* ------------------------------------------------------------------ */
class AI {
  constructor(side, diff) {
    this.s = side;
    this.d = diff;
    this.think = 0.4;
    this.intent = -1;
    this.pref = 260;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(0.8, 2);
    this.dodgeCheck = 0;
    this.patience = 0;
  }

  static idealRange(mv) {
    switch (mv.kind) {
      case 'proj': return Math.min(mv.range * 0.6, 320);
      case 'beam': return Math.min(mv.length * 0.5, 320);
      case 'target': return 280;
      case 'melee': return mv.reach * 0.6;
      case 'dash': return mv.dist * 0.65;
      case 'nova': return mv.radius * 0.55;
    }
    return 250;
  }

  inRange(mv, d, f) {
    switch (mv.kind) {
      case 'proj': return d < mv.range * 0.85;
      case 'beam': return d < mv.length * 0.9;
      case 'target': return d < 620;
      case 'melee': return d < mv.reach + f.r;
      case 'dash': return d < mv.dist + f.r;
      case 'nova': return d < mv.radius + f.r * 0.4;
    }
    return false;
  }

  findThreat() {
    const s = this.s, g = s.g;
    for (const p of g.projectiles) {
      if (p.owner === s || p.aiSeen) continue;
      const rx = s.x - p.x, ry = s.y - p.y;
      const v2 = p.vx * p.vx + p.vy * p.vy;
      const t = (rx * p.vx + ry * p.vy) / v2;
      if (t < 0 || t > 0.45) continue;
      const cx = p.x + p.vx * t - s.x, cy = p.y + p.vy * t - s.y;
      if (Math.hypot(cx, cy) > p.r + s.r + 10) continue;
      p.aiSeen = true;
      const [nx, ny] = norm(-p.vy, p.vx);
      const side = (rx * nx + ry * ny) >= 0 ? 1 : -1;
      return [nx * side, ny * side];
    }
    for (const f of g.enemies(s)) {
      if (f.cast && !f.cast.aiSeen && f.cast.t < 0.3) {
        f.cast.aiSeen = true;
        if (f.cast.kind === 'beam') return [-f.cast.aim[1], f.cast.aim[0]];
        if (Math.hypot(f.x - s.x, f.y - s.y) < (f.cast.mv.reach || f.cast.mv.radius || 0) + s.r + 20) return norm(s.x - f.x, s.y - f.y);
      }
      if (f.dash && !f.dash.aiSeen && Math.hypot(f.x - s.x, f.y - s.y) < 220) {
        f.dash.aiSeen = true;
        return [-f.dash.dir[1], f.dash.dir[0]];
      }
    }
    return null;
  }

  choose() {
    const s = this.s, f = s.foe, m = s.mon;
    if (!f) { this.intent = -1; return; }
    const alive = s.team.map((x, i) => i).filter(i => i !== s.active && !s.team[i].fainted);

    if (s.canMega() && Math.random() < 0.4 + 0.5 * this.d) s.megaEvolve();
    const bestEff = c => Math.max(...c.moves.map(sl => moveEffect(c, MOVES[sl.id], f.mon, s.g)));
    const threatTo = c => Math.max(...f.mon.moves.map(sl => moveEffect(f.mon, MOVES[sl.id], c, s.g)));
    if (s.switchCd <= 0 && alive.length) {
      const myBest = bestEff(m);
      const threat = threatTo(m);
      const hpR = m.hp / m.maxHp;
      const walled = myBest === 0 && alive.some(i => bestEff(s.team[i]) > 0);
      if (walled && Math.random() < 0.4 + 0.6 * this.d ||
          (hpR < 0.25 && Math.random() < 0.25 * this.d) || (myBest < 1 && threat >= 2 && Math.random() < 0.5 * this.d)) {
        let best = alive[0], bs = -Infinity;
        for (const i of alive) {
          const c = s.team[i];
          const sc = bestEff(c) * 1.5 - threatTo(c) + c.hp / c.maxHp;
          if (sc > bs) { bs = sc; best = i; }
        }
        if (s.requestSwitch(best)) return;
      }
    }

    let best = -1, bs = 0;
    m.moves.forEach((sl, i) => {
      if (sl.pp <= 0 || sl.cd > 0) return;
      const mv = MOVES[sl.id];
      const eff = moveEffect(m, mv, f.mon, s.g);
      if (eff === 0) return;
      const stab = m.sp.types.includes(mv.type) ? 1.5 : 1;
      const atk = mv.cat === 'phy' ? m.stats.atk : m.stats.spa;
      const sc = mv.power * eff * stab * atk * rand(0.6, 1.4) * (this.d > 0.5 ? 1 : rand(0.5, 1.5));
      if (sc > bs) { bs = sc; best = i; }
    });
    if (best < 0 && m.moves.every(sl => sl.pp <= 0)) best = 0;
    this.intent = best;
    const mv = best >= 0 ? MOVES[m.moves[best].pp > 0 ? m.moves[best].id : 'struggle'] : null;
    this.pref = mv ? AI.idealRange(mv) : 280;
    this.patience = 2.5;
  }

  update(dt) {
    const s = this.s, f = s.foe, g = s.g;
    s.input.x = 0; s.input.y = 0;
    if (g.state !== 'fight' || s.faintT > 0 || s.switching > 0 || s.mon.fainted || !f) return;

    const dx = f.x - s.x, dy = f.y - s.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;

    this.dodgeCheck -= dt;
    if (this.dodgeCheck <= 0) {
      this.dodgeCheck = 0.06;
      const threat = this.findThreat();
      if (threat && Math.random() < this.d * 0.8) s.dodge(threat);
    }

    for (const tg of g.telegraphs) {
      if (tg.owner === s) continue;
      if (Math.hypot(tg.x - s.x, tg.y - s.y) < tg.r + s.r + 8 && (tg.t < tg.max * (0.3 + this.d * 0.7))) {
        const [ex, ey] = norm(s.x - tg.x, s.y - tg.y);
        [s.input.x, s.input.y] = g.steer(s, ex || 1, ey);
        return;
      }
    }

    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.6 - this.d * 0.35 + Math.random() * 0.2;
      if (this.intent < 0 || Math.random() < 0.3) this.choose();
    }

    let mx = 0, my = 0;
    const pref = this.pref;
    if (d > pref + 35) { mx = ux; my = uy; }
    else if (d < pref - 35) { mx = -ux; my = -uy; }
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(0.8, 2.2); }
    const sw = d < pref + 120 ? 0.8 : 0.3;
    mx += -uy * this.strafe * sw;
    my += ux * this.strafe * sw;
    [s.input.x, s.input.y] = g.steer(s, mx, my);

    if (this.intent >= 0) {
      const sl = s.mon.moves[this.intent];
      const mv = MOVES[sl.pp > 0 ? sl.id : 'struggle'];
      this.patience -= dt;
      if (this.inRange(mv, d, f) && s.canAct()) {
        if (s.useMove(this.intent)) { this.intent = -1; this.think = 0.15 + (1 - this.d) * 0.4; }
      } else if (this.patience <= 0) {
        this.intent = -1;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Game                                                                */
/* ------------------------------------------------------------------ */
class Game {
  constructor(opts) {
    this.opts = opts;
    this.arena = ARENAS[opts.arena];
    this.world = document.getElementById('world');
    this.bg = document.getElementById('bg').getContext('2d');
    this.under = document.getElementById('under').getContext('2d');
    this.over = document.getElementById('over').getContext('2d');
    this.spriteLayer = document.getElementById('sprites');
    this.spriteLayer.innerHTML = '';
    drawArena(this.bg, this.arena);

    this.playerIdx = 0;
    this.ffa = !!opts.ffa;
    this.boss = !!opts.boss;
    this.sides = [];
    let allMons;
    if (opts.ffa) {
      const roster = opts.playerTeam.map(k => makeMon(k, opts.playerLevel || 50));
      this.megaOK = roster.map(() => true);
      roster.forEach((m, i) => this.sides.push(new Side(this, i, [m], i !== 0 || !!opts.watch, opts.diff)));
      allMons = roster;
    } else {
      const pTeam = opts.playerTeam.map(k => makeMon(k, opts.playerLevel || 50));
      const cTeam = opts.cpuTeam.map(k => makeMon(k, opts.cpuLevel || 50, { randomize: opts.randomCpu, hpMult: opts.hpMult }));
      this.megaOK = [true, true];
      this.sides.push(new Side(this, 0, pTeam, !!opts.watch, opts.diff));
      this.sides.push(new Side(this, 1, cTeam, true, opts.diff));
      allMons = [...pTeam, ...cTeam];
    }
    for (const m of allMons) {
      const ids = [m.sp.id, ...(m.baseSp.megas || []).map(f => f.id)];
      if (m.baseSp.primal) ids.push(m.baseSp.primal.id);
      if (m.baseSp.crown) ids.push(m.baseSp.crown.id);
      for (const id of ids) {
        setSprite(new Image(), id, false);
        setSprite(new Image(), id, true);
      }
    }

    this.projectiles = [];
    this.effects = [];
    this.particles = [];
    this.texts = [];
    this.telegraphs = [];
    this.orbs = [];
    this.missShown = new Set();
    this.hitSeqs = new Set();
    this.orbTimer = 10;
    this.time = 0;
    this.clock = 0;
    this.state = 'intro';
    this.stateT = 2.0;
    this.shake = 0;
    this.hitstop = 0;
    this.castSeq = 0;
    this.paused = false;
    this.winner = -1;
    this.ended = false;
    this.weather = null;
    this.sandT = 2;
    this.dreamT = 2;
    this.banner('READY...', true);
    Sound.play('start');
    for (const s of this.sides) this.onEntry(s);
  }

  destroy() {
    this.spriteLayer.innerHTML = '';
    this.under.clearRect(0, 0, W, H);
    this.over.clearRect(0, 0, W, H);
    this.world.style.transform = '';
  }

  checkBoss(mon) {
    if (!mon.boss) return;
    const ratio = mon.hp / mon.maxHp;
    const rage = (label) => {
      mon.atkMod *= 1.2;
      mon.spaMod = (mon.spaMod || 1) * 1.2;
      this.banner(label, true);
      this.shake = Math.max(this.shake, 10);
      const s = this.sides.find(sd => sd.mon === mon);
      if (s) this.text(s.x, s.y - s.spriteH() - 36, label, '#ffd24a', 18, 1.2);
    };
    if (!mon.phase1 && ratio <= 0.5) { mon.phase1 = true; rage('보스가 분노했다!'); }
    else if (mon.phase1 && !mon.phase2 && ratio <= 0.25) { mon.phase2 = true; rage('보스가 폭주한다!'); }
  }

  banner(text, big) {
    const el = document.getElementById('banner');
    el.textContent = text;
    el.className = big ? 'show big' : 'show';
    void el.offsetWidth;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => { el.className = ''; }, big ? 1300 : 1500);
  }

  /* ---------------- update ---------------- */
  update(dt) {
    this.clock += dt;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }

    if (this.state === 'intro') {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.state = 'fight';
        this.banner(this.boss ? `${this.sides[1].mon.sp.name} 등장!` : 'FIGHT!', true);
        Sound.play('fight');
      }
    } else if (this.state === 'fight') {
      this.time += dt;
      this.updateWeather(dt);
      this.updateBadDreams(dt);
      if (this.time >= TIME_LIMIT) this.timeUp();
    } else if (this.state === 'end') {
      this.stateT -= dt;
      if (this.stateT <= 0 && !this.ended) {
        this.ended = true;
        this.opts.onEnd(this.result());
      }
    }

    const p = this.playerSide();
    if (p && !p.ai) this.readPlayerInput(p);

    for (const s of this.sides) s.update(dt);
    this.separate();
    this.updateProjectiles(dt);
    this.updateTelegraphs(dt);
    this.updateOrbs(dt);
    this.updateFx(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  readPlayerInput(p) {
    if (this.state === 'fight') {
      let x = 0, y = 0;
      const k = Input.down;
      if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      p.input.x = x; p.input.y = y;
      MOVE_KEYS.forEach((codes, i) => { if (codes.some(c => k.has(c))) p.useMove(i); });
      if (DODGE_KEYS.some(c => Input.pressed.has(c))) p.dodge([x, y]);
      if (!this.ffa) {
        if (Input.pressed.has('KeyQ')) p.requestSwitch();
        if (Input.pressed.has('KeyE')) p.requestSwitch(undefined, -1);
      }
      if (Input.pressed.has('KeyR')) p.megaEvolve();
    } else {
      p.input.x = p.input.y = 0;
    }
  }

  /* ---------------- abilities & weather ---------------- */
  abilityPop(s, ab, label) {
    const now = this.clock;
    if (s.popT[ab] && now - s.popT[ab] < 0.8) return;
    s.popT[ab] = now;
    this.text(s.x, s.y - s.spriteH() - 40, `《${label || ABILITIES[ab].name}》`, '#e9d8ff', 15, 1.2, true);
  }

  hasDeltaStream() {
    return this.sides.some(s => this.targetable(s) && s.switching <= 0 && s.mon.ability === 'deltastream');
  }

  transformInto(s, target) {
    const m = s.mon;
    if (m.transformed || target.transformed || target.baseSp.key === 'ditto' || target.ability === 'imposter') return false;
    m.transformed = true;
    m.origMoves = m.moves.map(sl => ({ ...sl }));
    m.sp = target.sp;
    m.ability = target.ability;
    const hp = m.hp, maxHp = m.maxHp;
    m.stats = { ...target.stats, hp: m.stats.hp };
    m.hp = hp;
    m.maxHp = maxHp;
    m.atkMod = target.atkMod;
    m.defMod = target.defMod;
    m.speMod = target.speMod;
    m.spaMod = target.spaMod;
    m.flashFire = target.flashFire;
    m.disguiseBroken = target.disguiseBroken;
    m.moves = target.moves.map(sl => ({ id: sl.id, pp: 5, maxPp: 5, cd: 0 }));
    s.applySprite();
    this.abilityPop(s, 'imposter', `변신 → ${m.sp.name}`);
    return true;
  }

  playerSide() {
    if (this.opts.watch) return null;
    return this.sides[this.playerIdx || 0];
  }
  enemies(s) {
    return this.sides.filter(o => o !== s && this.targetable(o) && o.switching <= 0);
  }
  livingSides() {
    return this.sides.filter(s => s.aliveCount() > 0);
  }
  nearestFoe(s) {
    let best = null, bd = Infinity;
    for (const o of this.sides) {
      if (o === s || !this.targetable(o)) continue;
      const d = Math.hypot(o.x - s.x, o.y - s.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  onEntry(s) {
    const m = s.mon, f = s.foe;
    s.fieldT = 0;
    if (m.sp.primaled) {
      this.banner(`${m.sp.name}의 원시회귀!`, true);
      this.burst(s.x, s.y - LIFT, m.sp.types.includes('fire') ? '#ff6b3d' : '#5aa0ff', 28, 300);
      this.effects.push({ type: 'ring', x: s.x, y: s.y, r: 110, color: m.sp.types.includes('fire') ? '#ff6b3d' : '#5aa0ff', life: 0.6, max: 0.6 });
    }
    const foeHere = f && this.targetable(f) && f.switching <= 0;
    if (m.ability === 'imposter' && foeHere && !m.transformed) {
      if (this.transformInto(s, f.mon)) this.onEntry(s);
      return;
    }
    if (m.ability === 'trace' && foeHere && !NO_TRACE.includes(f.mon.ability)) {
      m.ability = f.mon.ability;
      this.abilityPop(s, 'trace', `트레이스 → ${ABILITIES[m.ability].name}`);
    }
    switch (m.ability) {
      case 'intimidate':
        this.abilityPop(s, 'intimidate');
        for (const foe of this.enemies(s)) {
          if (foe.mon.ability === 'clearbody' || foe.mon.ability === 'fullmetalbody') {
            this.abilityPop(foe, foe.mon.ability);
          } else if (foe.mon.ability === 'contrary') {
            this.abilityPop(foe, 'contrary');
            foe.mon.atkMod *= 1.5;
            this.text(foe.x, foe.y - foe.spriteH() - 20, '공격이 올랐다!', '#ff9aa8', 15, 1.2);
          } else if (foe.mon.ability === 'defiant') {
            this.abilityPop(foe, 'defiant');
            foe.mon.atkMod *= 2;
            this.text(foe.x, foe.y - foe.spriteH() - 20, '공격이 크게 올랐다!', '#ff9aa8', 15, 1.2);
          } else if (foe.mon.ability === 'mirrorarmor') {
            this.abilityPop(foe, 'mirrorarmor');
            m.atkMod *= 2 / 3;
            this.text(s.x, s.y - s.spriteH() - 20, '공격이 떨어졌다!', '#9fc4ff', 15, 1.2);
          } else {
            foe.mon.atkMod *= 2 / 3;
            this.text(foe.x, foe.y - foe.spriteH() - 20, '공격이 떨어졌다!', '#9fc4ff', 15, 1.2);
          }
        }
        break;
      case 'intrepidsword':
        this.abilityPop(s, 'intrepidsword');
        m.atkMod *= 1.5;
        break;
      case 'dauntlessshield':
        this.abilityPop(s, 'dauntlessshield');
        m.defMod *= 1.5;
        break;
      case 'drought': case 'orichalcumpulse': this.setWeather('sun', s); break;
      case 'drizzle': this.setWeather('rain', s); break;
      case 'sandstream': this.setWeather('sand', s); break;
      case 'snowwarning': this.setWeather('snow', s); break;
      case 'primordialsea': this.setWeather('rain', s, true); break;
      case 'desolateland': this.setWeather('sun', s, true); break;
      case 'airlock': case 'deltastream':
        this.abilityPop(s, m.ability);
        if (this.weather) this.text(W / 2, 150, '날씨의 영향이 없어졌다!', '#ffffff', 20, 1.6);
        break;
      case 'pressure': case 'wonderguard': case 'moldbreaker': case 'turboblaze': case 'teravolt': case 'disguise':
      case 'auraguard': case 'shadowshield': case 'prismarmor': case 'fullmetalbody':
      case 'fairyaura': case 'darkaura': case 'hadronengine': case 'goodasgold': case 'baddreams':
      case 'tabletsofruin': case 'swordofruin': case 'vesselofruin': case 'beadsofruin':
        this.abilityPop(s, m.ability);
        break;
    }
  }

  setWeather(type, s, primal) {
    if (this.weather && this.weather.primal && !primal) return;
    this.abilityPop(s, s.mon.ability);
    const w = WEATHER[type];
    this.weather = { type, t: primal ? 9999 : WEATHER_TIME, primal: !!primal, src: s };
    this.text(W / 2, 150, primal ? w.primalStart : w.start, w.color, 22, 1.8);
  }

  weatherNow() {
    if (!this.weather) return null;
    if (this.sides.some(s => this.targetable(s) && s.switching <= 0 && (s.mon.ability === 'airlock' || s.mon.ability === 'deltastream'))) return null;
    return this.weather.type;
  }

  updateWeather(dt) {
    if (!this.weather) return;
    if (this.weather.primal) {
      const src = this.weather.src;
      const need = this.weather.type === 'sun' ? 'desolateland' : 'primordialsea';
      if (!src || !this.targetable(src) || src.switching > 0 || src.mon.ability !== need) {
        const ko = WEATHER[this.weather.type].primalKo;
        this.text(W / 2, 150, `${ko}${josa(ko, '이', '가')} 그쳤다.`, '#ffffff', 18, 1.4);
        this.weather = null;
      }
      return;
    }
    this.weather.t -= dt;
    if (this.weather.t <= 0) {
      this.text(W / 2, 150, `${WEATHER[this.weather.type].ko}${josa(WEATHER[this.weather.type].ko, '이', '가')} 그쳤다.`, '#ffffff', 18, 1.4);
      this.weather = null;
      return;
    }
    if (this.weatherNow() !== 'sand') return;
    this.sandT -= dt;
    if (this.sandT > 0) return;
    this.sandT = 2;
    for (const s of this.sides) {
      if (!this.targetable(s) || s.switching > 0) continue;
      if (s.mon.sp.types.some(t => t === 'rock' || t === 'ground' || t === 'steel')) continue;
      if (s.mon.ability === 'sandforce' || s.mon.ability === 'magicguard') continue;
      this.damageSelf(s, Math.max(1, Math.round(s.mon.maxHp * 0.04)), '#d8b070');
    }
  }

  updateBadDreams(dt) {
    this.dreamT -= dt;
    if (this.dreamT > 0) return;
    this.dreamT = 2;
    for (const s of this.sides) {
      if (!this.targetable(s) || s.switching > 0 || s.mon.ability !== 'baddreams') continue;
      for (const f of this.enemies(s)) {
        if (!this.targetable(f) || f.switching > 0 || f.mon.status !== 'frz' || f.mon.ability === 'magicguard') continue;
        this.damageSelf(f, Math.max(1, Math.round(f.mon.maxHp / 8)), '#5b4b8a');
      }
    }
  }

  timeUp() {
    if (this.state === 'end') return;
    this.text(W / 2, 200, '시간 종료! 남은 포켓몬과 HP로 판정', '#ffffff', 22, 2);
    const score = s => s.aliveCount() * 1000 + s.team.reduce((a, m) => a + m.hp / Math.max(1, m.maxHp), 0);
    if (this.ffa) {
      const ranked = this.sides.slice().sort((a, b) => score(b) - score(a));
      ranked.forEach((s, i) => { if (!s.place) s.place = i + 1; });
      this.finish(ranked[0].idx);
      return;
    }
    const [a, b] = this.sides;
    this.finish(score(a) > score(b) ? 0 : 1);
  }

  targetable(s) {
    return s.faintT <= 0 && !s.mon.fainted;
  }

  separate() {
    const list = this.sides.filter(s => this.targetable(s) && s.switching <= 0);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = (a.r + b.r) * 0.8;
        if (d < m && d > 0.01) {
          const push = (m - d) / 2, nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          this.collide(a);
          this.collide(b);
        }
      }
    }
  }

  collide(e) {
    const B = ARENA_BOUNDS;
    let hit = false;
    const r = e.r * 0.8;
    if (e.x < B.x + r) { e.x = B.x + r; hit = true; }
    if (e.x > B.x + B.w - r) { e.x = B.x + B.w - r; hit = true; }
    if (e.y < B.y + r) { e.y = B.y + r; hit = true; }
    if (e.y > B.y + B.h - r) { e.y = B.y + B.h - r; hit = true; }
    for (const c of this.arena.circles) {
      const dx = e.x - c.x, dy = e.y - c.y, d = Math.hypot(dx, dy), m = r + c.r;
      if (d < m) {
        const [nx, ny] = d > 0.01 ? [dx / d, dy / d] : [1, 0];
        e.x = c.x + nx * m;
        e.y = c.y + ny * m;
        hit = true;
      }
    }
    for (const q of this.arena.rects) {
      const cx = clamp(e.x, q.x, q.x + q.w), cy = clamp(e.y, q.y, q.y + q.h);
      const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
      if (d < r) {
        if (d > 0.01) {
          e.x = cx + dx / d * r;
          e.y = cy + dy / d * r;
        } else {
          const opts = [[e.x - q.x, -1, 0], [q.x + q.w - e.x, 1, 0], [e.y - q.y, 0, -1], [q.y + q.h - e.y, 0, 1]];
          opts.sort((a, b) => a[0] - b[0]);
          const [, nx, ny] = opts[0];
          if (nx) e.x = nx < 0 ? q.x - r : q.x + q.w + r;
          if (ny) e.y = ny < 0 ? q.y - r : q.y + q.h + r;
        }
        hit = true;
      }
    }
    return hit;
  }

  blocked(x, y, pad = 0) {
    const B = ARENA_BOUNDS;
    if (x < B.x + pad || x > B.x + B.w - pad || y < B.y + pad || y > B.y + B.h - pad) return true;
    for (const c of this.arena.circles) if (Math.hypot(x - c.x, y - c.y) < c.r + pad) return true;
    for (const q of this.arena.rects) {
      if (x > q.x - pad && x < q.x + q.w + pad && y > q.y - pad && y < q.y + q.h + pad) return true;
    }
    return false;
  }

  inLava(x, y) {
    return this.arena.hazards.some(h => Math.hypot(x - h.x, y - h.y) < h.r + 10);
  }

  steer(s, mx, my) {
    const [nx, ny] = norm(mx, my);
    if (!nx && !ny) return [0, 0];
    const fireproof = s.floats();
    const base = Math.atan2(ny, nx);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = base + off;
      const px = s.x + Math.cos(a) * (s.r + 30), py = s.y + Math.sin(a) * (s.r + 30);
      if (!this.blocked(px, py, s.r * 0.6) && (fireproof || !this.inLava(px, py))) return [Math.cos(a), Math.sin(a)];
    }
    return [nx, ny];
  }

  /* ---------------- moves ---------------- */
  performMove(s, id) {
    const mv = MOVES[id];
    const aim = s.aim(mv);
    s.face = aim;
    const seq = ++this.castSeq;
    this.text(s.x, s.y - s.spriteH() - 16, mv.name, TYPES[mv.type].color, 15, 0.8, true);

    switch (mv.kind) {
      case 'proj': {
        const n = (mv.count || 1) + (s.mon.ability === 'skilllink' && mv.count ? 2 : 0);
        const base = Math.atan2(aim[1], aim[0]);
        for (let k = 0; k < n; k++) {
          const a = base + (n > 1 ? (k / (n - 1) - 0.5) * 2 * (mv.spread || 0) : 0);
          const c = Math.cos(a), sn = Math.sin(a);
          this.projectiles.push({
            x: s.x + c * (s.r + 4), y: s.y + sn * (s.r + 4), vx: c * mv.speed, vy: sn * mv.speed,
            r: mv.r, life: mv.range / mv.speed, mv, owner: s, mon: s.mon, seq, rot: Math.random() * 6, missed: false,
          });
        }
        Sound.play('proj');
        break;
      }
      case 'beam': {
        if (id === 'solarbeam' && this.weatherNow() === 'sun') {
          this.resolveCast(s, { kind: 'beam', mv, aim, seq });
          Sound.play('beam');
          break;
        }
        s.cast = { kind: 'beam', t: mv.charge, max: mv.charge, mv, aim, seq, slow: 0 };
        Sound.play('beam');
        break;
      }
      case 'melee':
        s.cast = { kind: 'melee', t: 0.12, max: 0.12, mv, aim, seq, slow: 0.35 };
        break;
      case 'nova':
        s.cast = { kind: 'nova', t: 0.2, max: 0.2, mv, aim, seq, slow: 0 };
        break;
      case 'dash':
        s.dash = { t: mv.dist / mv.speed, dir: aim, speed: mv.speed, mv, seq, hit: false, landed: false };
        if (mv.phase) s.iframes = Math.max(s.iframes, mv.dist / mv.speed);
        Sound.play('dash');
        break;
      case 'target': {
        const f = s.foe || s;
        const sure = id === 'thunder' && this.weatherNow() === 'rain' && f !== s ? f : null;
        const delay = mv.statusOnly && s.mon.ability === 'prankster' ? mv.delay * 0.5 : mv.delay;
        let tx = f.x, ty = f.y;
        if (s.ai && !sure) {
          tx += f.vx * 0.25 * s.ai.d + rand(-1, 1) * (1 - s.ai.d) * 50;
          ty += f.vy * 0.25 * s.ai.d + rand(-1, 1) * (1 - s.ai.d) * 50;
        }
        this.telegraphs.push({ x: tx, y: ty, r: mv.radius, t: delay, max: delay, mv, owner: s, mon: s.mon, seq, sure });
        Sound.play('target');
        break;
      }
    }
  }

  resolveCast(s, c) {
    const mv = c.mv, col = TYPES[mv.type].color;
    if (c.kind === 'beam') {
      const x2 = s.x + c.aim[0] * mv.length, y2 = s.y + c.aim[1] * mv.length;
      this.effects.push({ type: 'beam', x1: s.x + c.aim[0] * s.r, y1: s.y + c.aim[1] * s.r, x2, y2, w: mv.width, color: col, life: 0.35, max: 0.35 });
      this.shake = Math.max(this.shake, 6);
      for (const f of this.enemies(s)) {
        if (distSeg(f.x, f.y, s.x, s.y, x2, y2) < mv.width / 2 + f.r) this.applyHit(s, s.mon, f, mv, c.aim, c.seq);
      }
    } else if (c.kind === 'melee') {
      const aim = s.aim(mv);
      s.face = aim;
      const ang = Math.atan2(aim[1], aim[0]);
      this.effects.push({ type: 'slash', x: s.x, y: s.y, ang, reach: mv.reach + 12, arc: mv.arc, color: col, life: 0.22, max: 0.22 });
      Sound.play('melee');
      for (const f of this.enemies(s)) {
        const dx = f.x - s.x, dy = f.y - s.y, d = Math.hypot(dx, dy);
        if (d < mv.reach + f.r && Math.abs(angDiff(Math.atan2(dy, dx), ang)) < mv.arc / 2 + 0.3) {
          this.applyHit(s, s.mon, f, mv, norm(dx, dy), c.seq);
        }
      }
    } else if (c.kind === 'nova') {
      this.effects.push({ type: 'ring', x: s.x, y: s.y, r: mv.radius, color: col, life: 0.4, max: 0.4 });
      this.burst(s.x, s.y, col, 18, 260);
      this.shake = Math.max(this.shake, mv.type === 'ground' ? 10 : 4);
      Sound.play('nova');
      for (const f of this.enemies(s)) {
        const dx = f.x - s.x, dy = f.y - s.y, d = Math.hypot(dx, dy);
        if (d < mv.radius + f.r * 0.4) this.applyHit(s, s.mon, f, mv, norm(dx, dy), c.seq);
      }
    }
    if (mv.selfStun) s.stun = mv.selfStun;
  }

  applyHit(src, srcMon, t, mv, dir, seq, sure) {
    if (!this.targetable(t)) return 'none';
    const def = t.mon;
    const hy = t.y - t.spriteH() - 4;
    const aAb = srcMon.ability;
    const mold = MOLD_BREAKERS.includes(aAb) || mv.ignoresAbility;
    const dAb = mold ? null : def.ability;
    const contact = mv.kind === 'melee' || mv.kind === 'dash';
    const srcActive = src.mon === srcMon && this.targetable(src);
    if ((t.iframes > 0 && aAb !== 'noguard' && !sure) || t.switching > 0) {
      if (!this.missShown.has(seq)) {
        this.missShown.add(seq);
        this.text(t.x + rand(-10, 10), hy, 'Miss', '#ffffff', 20, 0.7);
        Sound.play('miss');
      }
      return 'miss';
    }
    const atkT = attackType(srcMon, mv);
    if (this.weather && this.weather.primal) {
      const wn = this.weatherNow();
      if (wn === 'rain' && atkT === 'fire') {
        this.text(t.x, hy, '큰비에 삼켜졌다!', '#5aa0ff', 16, 1);
        return 'immune';
      }
      if (wn === 'sun' && atkT === 'water') {
        this.text(t.x, hy, '햇살에 증발했다!', '#ffb340', 16, 1);
        return 'immune';
      }
    }
    const skinBoost = mv.type === 'normal' && (aAb === 'pixilate' || aAb === 'aerilate' || aAb === 'dragonize') ? 1.2 : 1;
    const eff = typeEffFor(srcMon, mv, def, this);
    if (mold && def.ability === 'wonderguard' && eff <= 1 && atkT !== 'none') this.abilityPop(src, aAb);

    const blocked = abilityBlock(dAb, mv, eff, atkT);
    if (blocked) {
      this.abilityPop(t, blocked);
      if (blocked === 'wonderguard') {
        this.text(t.x, hy, '불가사의부적이 막았다!', '#d9c2ff', 16, 1);
        this.effects.push({ type: 'burst', x: t.x, y: t.y - LIFT, r: t.r + 10, color: '#d9c2ff', life: 0.3, max: 0.3 });
        Sound.play('miss');
      } else if (blocked === 'levitate' || blocked === 'bulletproof') {
        this.text(t.x, hy, blocked === 'bulletproof' ? '방탄으로 막았다!' : '떠 있어서 맞지 않는다!', '#cccccc', 15, 1);
      } else if (blocked === 'flashfire') {
        def.flashFire = true;
        this.text(t.x, hy, '불꽃의 위력이 올라갔다!', '#ffb060', 15, 1);
      } else if (blocked === 'lightningrod') {
        def.spaMod *= 1.5;
        this.text(t.x, hy, '특수공격이 올라갔다!', '#f7d02c', 15, 1);
      } else if (blocked === 'motordrive') {
        def.speMod *= 1.5;
        this.text(t.x, hy, '스피드가 올라갔다!', '#f7d02c', 15, 1);
      } else if (blocked === 'sapsipper') {
        def.atkMod *= 1.5;
        this.text(t.x, hy, '공격이 올라갔다!', '#7ac74c', 15, 1);
      } else {
        const heal = Math.round(def.maxHp / 4);
        def.hp = Math.min(def.maxHp, def.hp + heal);
        this.text(t.x, hy, '+' + heal, '#7dff8a', 18, 0.9);
      }
      return 'immune';
    }
    if (eff === 0) {
      this.text(t.x, hy, '효과가 없다...', '#cccccc', 16, 1);
      return 'immune';
    }
    if (mv.statusOnly) {
      if (mv.healSelf && srcActive) {
        const heal = Math.max(1, Math.round(srcMon.maxHp * mv.healSelf));
        srcMon.hp = Math.min(srcMon.maxHp, srcMon.hp + heal);
        this.text(src.x, src.y - src.spriteH() - 4, '+' + heal, '#7dff8a', 18, 0.9);
      }
      if (mv.status && !def.status && def.hp > 0) {
        if (dAb === 'goodasgold') this.abilityPop(t, 'goodasgold');
        else this.applyStatus(t, mv.status[0], srcActive ? src : null);
      }
      return 'hit';
    }

    if (dAb === 'disguise' && !def.disguiseBroken) {
      def.disguiseBroken = true;
      this.abilityPop(t, 'disguise');
      this.text(t.x, hy - 20, '탈이 대신 맞아 주었다!', '#f5e27a', 15, 1.2);
      t.flash = 0.12;
      t.kx += dir[0] * 150;
      t.ky += dir[1] * 150;
      def.hp = Math.max(0, def.hp - Math.max(1, Math.round(def.maxHp / 8)));
      if (def.hp <= 0) this.faint(t);
      return 'hit';
    }

    const phy = mv.cat === 'phy';
    const usesDef = phy || mv.targetDef;
    const sandRock = !usesDef && this.weatherNow() === 'sand' && def.sp.types.includes('rock') ? 1.5 : 1;
    const snowIce = usesDef && this.weatherNow() === 'snow' && def.sp.types.includes('ice') ? 1.5 : 1;
    const atkMod = dAb === 'unaware' ? 1 : srcMon.atkMod;
    const spaMod = dAb === 'unaware' ? 1 : (srcMon.spaMod || 1);
    const defMod = aAb === 'unaware' ? 1 : (def.defMod || 1);
    let atkStat = phy ? srcMon.stats.atk * atkMod : srcMon.stats.spa * spaMod;
    if (mv.useDef) atkStat = srcMon.stats.def * (srcMon.defMod || 1);
    if (aAb === 'hugepower' && phy && !mv.useDef) atkStat *= 2;
    if (aAb === 'orichalcumpulse' && phy && !mv.useDef && this.weatherNow() === 'sun') atkStat *= 1.3;
    if (aAb === 'guts' && srcMon.status && phy && !mv.useDef) atkStat *= 1.5;
    if (aAb === 'solarpower' && this.weatherNow() === 'sun' && !phy) atkStat *= 1.5;
    let dfs = (usesDef ? def.stats.def * defMod * snowIce : def.stats.spd) * sandRock;
    const ruined = (mon, ab) => this.sides.some(sd => this.targetable(sd) && sd.switching <= 0 && sd.mon !== mon && sd.mon.ability === ab) ? 0.75 : 1;
    if (!mv.useDef) atkStat *= ruined(srcMon, phy ? 'tabletsofruin' : 'vesselofruin');
    dfs *= ruined(def, usesDef ? 'swordofruin' : 'beadsofruin');
    if (dAb === 'marvelscale' && def.status) dfs *= 1.5;

    let power = mv.power;
    if (aAb === 'technician' && power <= 60) power *= 1.5;
    const pinch = { blaze: 'fire', torrent: 'water', overgrow: 'grass' }[aAb];
    if (pinch === atkT && srcMon.hp <= srcMon.maxHp / 3) power *= 1.5;
    if (srcMon.flashFire && atkT === 'fire') power *= 1.5;
    if (mv.facade && srcMon.status) power *= 2;
    if (mv.hex && def.status) power *= 2;
    power *= skinBoost;
    if (aAb === 'toughclaws' && contact) power *= 1.3;
    if (aAb === 'ironfist' && mv.punch) power *= 1.2;
    if (aAb === 'strongjaw' && mv.bite) power *= 1.5;
    if (aAb === 'megalauncher' && mv.pulse) power *= 1.5;
    if (aAb === 'reckless' && (mv.recoil || mv.crash)) power *= 1.2;
    if (aAb === 'sandforce' && this.weatherNow() === 'sand' && ['rock', 'ground', 'steel'].includes(atkT)) power *= 1.3;
    if (aAb === 'hadronengine' && !phy && atkT === 'electric') power *= 1.3;
    if (aAb === 'royalknight' && (atkT === 'steel' || atkT === 'ice')) power *= 1.3;
    if (this.sides.some(sd => this.targetable(sd) && sd.switching <= 0 && ((sd.mon.ability === 'fairyaura' && atkT === 'fairy') || (sd.mon.ability === 'darkaura' && atkT === 'dark')))) power *= 1.33;
    const sheer = aAb === 'sheerforce' && (mv.status || mv.flinch);
    if (sheer) power *= 1.3;

    const stabbed = atkT !== 'none' && (srcMon.sp.types.includes(atkT) || aAb === 'protean' || aAb === 'libero');
    const stab = stabbed ? (aAb === 'adaptability' ? 2 : 1.5) : 1;
    const critStage = (aAb === 'superluck' ? 1 : 0) + (mv.critBoost ? 1 : 0);
    const crit = mv.alwaysCrit || (dAb !== 'shellarmor' && Math.random() < [1 / 16, 1 / 8, 1 / 2][Math.min(2, critStage)]);
    const burn = phy && srcMon.status === 'brn' && aAb !== 'guts' ? 0.5 : 1;

    let mod = 1;
    const w = this.weatherNow();
    if (w === 'sun') mod *= atkT === 'fire' ? 1.5 : atkT === 'water' ? 0.5 : 1;
    if (w === 'rain') mod *= atkT === 'water' ? 1.5 : atkT === 'fire' ? 0.5 : 1;
    if (dAb === 'thickfat' && (atkT === 'fire' || atkT === 'ice')) mod *= 0.5;
    if ((dAb === 'multiscale' || dAb === 'shadowshield') && def.hp === def.maxHp) { mod *= 0.5; this.abilityPop(t, dAb); }
    if ((dAb === 'filter' || dAb === 'solidrock' || dAb === 'prismarmor') && eff > 1) { mod *= 0.75; this.abilityPop(t, dAb); }
    if (dAb === 'auraguard' && contact) { mod *= 0.5; this.abilityPop(t, 'auraguard'); }

    const base = (2 * srcMon.level / 5 + 2) * power * atkStat / dfs / 50 + 2;
    let dmg = Math.max(1, Math.round(base * stab * eff * (crit ? 1.5 : 1) * burn * mod * rand(0.85, 1) * DMG_SCALE));
    if (mv.halfHp) dmg = Math.max(1, Math.floor(def.hp / 2));
    if (mv.levelDmg) dmg = srcMon.level;
    if (dAb === 'sturdy' && def.hp === def.maxHp && dmg >= def.hp) {
      dmg = def.hp - 1;
      this.abilityPop(t, 'sturdy');
      this.text(t.x, hy - 20, '버텼다!', '#ffe14d', 15, 1);
    }

    if (def.ability === 'wonderguard' && atkT !== 'none' && eff > 1) this.abilityPop(t, 'wonderguard', '불가사의부적 관통!');
    if (dAb === 'thermalexchange' && atkT === 'fire') { def.atkMod *= 1.5; this.abilityPop(t, 'thermalexchange'); }
    if (dAb === 'justified' && atkT === 'dark') { def.atkMod *= 1.5; this.abilityPop(t, 'justified'); }
    def.hp = Math.max(0, def.hp - dmg);
    if (def.hp > 0) this.checkBoss(def);
    src.dealt += dmg;
    t.lastHitBy = src;
    t.flash = 0.12;
    const col = TYPES[mv.type].color;
    this.text(t.x + rand(-14, 14), hy, String(dmg), eff > 1 ? '#ffe14d' : '#ffffff', eff > 1 ? 28 : 22, 0.9);
    if (eff > 1) this.text(t.x, hy - 26, '효과가 굉장했다!', '#ffd34d', 15, 1.1);
    else if (eff < 1) this.text(t.x, hy - 26, '효과가 별로인 듯하다', '#bbbbbb', 13, 1.1);
    if (crit) this.text(t.x, hy - 44, '급소에 맞았다!', '#ff7a7a', 15, 1.1);
    this.burst(t.x, t.y - LIFT, col, eff > 1 ? 18 : 10, 220);
    this.effects.push({ type: 'burst', x: t.x, y: t.y - LIFT, r: 26 + dmg * 0.3, color: col, life: 0.25, max: 0.25 });
    Sound.play(eff > 1 ? 'super' : eff < 1 ? 'weak' : 'hit');

    const kb = (mv.kb || DEFAULT_KB[mv.kind]) * (eff > 1 ? 1.2 : 1) * (crit ? 1.2 : 1);
    t.kx += dir[0] * kb;
    t.ky += dir[1] * kb;
    const flinch = !sheer && mv.flinch && def.ability !== 'innerfocus';
    t.stun = Math.max(t.stun, flinch ? 0.45 : 0.15);
    if (flinch && t.cast) t.cast = null;
    if (flinch && def.ability === 'steadfast') { def.speMod *= 1.5; this.abilityPop(t, 'steadfast'); }
    this.shake = Math.max(this.shake, Math.min(14, 3 + dmg * 0.15));
    if (dmg > def.maxHp * 0.25) this.hitstop = 0.06;

    const chance = !sheer && mv.status ? mv.status[1] * (aAb === 'serenegrace' ? 2 : 1) : 0;
    if (mv.status && !sheer && def.hp > 0 && Math.random() < chance) {
      if (dAb === 'magicbounce' && srcActive) {
        this.abilityPop(t, 'magicbounce');
        this.applyStatus(src, mv.status[0]);
      } else if (!def.status) this.applyStatus(t, mv.status[0], srcActive ? src : null);
    }

    if (mv.drain && srcActive) {
      const heal = Math.max(1, Math.round(dmg * mv.drain));
      srcMon.hp = Math.min(srcMon.maxHp, srcMon.hp + heal);
      this.text(src.x, src.y - src.spriteH() - 4, '+' + heal, '#7dff8a', 18, 0.9);
    }
    if (def.ability === 'cursedbody' && Math.random() < 0.3) {
      const slot = srcMon.moves.find(sl => sl.id === mv.id);
      if (slot) {
        slot.cd += 4;
        this.abilityPop(t, 'cursedbody');
        this.text(src.x, src.y - src.spriteH() - 24, `${MOVES[mv.id].name} 봉인!`, '#c9a0ff', 14, 1.1);
      }
    }
    if (def.hp <= 0) this.faint(t);
    if (mv.recoil && srcActive) {
      this.damageSelf(src, Math.max(1, Math.round(dmg * mv.recoil)), '#ff9b9b');
    }
    if (contact && srcActive && !srcMon.fainted) {
      if (def.ability === 'static' && Math.random() < 0.3 && !srcMon.status) {
        this.abilityPop(t, 'static');
        this.applyStatus(src, 'par');
      }
      if (def.ability === 'roughskin') {
        this.abilityPop(t, 'roughskin');
        this.damageSelf(src, Math.max(1, Math.round(srcMon.maxHp / 8)), '#ff9b9b');
      }
      if (def.ability === 'flamebody' && Math.random() < 0.3 && !srcMon.status) {
        this.abilityPop(t, 'flamebody');
        this.applyStatus(src, 'brn');
      }
    }
    if (aAb === 'parentalbond' && !mv._bond && !mv.multiHit && def.hp > 0 && srcActive) {
      this.applyHit(src, srcMon, t, Object.assign({}, mv, { power: Math.max(1, Math.round(mv.power / 4)), _bond: true, status: null, flinch: false }), dir, seq + 9000);
    }
    return 'hit';
  }

  applyStatus(t, st, src) {
    if (st === 'tri') st = ['brn', 'par', 'frz'][Math.floor(Math.random() * 3)];
    const m = t.mon;
    if (m.status || m.fainted) return;
    if (STATUS_IMMUNE[st].some(ty => m.sp.types.includes(ty))) return;
    if (m.ability === 'multitype' || (st === 'frz' && m.ability === 'insomnia')) { this.abilityPop(t, m.ability); return; }
    if (st === 'par' && m.ability === 'limber') { this.abilityPop(t, 'limber'); return; }
    if (st === 'brn' && m.ability === 'thermalexchange') { this.abilityPop(t, 'thermalexchange'); return; }
    m.status = st;
    m.statusT = STATUS_TIME[st];
    t.dotT = 1;
    if (st === 'frz') { t.stun = Math.max(t.stun, STATUS_TIME.frz); t.cast = null; }
    this.text(t.x, t.y - t.spriteH() - 46, STATUS[st].ko + '!', STATUS[st].color, 17, 1.1);
    if (src && m.ability === 'synchronize' && st !== 'frz' && this.targetable(src)) {
      this.abilityPop(t, 'synchronize');
      this.applyStatus(src, st);
    }
  }

  // 공격 외 데미지 (상태이상·용암·모래바람·반동·까칠한피부)
  damageSelf(s, dmg, color) {
    const m = s.mon;
    if (m.fainted) return;
    if (m.ability === 'magicguard') { this.abilityPop(s, 'magicguard'); return; }
    m.hp = Math.max(0, m.hp - dmg);
    s.flash = 0.08;
    this.text(s.x + rand(-10, 10), s.y - s.spriteH() - 4, String(dmg), color || '#ffffff', 17, 0.8);
    if (m.hp <= 0) this.faint(s);
  }

  faint(t) {
    const m = t.mon;
    if (m.fainted) return;
    m.fainted = true;
    m.hp = 0;
    m.status = null;
    t.faintT = 1.4;
    t.cast = null;
    t.dash = null;
    t.dodgeT = 0;
    t.switching = 0;
    if (t.lastHitBy && t.lastHitBy !== t) {
      t.lastHitBy.ko++;
      if (t.lastHitBy.mon && !t.lastHitBy.mon.fainted && t.lastHitBy.mon.ability === 'moxie') {
        t.lastHitBy.mon.atkMod *= 1.5;
        this.abilityPop(t.lastHitBy, 'moxie');
      }
    }
    this.text(t.x, t.y - t.spriteH() - 24, `${m.sp.name} 쓰러졌다!`, '#ffffff', 19, 1.3);
    this.shake = Math.max(this.shake, 10);
    Sound.play('faint');
    if (this.ffa) {
      t.place = this.livingSides().length + 1;
      const left = this.livingSides();
      if (left.length <= 1) {
        if (left[0]) left[0].place = 1;
        this.finish(left[0] ? left[0].idx : t.idx);
      }
    } else if (t.aliveCount() === 0) this.finish(1 - t.idx);
  }

  finish(winner) {
    if (this.state === 'end') return;
    this.state = 'end';
    this.stateT = 2.2;
    this.winner = winner;
    if (this.ffa) {
      const name = this.sides[winner].team[0].sp.name;
      this.banner(`${name} 우승!`, true);
      Sound.play(winner === 0 && !this.opts.watch ? 'win' : 'win');
    } else {
      const watch = !!this.opts.watch;
      this.banner(watch ? `CPU ${winner + 1} 승리!` : winner === 0 ? '승리!' : '패배...', true);
      Sound.play(winner === 0 || watch ? 'win' : 'lose');
    }
  }

  result() {
    if (this.ffa) {
      const ranking = this.sides.map(s => ({
        idx: s.idx,
        name: s.team[0].sp.name,
        ko: s.ko,
        dealt: s.dealt,
        hp: s.team[0].hp,
        fainted: !!s.team[0].fainted,
        place: s.place || (s.aliveCount() ? 1 : this.sides.length),
      })).sort((a, b) => a.place - b.place || b.hp - a.hp || b.ko - a.ko);
      return {
        ffa: true, win: this.winner === 0, time: this.time, winner: this.winner,
        winnerName: this.sides[this.winner].team[0].sp.name,
        ranking, ko: this.sides[0].ko, dealt: this.sides[0].dealt, taken: this.sides.slice(1).reduce((a, s) => a + s.dealt, 0),
      };
    }
    const [p, c] = this.sides;
    return { win: this.winner === 0, time: this.time, ko: p.ko, lost: c.ko, dealt: p.dealt, taken: c.dealt };
  }

  /* ---------------- world objects ---------------- */
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      const home = p.owner.foe;
      if (p.mv.homing && home && this.targetable(home) && !p.missed) {
        const want = Math.atan2(home.y - p.y, home.x - p.x), cur = Math.atan2(p.vy, p.vx);
        const a = cur + clamp(angDiff(want, cur), -p.mv.homing * dt, p.mv.homing * dt);
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.rot += dt * 12;
      const col = TYPES[p.mv.type].color;
      if (Math.random() < 0.7) {
        this.particles.push({ x: p.x + rand(-4, 4), y: p.y - LIFT + rand(-4, 4), vx: -p.vx * 0.05, vy: -p.vy * 0.05, life: 0.3, max: 0.3, size: p.r * 0.5, color: col });
      }
      if (this.blocked(p.x, p.y, -p.r * 0.3)) {
        p.dead = true;
        this.burst(p.x, p.y - LIFT, col, 6, 140);
        continue;
      }
      if (p.life <= 0) { p.dead = true; continue; }
      if (p.missed) continue;
      let hit = null, hd = Infinity;
      for (const f of this.enemies(p.owner)) {
        const d = Math.hypot(f.x - p.x, f.y - p.y);
        if (d < p.r + f.r && d < hd) { hd = d; hit = f; }
      }
      if (!hit) continue;
      const key = p.seq + ':' + hit.idx;
      if (!p.mv.multiHit && this.hitSeqs.has(key)) { p.dead = true; continue; }
      const res = this.applyHit(p.owner, p.mon, hit, p.mv, norm(p.vx, p.vy), p.seq);
      if (res === 'miss') { p.missed = true; continue; }
      this.hitSeqs.add(key);
      p.dead = true;
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  updateTelegraphs(dt) {
    for (const tg of this.telegraphs) {
      if (tg.sure && this.targetable(tg.sure) && tg.sure.switching <= 0) {
        tg.x = tg.sure.x;
        tg.y = tg.sure.y;
      }
      tg.t -= dt;
      if (tg.t > 0) continue;
      tg.dead = true;
      const col = TYPES[tg.mv.type].color;
      this.effects.push({ type: tg.mv.fx === 'bolt' ? 'bolt' : 'impact', x: tg.x, y: tg.y, r: tg.r, color: col, life: 0.35, max: 0.35, fx: tg.mv.fx });
      this.burst(tg.x, tg.y - 10, col, 22, 280);
      this.shake = Math.max(this.shake, 6);
      Sound.play('impact');
      if (tg.sure && this.targetable(tg.sure)) {
        this.applyHit(tg.owner, tg.mon, tg.sure, tg.mv, norm(tg.sure.x - tg.x, tg.sure.y - tg.y), tg.seq, true);
      } else {
        for (const f of this.enemies(tg.owner)) {
          if (Math.hypot(f.x - tg.x, f.y - tg.y) < tg.r + f.r * 0.4) {
            this.applyHit(tg.owner, tg.mon, f, tg.mv, norm(f.x - tg.x, f.y - tg.y), tg.seq);
          }
        }
      }
    }
    this.telegraphs = this.telegraphs.filter(t => !t.dead);
  }

  updateOrbs(dt) {
    for (const o of this.orbs) o.t += dt;
    if (this.state !== 'fight') return;
    this.orbTimer -= dt;
    if (this.orbTimer <= 0) {
      this.orbTimer = rand(10, 14);
      if (this.orbs.length < 2) this.spawnOrb();
    }
    for (const o of this.orbs) {
      o.life -= dt;
      for (const s of this.sides) {
        if (!this.targetable(s) || s.switching > 0) continue;
        if (Math.hypot(s.x - o.x, s.y - o.y) < s.r + 16 && this.restorePP(s)) { o.dead = true; break; }
      }
    }
    this.orbs = this.orbs.filter(o => !o.dead && o.life > 0);
  }

  spawnOrb() {
    const B = ARENA_BOUNDS;
    for (let i = 0; i < 40; i++) {
      const x = rand(B.x + 70, B.x + B.w - 70), y = rand(B.y + 60, B.y + B.h - 60);
      if (this.blocked(x, y, 24) || this.inLava(x, y)) continue;
      if (this.sides.some(s => Math.hypot(s.x - x, s.y - y) < 140)) continue;
      this.orbs.push({ x, y, life: 18, t: 0 });
      return;
    }
  }

  restorePP(s) {
    const cands = s.mon.moves.filter(m => m.pp < m.maxPp);
    if (!cands.length) return false;
    cands.sort((a, b) => a.pp / a.maxPp - b.pp / b.maxPp);
    cands[0].pp++;
    this.text(s.x, s.y - s.spriteH() - 10, `+1 PP ${MOVES[cands[0].id].name}`, '#c99bff', 15, 1);
    this.burst(s.x, s.y - LIFT, '#b57bff', 12, 160);
    Sound.play('orb');
    return true;
  }

  /* ---------------- fx helpers ---------------- */
  text(x, y, str, color, size = 18, life = 0.9, small) {
    this.texts.push({ x, y, str, color, size, life, max: life, small });
  }

  burst(x, y, color, n = 10, speed = 200) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(0.3, 1) * speed;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.25, 0.5), max: 0.5, size: rand(2, 5), color });
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(30, 120);
      this.particles.push({ x, y: y - 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.4, life: rand(0.3, 0.5), max: 0.5, size: rand(3, 6), color: 'rgba(255,255,255,.8)' });
    }
  }

  trail(s, mv) {
    const col = TYPES[mv.type].color;
    for (let i = 0; i < 2; i++) {
      this.particles.push({ x: s.x + rand(-8, 8), y: s.y - LIFT + rand(-10, 10), vx: 0, vy: 0, life: 0.25, max: 0.25, size: rand(4, 8), color: col });
    }
  }

  updateFx(dt) {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * (t.small ? 18 : 40);
    }
    this.texts = this.texts.filter(t => t.life > 0);
  }

  /* ---------------- render ---------------- */
  render() {
    const sh = this.shake;
    this.world.style.transform = sh > 0.3 ? `translate(${rand(-sh, sh) * 0.6}px, ${rand(-sh, sh) * 0.6}px)` : '';
    this.renderUnder();
    for (const s of this.sides) this.renderSprite(s);
    this.renderOver();
  }

  renderUnder() {
    const c = this.under, t = this.clock;
    c.clearRect(0, 0, W, H);

    for (const h of this.arena.hazards) {
      const pulse = 0.85 + Math.sin(t * 3 + h.x) * 0.15;
      const gr = c.createRadialGradient(h.x, h.y, 4, h.x, h.y, h.r * 1.25);
      gr.addColorStop(0, '#ffe08a');
      gr.addColorStop(0.45, '#ff8a1f');
      gr.addColorStop(0.8, '#d6370f');
      gr.addColorStop(1, 'rgba(120,20,0,0)');
      c.globalAlpha = pulse;
      c.fillStyle = gr;
      c.beginPath(); c.arc(h.x, h.y, h.r * 1.25, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        const a = t * 0.7 + i * 2.1 + h.y;
        const bx = h.x + Math.cos(a) * h.r * 0.5, by = h.y + Math.sin(a * 1.3) * h.r * 0.4;
        c.fillStyle = 'rgba(255,240,180,.6)';
        c.beginPath(); c.arc(bx, by, 3 + Math.sin(t * 5 + i) * 2, 0, Math.PI * 2); c.fill();
      }
    }

    for (const o of this.orbs) {
      const blink = o.life < 4 ? (Math.sin(o.t * 18) > 0 ? 1 : 0.35) : 1;
      const y = o.y - 10 - Math.sin(o.t * 4) * 4;
      c.globalAlpha = 0.3 * blink;
      c.fillStyle = '#000';
      c.beginPath(); c.ellipse(o.x, o.y, 10, 4, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = blink;
      const gr = c.createRadialGradient(o.x, y, 1, o.x, y, 16);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.35, '#c48bff');
      gr.addColorStop(1, 'rgba(140,60,255,0)');
      c.fillStyle = gr;
      c.beginPath(); c.arc(o.x, y, 16, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff';
      c.font = 'bold 9px sans-serif';
      c.textAlign = 'center';
      c.fillText('PP', o.x, y + 3);
      c.globalAlpha = 1;
    }

    for (const tg of this.telegraphs) {
      const k = 1 - tg.t / tg.max;
      const col = TYPES[tg.mv.type].color;
      c.strokeStyle = col;
      c.lineWidth = 3;
      c.globalAlpha = 0.9;
      c.setLineDash([8, 6]);
      c.lineDashOffset = -t * 30;
      c.beginPath(); c.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 0.18 + k * 0.25;
      c.fillStyle = col;
      c.beginPath(); c.arc(tg.x, tg.y, tg.r * k, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }

    for (const s of this.sides) {
      if (s.cast && s.cast.kind === 'beam') {
        const k = 1 - s.cast.t / s.cast.max;
        c.strokeStyle = TYPES[s.cast.mv.type].color;
        c.globalAlpha = 0.25 + k * 0.5;
        c.lineWidth = 2 + k * 3;
        c.setLineDash([12, 8]);
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.lineTo(s.x + s.cast.aim[0] * s.cast.mv.length, s.y + s.cast.aim[1] * s.cast.mv.length);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
      if (s.mon.fainted && s.faintT <= 0) continue;
      const a = s.faintT > 0 ? s.faintT / 1.4 : 1;
      c.globalAlpha = 0.28 * a;
      c.fillStyle = '#000';
      c.beginPath(); c.ellipse(s.x, s.y + 2, s.r * 1.2, s.r * 0.42, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.8 * a;
      c.strokeStyle = s.mon.boss ? '#ffd24a' : (s.idx === 0 ? '#4fb3ff' : '#ff5a5a');
      c.lineWidth = s.mon.boss ? 3 : 2;
      c.beginPath(); c.ellipse(s.x, s.y + 2, s.r * 1.3, s.r * 0.48, 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
  }

  styleIf(el, prop, val) {
    if (el['_' + prop] === val) return;
    el['_' + prop] = val;
    el.style[prop] = val;
  }

  renderSprite(s) {
    const wantBack = s.face[1] < -0.55 && s.faintT <= 0 && s.elB.naturalWidth > 0;
    s.back = wantBack;
    const el = s.el, other = s.back ? s.elF : s.elB;
    this.styleIf(other, 'visibility', 'hidden');
    const nw = el.naturalWidth;
    if (!nw || (s.mon.fainted && s.faintT <= 0)) { this.styleIf(el, 'visibility', 'hidden'); return; }
    this.styleIf(el, 'visibility', 'visible');
    const sc = s.spriteScale();
    const w = nw * sc, h = el.naturalHeight * sc;
    const bob = s.moving ? -Math.abs(Math.sin(this.clock * 12)) * 4 : Math.sin(this.clock * 2.5 + s.idx) * 1.2;
    let scale = 1, alpha = 1, dy = 0;
    if (s.switching > 0) {
      scale = s.swapped ? 1 - s.switching / 0.3 : (s.switching - 0.3) / 0.3;
      scale = clamp(scale, 0.05, 1);
    }
    if (s.faintT > 0) {
      const k = s.faintT / 1.4;
      alpha = k;
      dy = (1 - k) * 24;
    }
    if (s.dodgeT > 0) alpha *= 0.45;
    else if (s.iframes > 0) alpha *= 0.75;
    const flip = s.back ? (s.face[0] < -0.1 ? -1 : 1) : (s.face[0] > 0.1 ? -1 : 1);
    const transform = `translate(${(s.x - w / 2).toFixed(1)}px, ${(s.y - h + 6 + bob + dy).toFixed(1)}px) scale(${flip * scale}, ${scale})`;
    this.styleIf(el, 'transform', transform);
    this.styleIf(el, 'opacity', String(alpha));
    this.styleIf(el, 'zIndex', String(Math.round(s.y)));
    let filter = '';
    if (s.flash > 0) filter = 'brightness(2.6)';
    else if (s.mon.status === 'frz') filter = 'hue-rotate(170deg) saturate(.6) brightness(1.35)';
    else if (s.mon.status === 'par' && Math.sin(this.clock * 30) > 0.6) filter = 'brightness(1.6) sepia(1) saturate(4)';
    else if (s.mon.status === 'brn') filter = 'drop-shadow(0 0 4px #ff6a00)';
    else if (s.mon.status === 'psn') filter = 'drop-shadow(0 0 4px #b040ff)';
    this.styleIf(el, 'filter', filter);
  }

  renderOver() {
    const c = this.over, t = this.clock;
    c.clearRect(0, 0, W, H);

    for (const p of this.projectiles) this.drawProjectile(c, p);

    for (const e of this.effects) {
      const k = e.life / e.max;
      c.save();
      switch (e.type) {
        case 'beam': {
          c.globalAlpha = Math.min(1, k * 1.6);
          c.lineCap = 'round';
          c.shadowColor = e.color;
          c.shadowBlur = 20;
          c.strokeStyle = e.color;
          c.lineWidth = e.w * (0.6 + k * 0.6);
          c.beginPath(); c.moveTo(e.x1, e.y1 - LIFT); c.lineTo(e.x2, e.y2 - LIFT); c.stroke();
          c.strokeStyle = '#fff';
          c.lineWidth = e.w * 0.3 * k;
          c.stroke();
          break;
        }
        case 'slash': {
          const prog = 1 - k;
          c.globalAlpha = k;
          c.strokeStyle = e.color;
          c.shadowColor = e.color;
          c.shadowBlur = 10;
          c.lineWidth = 10 * k + 2;
          c.lineCap = 'round';
          const a0 = e.ang - e.arc / 2, a1 = a0 + e.arc * Math.min(1, prog * 2.2);
          c.beginPath(); c.arc(e.x, e.y - LIFT, e.reach, a0, a1); c.stroke();
          c.strokeStyle = '#fff';
          c.lineWidth = 3 * k;
          c.beginPath(); c.arc(e.x, e.y - LIFT, e.reach - 4, a0, a1); c.stroke();
          break;
        }
        case 'ring': {
          const rr = e.r * (1 - k * k * 0.9);
          c.globalAlpha = k;
          c.strokeStyle = e.color;
          c.lineWidth = 12 * k + 2;
          c.beginPath(); c.ellipse(e.x, e.y, rr, rr * 0.75, 0, 0, Math.PI * 2); c.stroke();
          c.globalAlpha = k * 0.2;
          c.fillStyle = e.color;
          c.fill();
          break;
        }
        case 'burst': {
          c.globalAlpha = k;
          c.strokeStyle = '#fff';
          c.lineWidth = 3;
          c.beginPath(); c.arc(e.x, e.y, e.r * (1.2 - k * 0.7), 0, Math.PI * 2); c.stroke();
          break;
        }
        case 'bolt': {
          c.globalAlpha = k;
          c.strokeStyle = '#fff6a0';
          c.shadowColor = '#ffe84d';
          c.shadowBlur = 18;
          c.lineWidth = 5;
          c.beginPath();
          let x = e.x + rand(-10, 10), y = e.y - 420;
          c.moveTo(x, y);
          while (y < e.y) { y += rand(25, 45); x = e.x + rand(-18, 18); c.lineTo(x, Math.min(y, e.y)); }
          c.stroke();
          c.globalAlpha = k * 0.5;
          c.fillStyle = '#fff6a0';
          c.beginPath(); c.ellipse(e.x, e.y, e.r * (1.3 - k * 0.3), e.r * 0.6, 0, 0, Math.PI * 2); c.fill();
          break;
        }
        case 'impact': {
          const rr = e.r * (1.2 - k * 0.4);
          c.globalAlpha = k;
          c.fillStyle = e.color;
          c.globalAlpha = k * 0.45;
          c.beginPath(); c.ellipse(e.x, e.y, rr, rr * 0.7, 0, 0, Math.PI * 2); c.fill();
          c.globalAlpha = k;
          c.strokeStyle = '#fff';
          c.lineWidth = 4;
          c.stroke();
          if (e.fx === 'rock') {
            c.fillStyle = '#8a7a5a';
            for (let i = 0; i < 5; i++) {
              const a = i * 1.26 + e.x;
              c.fillRect(e.x + Math.cos(a) * e.r * 0.5 - 6, e.y + Math.sin(a) * e.r * 0.35 - 6 - k * 30, 12, 12);
            }
          }
          break;
        }
        case 'pokeball': {
          const rr = 50 * (1 - k) + 8;
          c.globalAlpha = k;
          c.fillStyle = '#ffffff';
          c.shadowColor = '#ff5050';
          c.shadowBlur = 25;
          c.beginPath(); c.arc(e.x, e.y - LIFT, rr, 0, Math.PI * 2); c.fill();
          break;
        }
      }
      c.restore();
    }

    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    this.drawWeather(c);
    for (const s of this.sides) this.drawNameplate(c, s);

    c.textAlign = 'center';
    for (const tx of this.texts) {
      const k = tx.life / tx.max;
      c.globalAlpha = Math.min(1, k * 3);
      const pop = k > 0.85 ? 1 + (k - 0.85) * 2 : 1;
      c.font = `900 ${Math.round(tx.size * pop)}px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(10,15,30,.9)';
      c.strokeText(tx.str, tx.x, tx.y);
      c.fillStyle = tx.color;
      c.fillText(tx.str, tx.x, tx.y);
    }
    c.globalAlpha = 1;
  }

  drawProjectile(c, p) {
    const col = TYPES[p.mv.type].color, x = p.x, y = p.y - LIFT, r = p.r;
    c.save();
    c.globalAlpha = 0.25;
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.4, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = p.missed ? 0.5 : 1;
    c.translate(x, y);
    const ang = Math.atan2(p.vy, p.vx);
    c.shadowColor = col;
    c.shadowBlur = 14;
    switch (p.mv.fx) {
      case 'star': {
        c.rotate(p.rot);
        c.fillStyle = col;
        c.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 ? r * 0.45 : r * 1.2, a = i * Math.PI / 5;
          c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath(); c.fill();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(0, 0, r * 0.3, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'leaf': {
        c.rotate(p.rot);
        c.fillStyle = '#5fd35a';
        c.beginPath(); c.ellipse(0, 0, r * 1.3, r * 0.55, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#d8ffb0'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.stroke();
        break;
      }
      case 'crescent': {
        c.rotate(ang);
        c.strokeStyle = '#fff';
        c.lineWidth = 4;
        c.beginPath(); c.arc(-r * 0.4, 0, r * 1.2, -1.1, 1.1); c.stroke();
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.beginPath(); c.arc(-r * 0.7, 0, r * 1.2, -1.1, 1.1); c.stroke();
        break;
      }
      case 'rock': {
        c.rotate(p.rot * 0.5);
        c.fillStyle = '#a89060';
        c.beginPath();
        c.moveTo(r * 1.2, 0); c.lineTo(r * 0.3, r); c.lineTo(-r, r * 0.6); c.lineTo(-r * 0.9, -r * 0.7); c.lineTo(r * 0.2, -r);
        c.closePath(); c.fill();
        c.strokeStyle = '#5a4a30'; c.lineWidth = 2; c.stroke();
        break;
      }
      case 'bolt': {
        c.rotate(ang);
        c.strokeStyle = '#fff8b0';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(-r * 2.2, 0);
        for (let i = 1; i <= 4; i++) c.lineTo(-r * 2.2 + i * r * 0.9, (i % 2 ? -1 : 1) * r * 0.7 * Math.random());
        c.stroke();
        c.fillStyle = col;
        c.beginPath(); c.arc(r * 0.6, 0, r * 0.9, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'flame': {
        const fl = 1 + Math.sin(p.rot * 2) * 0.15;
        const gr = c.createRadialGradient(0, 0, 1, 0, 0, r * 1.3 * fl);
        gr.addColorStop(0, '#fff3b0');
        gr.addColorStop(0.4, '#ffb030');
        gr.addColorStop(1, 'rgba(230,60,10,0)');
        c.fillStyle = gr;
        c.beginPath(); c.arc(0, 0, r * 1.3 * fl, 0, Math.PI * 2); c.fill();
        break;
      }
      default: {
        const gr = c.createRadialGradient(0, 0, 1, 0, 0, r * 1.2);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.45, col);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.beginPath(); c.arc(0, 0, r * 1.2, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
  }

  drawWeather(c) {
    const w = this.weatherNow();
    if (!w) return;
    const B = ARENA_BOUNDS, t = this.clock;
    c.save();
    c.beginPath();
    c.rect(B.x, B.y, B.w, B.h);
    c.clip();
    if (w === 'sun') {
      c.fillStyle = 'rgba(255,190,80,.10)';
      c.fillRect(B.x, B.y, B.w, B.h);
      c.globalAlpha = 0.08 + Math.sin(t * 1.5) * 0.03;
      c.fillStyle = '#fff3c0';
      for (let i = 0; i < 5; i++) {
        const x = B.x + 120 + i * 260 + Math.sin(t * 0.4 + i) * 40;
        c.beginPath();
        c.moveTo(x, B.y); c.lineTo(x + 70, B.y); c.lineTo(x - 140, B.y + B.h); c.lineTo(x - 260, B.y + B.h);
        c.closePath(); c.fill();
      }
    } else if (w === 'rain') {
      c.fillStyle = 'rgba(30,60,130,.14)';
      c.fillRect(B.x, B.y, B.w, B.h);
      c.strokeStyle = 'rgba(190,215,255,.55)';
      c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 0; i < 120; i++) {
        const x = B.x + ((i * 97.3 + t * 160) % B.w);
        const y = B.y + ((i * 53.7 + t * 900) % B.h);
        c.moveTo(x, y); c.lineTo(x - 5, y + 16);
      }
      c.stroke();
    } else if (w === 'snow') {
      c.fillStyle = 'rgba(210,230,255,.16)';
      c.fillRect(B.x, B.y, B.w, B.h);
      c.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 90; i++) {
        const x = B.x + ((i * 113.1 + Math.sin(t * 0.7 + i) * 18 + B.w) % B.w);
        const y = B.y + ((i * 47.9 + t * 70) % B.h);
        c.fillRect(x, y, 2.5, 2.5);
      }
    } else if (w === 'sand') {
      c.fillStyle = 'rgba(190,150,80,.18)';
      c.fillRect(B.x, B.y, B.w, B.h);
      c.fillStyle = 'rgba(230,200,140,.6)';
      for (let i = 0; i < 140; i++) {
        const x = B.x + ((i * 131.7 + t * 520) % B.w);
        const y = B.y + ((i * 71.3 + Math.sin(t * 2 + i) * 12 + B.h) % B.h);
        c.fillRect(x, y, 3, 1.5);
      }
    }
    c.restore();
  }

  drawNameplate(c, s) {
    if (s.mon.fainted || s.switching > 0.05 && !s.swapped) return;
    const m = s.mon, h = s.spriteH();
    const by = s.y - h - 6, bw = m.boss ? 110 : 50;
    const ratio = m.hp / m.maxHp;
    c.fillStyle = 'rgba(10,15,30,.75)';
    c.fillRect(s.x - bw / 2 - 1, by - 1, bw + 2, 7);
    c.fillStyle = ratio > 0.5 ? '#4ade80' : ratio > 0.2 ? '#facc15' : '#ef4444';
    c.fillRect(s.x - bw / 2, by, bw * ratio, 5);
    c.fillStyle = m.boss ? '#ffd24a' : this.ffa ? FFA_COLORS[s.idx % FFA_COLORS.length] : (s.idx === 0 ? '#4fb3ff' : '#ff5a5a');
    c.beginPath();
    c.moveTo(s.x - 5, by - 12); c.lineTo(s.x + 5, by - 12); c.lineTo(s.x, by - 5);
    c.closePath(); c.fill();
    if (s.cast && s.cast.kind === 'beam') {
      const k = 1 - s.cast.t / s.cast.max;
      c.fillStyle = 'rgba(10,15,30,.75)';
      c.fillRect(s.x - bw / 2 - 1, by + 7, bw + 2, 5);
      c.fillStyle = '#fff';
      c.fillRect(s.x - bw / 2, by + 8, bw * k, 3);
    }
    c.font = "800 13px 'Malgun Gothic', sans-serif";
    c.textAlign = 'center';
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(10,15,30,.85)';
    c.strokeText(m.sp.name, s.x, s.y + 22);
    c.fillStyle = '#fff';
    c.fillText(m.sp.name, s.x, s.y + 22);
  }
}

/* ------------------------------------------------------------------ */
/*  Arena background                                                    */
/* ------------------------------------------------------------------ */
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawArena(c, A) {
  const B = ARENA_BOUNDS;
  let seed = 1234;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const backdrop = { frost: ['#a9cde3', '#6f9bbb'], grove: ['#3d7a34', '#28561f'], crater: ['#3a2420', '#1d100d'], stadium: ['#1b1638', '#0b0920'] }[A.deco];

  c.clearRect(0, 0, W, H);
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, backdrop[0]);
  bg.addColorStop(1, backdrop[1]);
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // 바깥 장식
  for (let i = 0; i < 120; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (x > B.x - 10 && x < B.x + B.w + 10 && y > B.y - 10 && y < B.y + B.h + 10) continue;
    c.globalAlpha = 0.25;
    c.fillStyle = A.deco === 'frost' ? '#ffffff' : A.deco === 'grove' ? '#1d4a17' : A.deco === 'crater' ? '#ff7a2a' : '#7de3ff';
    c.beginPath(); c.arc(x, y, rnd() * 4 + 1, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;

  c.save();
  roundRectPath(c, B.x, B.y, B.w, B.h, 18);
  c.clip();

  const T = 60;
  for (let y = B.y; y < B.y + B.h; y += T) {
    for (let x = B.x; x < B.x + B.w; x += T) {
      const alt = ((x - B.x) / T + (y - B.y) / T) % 2 === 0;
      c.fillStyle = alt ? A.floor[0] : A.floor[1];
      c.fillRect(x, y, T, T);
      c.globalAlpha = rnd() * 0.06;
      c.fillStyle = rnd() > 0.5 ? '#fff' : '#000';
      c.fillRect(x, y, T, T);
      c.globalAlpha = 1;
    }
  }
  c.strokeStyle = A.line;
  c.lineWidth = 1;
  c.globalAlpha = 0.5;
  for (let x = B.x; x <= B.x + B.w; x += T) { c.beginPath(); c.moveTo(x, B.y); c.lineTo(x, B.y + B.h); c.stroke(); }
  for (let y = B.y; y <= B.y + B.h; y += T) { c.beginPath(); c.moveTo(B.x, y); c.lineTo(B.x + B.w, y); c.stroke(); }
  c.globalAlpha = 1;

  const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  if (A.deco === 'frost') {
    for (let i = 0; i < 30; i++) {
      c.strokeStyle = 'rgba(255,255,255,.5)';
      c.lineWidth = 1;
      let x = B.x + rnd() * B.w, y = B.y + rnd() * B.h;
      c.beginPath(); c.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += rnd() * 30 - 15; y += rnd() * 30 - 15; c.lineTo(x, y); }
      c.stroke();
    }
    c.strokeStyle = A.accent;
    c.lineWidth = 3;
    c.globalAlpha = 0.8;
    c.beginPath(); c.arc(cx, cy, 150, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, 128, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(255,255,255,.75)';
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 - Math.PI / 2;
      const rr = i % 4 === 0 ? 120 : i % 2 === 0 ? 60 : 22;
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
    c.strokeStyle = A.accent; c.lineWidth = 1.5; c.stroke();
    for (let i = 0; i < 40; i++) {
      const edge = rnd() < 0.5;
      const x = edge ? B.x + rnd() * B.w : (rnd() < 0.5 ? B.x : B.x + B.w);
      const y = edge ? (rnd() < 0.5 ? B.y : B.y + B.h) : B.y + rnd() * B.h;
      const gr = c.createRadialGradient(x, y, 0, x, y, 50);
      gr.addColorStop(0, 'rgba(255,255,255,.85)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.beginPath(); c.arc(x, y, 50, 0, Math.PI * 2); c.fill();
    }
  } else if (A.deco === 'grove') {
    for (let i = 0; i < 400; i++) {
      const x = B.x + rnd() * B.w, y = B.y + rnd() * B.h;
      c.strokeStyle = rnd() < 0.5 ? '#5e9c43' : '#9bd46e';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y - 6); c.moveTo(x, y); c.lineTo(x + 2, y - 7); c.stroke();
    }
    for (let i = 0; i < 70; i++) {
      c.fillStyle = ['#ffffff', '#ffe066', '#ff8fb1'][Math.floor(rnd() * 3)];
      c.beginPath(); c.arc(B.x + rnd() * B.w, B.y + rnd() * B.h, 2.5, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,.55)';
    c.lineWidth = 4;
    c.beginPath(); c.arc(cx, cy, 100, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(cx, B.y); c.lineTo(cx, cy - 100); c.moveTo(cx, cy + 100); c.lineTo(cx, B.y + B.h); c.stroke();
    c.strokeRect(B.x + 20, cy - 120, 120, 240);
    c.strokeRect(B.x + B.w - 140, cy - 120, 120, 240);
  } else if (A.deco === 'crater') {
    c.shadowColor = '#ff6a00';
    c.shadowBlur = 12;
    for (let i = 0; i < 22; i++) {
      c.strokeStyle = 'rgba(255,120,40,.7)';
      c.lineWidth = 2;
      let x = B.x + rnd() * B.w, y = B.y + rnd() * B.h;
      c.beginPath(); c.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += rnd() * 50 - 25; y += rnd() * 50 - 25; c.lineTo(x, y); }
      c.stroke();
    }
    c.shadowBlur = 0;
    for (let i = 0; i < 90; i++) {
      c.fillStyle = rnd() < 0.5 ? '#3d2a24' : '#6b4f44';
      c.beginPath(); c.arc(B.x + rnd() * B.w, B.y + rnd() * B.h, rnd() * 4 + 1, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(255,122,42,.45)';
    c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, 130, 0, Math.PI * 2); c.stroke();
  } else if (A.deco === 'stadium') {
    c.shadowColor = '#5ad8ff';
    c.shadowBlur = 14;
    c.strokeStyle = '#5ad8ff';
    c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, 110, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(cx, B.y); c.lineTo(cx, B.y + B.h); c.stroke();
    c.strokeRect(B.x + 30, cy - 150, 160, 300);
    c.strokeRect(B.x + B.w - 190, cy - 150, 160, 300);
    c.shadowColor = A.accent;
    c.strokeStyle = A.accent;
    c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.stroke();
    c.shadowBlur = 0;
  }
  c.restore();

  c.lineWidth = 10;
  c.strokeStyle = 'rgba(10,15,30,.55)';
  roundRectPath(c, B.x - 5, B.y - 5, B.w + 10, B.h + 10, 22);
  c.stroke();
  c.lineWidth = 3;
  c.strokeStyle = A.accent;
  roundRectPath(c, B.x, B.y, B.w, B.h, 18);
  c.stroke();

  for (const q of A.rects) drawRectObstacle(c, q, A);
  for (const o of A.circles) drawCircleObstacle(c, o, A);
}

function drawRectObstacle(c, q) {
  c.fillStyle = 'rgba(0,0,0,.22)';
  roundRectPath(c, q.x + 6, q.y + 10, q.w, q.h, 10);
  c.fill();
  if (q.kind === 'ice') {
    const gr = c.createLinearGradient(q.x, q.y, q.x + q.w, q.y + q.h);
    gr.addColorStop(0, '#f2fbff');
    gr.addColorStop(1, '#8ecbea');
    c.fillStyle = gr;
    roundRectPath(c, q.x, q.y - 14, q.w, q.h + 14, 12);
    c.fill();
    c.strokeStyle = '#5fa7cf';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.beginPath();
    c.moveTo(q.x + 14, q.y - 6); c.lineTo(q.x + q.w * 0.45, q.y - 6); c.lineTo(q.x + 20, q.y + q.h * 0.55);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.8)';
    c.beginPath(); c.moveTo(q.x + q.w * 0.6, q.y + 8); c.lineTo(q.x + q.w * 0.8, q.y + q.h * 0.5); c.stroke();
  } else {
    const gr = c.createLinearGradient(q.x, q.y, q.x, q.y + q.h);
    gr.addColorStop(0, '#8a7468');
    gr.addColorStop(1, '#4a3a32');
    c.fillStyle = gr;
    roundRectPath(c, q.x, q.y - 10, q.w, q.h + 10, 10);
    c.fill();
    c.strokeStyle = '#2c201b';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.15)';
    c.fillRect(q.x + 8, q.y - 4, q.w - 16, 6);
  }
}

function drawCircleObstacle(c, o, A) {
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.beginPath(); c.ellipse(o.x + 4, o.y + 6, o.r * 1.1, o.r * 0.6, 0, 0, Math.PI * 2); c.fill();
  if (o.kind === 'crystal') {
    const gr = c.createLinearGradient(o.x - o.r, o.y - o.r * 2, o.x + o.r, o.y);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#4fb0e8');
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(o.x, o.y - o.r * 2.2); c.lineTo(o.x + o.r, o.y - o.r * 0.6); c.lineTo(o.x + o.r * 0.5, o.y + o.r * 0.4);
    c.lineTo(o.x - o.r * 0.5, o.y + o.r * 0.4); c.lineTo(o.x - o.r, o.y - o.r * 0.6);
    c.closePath(); c.fill();
    c.strokeStyle = '#2f86bd'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.8)';
    c.beginPath(); c.moveTo(o.x, o.y - o.r * 2.2); c.lineTo(o.x, o.y + o.r * 0.4); c.stroke();
  } else if (o.kind === 'tree') {
    c.fillStyle = '#6b4a2b';
    c.fillRect(o.x - 6, o.y - 10, 12, 16);
    const layers = [['#2f6b2a', 1, 0], ['#3f8a35', 0.8, -8], ['#58a947', 0.55, -14]];
    for (const [col, k, oy] of layers) {
      c.fillStyle = col;
      c.beginPath(); c.arc(o.x, o.y - o.r * 0.9 + oy, o.r * 1.25 * k, 0, Math.PI * 2); c.fill();
    }
  } else if (o.kind === 'bush') {
    c.fillStyle = '#3f8a35';
    for (const [dx, dy] of [[-10, 0], [10, 0], [0, -8]]) {
      c.beginPath(); c.arc(o.x + dx, o.y + dy - 6, o.r * 0.75, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#ff6b8a';
    c.beginPath(); c.arc(o.x + 4, o.y - 16, 3, 0, Math.PI * 2); c.fill();
  } else if (o.kind === 'rock') {
    const gr = c.createLinearGradient(o.x, o.y - o.r * 1.5, o.x, o.y + o.r * 0.5);
    gr.addColorStop(0, '#8d7a6e');
    gr.addColorStop(1, '#43352e');
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(o.x - o.r, o.y + o.r * 0.3); c.lineTo(o.x - o.r * 0.8, o.y - o.r * 0.9); c.lineTo(o.x - o.r * 0.1, o.y - o.r * 1.4);
    c.lineTo(o.x + o.r * 0.8, o.y - o.r * 0.8); c.lineTo(o.x + o.r, o.y + o.r * 0.3);
    c.closePath(); c.fill();
    c.strokeStyle = '#241a15'; c.lineWidth = 2; c.stroke();
  } else if (o.kind === 'pillar') {
    c.fillStyle = '#1a1533';
    c.beginPath(); c.arc(o.x, o.y - 10, o.r, 0, Math.PI * 2); c.fill();
    c.shadowColor = A.accent;
    c.shadowBlur = 16;
    c.strokeStyle = A.accent;
    c.lineWidth = 3;
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(o.x, o.y - 10, 4, 0, Math.PI * 2); c.fill();
  }
}
