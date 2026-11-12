'use strict';
/*
 * Lore questions for the quiz: generated from genshin-db lore (GET /api/lore) plus hand-written
 * easter eggs and fun facts. Loaded after quiz.js and adds to its GENERATORS list.
 */

/* ---------- hand-written fun facts ---------- */
/* Only well-established facts. Wrong answers are often real names from the game, to keep it tricky. */
const FUN_FACTS = [
  { q: 'What does the Traveler jokingly call Paimon?', a: 'Emergency food', w: ['Travel snack', 'Lucky charm', 'Pocket compass'],
    fact: 'Paimon is "emergency food", much to her annoyance.' },
  { q: 'Venti is secretly which Archon?', a: 'Barbatos', w: ['Morax', 'Buer', 'Focalors'], fact: 'The bard Venti is Barbatos, the Anemo Archon.' },
  { q: 'Zhongli is secretly which Archon?', a: 'Morax', w: ['Barbatos', 'Beelzebul', 'Buer'], fact: 'Zhongli is Morax, also known as Rex Lapis.' },
  { q: 'What is the real name of the Archon behind the Raiden Shogun puppet?', a: 'Ei', w: ['Makoto', 'Miko', 'Sara'],
    fact: 'Ei built the Shogun puppet. Makoto was her twin sister.' },
  { q: 'Nahida is also known as…', a: 'Lesser Lord Kusanali', w: ['Greater Lord Rukkhadevata', 'The Divine Priestess', 'Lady Guuji'],
    fact: 'Nahida is Lesser Lord Kusanali. Greater Lord Rukkhadevata was the previous Dendro Archon.' },
  { q: 'For how long did Furina pretend to be the Hydro Archon?', a: '500 years', w: ['50 years', '2,000 years', '5,000 years'],
    fact: 'Furina played the role of Archon for 500 years to fool the prophecy.' },
  { q: 'What is Neuvillette\'s true nature?', a: 'The Hydro Sovereign', w: ['A Melusine', 'A former Fatui Harbinger', 'The Hydro Archon'],
    fact: 'Neuvillette is the Hydro Sovereign, one of the original dragon sovereigns.' },
  { q: 'What is Stormterror\'s real name?', a: 'Dvalin', w: ['Durin', 'Andrius', 'Azhdaha'], fact: 'Stormterror is Dvalin, one of the Four Winds of Mondstadt.' },
  { q: 'Andrius, the Wolf of the North, is also known as…', a: 'Boreas', w: ['Decarabian', 'Osial', 'Durin'],
    fact: 'Andrius is Boreas, the Lupus Boreas who watches over Wolvendom.' },
  { q: 'What is Childe\'s rank among the Fatui Harbingers?', a: '11th', w: ['4th', '6th', '8th'], fact: 'Tartaglia "Childe" is the 11th Harbinger.' },
  { q: 'Which Harbinger runs the House of the Hearth orphanage?', a: 'Arlecchino', w: ['La Signora', 'Pantalone', 'Columbina'],
    fact: 'Arlecchino, "the Knave", is "Father" to the House of the Hearth.' },
  { q: 'What name does Scaramouche go by as a playable character?', a: 'Wanderer', w: ['Balladeer', 'Kabukimono', 'Kunikuzushi'],
    fact: 'All four are his names, but he joined as the Wanderer.' },
  { q: 'Which organization does the Traveler\'s twin lead?', a: 'The Abyss Order', w: ['The Fatui', 'The Eremites', 'The Treasure Hoarders'],
    fact: 'Your lost sibling is the Prince or Princess of the Abyss Order.' },
  { q: 'What is Dainsleif\'s title?', a: 'The Bough Keeper', w: ['The Prince of the Abyss', 'The Herald of Khaenri\'ah', 'The Knight of Boreas'],
    fact: 'Dainsleif is the Bough Keeper, a survivor of Khaenri\'ah.' },
  { q: 'What does Zhongli famously always forget to bring?', a: 'His Mora', w: ['His umbrella', 'His tea set', 'His Vision'],
    fact: 'Zhongli never carries Mora, so someone else always pays.' },
  { q: 'Teyvat\'s currency, Mora, is named after…', a: 'Morax', w: ['Barbatos', 'Celestia', 'A Liyue merchant guild'],
    fact: 'Mora comes from Morax, the God of Contracts and Commerce.' },
  { q: 'What is Xiao\'s favorite dish?', a: 'Almond Tofu', w: ['Jade Parcels', 'Golden Shrimp Balls', 'Sticky Honey Roast'],
    fact: 'Almond Tofu reminds Xiao of the taste of dreams he used to devour.' },
  { q: 'Diluc and Kaeya are…', a: 'Adoptive brothers', w: ['Cousins', 'Childhood neighbors', 'Business partners'],
    fact: 'Diluc\'s father Crepus adopted Kaeya.' },
  { q: 'Diona hates alcohol, yet she works as…', a: 'A bartender', w: ['A wine taster', 'A tavern bouncer', 'A winery accountant'],
    fact: 'Diona is the Cat\'s Tail\'s star bartender, who secretly wants to ruin Mondstadt\'s wine industry.' },
  { q: 'What is the name of Fischl\'s raven?', a: 'Oz', w: ['Corvus', 'Noctis', 'Huginn'], fact: 'Oz, full name Ozvaldo Hrafnavins.' },
  { q: 'What is the name of Xiangling\'s bear-like companion?', a: 'Guoba', w: ['Oz', 'Baron Bunny', 'Jumpy Dumpty'],
    fact: 'Guoba is an ancient deity Xiangling befriended.' },
  { q: 'What are Klee\'s signature bombs called?', a: 'Jumpy Dumpty', w: ['Baron Bunny', 'Sparks \'n\' Splash', 'Guoba'],
    fact: 'Jumpy Dumpty is Klee\'s favorite way to "go fish-blasting".' },
  { q: 'Baron Bunny, the exploding decoy, belongs to…', a: 'Amber', w: ['Klee', 'Bennett', 'Lisa'], fact: 'Amber\'s Baron Bunny was a gift from her grandfather.' },
  { q: 'Which character is famous for having terrible luck?', a: 'Bennett', w: ['Xingqiu', 'Noelle', 'Razor'],
    fact: 'Bennett\'s luck is so bad that his adventure team only has one member.' },
  { q: 'Who raised Razor?', a: 'A pack of wolves', w: ['The Church of Favonius', 'Dawn Winery\'s staff', 'An Adeptus'],
    fact: 'Razor grew up with the wolves of Wolvendom, his "Lupical".' },
  { q: 'What kind of being is Qiqi?', a: 'A jiangshi (zombie)', w: ['An adeptus', 'A yaksha', 'An illuminated beast'],
    fact: 'Qiqi died long ago and was revived by the adepti as a jiangshi.' },
  { q: 'Who created Albedo?', a: 'Rhinedottir', w: ['Alice', 'La Signora', 'Dainsleif'], fact: 'Albedo was created by the alchemist Rhinedottir, "Gold".' },
  { q: 'Ganyu is half human and half…', a: 'Qilin', w: ['Yaksha', 'Kitsune', 'Dragon'], fact: 'Ganyu is half-qilin and has served the Liyue Qixing for millennia.' },
  { q: 'What kind of youkai is Yae Miko?', a: 'Kitsune', w: ['Tanuki', 'Oni', 'Tengu'], fact: 'Yae Miko is a kitsune and Guuji of the Grand Narukami Shrine.' },
  { q: 'Besides the shrine, which business does Yae Miko run?', a: 'Yae Publishing House', w: ['Naganohara Fireworks', 'Komore Teahouse', 'Komaniya Express'],
    fact: 'Yae Miko is the editor-in-chief behind Inazuma\'s light novels.' },
  { q: 'Arataki Itto is a proud…', a: 'Oni', w: ['Tengu', 'Kitsune', 'Yaksha'], fact: 'Itto is the first and greatest head of the Arataki Gang, and an oni.' },
  { q: 'What does Itto love to stage battles with?', a: 'Onikabuto beetles', w: ['Crystalflies', 'Frogs', 'Mushroom crabs'],
    fact: 'Itto takes beetle battles very seriously. Hu Tao and Kuki Shinobu less so.' },
  { q: 'Kujou Sara is a…', a: 'Tengu', w: ['Oni', 'Kitsune', 'Bake-danuki'], fact: 'Sara is a tengu raised by the Kujou Clan.' },
  { q: 'Yoimiya\'s family business makes…', a: 'Fireworks', w: ['Swords', 'Tea', 'Light novels'], fact: 'Yoimiya runs Naganohara Fireworks, the "Queen of the Summer Festival".' },
  { q: 'Thoma is the housekeeper for which clan?', a: 'Kamisato Clan', w: ['Kujou Clan', 'Hiiragi Clan', 'Kaedehara Clan'],
    fact: 'Thoma, from Mondstadt, looks after the Kamisato estate.' },
  { q: 'Sangonomiya Kokomi is the Divine Priestess of…', a: 'Watatsumi Island', w: ['Narukami Island', 'Seirai Island', 'Tsurumi Island'],
    fact: 'Kokomi leads Watatsumi\'s resistance and is a master strategist.' },
  { q: 'Kirara works as a courier for…', a: 'Komaniya Express', w: ['Yae Publishing House', 'The Tenryou Commission', 'The Kamisato Clan'],
    fact: 'Kirara is a nekomata delivery girl who loves boxes.' },
  { q: 'Which Inazuman decree confiscated people\'s Visions?', a: 'The Vision Hunt Decree', w: ['The Sakoku Decree', 'The Shogun\'s Mercy Edict', 'The Kanjou Act'],
    fact: 'The Sakoku Decree was real too, but it sealed Inazuma\'s borders.' },
  { q: 'What is the Sumeru Akademiya\'s knowledge network called?', a: 'The Akasha', w: ['Irminsul', 'The Oratrice', 'The Ley Line Archive'],
    fact: 'The Akasha drew on Irminsul, the tree of memories.' },
  { q: 'What judges trials at Fontaine\'s Opera Epiclese?', a: 'The Oratrice Mecanique d\'Analyse Cardinale', w: ['The Akasha Terminal', 'The Arkhium', 'The Hydro Archon\'s seal'],
    fact: 'The Oratrice was secretly designed to gather energy to defy the prophecy.' },
  { q: 'Which card game is Cyno obsessed with?', a: 'Genius Invokation TCG', w: ['Mahjong', 'Liyue chess', 'Monster cards'],
    fact: 'The General Mahamatra loves TCG almost as much as his terrible puns.' },
  { q: 'Who is Alhaitham\'s roommate?', a: 'Kaveh', w: ['Tighnari', 'Cyno', 'Collei'], fact: 'Kaveh lives in Alhaitham\'s house after going broke on a building project.' },
  { q: 'Tighnari has the ears and tail of which animal?', a: 'Fennec fox', w: ['Cat', 'Wolf', 'Rabbit'], fact: 'Tighnari is a Forest Watcher of the Avidya Forest.' },
  { q: 'What does Chongyun eat to calm his overflowing yang energy?', a: 'Popsicles', w: ['Spicy hotpot', 'Sweet Madame', 'Almond Tofu'],
    fact: 'Chongyun can\'t eat spicy food, and keeps cool with ice treats.' },
  { q: 'Who is the true Grand Master of the Knights of Favonius, away on an expedition?', a: 'Varka', w: ['Eroch', 'Rostam', 'Kaeya'],
    fact: 'Varka is away, so Jean serves as Acting Grand Master.' },
  { q: 'Which Liyue festival fills the sky with lanterns?', a: 'Lantern Rite', w: ['Windblume Festival', 'Irodori Festival', 'Fontinalia'],
    fact: 'Lantern Rite ends the year with thousands of Xiao lanterns.' },
  { q: 'Which festival celebrates love and freedom in Mondstadt?', a: 'Windblume Festival', w: ['Ludi Harpastum', 'Lantern Rite', 'Moonchase Festival'],
    fact: 'At Windblume, Mondstadters give flowers to the ones they love.' },
];

/* ---------- helpers ---------- */

/** Blanks out a name (and each word of it) so a bio or description doesn't give the answer away. */
function redact(text, name) {
  let out = text;
  const words = [name, ...name.split(/\s+/)].filter((w) => w.length >= 3).sort((a, b) => b.length - a.length);
  for (const w of words) out = out.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '___');
  return out;
}

/** Character name options with portraits; distractors prefer the same region for difficulty. */
function characterOptions(ctx, correct, isValidDistractor = () => true) {
  const others = ctx.loreChars.filter((c) => c.name !== correct.name && isValidDistractor(c));
  const sameRegion = others.filter((c) => c.region && c.region === correct.region);
  const pool = sameRegion.length >= 3 && Math.random() < 0.7 ? sameRegion : others;
  if (pool.length < 3) return null;
  return shuffle([correct, ...sample(pool, 3)]).map((c) => ({ id: c.name, label: c.name, img: charByName(c.name)?.iconUrl }));
}

/** "Which character has <field> X?" questions all follow the same shape. */
function byField(kind, field, prompt, explain, { weight = 2, unique = true } = {}) {
  return { kind, cat: 'lore', weight, make(ctx) {
    const c = ctx.loreChar((x) => x[field]);
    if (!c) return null;
    // Distractors must not share the same value, or two answers would be right
    const options = characterOptions(ctx, c, (x) => !unique || x[field] !== c[field]);
    if (!options) return null;
    return { key: `${kind}:${c.name}`, prompt: prompt(c[field], c), options, answer: c.name, explain: explain(c) };
  } };
}

/* ---------- generators ---------- */

GENERATORS.push(
  { kind: 'fun-fact', cat: 'lore', weight: 5, make() {
    const f = pick(FUN_FACTS);
    return { key: `ff:${f.q}`, prompt: esc(f.q), options: shuffle([f.a, ...f.w]).map((x) => ({ id: x, label: x })), answer: f.a, explain: f.fact };
  } },
  byField('title', 'title', (v) => `Who is known as “${esc(v)}”?`, (c) => `${c.name}: “${c.title}”.`, { weight: 3 }),
  { kind: 'bio', cat: 'lore', weight: 3, make(ctx) {
    const c = ctx.loreChar((x) => x.description && x.description.length > 30);
    const options = c && characterOptions(ctx, c);
    if (!options) return null;
    return { key: `bio:${c.name}`, prompt: 'Who is this?', visual: quote(redact(c.description, c.name)), options, answer: c.name,
      explain: `${c.name}, ${c.title}.` };
  } },
  byField('star-constellation', 'constellation', (v) => `Whose star constellation is “${esc(v)}”?`,
    (c) => `${c.name}'s constellation is ${c.constellation}.`),
  byField('birthday', 'birthday', (v) => `Whose birthday is ${esc(v)}?`, (c) => `${c.name} was born on ${c.birthday}.`),
  byField('affiliation', 'affiliation', (v) => `Who is affiliated with ${esc(v)}?`, (c) => `${c.name}: ${c.affiliation}.`),
  byField('dish', 'specialtyDish', (v) => `Whose specialty dish is “${esc(v)}”?`,
    (c) => `${c.specialtyDish} is ${c.name}'s take on a classic dish.`, { weight: 3 }),
  byField('burst', 'burst', (v) => `Whose Elemental Burst is “${esc(v)}”?`, (c) => `${c.burst} is ${c.name}'s Elemental Burst.`),
  byField('skill', 'skill', (v) => `Whose Elemental Skill is “${esc(v)}”?`, (c) => `${c.skill} is ${c.name}'s Elemental Skill.`),
  byField('utility-passive', 'utilityPassive', (v) => `“${esc(v)}” is a passive talent of which character?`,
    (c) => `${c.utilityPassive} is ${c.name}'s utility passive.`, { weight: 1 }),
  { kind: 'constellation-level', cat: 'lore', weight: 2, make(ctx) {
    const c = ctx.loreChar((x) => x.constellations?.length === 6);
    const options = c && characterOptions(ctx, c);
    if (!options) return null;
    const i = Math.floor(Math.random() * 6);
    return { key: `cl:${c.name}:${i}`, prompt: `“${esc(c.constellations[i])}” is one of whose constellations?`, options, answer: c.name,
      explain: `It's ${c.name}'s C${i + 1}.` };
  } },
  { kind: 'voice-actor', cat: 'lore', weight: 2, make(ctx) {
    const lang = Math.random() < 0.5 ? 'English' : 'Japanese';
    const field = lang === 'English' ? 'voiceEnglish' : 'voiceJapanese';
    const c = ctx.loreChar((x) => x[field]);
    if (!c) return null;
    const options = choices(c[field], ctx.loreChars.map((x) => x[field]).filter(Boolean));
    if (!options) return null;
    return { key: `va:${c.name}:${lang}`, prompt: `Who voices ${esc(c.name)} in ${lang}?`, visual: charIcon(charByName(c.name)),
      options, answer: c[field], explain: `${c[field]} voices ${c.name} in ${lang}.` };
  } },
  { kind: 'weapon-lore', cat: 'lore', weight: 2, make() {
    const weapons = state.lore?.weapons || [];
    const w = pick(weapons);
    if (!w) return null;
    const same = weapons.filter((x) => x.type === w.type && x.name !== w.name);
    const options = choices(w.name, (same.length >= 3 ? same : weapons).map((x) => x.name));
    if (!options) return null;
    return { key: `wl:${w.name}`, prompt: `Which ${esc((w.type || 'weapon').toLowerCase())} is described like this?`,
      visual: quote(redact(w.description, w.name)), options, answer: w.name, explain: `${w.name} (${w.rarity}★).` };
  } },
);
