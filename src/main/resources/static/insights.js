'use strict';
/* Tier list, flex board, progress history and shareable build cards. Uses helpers from app.js. */

const gradeFor = (perPiece) => (perPiece >= 7 ? 'SS' : perPiece >= 6 ? 'S' : perPiece >= 4.5 ? 'A'
  : perPiece >= 3 ? 'B' : perPiece >= 1.5 ? 'C' : 'D');
const cvTier = (cv) => (cv >= 220 ? 'SS' : cv >= 190 ? 'S' : cv >= 160 ? 'A' : cv >= 130 ? 'B' : cv >= 90 ? 'C' : 'D');
const TIER_ORDER = ['SS', 'S', 'A', 'B', 'C', 'D'];

Object.assign(state, { tierMetric: 'rolls', history: null, historyLoading: false, historyError: null,
  progressMetric: 'rolls', progressChar: '' });

/* ---------- tier list ---------- */

function renderTiers() {
  const builds = loadedPlayers().flatMap((p) => p.characters.map((c) => ({ p, c })));
  if (!builds.length) return emptyPanel('No builds yet', 'Tiers appear once players have character details in their showcase.');

  const byRolls = state.tierMetric === 'rolls';
  const groups = new Map();
  for (const b of builds) groups.set(b.c.name, [...(groups.get(b.c.name) || []), b]);
  const rows = [...groups.entries()].map(([name, list]) => {
    const avg = list.reduce((s, b) => s + (byRolls ? b.c.artifactScore : b.c.critValue), 0) / list.length;
    const best = list.reduce((x, y) => ((byRolls ? y.c.artifactScore > x.c.artifactScore : y.c.critValue > x.c.critValue) ? y : x));
    return { name, c: list[0].c, owners: list.length, avg, best, tier: byRolls ? gradeFor(avg / 5) : cvTier(avg) };
  }).sort((a, b) => b.avg - a.avg);

  const toggle = (id, label) => `<button type="button" class="seg ${state.tierMetric === id ? 'on' : ''}" data-action="tier-metric" data-id="${id}" aria-pressed="${state.tierMetric === id}">${label}</button>`;

  return `<div class="controls"><div class="segmented">${toggle('rolls', 'Roll score')}${toggle('cv', 'Crit value')}</div>
      <span class="muted">Average across everyone who shows that character. Click one to compare builds.</span></div>
    <div class="tier-list">${TIER_ORDER.map((t) => {
      const inTier = rows.filter((r) => r.tier === t);
      return `<div class="tier-row"><div class="tier-label grade-${t.toLowerCase()}">${t}</div>
        <div class="tier-items">${inTier.length ? inTier.map((r) => `
          <button type="button" class="tier-char ${elClass(r.c.element)}" data-action="open-char" data-name="${esc(r.name)}"
            title="${esc(r.name)}: best is ${esc(playerName(r.best.p))}'s">
            ${img(r.c.iconUrl, 'icon', r.name)}
            <span class="tc-name">${esc(r.name)}</span>
            <span class="tc-val">${byRolls ? r.avg.toFixed(1) + ' rolls' : r.avg.toFixed(1) + ' CV'}</span>
            <span class="tc-own">${r.owners} owner${r.owners === 1 ? '' : 's'}</span>
          </button>`).join('') : '<span class="muted small">—</span>'}</div></div>`;
    }).join('')}</div>`;
}

/* ---------- flex board ---------- */

function flexStats(p, ownerCounts) {
  const five = p.characters.filter((c) => c.rarity === 5);
  const four = p.characters.filter((c) => c.rarity !== 5);
  const fiveCons = five.reduce((s, c) => s + c.constellation, 0);
  const fiveRefines = p.characters.filter((c) => c.weapon?.rarity === 5).reduce((s, c) => s + c.weapon.refinement - 1, 0);
  const c6 = four.filter((c) => c.constellation === 6).length;
  const r5 = p.characters.filter((c) => c.weapon && c.weapon.rarity < 5 && c.weapon.refinement === 5).length;
  const rarest = [...p.characters].sort((a, b) => ownerCounts.get(a.name) - ownerCounts.get(b.name)
    || b.rarity - a.rarity || b.constellation - a.constellation)[0] || null;
  return { five: five.length, fiveCons, fiveRefines, c6, r5, rarest,
    score: fiveCons * 3 + fiveRefines * 3 + c6 + r5 };
}

function renderFlex() {
  const players = loadedPlayers().filter((p) => p.characters.length);
  if (!players.length) return emptyPanel('Nothing to flex yet', 'Flex scores need players with character details in their showcase.');
  const ownerCounts = new Map();
  for (const p of players) for (const name of new Set(p.characters.map((c) => c.name))) ownerCounts.set(name, (ownerCounts.get(name) || 0) + 1);

  const rows = players.map((p) => ({ p, s: flexStats(p, ownerCounts) })).sort((a, b) => b.s.score - a.s.score);
  return `<p class="intro muted">Flex score = 3 × (5★ constellations + 5★ weapon refinements) + C6 4★ characters + R5 4★ weapons.
      Only showcased characters count.</p>
    <div class="table-wrap"><table class="board"><thead><tr>
      <th class="rank">#</th><th>Player</th><th class="num">Flex score</th><th class="num">5★ shown</th>
      <th class="num">5★ cons</th><th class="num">5★ refines</th><th class="num">C6 4★</th><th class="num">R5 4★</th><th>Rarest in the group</th>
    </tr></thead><tbody>${withRanks(rows, (r) => r.s.score).map(({ item: { p, s }, rank }) => `<tr>
      <td class="rank">${rankBadge(rank)}</td><td>${playerCell(p)}</td>
      <td class="num active">${s.score}</td><td class="num">${s.five}</td><td class="num">${s.fiveCons}</td>
      <td class="num">${s.fiveRefines}</td><td class="num">${s.c6}</td><td class="num">${s.r5}</td>
      <td>${s.rarest ? `<span class="char-cell ${elClass(s.rarest.element)}">${img(s.rarest.iconUrl, 'mini', s.rarest.name)}
        <span><span class="name">${esc(s.rarest.name)}</span> <span class="sub">C${s.rarest.constellation} ·
        ${ownerCounts.get(s.rarest.name) === 1 ? 'only one in the group' : `${ownerCounts.get(s.rarest.name)} owners`}</span></span></span>` : '—'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

/* ---------- progress history ---------- */

const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const hasChars = (s) => Object.keys(s.characters || {}).length > 0;
const abyssText = (v) => `${Math.floor(v / 1000)}-${Math.floor((v % 1000) / 100)} · ${v % 100}★`;

const PROGRESS_METRICS = [
  { id: 'rolls', label: 'Average roll score', get: (s) => (hasChars(s) ? s.avgRollScore : null), fmt: (v) => v.toFixed(1) },
  { id: 'bestCv', label: 'Best crit value', get: (s) => (hasChars(s) ? s.bestCritValue : null), fmt: (v) => v.toFixed(1) },
  { id: 'ar', label: 'Adventure Rank', get: (s) => s.adventureRank, fmt: (v) => String(Math.round(v)) },
  { id: 'achievements', label: 'Achievements', get: (s) => s.achievements, fmt: int },
  { id: 'abyss', label: 'Spiral Abyss', get: (s) => s.abyssScore || null, fmt: abyssText,
    tick: (v) => `${Math.floor(v / 1000)}-${Math.floor((v % 1000) / 100)}` },
  { id: 'friend', label: 'Characters at max friendship', get: (s) => s.maxFriendshipCharacters, fmt: (v) => String(Math.round(v)) },
  { id: 'charCv', label: 'One character: crit value', perChar: true, get: (s, n) => s.characters?.[n]?.critValue ?? null, fmt: (v) => v.toFixed(1) },
  { id: 'charRolls', label: 'One character: roll score', perChar: true, get: (s, n) => s.characters?.[n]?.rollScore ?? null, fmt: (v) => v.toFixed(1) },
];

async function loadHistory() {
  state.historyLoading = true;
  try {
    state.history = await api('/api/history');
    state.historyError = null;
  } catch (e) {
    state.historyError = e.message;
  } finally {
    state.historyLoading = false;
    if (state.tab === 'progress') render();
  }
}

/** Fixed color per player, by their position in the friend list, so filtering never repaints anyone. */
const playerColor = (uid) => SERIES_COLORS[Math.max(0, state.players.findIndex((p) => p.uid === uid)) % SERIES_COLORS.length];
const shortDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function renderProgress() {
  if (!state.history) {
    if (!state.historyLoading && !state.historyError) loadHistory();
    return state.historyError ? emptyPanel("Couldn't load history", state.historyError) : '<div class="panel empty">Loading history…</div>';
  }
  const players = loadedPlayers().filter((p) => (state.history[p.uid] || []).length);
  if (!players.length) return emptyPanel('No history yet', 'A snapshot is saved each day the leaderboard loads. Come back tomorrow.');

  const metric = PROGRESS_METRICS.find((m) => m.id === state.progressMetric);
  const allChars = [...new Set(players.flatMap((p) => state.history[p.uid].flatMap((s) => Object.keys(s.characters || {}))))].sort();
  if (metric.perChar && !allChars.includes(state.progressChar)) state.progressChar = allChars[0] || '';

  const series = players.slice(0, SERIES_COLORS.length).map((p) => ({
    uid: p.uid, name: playerName(p), color: playerColor(p.uid),
    points: state.history[p.uid].map((s) => ({ date: s.date, v: metric.get(s, state.progressChar) })).filter((x) => x.v != null),
  })).filter((s) => s.points.length);
  const dates = [...new Set(series.flatMap((s) => s.points.map((x) => x.date)))].sort();

  const controls = `<div class="controls">
    <label>Show <select id="progress-metric">${PROGRESS_METRICS.map((m) => `<option value="${m.id}" ${m.id === metric.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
    ${metric.perChar ? `<label>Character <select id="progress-char">${allChars.map((n) => `<option ${n === state.progressChar ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
  </div>`;

  const chart = series.length
    ? lineChart(series, dates, metric)
    : '<div class="panel empty">Nobody has data for this yet.</div>';
  const note = dates.length === 1 ? `<p class="muted small">History started ${shortDate(dates[0])}. Lines appear once there are two days of snapshots.</p>` : '';
  const folded = players.length > SERIES_COLORS.length ? `<p class="muted small">Showing the first ${SERIES_COLORS.length} players.</p>` : '';

  return `${controls}${chart}${note}${folded}${renderGlowUps(players)}`;
}

function lineChart(series, dates, metric) {
  // Draw at the real on-screen width so text stays readable on phones
  const W = Math.max(320, Math.min(1000, (view.clientWidth || 1000) - 34));
  const narrow = W < 600;
  const H = narrow ? 240 : 300;
  const m = { l: narrow ? 48 : 64, r: narrow ? 84 : 130, t: 14, b: 34 };
  const t0 = Date.parse(dates[0]); const t1 = Date.parse(dates[dates.length - 1]);
  const x = (d) => (t1 === t0 ? m.l + (W - m.l - m.r) / 2 : m.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - m.l - m.r));
  const values = series.flatMap((s) => s.points.map((p) => p.v));
  let lo = Math.min(...values); let hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const tickFmt = metric.tick || metric.fmt;

  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const grid = ticks.map((v) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="axis" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(tickFmt(v))}</text>`).join('');
  const xLabelDates = dates.length <= 3 ? dates : [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]];
  const xLabels = xLabelDates.map((d) => `<text class="axis" x="${x(d)}" y="${H - 10}" text-anchor="middle">${esc(shortDate(d))}</text>`).join('');

  const lines = series.map((s) => {
    const path = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${s.points.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.v)}" r="4" fill="${s.color}" stroke="var(--bg-raised)" stroke-width="2"/>`).join('')}`;
  }).join('');

  // Direct labels at line ends (up to 4 series), nudged apart so they don't collide
  let ends = '';
  if (series.length <= 4) {
    const labels = series.map((s) => { const last = s.points[s.points.length - 1]; return { s, x: x(last.date), y: y(last.v) }; })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
    ends = labels.map((l) => `<text class="end-label" x="${l.x + 10}" y="${l.y + 4}">${esc(l.s.name)}</text>`).join('');
  }

  const step = dates.length > 1 ? (W - m.l - m.r) / (dates.length - 1) : W - m.l - m.r;
  const hits = dates.map((d, i) => `<rect class="hit" data-i="${i}" x="${x(d) - step / 2}" y="${m.t}" width="${step}" height="${H - m.t - m.b}"/>`).join('');

  chartData = { series, dates, metric, width: W, xs: dates.map((d) => (x(d) / W) * 100) };
  const legend = series.length >= 2
    ? `<div class="legend">${series.map((s) => `<span class="legend-item"><span class="swatch" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>`
    : '';

  const table = `<details class="chart-table"><summary>Show as table</summary><div class="table-wrap"><table class="board">
    <thead><tr><th>Date</th>${series.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}</tr></thead>
    <tbody>${dates.map((d) => `<tr><td>${esc(shortDate(d))}</td>${series.map((s) => {
      const p = s.points.find((q) => q.date === d);
      return `<td class="num">${p ? esc(metric.fmt(p.v)) : '—'}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div></details>`;

  return `<div class="panel chart">
    <h2 class="chart-title">${esc(metric.label)}${metric.perChar ? ` · ${esc(state.progressChar)}` : ''}</h2>
    ${legend}
    <div class="chart-area" id="chart-area">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(metric.label)} over time">
        ${grid}${xLabels}<line id="crosshair" class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>
        ${lines}${ends}${hits}
      </svg>
      <div class="chart-tip" id="chart-tip" hidden></div>
    </div>
    ${table}
  </div>`;
}

let chartData = null;

view.addEventListener('mouseover', (e) => {
  const hit = e.target.closest?.('.hit');
  const tip = document.getElementById('chart-tip');
  const cross = document.getElementById('crosshair');
  if (!tip || !chartData) return;
  if (!hit) { tip.hidden = true; cross?.setAttribute('visibility', 'hidden'); return; }
  const i = Number(hit.dataset.i);
  const date = chartData.dates[i];
  const rows = chartData.series.map((s) => ({ s, p: s.points.find((q) => q.date === date) }))
    .filter((r) => r.p).sort((a, b) => b.p.v - a.p.v);
  tip.innerHTML = `<div class="tip-date">${esc(shortDate(date))}</div>${rows.map(({ s, p }) =>
    `<div class="tip-row"><span class="swatch" style="background:${s.color}"></span><span>${esc(s.name)}</span><b>${esc(chartData.metric.fmt(p.v))}</b></div>`).join('')}`;
  const pctX = chartData.xs[i];
  tip.style.left = `${pctX}%`;
  tip.classList.toggle('flip', pctX > 60);
  tip.hidden = false;
  const svgX = (pctX / 100) * chartData.width;
  cross?.setAttribute('x1', svgX); cross?.setAttribute('x2', svgX); cross?.setAttribute('visibility', 'visible');
});

function renderGlowUps(players) {
  const DAY = 86400000;
  const changes = players.map((p) => {
    const h = state.history[p.uid];
    const latest = h[h.length - 1];
    if (!hasChars(latest)) return null;
    const cutoff = Date.parse(latest.date) - 7 * DAY;
    const base = [...h].reverse().find((s) => Date.parse(s.date) <= cutoff) || h[0];
    if (base === latest) return null;
    let bestChar = null;
    for (const [name, now] of Object.entries(latest.characters || {})) {
      const before = base.characters?.[name];
      if (!before) continue;
      const d = now.rollScore - before.rollScore;
      if (!bestChar || d > bestChar.d) bestChar = { name, d, cv: now.critValue - before.critValue };
    }
    return { p, base, latest, rolls: latest.avgRollScore - base.avgRollScore, cv: latest.bestCritValue - base.bestCritValue,
      ar: latest.adventureRank - base.adventureRank, ach: latest.achievements - base.achievements, bestChar };
  }).filter(Boolean).sort((a, b) => b.rolls - a.rolls || b.cv - a.cv);

  if (!changes.length) return '';
  const sign = (v, f = (n) => n.toFixed(1)) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${f(Math.abs(v))}`;
  return `<h2 class="h2h-heading">Glow-ups this week</h2>
    <div class="award-grid">${changes.map((c, i) => `<div class="panel glow ${i === 0 && c.rolls > 0 ? 'top' : ''}">
      <div class="who">${img(c.p.avatarUrl, 'pfp')}<div><div class="name">${esc(playerName(c.p))}${i === 0 && c.rolls > 0 ? ' <span class="title-chip">Biggest glow-up</span>' : ''}</div>
        <div class="sub">since ${esc(shortDate(c.base.date))}</div></div></div>
      <dl class="quiz-stats">
        <div><dt>Avg rolls</dt><dd>${sign(c.rolls)}</dd></div>
        <div><dt>Best CV</dt><dd>${sign(c.cv)}</dd></div>
        <div><dt>AR</dt><dd>${sign(c.ar, String)}</dd></div>
        <div><dt>Achievements</dt><dd>${sign(c.ach, String)}</dd></div>
      </dl>
      ${c.bestChar && c.bestChar.d > 0 ? `<p class="small">Most improved: <b>${esc(c.bestChar.name)}</b> (${sign(c.bestChar.d)} rolls, ${sign(c.bestChar.cv)} CV)</p>` : ''}
    </div>`).join('')}</div>`;
}

/* ---------- shareable build cards ---------- */

const GRADE_COLORS = { SS: '#ffd76a', S: '#f0b86a', A: '#b896e8', B: '#6fb3e0', C: '#8fbf8a', D: '#9a98a6' };
const ELEMENT_COLORS = { pyro: '#ef7938', hydro: '#4cc2f1', anemo: '#74c2a8', electro: '#b08fc2', dendro: '#a5c83b', cryo: '#9fd6e3', geo: '#fab72e' };
let cardBlob = null;
let cardName = 'build.png';

const loadImage = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = () => resolve(im);
  im.onerror = () => resolve(null);
  im.src = src;
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function gradeChip(ctx, grade, x, y, size = 30) {
  if (!grade) return;
  const color = GRADE_COLORS[grade];
  ctx.save();
  roundRect(ctx, x, y, size + (grade.length > 1 ? 10 : 0), size, 7);
  ctx.fillStyle = '#11131c'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = color; ctx.font = `800 ${Math.round(size * 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(grade, x + (size + (grade.length > 1 ? 10 : 0)) / 2, y + size / 2 + 1);
  ctx.restore();
}

async function drawBuildCard(canvas, p, c) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width; const H = canvas.height;
  const accent = ELEMENT_COLORS[(c.element || '').toLowerCase()] || '#d3bc8e';
  const font = (weight, size) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  const [splash, weaponIcon, ...artIcons] = await Promise.all([
    loadImage(c.iconUrl?.replace('UI_AvatarIcon_Side_', 'UI_Gacha_AvatarImg_')),
    loadImage(c.weapon?.iconUrl),
    ...c.artifacts.map((a) => loadImage(a.iconUrl)),
  ]);

  ctx.fillStyle = '#11131c'; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.78, H * 0.45, 40, W * 0.78, H * 0.45, W * 0.6);
  glow.addColorStop(0, `${accent}66`); glow.addColorStop(1, '#11131c00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  if (splash) {
    const scale = (H * 1.25) / splash.height;
    const w = splash.width * scale;
    ctx.drawImage(splash, W - w * 0.82, -H * 0.08, w, splash.height * scale);
  }
  const fade = ctx.createLinearGradient(470, 0, 820, 0);
  fade.addColorStop(0, '#11131cff'); fade.addColorStop(1, '#11131c00');
  ctx.fillStyle = fade; ctx.fillRect(470, 0, 350, H);
  ctx.fillStyle = '#11131c'; ctx.fillRect(0, 0, 470, H);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 8, H);

  const L = 52;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#ece5d8'; ctx.font = font(800, 50); ctx.fillText(c.name, L, 92, 560);
  ctx.fillStyle = '#9a98a6'; ctx.font = font(500, 22);
  ctx.fillText(`Lv ${c.level} · C${c.constellation} · Talents ${c.talents.join(' / ') || '—'}`, L, 128);
  ctx.fillStyle = '#e8cf9a'; ctx.font = font(600, 21); ctx.fillText(`${playerName(p)} · UID ${p.uid}`, L, 160, 420);

  if (c.weapon) {
    if (weaponIcon) ctx.drawImage(weaponIcon, L - 4, 182, 64, 64);
    ctx.fillStyle = c.weapon.rarity >= 5 ? '#e0a35a' : '#a98be0'; ctx.font = font(700, 24);
    ctx.fillText(c.weapon.name, L + 72, 210, 340);
    ctx.fillStyle = '#9a98a6'; ctx.font = font(500, 19); ctx.fillText(`Lv ${c.weapon.level} · R${c.weapon.refinement}`, L + 72, 236);
  }

  const s = c.stats;
  const stats = [['HP', int(s.hp)], ['Crit Rate', pct(s.critRate)], ['ATK', int(s.atk)], ['Crit DMG', pct(s.critDmg)],
    ['DEF', int(s.def)], ['Energy Recharge', pct(s.er)], ['Elemental Mastery', int(s.em)], [`${s.dmgBonusType} DMG`, pct(s.dmgBonus)]];
  stats.forEach(([label, value], i) => {
    const col = i % 2; const row = Math.floor(i / 2);
    const x = L + col * 210; const y = 292 + row * 52;
    ctx.fillStyle = '#9a98a6'; ctx.font = font(500, 15); ctx.fillText(label.toUpperCase(), x, y);
    ctx.fillStyle = '#ece5d8'; ctx.font = font(700, 24); ctx.fillText(value, x, y + 26);
  });

  ctx.fillStyle = '#9a98a6'; ctx.font = font(600, 15); ctx.fillText('CRIT VALUE', L, 518);
  ctx.fillStyle = '#e8cf9a'; ctx.font = font(800, 42); ctx.fillText(c.critValue.toFixed(1), L, 560);
  ctx.fillStyle = '#9a98a6'; ctx.font = font(600, 15); ctx.fillText('ARTIFACT ROLLS', L + 210, 518);
  gradeChip(ctx, c.artifactGrade, L + 210, 528, 34);
  ctx.fillStyle = '#ece5d8'; ctx.font = font(700, 26); ctx.fillText(c.artifactScore.toFixed(1), L + 262, 556);

  c.artifacts.forEach((a, i) => {
    const x = L + i * 82; const y = 588;
    roundRect(ctx, x, y, 66, 66, 10); ctx.fillStyle = '#1a1d2a'; ctx.fill();
    if (artIcons[i]) ctx.drawImage(artIcons[i], x + 3, y + 3, 60, 60);
    gradeChip(ctx, a.grade, x + 42, y + 44, 24);
  });

  ctx.save();
  ctx.shadowColor = '#000c'; ctx.shadowBlur = 8;
  ctx.textAlign = 'right'; ctx.fillStyle = '#e8cf9a'; ctx.font = font(700, 18);
  ctx.fillText('Friends Leaderboard', W - 32, 42);
  if (c.artifactSets.length) {
    ctx.fillStyle = '#ece5d8'; ctx.font = font(600, 19);
    ctx.fillText(c.artifactSets.join('  ·  '), W - 32, H - 32, 640);
  }
  ctx.restore();

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function openBuildCard(key) {
  const [uid, avatarId] = key.split(':');
  const p = state.players.find((x) => x.uid === uid);
  const c = p?.characters.find((x) => String(x.avatarId) === avatarId);
  if (!c) return;
  const dialog = document.getElementById('card-dialog');
  const msg = document.getElementById('card-msg');
  const canvas = document.getElementById('card-canvas');
  msg.textContent = 'Drawing…';
  cardBlob = null;
  cardName = `${c.name}-${playerName(p)}`.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') + '.png';
  document.getElementById('card-share').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  document.getElementById('card-copy').hidden = !(navigator.clipboard && window.ClipboardItem);
  if (!dialog.open) dialog.showModal();
  try {
    cardBlob = await drawBuildCard(canvas, p, c);
    msg.textContent = cardBlob ? '' : "Couldn't create the image.";
  } catch (e) {
    msg.textContent = `Couldn't create the image: ${e.message}`;
  }
}

document.getElementById('card-dialog').addEventListener('click', async (e) => {
  const dialog = e.currentTarget;
  const msg = document.getElementById('card-msg');
  if (e.target === dialog) { dialog.close(); return; }
  const action = e.target.closest('[data-card]')?.dataset.card;
  if (!action) return;
  if (action === 'close') { dialog.close(); return; }
  if (!cardBlob) return;
  try {
    if (action === 'download') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(cardBlob); a.download = cardName; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else if (action === 'share') {
      await navigator.share({ files: [new File([cardBlob], cardName, { type: 'image/png' })], title: cardName.replace('.png', '') });
    } else if (action === 'copy') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })]);
      msg.textContent = 'Copied. Paste it into Discord or any chat.';
    }
  } catch (err) {
    if (err.name !== 'AbortError') msg.textContent = err.message;
  }
});

/* ---------- wiring ---------- */

Object.assign(TABS, { tiers: renderTiers, flex: renderFlex, progress: renderProgress });

view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'tier-metric') { state.tierMetric = el.dataset.id; render(); }
  if (el.dataset.action === 'share-card') { e.stopPropagation(); openBuildCard(el.dataset.key); }
});

view.addEventListener('change', (e) => {
  if (e.target.id === 'progress-metric') { state.progressMetric = e.target.value; render(); }
  if (e.target.id === 'progress-char') { state.progressChar = e.target.value; render(); }
});

refreshBtn.addEventListener('click', () => { state.history = null; });
