'use strict';
/*
 * Icon questions for the quiz: talent, passive and constellation icons, weapon and artifact
 * icons and character name cards. Icons are served by Enka (https://enka.network/ui/<file>.png).
 * Loaded after quiz.js and quiz-lore.js; adds to GENERATORS.
 */

const KIND_LABELS = { skill: 'Elemental Skill', burst: 'Elemental Burst', passive: 'Passive Talent', constellation: 'Constellation' };
const SLOT_LABELS = { flower: 'Flower of Life', plume: 'Plume of Death', sands: 'Sands of Eon', goblet: 'Goblet of Eonothem', circlet: 'Circlet of Logos' };
const uiIcon = (file) => `https://enka.network/ui/${file}.png`;

/** Talent icons are white glyphs, so they sit on a colored disc in the character's element color. */
function talentIcon(file, element) {
  return `<div class="quiz-icon talent ${elClass(element)}"><img src="${esc(uiIcon(file))}" alt="" loading="eager"></div>`;
}
const itemIcon = (file, cls = 'item') => `<div class="quiz-icon ${cls}"><img src="${esc(uiIcon(file))}" alt="" loading="eager"></div>`;

/** Lore characters with at least one unique icon, each icon tagged with its owner. */
function iconPool(ctx, kinds) {
  return ctx.loreChars.flatMap((c) => (c.icons || [])
    .filter((i) => !kinds || kinds.includes(i.kind))
    .map((i) => ({ c, i })));
}
const elementOf = (name) => charByName(name)?.element;

/** Prefer icons of characters the group owns (60%), like the other lore questions. */
function pickIcon(ctx, kinds) {
  const all = iconPool(ctx, kinds);
  const mine = all.filter((x) => ctx.ownerCount.has(x.c.name));
  return mine.length && Math.random() < 0.6 ? pick(mine) : pick(all);
}

GENERATORS.push(
  /* Whose talent/constellation icon is this? */
  { kind: 'icon-owner', cat: 'icons', weight: 4, make(ctx) {
    const x = pickIcon(ctx);
    if (!x) return null;
    const options = characterOptions(ctx, x.c);
    if (!options) return null;
    const label = KIND_LABELS[x.i.kind];
    return { key: `io:${x.i.file}`, prompt: `Whose ${label.toLowerCase()} icon is this?`,
      visual: talentIcon(x.i.file, elementOf(x.c.name)), options, answer: x.c.name,
      explain: `${x.c.name}'s ${label}: “${x.i.name}”.` };
  } },

  /* What is this talent/constellation called? (all options are the same character's) */
  { kind: 'icon-name', cat: 'icons', weight: 3, make(ctx) {
    const x = pickIcon(ctx);
    if (!x) return null;
    const names = x.c.icons.map((i) => i.name);
    const options = choices(x.i.name, names);
    if (!options || options.length < 4) return null;
    return { key: `in:${x.i.file}`, prompt: `This is one of ${esc(x.c.name)}'s icons. What is it called?`,
      visual: talentIcon(x.i.file, elementOf(x.c.name)), options, answer: x.i.name,
      explain: `“${x.i.name}”, ${x.c.name}'s ${KIND_LABELS[x.i.kind]}.` };
  } },

  /* Is this icon a skill, burst, passive or constellation? */
  { kind: 'icon-type', cat: 'icons', weight: 3, make(ctx) {
    const x = pickIcon(ctx);
    if (!x) return null;
    const options = Object.entries(KIND_LABELS).map(([id, label]) => ({ id, label }));
    return { key: `it:${x.i.file}`, prompt: `What kind of icon is this, from ${esc(x.c.name)}?`,
      visual: talentIcon(x.i.file, elementOf(x.c.name)), options, answer: x.i.kind,
      explain: `It's ${x.c.name}'s ${KIND_LABELS[x.i.kind]}, “${x.i.name}”.` };
  } },

  /* Which weapon is this? (options of the same weapon type) */
  { kind: 'weapon-icon', cat: 'icons', weight: 2, make() {
    const weapons = (state.lore?.weapons || []).filter((w) => w.icon && w.rarity >= 4);
    const w = pick(weapons);
    if (!w) return null;
    const same = weapons.filter((x) => x.type === w.type && x.name !== w.name);
    const options = choices(w.name, (same.length >= 3 ? same : weapons).map((x) => x.name));
    if (!options) return null;
    return { key: `wi:${w.name}`, prompt: `Which ${esc((w.type || 'weapon').toLowerCase())} is this?`,
      visual: itemIcon(w.icon), options, answer: w.name, explain: `${w.name}, a ${w.rarity}★ ${w.type.toLowerCase()}.` };
  } },

  /* Which artifact set is this piece from? */
  { kind: 'artifact-icon', cat: 'icons', weight: 2, make() {
    const sets = state.lore?.artifactSets || [];
    const set = pick(sets);
    const piece = set && pick(set.pieces);
    if (!piece) return null;
    const options = choices(set.name, sets.map((s) => s.name));
    if (!options) return null;
    return { key: `ai:${piece.icon}`, prompt: `Which artifact set is this ${SLOT_LABELS[piece.slot] || 'piece'} from?`,
      visual: itemIcon(piece.icon), options, answer: set.name, explain: `“${piece.name}”, from ${set.name}.` };
  } },

  /* Whose name card is this? */
  { kind: 'namecard', cat: 'icons', weight: 2, make(ctx) {
    const c = ctx.loreChar((x) => x.namecard);
    const options = c && characterOptions(ctx, c);
    if (!options) return null;
    return { key: `nc:${c.name}`, prompt: 'Whose character name card is this?',
      visual: `<div class="quiz-namecard"><img src="${esc(uiIcon(c.namecard))}" alt="" loading="eager"></div>`,
      options, answer: c.name, explain: `${c.name}'s name card, earned at max friendship.` };
  } },
);
