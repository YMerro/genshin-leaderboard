'use strict';
/*
 * Quiz: randomized questions built from the group's real data.
 * Categories: owner (whose artifact/build), account (profile and build trivia),
 * wishes (imported wish history), lore (character/weapon lore and fun facts, see quiz-lore.js).
 * Uses helpers from app.js and the wish loader from wishes.js.
 */

const QUIZ_ROUNDS = 10;
const QUIZ_MODES = {
  mixed: { label: 'Mixed', cats: ['owner', 'account', 'wishes', 'lore'] },
  owner: { label: 'Guess the owner', cats: ['owner'] },
  account: { label: 'Account trivia', cats: ['account', 'wishes'] },
  lore: { label: 'Lore & fun facts', cats: ['lore'] },
};

const quiz = { mode: 'mixed', round: 0, score: 0, streak: 0, q: null, answer: null, finished: false, seen: new Set(), lastKind: null };
Object.assign(state, { allChars: null, allCharsLoading: false, lore: null, loreLoading: false });

/* ---------- helpers ---------- */

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sample = (list, n) => shuffle(list).slice(0, n);
const uniq = (list) => [...new Set(list)];

/** Builds a question with the correct option plus up to `n - 1` distinct distractors (by label). */
function choices(correct, pool, n = 4) {
  const others = sample(uniq(pool.filter((x) => x !== correct)), n - 1);
  return others.length ? shuffle([correct, ...others]).map((label) => ({ id: label, label })) : null;
}

/** Nearby numbers as distractors, e.g. for "What AR is Sam?". */
function numberChoices(correct, { min = 0, max = Infinity, spread = 5 } = {}) {
  const set = new Set([correct]);
  for (let tries = 0; set.size < 4 && tries < 50; tries++) {
    const v = correct + (Math.floor(Math.random() * spread * 2) - spread);
    if (v >= min && v <= max && v !== correct) set.add(v);
  }
  return [...set].sort((a, b) => a - b).map((v) => ({ id: String(v), label: String(v) }));
}

const charByName = (name) => state.allChars?.find((c) => c.name === name);
const charIcon = (c) => (c?.iconUrl ? `<div class="quiz-portrait">${img(c.iconUrl, '', c.name)}</div>` : '');
const quote = (text) => `<blockquote class="quiz-quote">“${esc(text)}”</blockquote>`;
const playerOptions = (players) => players.map((p) => ({ id: p.uid, label: playerName(p), img: p.avatarUrl }));

/* ---------- question generators ---------- */
/* Each returns { key, prompt, visual?, options, answer, explain } or null if the data doesn't allow it. */

const PLAYER_STATS = [
  { label: 'Spiral Abyss progress', get: (p) => PLAYER_COLUMNS[0].key(p), show: PLAYER_COLUMNS[0].show, valid: (p) => p.abyssFloor },
  { label: 'Adventure Rank', get: (p) => p.adventureRank, show: (p) => `AR ${p.adventureRank}` },
  { label: 'achievement count', get: (p) => p.achievements, show: (p) => `${int(p.achievements)} achievements` },
  { label: 'best crit value', get: (p) => bestBuild(p)?.critValue ?? -1, show: (p) => `${(bestBuild(p)?.critValue ?? 0).toFixed(1)} CV`, valid: (p) => p.characters.length },
  { label: 'average artifact roll score', get: avgRollScore, show: (p) => `${avgRollScore(p).toFixed(1)} rolls`, valid: (p) => p.characters.length },
  { label: 'number of characters at max friendship', get: (p) => p.maxFriendshipCharacters, show: (p) => `${p.maxFriendshipCharacters}` },
];

const GENERATORS = [
  /* ----- owner ----- */
  { kind: 'owner-artifact', cat: 'owner', weight: 3, make(ctx) {
    const pieces = ctx.builds.flatMap((b) => b.c.artifacts.filter((a) => a.level >= 16).map((a) => ({ ...b, a })));
    if (ctx.withChars.length < 2 || !pieces.length) return null;
    const x = pick(pieces);
    return { key: `oa:${x.p.uid}:${x.c.name}:${x.a.slot}`, prompt: 'Whose artifact is this?',
      visual: `<div class="quiz-artifact">${artifactCard(x.a)}</div>`,
      options: shuffle(playerOptions([x.p, ...sample(ctx.withChars.filter((p) => p !== x.p), 3)])), answer: x.p.uid,
      explain: `It's ${playerName(x.p)}'s ${x.c.name} ${x.a.slot.toLowerCase()} (${x.a.usefulRolls.toFixed(1)} useful rolls).` };
  } },
  { kind: 'owner-build', cat: 'owner', weight: 2, make(ctx) {
    const shared = ctx.builds.filter((b) => ctx.ownerCount.get(b.c.name) > 1);
    if (!shared.length) return null;
    const x = pick(shared);
    return { key: `ob:${x.p.uid}:${x.c.name}`, prompt: `Whose ${esc(x.c.name)} is this?`, visual: quizBuildCard(x.c),
      options: shuffle(playerOptions([x.p, ...sample(ctx.withChars.filter((p) => p !== x.p), 3)])), answer: x.p.uid,
      explain: `It's ${playerName(x.p)}'s: ${x.c.critValue.toFixed(1)} CV, ${x.c.artifactScore.toFixed(1)} rolls.` };
  } },

  /* ----- account ----- */
  { kind: 'higher-stat', cat: 'account', weight: 3, make(ctx) {
    const stat = pick(PLAYER_STATS);
    const eligible = ctx.players.filter((p) => !stat.valid || stat.valid(p));
    if (eligible.length < 2) return null;
    const [a, b] = sample(eligible, 2);
    if (stat.get(a) === stat.get(b)) return null;
    const winner = stat.get(a) > stat.get(b) ? a : b;
    return { key: `hs:${stat.label}:${[a.uid, b.uid].sort()}`, prompt: `Who has the higher ${stat.label}?`,
      options: shuffle(playerOptions([a, b])), answer: winner.uid,
      explain: `${playerName(a)}: ${stat.show(a)} · ${playerName(b)}: ${stat.show(b)}` };
  } },
  { kind: 'guess-ar', cat: 'account', weight: 1, make(ctx) {
    const p = pick(ctx.players);
    if (!p?.adventureRank) return null;
    return { key: `ar:${p.uid}`, prompt: `What is ${esc(playerName(p))}'s Adventure Rank?`,
      options: numberChoices(p.adventureRank, { min: 1, max: 60, spread: 4 }), answer: String(p.adventureRank),
      explain: `${playerName(p)} is AR ${p.adventureRank}, World Level ${p.worldLevel}.` };
  } },
  { kind: 'top-cv-char', cat: 'account', weight: 2, make(ctx) {
    const p = pick(ctx.withChars.filter((x) => x.characters.length >= 3));
    if (!p) return null;
    const opts = sample(p.characters, 4);
    const best = opts.reduce((x, y) => (y.critValue > x.critValue ? y : x));
    if (opts.filter((c) => c.critValue === best.critValue).length > 1) return null;
    return { key: `tc:${p.uid}:${opts.map((c) => c.name).sort()}`, prompt: `Which of ${esc(playerName(p))}'s characters has the highest crit value?`,
      options: opts.map((c) => ({ id: c.name, label: c.name, img: c.iconUrl })), answer: best.name,
      explain: opts.map((c) => `${c.name} ${c.critValue.toFixed(1)}`).join(' · ') };
  } },
  { kind: 'weapon-of', cat: 'account', weight: 2, make(ctx) {
    const x = pick(ctx.builds.filter((b) => b.c.weapon));
    if (!x) return null;
    const pool = ctx.builds.map((b) => b.c.weapon?.name).filter(Boolean);
    const opts = choices(x.c.weapon.name, pool);
    if (!opts || opts.length < 3) return null;
    return { key: `wo:${x.p.uid}:${x.c.name}`, prompt: `Which weapon is ${esc(playerName(x.p))}'s ${esc(x.c.name)} using?`,
      visual: charIcon(x.c), options: opts, answer: x.c.weapon.name,
      explain: `${x.c.weapon.name}, Lv ${x.c.weapon.level}, R${x.c.weapon.refinement}.` };
  } },
  { kind: 'constellation-of', cat: 'account', weight: 2, make(ctx) {
    const x = pick(ctx.builds);
    if (!x) return null;
    const opts = choices(`C${x.c.constellation}`, ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6']).sort((a, b) => a.id.localeCompare(b.id));
    return { key: `co:${x.p.uid}:${x.c.name}`, prompt: `What constellation is ${esc(playerName(x.p))}'s ${esc(x.c.name)}?`,
      visual: charIcon(x.c), options: opts, answer: `C${x.c.constellation}`,
      explain: `C${x.c.constellation}, level ${x.c.level}, talents ${x.c.talents.join(' / ') || '—'}.` };
  } },
  { kind: 'set-of', cat: 'account', weight: 2, make(ctx) {
    const x = pick(ctx.builds.filter((b) => b.c.artifactSets.length));
    if (!x) return null;
    const correct = x.c.artifactSets[0];
    // Distractors: other set bonuses seen in the group, never another bonus this character actually has
    const pool = ctx.builds.flatMap((b) => b.c.artifactSets)
      .concat(ctx.builds.flatMap((b) => b.c.artifacts.map((a) => `4pc ${a.setName}`)));
    const opts = choices(correct, pool.filter((s) => !x.c.artifactSets.includes(s)));
    if (!opts || opts.length < 3) return null;
    return { key: `so:${x.p.uid}:${x.c.name}`, prompt: `Which set bonus is ${esc(playerName(x.p))}'s ${esc(x.c.name)} running?`,
      visual: charIcon(x.c), options: opts, answer: correct, explain: `${x.c.artifactSets.join(' + ')}.` };
  } },
  { kind: 'grade-of', cat: 'account', weight: 1, make(ctx) {
    const x = pick(ctx.builds.filter((b) => b.c.artifactGrade));
    if (!x) return null;
    const opts = choices(x.c.artifactGrade, ['SS', 'S', 'A', 'B', 'C', 'D']).sort((a, b) => 'SSABCD'.indexOf(a.id) - 'SSABCD'.indexOf(b.id));
    return { key: `go:${x.p.uid}:${x.c.name}`, prompt: `What artifact grade does ${esc(playerName(x.p))}'s ${esc(x.c.name)} get?`,
      visual: charIcon(x.c), options: opts, answer: x.c.artifactGrade,
      explain: `${x.c.artifactGrade}: ${x.c.artifactScore.toFixed(1)} useful rolls across 5 pieces.` };
  } },
  { kind: 'signature', cat: 'account', weight: 2, make(ctx) {
    const withSig = ctx.players.filter((p) => (p.signature || '').trim().length >= 4);
    if (!withSig.length || ctx.players.length < 2) return null;
    const p = pick(withSig);
    return { key: `sg:${p.uid}`, prompt: 'Whose profile signature is this?', visual: quote(p.signature),
      options: shuffle(playerOptions([p, ...sample(ctx.players.filter((x) => x !== p), 3)])), answer: p.uid,
      explain: `That's ${playerName(p)}'s signature.` };
  } },
  { kind: 'most-showcased', cat: 'account', weight: 1, make(ctx) {
    const counts = [...ctx.ownerCount.entries()].sort((a, b) => b[1] - a[1]);
    if (counts.length < 4 || counts[0][1] < 2 || counts[0][1] === counts[1][1]) return null;
    const opts = [counts[0][0], ...sample(counts.slice(1).map((c) => c[0]), 3)];
    return { key: 'ms', prompt: 'Which character shows up in the most showcases in the group?',
      options: shuffle(opts).map((n) => ({ id: n, label: n, img: ctx.builds.find((b) => b.c.name === n)?.c.iconUrl })),
      answer: counts[0][0], explain: `${counts[0][0]}, in ${counts[0][1]} showcases.` };
  } },

  /* ----- wishes ----- */
  { kind: 'last-five', cat: 'wishes', weight: 2, make(ctx) {
    const acc = pick(ctx.wishAccounts.filter((a) => a.banners.some((b) => b.fiveStars.length)));
    if (!acc) return null;
    const banner = pick(acc.banners.filter((b) => b.fiveStars.length));
    const correct = banner.fiveStars[0].name;
    const pool = ctx.wishAccounts.flatMap((a) => a.banners.flatMap((b) => b.fiveStars.map((f) => f.name)))
      .concat((state.allChars || []).filter((c) => c.rarity === 5).map((c) => c.name));
    return { key: `lf:${acc.uid}:${banner.key}`, prompt: `What was ${esc(accountName(acc.uid))}'s most recent 5★ on the ${esc(banner.name)} banner?`,
      options: choices(correct, pool), answer: correct,
      explain: `${correct}, at ${banner.fiveStars[0].pity} pity (${banner.fiveStars[0].time.slice(0, 10)}).` };
  } },
  { kind: 'fifty-fifty', cat: 'wishes', weight: 2, make(ctx) {
    const fives = ctx.wishAccounts.flatMap((a) => (a.banners.find((b) => b.key === 'character')?.fiveStars || [])
      .filter((f) => f.result === 'won' || f.result === 'lost').map((f) => ({ a, f })));
    if (!fives.length) return null;
    const { a, f } = pick(fives);
    return { key: `ff:${a.uid}:${f.name}:${f.time}`, prompt: `Did ${esc(accountName(a.uid))} win or lose the 50/50 when they pulled ${esc(f.name)}?`,
      visual: charIcon(charByName(f.name)),
      options: [{ id: 'won', label: 'Won the 50/50' }, { id: 'lost', label: 'Lost the 50/50' }], answer: f.result,
      explain: `${f.result === 'won' ? 'Won' : 'Lost'}, at ${f.pity} pity on ${f.time.slice(0, 10)}.` };
  } },
  { kind: 'pity-of', cat: 'wishes', weight: 1, make(ctx) {
    const fives = ctx.wishAccounts.flatMap((a) => a.banners.flatMap((b) => b.fiveStars.map((f) => ({ a, b, f }))));
    if (!fives.length) return null;
    const { a, b, f } = pick(fives);
    return { key: `pf:${a.uid}:${f.name}:${f.time}`, prompt: `At what pity did ${esc(accountName(a.uid))} pull ${esc(f.name)}?`,
      visual: charIcon(charByName(f.name)),
      options: numberChoices(f.pity, { min: 1, max: b.key === 'weapon' ? 80 : 90, spread: 12 }), answer: String(f.pity),
      explain: `Pity ${f.pity} on the ${b.name} banner.` };
  } },

];

/* ---------- game flow ---------- */

function quizContext() {
  const players = loadedPlayers();
  const withChars = players.filter((p) => p.characters.length);
  const builds = withChars.flatMap((p) => p.characters.map((c) => ({ p, c })));
  const ownerCount = new Map();
  for (const p of withChars) for (const n of new Set(p.characters.map((c) => c.name))) ownerCount.set(n, (ownerCount.get(n) || 0) + 1);
  const loreChars = state.lore?.characters || [];
  const owned = loreChars.filter((c) => ownerCount.has(c.name));
  return {
    players, withChars, builds, ownerCount,
    wishAccounts: state.wishes || [],
    // Lore leans toward characters the group actually owns, so questions feel familiar
    loreChars,
    loreChar: (ok = () => true) => {
      const mine = owned.filter(ok);
      return mine.length && Math.random() < 0.6 ? pick(mine) : pick(loreChars.filter(ok));
    },
  };
}

function nextQuestion() {
  const ctx = quizContext();
  const cats = QUIZ_MODES[quiz.mode].cats;
  const gens = GENERATORS.filter((g) => cats.includes(g.cat));
  for (let tries = 0; tries < 60; tries++) {
    // Weighted pick, avoiding the same kind twice in a row when possible
    const pool = gens.filter((g) => g.kind !== quiz.lastKind || tries > 40);
    const total = pool.reduce((s, g) => s + g.weight, 0);
    let r = Math.random() * total;
    const gen = pool.find((g) => (r -= g.weight) < 0) || pool[0];
    const q = gen.make(ctx);
    if (!q || !q.options || q.options.length < 2 || quiz.seen.has(q.key)) continue;
    quiz.seen.add(q.key);
    quiz.lastKind = gen.kind;
    return q;
  }
  return null;
}

function readBest(mode) { try { return Number(localStorage.getItem(`quizBest:${mode}`)) || 0; } catch { return 0; } }
function saveBest(mode, v) { try { localStorage.setItem(`quizBest:${mode}`, String(v)); } catch { /* storage unavailable */ } }

function startQuiz(mode) {
  Object.assign(quiz, { mode, round: 1, score: 0, streak: 0, answer: null, finished: false, seen: new Set(), lastKind: null, noData: null });
  quiz.q = nextQuestion();
  if (!quiz.q) {
    // Back to the menu with an explanation instead of a 0/1 result
    quiz.round = 0;
    quiz.noData = mode === 'owner'
      ? 'Guess the owner needs at least two players with character details in their showcase.'
      : 'Not enough data for this mode yet. Add players, show more characters or import wishes.';
  }
}

function answerQuiz(id) {
  if (quiz.answer != null || !quiz.q) return;
  quiz.answer = id;
  if (id === quiz.q.answer) { quiz.score++; quiz.streak++; } else { quiz.streak = 0; }
}

function nextQuiz() {
  const q = quiz.round < QUIZ_ROUNDS ? nextQuestion() : null;
  if (!q) {
    quiz.finished = true;
    if (quiz.score > readBest(quiz.mode)) saveBest(quiz.mode, quiz.score);
    return;
  }
  quiz.round++;
  quiz.answer = null;
  quiz.q = q;
}

/* ---------- rendering ---------- */

function quizBuildCard(c) {
  const s = c.stats;
  const w = c.weapon;
  return `<div class="panel quiz-build ${elClass(c.element)}">
    <div class="char-cell">${img(c.iconUrl, '', c.name)}<div>
      <div class="name"><span class="el-dot"></span>${esc(c.name)}</div>
      <div class="sub">Lv ${c.level} · C${c.constellation} · Talents ${c.talents.join(' / ') || '—'}</div></div></div>
    ${w ? `<div class="weapon-cell">${img(w.iconUrl, '', w.name)}<span>${esc(w.name)} <span class="sub">R${w.refinement}</span></span></div>` : ''}
    <dl class="quiz-stats">
      <div><dt>CV</dt><dd>${c.critValue.toFixed(1)}</dd></div>
      <div><dt>Rolls</dt><dd>${gradeBadge(c.artifactGrade)} ${c.artifactScore.toFixed(1)}</dd></div>
      <div><dt>Crit</dt><dd>${pct(s.critRate)} / ${pct(s.critDmg)}</dd></div>
      <div><dt>ATK</dt><dd>${int(s.atk)}</dd></div>
      <div><dt>HP</dt><dd>${int(s.hp)}</dd></div>
      <div><dt>EM</dt><dd>${int(s.em)}</dd></div>
      <div><dt>ER</dt><dd>${pct(s.er)}</dd></div>
    </dl>
    <div class="sets">${c.artifactSets.map(esc).join(' · ') || 'No set bonus'}</div>
  </div>`;
}

async function loadAllChars() {
  state.allCharsLoading = true;
  try { state.allChars = await api('/api/characters'); } catch { state.allChars = []; }
  state.allCharsLoading = false;
  if (state.tab === 'quiz') render();
}

async function loadLore() {
  state.loreLoading = true;
  // The first load downloads the lore database on the server, which can take a few seconds
  try { state.lore = await api('/api/lore'); } catch { state.lore = { characters: [], weapons: [] }; }
  state.loreLoading = false;
  if (state.tab === 'quiz') render();
}

function renderQuiz() {
  if (!state.allChars || !state.lore) {
    if (!state.allChars && !state.allCharsLoading) loadAllChars();
    if (!state.lore && !state.loreLoading) loadLore();
    if (!state.wishes && !state.wishesLoading && !state.wishesError) loadWishes();
    return '<div class="panel empty">Loading quiz…</div>';
  }

  if (!quiz.round) {
    return `<div class="panel quiz-start">
      <h2>Quiz</h2>
      ${quiz.noData ? `<p class="form-msg error">${esc(quiz.noData)}</p>` : ''}
      <p class="muted">${QUIZ_ROUNDS} random questions about your group's accounts, builds, wishes and the game itself. Different every time.</p>
      <div class="quiz-modes">${Object.entries(QUIZ_MODES).map(([id, m]) => `
        <button class="btn ${id === 'mixed' ? 'primary' : ''}" type="button" data-action="quiz-start" data-mode="${id}">
          ${esc(m.label)}${readBest(id) ? ` <span class="sub">best ${readBest(id)}/${QUIZ_ROUNDS}</span>` : ''}</button>`).join('')}</div>
      ${!loadedPlayers().length ? '<p class="muted small">Add some players for account questions. Game trivia works without any.</p>' : ''}
    </div>`;
  }

  if (quiz.finished) {
    const rounds = quiz.round;
    const ratio = quiz.score / rounds;
    const verdict = ratio >= 0.9 ? 'Certified Teyvat scholar.'
      : ratio >= 0.6 ? 'Solid. You\'ve clearly been paying attention.'
      : ratio >= 0.3 ? 'Not bad, but some of those were guesses.' : 'Paimon is disappointed.';
    return `<div class="panel quiz-start">
      <h2>${quiz.score}/${rounds}</h2><p>${verdict}</p>
      <p class="muted">${esc(QUIZ_MODES[quiz.mode].label)} · best ${readBest(quiz.mode)}/${QUIZ_ROUNDS}</p>
      <div class="quiz-modes">
        <button class="btn primary" type="button" data-action="quiz-start" data-mode="${quiz.mode}">Play again</button>
        <button class="btn" type="button" data-action="quiz-menu">Change mode</button></div></div>`;
  }

  const q = quiz.q;
  const answered = quiz.answer != null;
  const correct = answered && quiz.answer === q.answer;
  return `<div class="quiz-bar"><span>${esc(QUIZ_MODES[quiz.mode].label)}</span><span>Round <b>${quiz.round}</b>/${QUIZ_ROUNDS}</span>
      <span>Score <b>${quiz.score}</b></span><span>Streak <b>${quiz.streak}</b>${quiz.streak >= 3 ? ' 🔥' : ''}</span></div>
    <h2 class="quiz-prompt">${q.prompt}</h2>
    ${q.visual || ''}
    <div class="quiz-options">${q.options.map((o) => {
      const cls = !answered ? '' : o.id === q.answer ? 'right' : o.id === quiz.answer ? 'wrong' : 'dim';
      return `<button type="button" class="quiz-option ${cls}" data-action="quiz-answer" data-id="${esc(o.id)}" ${answered ? 'disabled' : ''}>
        ${o.img ? img(o.img, 'pfp') : ''}<span class="name">${esc(o.label)}</span></button>`;
    }).join('')}</div>
    ${answered ? `<div class="quiz-result ${correct ? 'right' : 'wrong'}">
        <span>${correct ? 'Correct!' : 'Nope.'} ${esc(q.explain)}</span>
        <button class="btn primary" type="button" data-action="quiz-next">${quiz.round >= QUIZ_ROUNDS ? 'See results' : 'Next'}</button></div>` : ''}`;
}

Object.assign(TABS, { quiz: renderQuiz });

view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'quiz-start': startQuiz(el.dataset.mode || 'mixed'); break;
    case 'quiz-answer': answerQuiz(el.dataset.id); break;
    case 'quiz-next': nextQuiz(); break;
    case 'quiz-menu': quiz.round = 0; quiz.finished = false; quiz.noData = null; break;
    default: return;
  }
  render();
});
