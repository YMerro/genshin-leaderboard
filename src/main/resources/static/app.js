'use strict';

const state = {
  players: [],
  generatedAt: null,
  loading: false,
  loadError: null,
  tab: 'players',
  playerSort: 'abyss',
  openPlayers: new Set(),
  character: '',          // '' = all characters
  charSort: 'critValue',
  openBuilds: new Set(),  // "uid:avatarId"
  h2hA: null,
  h2hB: null,
};

const view = document.getElementById('view');
const refreshBtn = document.getElementById('refresh');
const updatedEl = document.getElementById('updated');
const form = document.getElementById('add-form');
const formMsg = document.getElementById('form-msg');

/* ---------- helpers ---------- */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const int = (n) => Math.round(n).toLocaleString();
const pct = (n) => `${n.toFixed(1)}%`;
const elClass = (element) => `el-${String(element || 'unknown').toLowerCase()}`;
const img = (src, cls = '', alt = '') => src
  ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.style.visibility='hidden'">`
  : '';

const playerName = (p) => p.nickname || p.label || `UID ${p.uid}`;
const loadedPlayers = () => state.players.filter((p) => !p.error);
const bestBuild = (p) => p.characters.reduce((best, c) => (!best || c.critValue > best.critValue ? c : best), null);
const avgRollScore = (p) => (p.characters.length
  ? p.characters.reduce((sum, c) => sum + c.artifactScore, 0) / p.characters.length
  : -1);
const gradeBadge = (grade) => (grade ? `<span class="grade grade-${grade.toLowerCase()}">${grade}</span>` : '');

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed (HTTP ${res.status})`);
  return body;
}

/** Ranks sorted items; equal keys share a rank (1, 2, 2, 4). */
function withRanks(items, key) {
  let prevKey = null;
  let prevRank = 0;
  return items.map((item, i) => {
    const k = key(item);
    const rank = i > 0 && k === prevKey ? prevRank : i + 1;
    prevKey = k;
    prevRank = rank;
    return { item, rank };
  });
}

const rankBadge = (rank) => `<span class="rank-badge ${rank <= 3 ? `rank-${rank}` : ''}">${rank}</span>`;

function sortHeader(col, activeId, action) {
  const active = col.id === activeId;
  return `<th class="${col.num ? 'num' : ''} ${active ? 'active' : ''}" aria-sort="${active ? 'descending' : 'none'}">
    <button type="button" data-action="${action}" data-id="${col.id}" title="Sort by ${esc(col.title || col.label)}">${esc(col.label)}</button></th>`;
}

const emptyPanel = (title, text) => `<div class="panel empty"><strong>${esc(title)}</strong>${esc(text)}</div>`;

/* ---------- players tab ---------- */

const PLAYER_COLUMNS = [
  {
    id: 'abyss', label: 'Spiral Abyss',
    key: (p) => (p.abyssFloor ? p.abyssFloor * 1000 + (p.abyssChamber ?? 0) * 100 + (p.abyssStars ?? 0) : -1),
    show: (p) => (p.abyssFloor
      ? `${p.abyssFloor}-${p.abyssChamber ?? '?'}${p.abyssStars != null ? ` · ${p.abyssStars}★` : ''}`
      : '—'),
  },
  {
    id: 'theater', label: 'Theater', title: 'Imaginarium Theater',
    key: (p) => (p.theaterAct ? p.theaterAct * 100 + (p.theaterStars ?? 0) : -1),
    show: (p) => (p.theaterAct ? `Act ${p.theaterAct}${p.theaterStars != null ? ` · ${p.theaterStars}★` : ''}` : '—'),
  },
  { id: 'ar', label: 'AR', title: 'Adventure Rank', num: true, key: (p) => p.adventureRank, show: (p) => p.adventureRank },
  { id: 'achievements', label: 'Achievements', num: true, key: (p) => p.achievements, show: (p) => int(p.achievements) },
  {
    id: 'cv', label: 'Best crit value', num: true,
    key: (p) => bestBuild(p)?.critValue ?? -1,
    show: (p) => { const b = bestBuild(p); return b ? `${b.critValue.toFixed(1)} · ${b.name}` : '—'; },
  },
];

function renderPlayers() {
  const loaded = loadedPlayers();
  const failed = state.players.filter((p) => p.error);
  const col = PLAYER_COLUMNS.find((c) => c.id === state.playerSort);
  const sorted = [...loaded].sort((a, b) => col.key(b) - col.key(a));

  const titles = titlesByPlayer();
  let html = '';
  if (sorted.length) {
    html += `<div class="table-wrap"><table class="board">
      <thead><tr><th class="rank">#</th><th>Player</th>
      ${PLAYER_COLUMNS.map((c) => sortHeader(c, state.playerSort, 'player-sort')).join('')}</tr></thead><tbody>`;
    for (const { item: p, rank } of withRanks(sorted, col.key)) {
      const open = state.openPlayers.has(p.uid);
      html += `<tr class="clickable ${open ? 'open' : ''}" data-action="toggle-player" data-uid="${esc(p.uid)}" tabindex="0" aria-expanded="${open}">
        <td class="rank">${rankBadge(rank)}</td>
        <td>${playerCell(p, titles.get(p.uid))}</td>
        ${PLAYER_COLUMNS.map((c) => `<td class="${c.num ? 'num' : ''} ${c.id === col.id ? 'active' : ''}">${esc(c.show(p))}</td>`).join('')}
      </tr>`;
      if (open) html += `<tr class="details"><td colspan="${PLAYER_COLUMNS.length + 2}">${playerDetails(p)}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }

  if (failed.length) {
    html += `<div class="panel failed"><h2>Couldn't load</h2>
      ${failed.map((p) => `<div class="failed-row">
        <span class="name">${esc(p.label || `UID ${p.uid}`)}</span><span class="sub">UID ${esc(p.uid)}</span>
        <span class="error-text">${esc(p.error)}</span>
        <button class="btn small danger" type="button" data-action="remove" data-uid="${esc(p.uid)}" data-name="${esc(p.label || p.uid)}">Remove</button>
      </div>`).join('')}</div>`;
  }
  return html;
}

function playerCell(p, awards = []) {
  const tag = p.label && p.label !== p.nickname ? `<span class="tag">${esc(p.label)}</span>` : '';
  const stale = p.warning ? ` · <span class="warn" title="${esc(p.warning)}">cached</span>` : '';
  const shown = awards.slice(0, 3);
  const more = awards.length - shown.length;
  const titles = awards.length
    ? `<div class="titles">${shown.map((a) => `<span class="title-chip" title="${esc(a.desc)}">${a.icon} ${esc(a.title)}</span>`).join('')}${more > 0 ? `<span class="title-chip more">+${more}</span>` : ''}</div>`
    : '';
  return `<div class="who">${img(p.avatarUrl, 'pfp')}<div>
    <div class="name">${esc(playerName(p))}${tag}</div>
    <div class="sub">UID ${esc(p.uid)} · WL ${p.worldLevel}${stale}</div>${titles}</div></div>`;
}

function playerDetails(p) {
  const namecard = p.namecardUrl ? `style="--namecard: url('${esc(p.namecardUrl)}')"` : '';
  const showcase = p.showcaseHidden || !p.characters.length
    ? `<p class="muted">No character details. Ask them to add characters to their in-game showcase and turn on "Show Character Details".</p>`
    : `<div class="showcase">${p.characters.map(charCard).join('')}</div>`;
  return `<div class="details-inner" ${namecard}>
    <div class="details-head">
      <p class="signature">${p.signature ? esc(p.signature) : '<span class="muted">No signature</span>'}</p>
      <dl class="facts">
        <div><dt>Characters at max friendship</dt><dd>${p.maxFriendshipCharacters}</dd></div>
        <div><dt>Fetched</dt><dd>${p.fetchedAt ? new Date(p.fetchedAt).toLocaleTimeString() : '—'}</dd></div>
      </dl>
      <button class="btn small danger" type="button" data-action="remove" data-uid="${esc(p.uid)}" data-name="${esc(playerName(p))}">Remove</button>
    </div>
    ${p.warning ? `<p class="warn">${esc(p.warning)}</p>` : ''}
    ${showcase}
  </div>`;
}

function charCard(c) {
  const weapon = c.weapon ? ` · R${c.weapon.refinement}` : '';
  return `<button type="button" class="char-card ${elClass(c.element)}" data-action="open-char" data-name="${esc(c.name)}" title="Compare everyone's ${esc(c.name)}">
    ${img(c.iconUrl, 'icon', c.name)}
    <span class="cc-name">${esc(c.name)}</span>
    <span class="cc-meta">Lv ${c.level} · C${c.constellation}${weapon}</span>
    <span class="cc-cv">${c.critValue.toFixed(1)} CV ${gradeBadge(c.artifactGrade)}</span>
  </button>`;
}

/* ---------- characters tab ---------- */

const CHAR_COLUMNS = [
  {
    id: 'artifactScore', label: 'Roll score', title: 'Useful artifact rolls',
    key: (c) => c.artifactScore,
    cell: (c) => (c.artifactGrade ? `${gradeBadge(c.artifactGrade)} ${c.artifactScore.toFixed(1)}` : '—'),
  },
  { id: 'critValue', label: 'CV', title: 'Crit value', key: (c) => c.critValue, show: (c) => c.critValue.toFixed(1) },
  { id: 'critRate', label: 'Crit rate', key: (c) => c.stats.critRate, show: (c) => pct(c.stats.critRate) },
  { id: 'critDmg', label: 'Crit DMG', key: (c) => c.stats.critDmg, show: (c) => pct(c.stats.critDmg) },
  { id: 'atk', label: 'ATK', key: (c) => c.stats.atk, show: (c) => int(c.stats.atk) },
  { id: 'hp', label: 'HP', key: (c) => c.stats.hp, show: (c) => int(c.stats.hp) },
  { id: 'def', label: 'DEF', key: (c) => c.stats.def, show: (c) => int(c.stats.def) },
  { id: 'em', label: 'EM', title: 'Elemental Mastery', key: (c) => c.stats.em, show: (c) => int(c.stats.em) },
  { id: 'er', label: 'ER', title: 'Energy Recharge', key: (c) => c.stats.er, show: (c) => pct(c.stats.er) },
  {
    id: 'dmgBonus', label: 'DMG bonus', key: (c) => c.stats.dmgBonus,
    show: (c) => `${pct(c.stats.dmgBonus)} ${c.stats.dmgBonusType}`,
  },
].map((c) => ({ ...c, num: true }));

const charColumnCell = (col, c) => (col.cell ? col.cell(c) : esc(col.show(c)));

function renderCharacters() {
  const builds = loadedPlayers().flatMap((p) => p.characters.map((c) => ({ p, c })));
  if (!builds.length) {
    return emptyPanel('No character builds yet',
      'Builds appear here once players have characters in their showcase with details turned on.');
  }

  const counts = new Map();
  for (const { c } of builds) counts.set(c.name, (counts.get(c.name) || 0) + 1);
  const names = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
  if (state.character && !counts.has(state.character)) state.character = '';

  const col = CHAR_COLUMNS.find((c) => c.id === state.charSort);
  const shown = builds
    .filter(({ c }) => !state.character || c.name === state.character)
    .sort((a, b) => col.key(b.c) - col.key(a.c));

  const options = [`<option value="">All characters (${builds.length} builds)</option>`]
    .concat(names.map((n) => `<option value="${esc(n)}" ${n === state.character ? 'selected' : ''}>${esc(n)} (${counts.get(n)})</option>`));
  const columnCount = 6 + CHAR_COLUMNS.length;

  let html = `<div class="controls"><label>Character <select id="char-select">${options.join('')}</select></label>
    <span class="muted">Click a column to rank by it, or a build to see its artifacts.</span></div>
    <div class="table-wrap"><table class="board"><thead><tr>
      <th class="rank">#</th><th>Character</th><th>Player</th><th>Weapon</th><th>Talents</th><th>Artifacts</th>
      ${CHAR_COLUMNS.map((c) => sortHeader(c, state.charSort, 'char-sort')).join('')}
    </tr></thead><tbody>`;

  for (const { item: { p, c }, rank } of withRanks(shown, (b) => col.key(b.c))) {
    const w = c.weapon;
    const key = `${p.uid}:${c.avatarId}`;
    const open = state.openBuilds.has(key);
    html += `<tr class="clickable ${open ? 'open' : ''}" data-action="toggle-build" data-key="${esc(key)}" tabindex="0" aria-expanded="${open}">
      <td class="rank">${rankBadge(rank)}</td>
      <td><div class="char-cell ${elClass(c.element)}">${img(c.iconUrl, '', c.name)}<div>
        <div class="name"><span class="el-dot"></span>${esc(c.name)}</div>
        <div class="sub">Lv ${c.level} · C${c.constellation} · ${c.rarity}★</div></div></div></td>
      <td><div class="name">${esc(playerName(p))}</div><div class="sub">UID ${esc(p.uid)}</div></td>
      <td>${w ? `<div class="weapon-cell">${img(w.iconUrl, '', w.name)}<div>
          <div class="r${w.rarity >= 5 ? 5 : 4}-text">${esc(w.name)}</div>
          <div class="sub">Lv ${w.level} · R${w.refinement}</div></div></div>` : '<span class="muted">—</span>'}</td>
      <td>${c.talents.length ? c.talents.join(' / ') : '—'}</td>
      <td class="sets">${c.artifactSets.length ? c.artifactSets.map(esc).join('<br>') : `${c.artifactCount}/5 pieces`}</td>
      ${CHAR_COLUMNS.map((k) => `<td class="num ${k.id === col.id ? 'active' : ''}">${charColumnCell(k, c)}</td>`).join('')}
    </tr>`;
    if (open) html += `<tr class="details"><td colspan="${columnCount}">${buildDetails(c, key)}</td></tr>`;
  }
  return html + '</tbody></table></div>';
}

function buildDetails(c, key) {
  const share = `<button class="btn small" type="button" data-action="share-card" data-key="${esc(key)}">Share card</button>`;
  if (!c.artifacts.length) return `<div class="details-inner muted">No artifacts equipped. ${share}</div>`;
  return `<div class="details-inner">
    <div class="graded-for"><span>Graded for <b>${c.gradedFor.map(esc).join(', ')}</b>
      · ${gradeBadge(c.artifactGrade)} ${c.artifactScore.toFixed(1)} useful rolls across 5 pieces</span>${share}</div>
    <div class="art-grid">${c.artifacts.map((a) => artifactCard(a)).join('')}</div>
  </div>`;
}

/* ---------- artifacts ---------- */

function artifactCard(a, header = '') {
  return `<div class="art-card">
    ${header}
    <div class="art-head">${img(a.iconUrl, 'art-icon', a.setName)}
      <div class="art-title"><div class="name">${esc(a.slot)} <span class="sub">+${a.level}</span></div>
      <div class="sub">${esc(a.setName)}</div></div>
      ${gradeBadge(a.grade)}</div>
    <div class="art-main"><span>${esc(a.mainStat)}</span><b>${esc(a.mainValue)}</b></div>
    <ul class="subs">${a.substats.map((s) => `<li class="${s.useful ? 'useful' : ''}">
      <span>${esc(s.name)}</span>
      <span class="pips" title="${s.rolls} roll${s.rolls === 1 ? '' : 's'}">${'●'.repeat(Math.min(s.rolls, 6))}</span>
      <b>${esc(s.value)}</b></li>`).join('')}</ul>
    <div class="art-foot"><span>${a.usefulRolls.toFixed(1)} useful rolls</span>
      ${a.wastedRolls ? `<span class="wasted">${a.wastedRolls} wasted on flat stats</span>` : ''}</div>
  </div>`;
}

function renderArtifacts() {
  const pieces = loadedPlayers().flatMap((p) => p.characters.flatMap((c) =>
    c.artifacts.filter((a) => a.level >= 20).map((a) => ({ p, c, a }))));
  if (!pieces.length) {
    return emptyPanel('No artifacts to grade yet', 'Only +20 artifacts from showcased characters are ranked here.');
  }

  const fame = [...pieces].sort((x, y) => y.a.usefulRolls - x.a.usefulRolls).slice(0, 10);
  const shame = [...pieces]
    .sort((x, y) => x.a.usefulRolls - y.a.usefulRolls || y.a.wastedRolls - x.a.wastedRolls)
    .slice(0, 10);

  const owner = (rank, { p, c }) => `<div class="art-owner ${elClass(c.element)}">${rankBadge(rank)}
    ${img(c.iconUrl, 'mini', c.name)}<div><div class="name">${esc(c.name)}</div><div class="sub">${esc(playerName(p))}</div></div></div>`;
  const section = (title, blurb, list) => `<section class="hall">
    <h2>${title}</h2><p class="muted">${blurb}</p>
    <div class="art-grid">${list.map((x, i) => artifactCard(x.a, owner(i + 1, x))).join('')}</div></section>`;

  return `<p class="muted intro">Each roll is scored against the stats that character uses: Crit Rate, Crit DMG,
      their scaling stat (from sands, goblet and circlet main stats) and Energy Recharge if they run 140%+ ER or an ER sands.
      1.0 = one max-tier roll. Pips show how many times a substat rolled; gold = useful.
      Only +20 pieces count (${pieces.length} graded).</p>
    ${section('Hall of Fame', 'The best rolled artifacts in the group.', fame)}
    ${section('Hall of Shame', 'The fewest useful rolls. Somebody fed these a lot of fodder for nothing.', shame)}`;
}

/* ---------- head-to-head ---------- */

const H2H_ROWS = [
  ...PLAYER_COLUMNS.map((c) => ({ label: c.title || c.label, key: c.key, show: c.show })),
  { label: 'Characters at max friendship', key: (p) => p.maxFriendshipCharacters, show: (p) => p.maxFriendshipCharacters },
  {
    label: 'Average roll score', key: avgRollScore,
    show: (p) => (p.characters.length ? avgRollScore(p).toFixed(1) : '—'),
  },
];

const compare = (a, b) => (a > b ? 'a' : b > a ? 'b' : 'tie');

/** Shared character winner: better artifact rolls, then higher crit value. */
function buildWinner(a, b) {
  const byRolls = compare(Math.round(a.artifactScore * 10), Math.round(b.artifactScore * 10));
  return byRolls !== 'tie' ? byRolls : compare(a.critValue, b.critValue);
}

function renderHeadToHead() {
  const players = loadedPlayers();
  if (players.length < 2) return emptyPanel('Need two players', 'Add at least two players to compare them head-to-head.');

  const uids = players.map((p) => p.uid);
  if (!uids.includes(state.h2hA)) state.h2hA = uids[0];
  if (!uids.includes(state.h2hB) || state.h2hB === state.h2hA) state.h2hB = uids.find((u) => u !== state.h2hA);
  const A = players.find((p) => p.uid === state.h2hA);
  const B = players.find((p) => p.uid === state.h2hB);

  const picker = (id, selected) => `<select id="${id}" aria-label="Player">${players.map((p) =>
    `<option value="${esc(p.uid)}" ${p.uid === selected ? 'selected' : ''}>${esc(playerName(p))}</option>`).join('')}</select>`;

  const profileRows = H2H_ROWS.map((r) => {
    const ka = r.key(A);
    const kb = r.key(B);
    return { ...r, winner: ka < 0 && kb < 0 ? 'tie' : compare(ka, kb), a: r.show(A), b: r.show(B) };
  });

  const bByName = new Map(B.characters.map((c) => [c.name, c]));
  const aNames = new Set(A.characters.map((c) => c.name));
  const shared = A.characters.filter((c) => bByName.has(c.name))
    .map((ca) => ({ ca, cb: bByName.get(ca.name), winner: buildWinner(ca, bByName.get(ca.name)) }));
  const onlyA = A.characters.filter((c) => !bByName.has(c.name));
  const onlyB = B.characters.filter((c) => !aNames.has(c.name));

  const all = [...profileRows, ...shared];
  const scoreA = all.filter((r) => r.winner === 'a').length;
  const scoreB = all.filter((r) => r.winner === 'b').length;
  const verdict = scoreA === scoreB ? "Dead even. Someone's going to have to pull more."
    : `${playerName(scoreA > scoreB ? A : B)} takes it${Math.abs(scoreA - scoreB) >= 4 ? ' by a mile' : ''}.`;

  const side = (w, who) => (w === who ? 'win' : w === 'tie' ? '' : 'lose');
  const row = (w, a, label, b) => `<div class="h2h-row">
      <div class="h2h-side a ${side(w, 'a')}">${a}</div><div class="h2h-label">${label}</div><div class="h2h-side b ${side(w, 'b')}">${b}</div></div>`;
  const buildSide = (c) => `<div class="h2h-build">${gradeBadge(c.artifactGrade)}
      <span>${c.artifactScore.toFixed(1)} rolls</span><span class="sub">${c.critValue.toFixed(1)} CV · C${c.constellation}${c.weapon ? ` · R${c.weapon.refinement}` : ''}</span></div>`;
  const chips = (list) => (list.length
    ? `<div class="chips">${list.map((c) => `<span class="chip ${elClass(c.element)}">${img(c.iconUrl, 'mini', c.name)}${esc(c.name)}</span>`).join('')}</div>`
    : '<p class="muted">None</p>');

  return `<div class="h2h-pick">${picker('h2h-a', A.uid)}
      <button class="btn" type="button" data-action="swap" title="Swap sides">⇄</button>${picker('h2h-b', B.uid)}</div>
    <div class="panel h2h-score">
      <div class="h2h-player">${img(A.avatarUrl, 'pfp big')}<div class="name">${esc(playerName(A))}</div></div>
      <div class="h2h-tally"><span class="${scoreA > scoreB ? 'lead' : ''}">${scoreA}</span><span class="muted">–</span><span class="${scoreB > scoreA ? 'lead' : ''}">${scoreB}</span></div>
      <div class="h2h-player">${img(B.avatarUrl, 'pfp big')}<div class="name">${esc(playerName(B))}</div></div>
      <p class="h2h-verdict">${esc(verdict)}</p>
    </div>

    <h2 class="h2h-heading">Profile</h2>
    <div class="panel h2h-list">${profileRows.map((r) => row(r.winner, esc(r.a), esc(r.label), esc(r.b))).join('')}</div>

    <h2 class="h2h-heading">Shared characters <span class="muted">(${shared.length})</span></h2>
    ${shared.length
      ? `<p class="muted small">Won by better artifact rolls, then crit value.</p>
         <div class="panel h2h-list">${shared.map(({ ca, cb, winner }) => row(winner, buildSide(ca),
           `<span class="char-cell ${elClass(ca.element)}">${img(ca.iconUrl, 'mini', ca.name)}${esc(ca.name)}</span>`,
           buildSide(cb))).join('')}</div>`
      : '<p class="muted">No characters in common in their showcases.</p>'}

    <div class="h2h-only">
      <div><h2 class="h2h-heading">Only ${esc(playerName(A))} has</h2>${chips(onlyA)}</div>
      <div><h2 class="h2h-heading">Only ${esc(playerName(B))} has</h2>${chips(onlyB)}</div>
    </div>`;
}

/* ---------- awards ---------- */

const allPieces = () => loadedPlayers().flatMap((p) => p.characters.flatMap((c) =>
  c.artifacts.filter((a) => a.level >= 20).map((a) => ({ p, c, a }))));
const maxOf = (list, fn) => (list.length ? Math.max(...list.map(fn)) : null);
const avgOf = (list, fn) => (list.length ? list.reduce((s, x) => s + fn(x), 0) / list.length : null);
const fiveStarScore = (p) =>
  p.characters.filter((c) => c.rarity === 5).reduce((s, c) => s + c.constellation, 0)
  + p.characters.filter((c) => c.weapon?.rarity === 5).reduce((s, c) => s + c.weapon.refinement - 1, 0);

/**
 * score(p, ctx) returns a number (higher wins) or null if the player doesn't qualify.
 * min: the best score must reach this for the award to be given at all.
 */
const AWARDS = [
  { id: 'goblin', icon: '✦', title: 'Crit Goblin', desc: 'Highest average crit value across their showcase.',
    score: (p) => avgOf(p.characters, (c) => c.critValue), show: (v) => `${v.toFixed(1)} avg CV` },
  { id: 'rollgod', icon: '★', title: 'Roll God', desc: 'Owns the single best-rolled +20 artifact.',
    score: (p) => maxOf(p.characters.flatMap((c) => c.artifacts.filter((a) => a.level >= 20)), (a) => a.usefulRolls),
    show: (v) => `${v.toFixed(1)} useful rolls on one piece` },
  { id: 'shame', icon: '☠', title: 'Hall of Shame Regular', desc: 'Most pieces in the Hall of Shame.',
    score: (p, ctx) => ctx.shameCounts.get(p.uid) || null, show: (v) => `${v} shameful piece${v === 1 ? '' : 's'}` },
  { id: 'flat', icon: '▭', title: 'Flat Stat Collector', desc: 'Most rolls wasted on flat HP, ATK and DEF.',
    score: (p) => p.characters.reduce((s, c) => s + c.artifacts.reduce((t, a) => t + a.wastedRolls, 0), 0) || null,
    show: (v) => `${v} wasted rolls` },
  { id: 'battery', icon: '⚡', title: 'Battery', desc: 'Highest Energy Recharge on one character (200%+).', min: 200,
    score: (p) => maxOf(p.characters, (c) => c.stats.er), show: (v) => pct(v) },
  { id: 'glass', icon: '◆', title: 'Glass Cannon', desc: 'Highest Crit DMG on one character.',
    score: (p) => maxOf(p.characters, (c) => c.stats.critDmg), show: (v) => `${pct(v)} Crit DMG` },
  { id: 'hp', icon: '♥', title: 'Big Health Bar', desc: 'Highest max HP on one character.',
    score: (p) => maxOf(p.characters, (c) => c.stats.hp), show: (v) => `${int(v)} HP` },
  { id: 'em', icon: '❋', title: 'Reaction Scientist', desc: 'Highest Elemental Mastery on one character (300+).', min: 300,
    score: (p) => maxOf(p.characters, (c) => c.stats.em), show: (v) => `${int(v)} EM` },
  { id: 'whale', icon: '◎', title: 'Whale Suspect', desc: 'Most 5★ constellations and weapon refinements on show.', min: 1,
    score: (p) => (p.characters.length ? fiveStarScore(p) : null), show: (v) => `${v} extra copies` },
  { id: 'talents', icon: '▲', title: 'Book Hoarder', desc: 'Highest average talent level.',
    score: (p) => avgOf(p.characters.filter((c) => c.talents.length), (c) => avgOf(c.talents, (t) => t)),
    show: (v) => `${v.toFixed(1)} avg talent` },
  { id: 'abyss', icon: '⛩', title: 'Abyss Conqueror', desc: 'Furthest in the current Spiral Abyss.',
    score: (p) => (p.abyssFloor ? PLAYER_COLUMNS[0].key(p) : null), show: (v, p) => PLAYER_COLUMNS[0].show(p) },
  { id: 'bestie', icon: '❀', title: 'Bestie', desc: 'Most characters at max friendship.', min: 1,
    score: (p) => p.maxFriendshipCharacters, show: (v) => `${v} characters` },
  { id: 'complete', icon: '✓', title: 'Completionist', desc: 'Most achievements.',
    score: (p) => p.achievements || null, show: (v) => `${int(v)} achievements` },
  { id: 'poet', icon: '✎', title: 'Signature Poet', desc: 'Longest profile signature.', min: 1,
    score: (p) => (p.signature || '').length, show: (v) => `${v} characters of wisdom` },
];

/** Returns [{award, winners: [player], value, runnerUp}] for awards that have a winner. */
function computeAwards() {
  const players = loadedPlayers();
  if (players.length < 2) return [];
  const shame = [...allPieces()]
    .sort((x, y) => x.a.usefulRolls - y.a.usefulRolls || y.a.wastedRolls - x.a.wastedRolls).slice(0, 10);
  const ctx = { shameCounts: new Map() };
  for (const { p } of shame) ctx.shameCounts.set(p.uid, (ctx.shameCounts.get(p.uid) || 0) + 1);

  const results = [];
  for (const award of AWARDS) {
    const scored = players.map((p) => ({ p, v: award.score(p, ctx) }))
      .filter((x) => x.v != null && Number.isFinite(x.v))
      .sort((a, b) => b.v - a.v);
    if (!scored.length || scored[0].v < (award.min ?? Number.MIN_VALUE)) continue;
    const top = scored[0].v;
    const winners = scored.filter((x) => x.v === top);
    const runnerUp = scored.find((x) => x.v < top) || null;
    results.push({ award, winners: winners.map((x) => x.p), value: award.show(top, winners[0].p), runnerUp });
  }
  return results;
}

function titlesByPlayer() {
  const map = new Map();
  for (const { award, winners } of computeAwards()) {
    for (const p of winners) map.set(p.uid, [...(map.get(p.uid) || []), award]);
  }
  return map;
}

function renderAwards() {
  if (loadedPlayers().length < 2) return emptyPanel('Need two players', 'Awards are handed out once at least two players are loaded.');
  const awards = computeAwards();
  const holders = new Map();
  for (const { winners } of awards) for (const p of winners) holders.set(p.uid, (holders.get(p.uid) || 0) + 1);
  const most = [...holders.entries()].sort((a, b) => b[1] - a[1])[0];
  const mostPlayer = most && loadedPlayers().find((p) => p.uid === most[0]);

  return `${mostPlayer ? `<p class="intro">Most decorated: <b>${esc(playerName(mostPlayer))}</b> with ${most[1]} title${most[1] === 1 ? '' : 's'}.</p>` : ''}
    <div class="award-grid">${awards.map(({ award, winners, value, runnerUp }) => `
      <div class="panel award">
        <div class="award-icon" aria-hidden="true">${award.icon}</div>
        <div class="award-body">
          <h3>${esc(award.title)}</h3>
          <p class="muted small">${esc(award.desc)}</p>
          <div class="award-winners">${winners.map((p) => `<span class="who">${img(p.avatarUrl, 'pfp')}<span class="name">${esc(playerName(p))}</span></span>`).join('')}</div>
          <div class="award-value">${esc(value)}${winners.length > 1 ? ' · shared' : ''}</div>
          ${runnerUp ? `<div class="sub">Runner-up: ${esc(playerName(runnerUp.p))} (${esc(award.show(runnerUp.v, runnerUp.p))})</div>` : ''}
        </div>
      </div>`).join('')}</div>`;
}

/* ---------- rendering ---------- */

const TABS = {
  players: renderPlayers,
  characters: renderCharacters,
  artifacts: renderArtifacts,
  h2h: renderHeadToHead,
  awards: renderAwards,
};

function render() {
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  refreshBtn.disabled = state.loading;
  refreshBtn.textContent = state.loading ? 'Refreshing…' : 'Refresh';
  updatedEl.textContent = state.generatedAt ? `Updated ${new Date(state.generatedAt).toLocaleTimeString()}` : '';

  if (state.loadError && !state.players.length) {
    view.innerHTML = emptyPanel("Couldn't load the leaderboard", state.loadError);
  } else if (!state.players.length) {
    view.innerHTML = state.loading
      ? '<div class="panel empty">Loading players…</div>'
      : emptyPanel('No players yet', "Add your UID and your friends' UIDs above to start the leaderboard.");
  } else {
    view.innerHTML = TABS[state.tab]();
  }
}

async function load() {
  state.loading = true;
  render();
  try {
    const data = await api('/api/leaderboard');
    state.players = data.players;
    state.generatedAt = data.generatedAt;
    state.loadError = null;
  } catch (e) {
    state.loadError = e.message;
  } finally {
    state.loading = false;
    render();
  }
}

/* ---------- events ---------- */

const toggle = (set, key) => (set.has(key) ? set.delete(key) : set.add(key));

refreshBtn.addEventListener('click', load);

document.querySelector('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (!tab) return;
  state.tab = tab.dataset.tab;
  history.replaceState(null, '', `#${state.tab}`);
  render();
});

view.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, uid, id, name, key } = el.dataset;

  switch (action) {
    case 'toggle-player': toggle(state.openPlayers, uid); break;
    case 'toggle-build': toggle(state.openBuilds, key); break;
    case 'player-sort': state.playerSort = id; break;
    case 'char-sort': state.charSort = id; break;
    case 'open-char': state.tab = 'characters'; state.character = name; break;
    case 'swap': [state.h2hA, state.h2hB] = [state.h2hB, state.h2hA]; break;
    case 'remove':
      if (!confirm(`Remove ${name} from the leaderboard?`)) return;
      try {
        await api(`/api/friends/${encodeURIComponent(uid)}`, { method: 'DELETE' });
        state.openPlayers.delete(uid);
        state.players = state.players.filter((p) => p.uid !== uid);
      } catch (err) {
        alert(err.message);
        return;
      }
      break;
    default: return;
  }
  render();
});

view.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-action]')) {
    e.preventDefault();
    e.target.click();
  }
});

view.addEventListener('change', (e) => {
  const { id, value } = e.target;
  if (id === 'char-select') state.character = value;
  else if (id === 'h2h-a') { if (value === state.h2hB) state.h2hB = state.h2hA; state.h2hA = value; }
  else if (id === 'h2h-b') { if (value === state.h2hA) state.h2hA = state.h2hB; state.h2hB = value; }
  else return;
  render();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uidInput = document.getElementById('uid');
  const labelInput = document.getElementById('label');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  formMsg.className = 'form-msg';
  formMsg.textContent = 'Looking up player…';
  try {
    const player = await api('/api/friends', {
      method: 'POST',
      body: JSON.stringify({ uid: uidInput.value.trim(), label: labelInput.value.trim() }),
    });
    formMsg.className = 'form-msg ok';
    formMsg.textContent = `Added ${playerName(player)} (AR ${player.adventureRank}).`;
    uidInput.value = '';
    labelInput.value = '';
    await load();
  } catch (err) {
    formMsg.className = 'form-msg error';
    formMsg.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

// Open the tab named in the address (e.g. /#wishes) once every tab script has loaded
window.addEventListener('DOMContentLoaded', () => {
  const fromHash = location.hash.slice(1);
  if (fromHash && TABS[fromHash]) { state.tab = fromHash; render(); }
});

load();
