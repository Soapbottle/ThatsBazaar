// ---------- Generated fights ----------
// Builds a fight from a pasted Board Reader copy. Each item's numbers come from its real recap
// averages (damage, burn, shield... per use), its cooldown and multicast from the item's card, and
// how many items it hastes, slows or freezes per use from the recap counts. Cooldowns are then
// fitted so every item gets its real number of uses, and the loser's health is fitted to the
// damage they took before falling.

const TIERS = ["Bronze", "Silver", "Gold", "Diamond", "Legendary"];
function tierVal(str, tiers, tier){
  const parts = String(str).split("/").map(Number), i = tiers.indexOf(tier);
  return parts[Math.min(i < 0 ? parts.length - 1 : i, parts.length - 1)];
}
function findItem(name){ return ITEMDB[name.toLowerCase()] || null; }
function findSkill(name){ return SKILLDB[name.toLowerCase()] || null; }
// First "<verb> ... N second(s)" amount on the card, for this tier
function cardSeconds(db, verb, tier){
  if (!db) return null;
  for (const line of db[7]){
    const m = line.match(new RegExp(verb + "[^.]*?([\\d.]+(?:/[\\d.]+)*) second", "i"));
    if (m) return tierVal(m[1], db[4], tier);
  }
  return null;
}
function genItem(b, rec, foeHits){
  const db = findItem(b.name), tier = b.tier || (db ? db[4][db[4].length - 1] : "Gold");
  const cd = db && (db[5][tier] || Object.values(db[5])[0]) || 0, mc = db && db[6][tier] || 1;
  const r = rec || {}, U = r.uses || 0, per = v => U ? Math.round((v || 0) / U) : 0;
  const it = { slug: db ? db[0] : b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: db ? db[1] : b.name, ench: b.ench || undefined,
    tier, size: db ? db[2] : 1, tags: db ? db[3] : [], cd: 0, anim: "glow", gen: true,
    real: Object.fromEntries(Object.entries(r).filter(([k, v]) => k !== "name" && v)),
    text: (db ? db[7] : []).map(l => [l, "avg", ""]) };
  if (cd > 0 && U > 0){
    it.cd = cd; if (mc > 1) it.multicast = mc;
    if (r.dmg){ it.dmg = per(r.dmg); it.anim = "slash"; }
    if (r.burn){ it.burn = per(r.burn); it.anim = it.dmg ? it.anim : "nitro"; }
    if (r.poison){ it.poison = per(r.poison); it.anim = it.dmg ? it.anim : "nitro"; }
    if (r.shield) it.shield = per(r.shield);
    if (r.heal) it.heal = per(r.heal);
    if (r.regen) it.regen = Math.max(1, per(r.regen));
    const casts = Math.max(1, U / mc), n = v => Math.max(1, Math.round(v / casts));
    if (r.haste){ it.haste = { amt: cardSeconds(db, "Haste", tier) || 1, mode: "random", n: n(r.haste) }; it.anim = it.dmg ? it.anim : "haste"; }
    if (r.slow) it.slowAct = { n: n(r.slow), amt: cardSeconds(db, "Slow", tier) || 1 };
    if (r.freeze) it.freezeAct = { n: n(r.freeze), amt: cardSeconds(db, "Freeze", tier) || 1 };
    if (r.charge) it.charge = { amt: cardSeconds(db, "Charge", tier) || 1, mode: "random" };
  } else if (r.dmg && foeHits){
    // A passive that hits back when the enemy uses items (Caltrops and the like)
    it.onEnemyUseDmg = Math.round(r.dmg / foeHits); it.anim = "slash";
  }
  return it;
}
function genSkill(s){
  const db = findSkill(s.name);
  return { slug: db ? db[0] : s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: db ? db[1] : s.name, tier: s.tier || "Gold", kind: "none",
    text: db ? db[2].join(" ") : "", m: "n/a", why: "Its effect is already inside the item averages." };
}
// Times each item was used in one fight with nobody dying, so cooldowns can be fitted to the recap
function useTimes(D, seed){
  const r = simulate({ ...D, seed }), u = D.sides.map(p => p.items.map(() => []));
  r.events.forEach(e => { if (e.kind === "use" && e.si >= 0 && e.ii >= 0) u[e.si][e.ii].push(e.t); });
  return { u, r };
}
function genFight(P){
  const hits = P.sides.map(p => p.did.reduce((a, x) => a + (x.uses || 0), 0));
  const D = {
    key: "gen-" + P.run + "-" + P.day, run: P.run, day: P.day, gen: true,
    label: `Day ${P.day} ${P.winner === 0 ? "win" : "loss"} vs ${P.sides[1].name}`,
    title: `${P.sides[0].name} vs ${P.sides[1].name}`,
    eyebrow: `Day ${P.day}${P.hour ? " · Hour " + P.hour : ""} · Built from your paste`,
    runUrl: `https://bazaarhub.gg/runs/${P.run}?day=${P.day}`,
    hpNote: "fitted so he falls when he did in the recap",
    dt: 0.05, maxT: 75, castGap: 0.25, sandstormAt: 45, seed: 5, winner: P.winner,
    sides: P.sides.map((p, si) => {
      const pool = p.did.slice();
      const items = p.items.map(b => {
        // Match each board item to its recap line by name (and enchant when two share a name)
        let k = pool.findIndex(x => x.name.toLowerCase() === b.name.toLowerCase() && (!x.ench || !b.ench || x.ench === b.ench));
        if (k < 0) k = pool.findIndex(x => x.name.toLowerCase() === b.name.toLowerCase());
        const rec = k >= 0 ? pool.splice(k, 1)[0] : null;
        return genItem(b, rec, hits[1 - si]);
      });
      return { name: p.name, hero: `${p.hero || "Monster"}${p.level ? " · Level " + p.level : ""}`, heroKey: (p.hero || "").toLowerCase().replace(/ /g, ""),
        hp: p.hp || 1e7, hpSrc: p.hp ? "page" : "est", items, skills: p.skills.map(genSkill) };
    }),
  };
  fitGen(D, P);
  return D;
}
function fitGen(D, P){
  const want = D.sides.map(p => p.items.map(it => it.real.uses ? it.real.uses / (it.multicast || 1) : 0));
  const total = want.flat().reduce((a, b) => a + b, 0), SEEDS = [1, 2, 3, 4, 5, 6];
  const F = { ...structuredClone(D), maxT: 60 }; F.sides.forEach(p => { p.hp = 1e9; });
  let T = 10;
  for (let pass = 0; pass < 8; pass++){
    const runs = SEEDS.map(s => useTimes(F, s).u);
    // Fight length: when all items together reach their real number of uses
    const Ts = runs.map(u => { const all = u.flat(2).sort((a, b) => a - b); return all[Math.min(all.length - 1, Math.max(0, Math.round(total) - 1))] || 10; }).sort((a, b) => a - b);
    T = Ts[Math.floor(Ts.length / 2)];
    F.sides.forEach((p, si) => p.items.forEach((it, ii) => {
      if (!(it.cd > 0) || !want[si][ii]) return;
      const got = runs.reduce((a, u) => a + u[si][ii].filter(t => t <= T + 1e-6).length, 0) / runs.length;
      const ratio = Math.max(0.5, Math.min(2, (got + 0.5) / (want[si][ii] + 0.5)));
      it.cd = Math.max(0.5, Math.min(30, +(it.cd * Math.pow(ratio, 0.8)).toFixed(2)));
    }));
  }
  // Health lost by each side by the real end of the fight
  const lost = [0, 1].map(si => { const v = SEEDS.map(s => { const r = simulate({ ...F, seed: s, maxT: T }); return 1e9 - r.S[si].hp; }).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; });
  D.sides.forEach((p, si) => p.items.forEach((it, ii) => { it.cd = F.sides[si].items[ii].cd; }));
  const L = D.winner === 0 ? 1 : 0, W = 1 - L;
  if (!P.sides[L].hp) D.sides[L].hp = Math.max(500, Math.round(lost[L] / 50) * 50);
  if (!P.sides[W].hp){ const lvl = P.sides[W].level || 10; D.sides[W].hp = Math.round(Math.max(lost[W] * 1.4, 2500 + 400 * lvl) / 50) * 50; D.sides[W].hpGuess = true; }
  D.fitT = T;
}

// ---------- Reading a Board Reader copy ----------
// The bookmarklet writes, per fight: "=== Hour N · <title> ===", then for each player a header line,
// "  Board: Item [Tier, Enchant] | ...", "  Skills: Name [tier], ...", and then the page's own
// "What <name>'s items did" text, which this reads loosely: an item name line, then numbers with words.
const RECAP_KEYS = [
  ["dmg", /damage|dealt/i], ["burn", /burn/i], ["poison", /poison/i], ["shield", /shield/i], ["heal", /heal/i],
  ["regen", /regen/i], ["rage", /rage/i], ["haste", /hasted?|haste/i], ["slow", /slow(ed)?/i], ["freeze", /froze|freeze/i],
  ["charge", /charged?/i], ["uses", /\buse[sd]?\b|\btimes\b/i],
];
const ENCH = /^(SHINY|TURBO|MOSSY|DEADLY|RESTORATIVE|TOXIC|FIERY|ICY|HEAVY|SHIELDED|GOLDEN|RADIANT|OBSIDIAN)\s+/i;
const cap = w => w[0].toUpperCase() + w.slice(1).toLowerCase();
function parseBoard(line){
  return line.split("|").map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s*\[([^\]]*)\]$/), name = (m ? m[1] : s).trim(), tags = m ? m[2].split(",").map(x => x.trim()) : [];
    const tier = tags[0] && TIERS.includes(cap(tags[0])) ? cap(tags[0]) : undefined;
    return { name, tier, ench: tags[1] ? cap(tags[1]) : undefined };
  });
}
function parseDid(block, board){
  const names = board.map(b => b.name.toLowerCase()), out = [];
  let cur = null;
  const lines = block.split("\n").map(s => s.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++){
    const raw = lines[i], em = raw.match(ENCH), bare = raw.replace(ENCH, "").trim();
    if (names.includes(bare.toLowerCase())){ cur = { name: bare, ench: em ? cap(em[1]) : undefined }; out.push(cur); continue; }
    if (!cur) continue;
    // BazaarHub writes one sentence per item ("Slowed 14 items, dealt 55 damage and added 11 regen in 7 uses"),
    // so each clause carries its own number and word; a bare number takes its word from a neighbouring line
    const clauses = raw.split(/,\s+|\s+and\s+|\s+(?=in\s+[\d,]+\s+uses?\b)/i);
    for (const c of clauses){
      const num = c.match(/(\d[\d,]*)/);
      if (!num) continue;
      const v = +num[1].replace(/,/g, ""), rest = c.replace(num[1], "");
      const key = (RECAP_KEYS.find(([, re]) => re.test(rest)) || (clauses.length === 1 && (RECAP_KEYS.find(([, re]) => re.test(lines[i - 1] || "") && !/\d/.test(lines[i - 1] || "")) || RECAP_KEYS.find(([, re]) => re.test(lines[i + 1] || "") && !/\d/.test(lines[i + 1] || "")))) || [])[0];
      if (key && cur[key] === undefined) cur[key] = v;
    }
  }
  // An item that did something without "in N uses" went off once
  out.forEach(d => { if (d.uses === undefined && Object.keys(d).some(k => k !== "name" && k !== "ench" && d[k] !== undefined)) d.uses = 1; });
  return out;
}
function parseReader(text, runId){
  const fights = [];
  const parts = text.split(/^=== (.*) ===$/m);
  for (let i = 1; i < parts.length; i += 2){
    const title = parts[i], body = parts[i + 1] || "", lines = body.split("\n");
    const sides = [];
    for (let j = 0; j < lines.length; j++){
      const b = lines[j].match(/^\s*Board:\s*(.*)$/);
      if (!b) continue;
      const head = (lines[j - 1] || "").trim(), hm = head.match(/^(.*?)\s*\((.*)\)\s*$/), meta = hm ? hm[2].split(",").map(s => s.trim()) : [];
      const sk = (lines[j + 1] || "").match(/^\s*Skills:\s*(.*)$/);
      const lvl = meta.find(x => /^Level/i.test(x)), hpm = head.match(/([\d,]+)\s*max health/i);
      sides.push({ name: hm ? hm[1] : head, hero: meta[0] && meta[0] !== "monster" ? meta[0] : "", level: lvl ? +lvl.replace(/\D/g, "") : 0,
        hp: hpm ? +hpm[1].replace(/,/g, "") : 0, items: parseBoard(b[1]),
        skills: sk && sk[1].trim() !== "-" ? sk[1].split(/,\s*(?![^\[]*\])/).map(s => { const m = s.match(/^(.*?)\s*\[(\w+)\]/); return m ? { name: m[1].trim(), tier: cap(m[2]) } : { name: s.trim() }; }) : [] });
    }
    if (sides.length < 2) continue;
    // Recap blocks: "What <name>'s items did" ... up to the next one
    const did = body.split(/What (.+?)'s items did/);
    sides.forEach(p => { p.did = []; });
    for (let k = 1; k < did.length; k += 2){ const who = sides.find(p => p.name === did[k].trim()) || sides[(k - 1) / 2]; if (who) who.did = parseDid(did[k + 1] || "", who.items); }
    const hour = (title.match(/Hour (\d+)/) || [])[1], dayM = title.match(/\bDay (\d+)/i) || text.match(/day[=\s](\d+)/i);
    const won = /\b(won|win|victory)\b/i.test(title) ? 0 : /\b(lost|loss|defeat|died)\b/i.test(title) ? 1 : null;
    fights.push({ run: runId || "paste", day: dayM ? +dayM[1] : 0, hour: hour ? +hour : 0, title, winner: won, sides });
  }
  return fights;
}
if (typeof module !== "undefined") module.exports = { genFight, tierVal, parseReader };
