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
// ---------- Card rules ----------
// Reads an item's card text, its enchant and the side's skills into engine effects, so passives like
// "When an adjacent item Slows, Burn 15" or "When you Slow, this gains 100 Damage" run in the fight
// instead of being folded into recap averages. Lines it can't read fall back to the recap averages.
const NUMRE = "([\\d.]+(?:/[\\d.]+)*)";
const STAT = { damage:"dmg", burn:"burn", poison:"poison", shield:"shield", heal:"heal", regen:"regen" };
const VERB = { slows:"slow", slow:"slow", hastes:"haste", haste:"haste", freezes:"freeze", freeze:"freeze", burns:"burn", burn:"burn", poisons:"poison", poison:"poison",
  shields:"shield", shield:"shield", heals:"heal", heal:"heal", regen:"regen", regens:"regen", crits:"crit", crit:"crit" };
const TAGWORD = w => { w = w.replace(/\s+items?$/i, "").replace(/s$/i, ""); return w[0].toUpperCase() + w.slice(1).toLowerCase(); };
// One effect ("Burn 15", "Slow 2 items 1 second(s)", "Shield equal to this item's Damage", "this gains 50 Damage")
function parseEff(txt, V, own){
  let m; txt = txt.trim().replace(/\.$/, "");
  const cnt = w => /^an?\b|^another\b/i.test(w) ? 1 : +V(w.match(/[\d.\/]+/)[0]);
  if ((m = txt.match(new RegExp("^(Deal|Burn|Poison|Shield|Heal|Regen) " + NUMRE + "(?: Damage)*(?: Damage)?$", "i")))){
    const k = m[1].toLowerCase() === "deal" ? "dmg" : STAT[m[1].toLowerCase()];
    return [{ kind:k, amt:V(m[2]), ownable:true }];
  }
  if ((m = txt.match(/^(Deal Damage|Burn|Poison|Shield|Heal|Regen) equal to (?:([\d.]+)% of |([\d.]+) times |(half) |(double) )?this item's (Damage|Burn|Shield|Heal|Poison|Regen)$/i))){
    const k = /deal/i.test(m[1]) ? "dmg" : STAT[m[1].toLowerCase()], f = m[2] ? +m[2] / 100 : m[3] ? +m[3] : m[4] ? 0.5 : m[5] ? 2 : 1;
    return [{ kind:k, of:STAT[m[6].toLowerCase()], f }];
  }
  if ((m = txt.match(new RegExp("^(Slow|Freeze) (an item|another item|" + NUMRE + " items?|" + NUMRE + " item\\(s\\)) " + NUMRE + "(?: (?:Slow|Freeze))? second", "i"))))
    return [{ kind:m[1].toLowerCase(), n:cnt(m[2]), secs:V(m[5]) }];
  if ((m = txt.match(new RegExp("^(Haste|Charge) (an item|another item|" + NUMRE + " items?|" + NUMRE + " item\\(s\\)|adjacent items|this|this item|the item to the (?:left|right)|your other Flying items|your items|your other items|an? ([A-Za-z]+(?: item)?)|" + NUMRE + " ([A-Za-z]+(?: items?| item\\(s\\))?)) " + NUMRE + "(?: (?:Haste|Charge))? second", "i")))){
    const k = m[1].toLowerCase(), w = m[2].toLowerCase(), secs = V(m[8]);
    if (w === "adjacent items") return [{ kind:k, who:"adj", secs }];
    if (w === "this" || w === "this item") return [{ kind:k, who:"self", secs }];
    if (/to the left/.test(w)) return [{ kind:k, who:"left", secs }];
    if (/to the right/.test(w)) return [{ kind:k, who:"right", secs }];
    if (w === "your other flying items") return [{ kind:k, who:"flyOthers", secs }];
    if (w === "your items" || w === "your other items") return [{ kind:k, who:"allOther", secs }];
    const tagW = m[5] || m[7];
    if (tagW && !/^items?$|^item\(s\)$/i.test(tagW)){ const n = m[5] ? 1 : +V(m[6]), tw = TAGWORD(tagW.replace(/\(s\)/, ""));
      if (/^(Burn|Poison|Shield|Heal|Regen|Damage|Slow|Haste|Freeze)$/i.test(tw)) return [{ kind:k, who:"has", has:STAT[tw.toLowerCase()] || tw.toLowerCase(), n, secs }];
      if (/^(Small|Medium|Large)$/i.test(tw)) return [{ kind:k, who:"size", size:{ small:1, medium:2, large:3 }[tw.toLowerCase()], n, secs }];
      return [{ kind:k, who:"tag", tag:tw, n, secs }]; }
    return [{ kind:k, n:cnt(m[2]), secs }];
  }
  if ((m = txt.match(new RegExp("^(this|this item|adjacent items|your items|your other items|the item to the (?:left|right)|an? ([A-Za-z]+) item|your ([A-Za-z]+?)s) gains? \\+?" + NUMRE + " ?(Damage|Burn|Poison|Shield|Heal|Regen|% Crit Chance)", "i")))){
    const w = m[1].toLowerCase(), stat = /crit/i.test(m[5]) ? "crit" : STAT[m[5].toLowerCase()], amt = V(m[4]);
    const who = /^this/.test(w) ? "self" : w === "adjacent items" ? "adj" : /left/.test(w) ? "left" : /right/.test(w) ? "right" : /^your (other )?items$/.test(w) ? "allOther" : null;
    if (who) return [{ kind:"gain", who, stat, amt }];
    if (m[2]){ const tw = TAGWORD(m[2]); return [STAT[tw.toLowerCase()] ? { kind:"gain", who:"has", has:STAT[tw.toLowerCase()], n:1, stat, amt } : { kind:"gain", who:"tag", tag:tw, n:1, stat, amt }]; }
    return [{ kind:"gain", who:"tag", tag:TAGWORD(m[3]), stat, amt }];
  }
  if ((m = txt.match(/^your items gain \+?([\d.\/]+) ?% Crit Chance(?: for the fight)?$/i))) return [{ kind:"gain", who:"side", stat:"crit", amt:V(m[1]) }];
  if (/^(this|this item) starts Flying$/i.test(txt)) return [{ kind:"fly", who:"self" }];
  if (/^adjacent items start Flying$/i.test(txt)) return [{ kind:"fly", who:"adj" }];
  if (/^(?:another|an) item starts Flying$/i.test(txt)) return [{ kind:"fly", n:1 }];
  if ((m = txt.match(/^([\d\/]+) (?:other )?items start Flying$/i))) return [{ kind:"fly", n:+V(m[1]) }];
  // Two effects in one line ("Haste and Charge an item 1 second(s)" is rare; "X and Y" splits)
  if (/ and /i.test(txt)){ const parts = txt.split(/ and /i).map(x => parseEff(x, V, own)); if (parts.every(Boolean)) return parts.flat(); }
  return null;
}
// A trigger at the start of a line: returns [react fields, rest of the line]
function parseTrigger(line){
  let m;
  if ((m = line.match(/^At the start of each fight, (.*)$/i))) return [{ on:"start" }, m[1]];
  if ((m = line.match(/^Every (\d+)(?:st|nd|rd|th) use, (.*)$/i))) return [{ on:"nth", n:+m[1] }, m[2]];
  if ((m = line.match(/^The first time you (.*?), (.*)$/i))){ const [r, rest] = parseTrigger("When you " + m[1] + ", " + m[2]) || []; return r ? [r.map ? r.map(x => ({ ...x, once:true })) : { ...r, once:true }, rest] : null; }
  if ((m = line.match(/^When you use an adjacent item, (.*)$/i))) return [{ on:"use", adj:true }, m[1]];
  if ((m = line.match(/^When you use (?:an|a) ?(?:item|another item)?, (.*)$/i))) return [{ on:"use" }, m[1]];
  if ((m = line.match(/^When you use another item, (.*)$/i))) return [{ on:"use", notSelf:true }, m[1]];
  if ((m = line.match(/^When you use another ([A-Za-z]+)(?: item)?, (.*)$/i)) && !/^non-/i.test(m[1])) return [{ on:"use", notSelf:true, tag:[TAGWORD(m[1])] }, m[2]];
  if ((m = line.match(/^When you use an? (Small|Medium|Large) item, (.*)$/i))) return [{ on:"use", size:{ small:1, medium:2, large:3 }[m[1].toLowerCase()] }, m[2]];
  if ((m = line.match(/^When you use an? (Flying) item, (.*)$/i))) return [{ on:"use", flying:true }, m[2]];
  if ((m = line.match(/^When you use an? ([A-Za-z]+(?: or (?:an? )?[A-Za-z]+)*?)(?: item)?, (.*)$/i))) return [{ on:"use", tag:m[1].split(/ or (?:an? )?/i).map(TAGWORD) }, m[2]];
  if ((m = line.match(/^When (?:your enemy|the enemy|an enemy) uses an item, (.*)$/i))) return [{ on:"enemyUse" }, m[1]];
  if ((m = line.match(/^When an adjacent item (Slows|Hastes|Freezes|Burns|Poisons|Shields|Heals|Crits|Regens), (.*)$/i))) return [{ on:VERB[m[1].toLowerCase()], adj:true }, m[2]];
  const VB = "(?:Slow|Haste|Freeze|Burn|Poison|Shield|Heal|Regen|Crit)";
  if ((m = line.match(new RegExp("^When you (" + VB + "(?:(?:,? and|,? or|,) " + VB + ")*)(?: each fight)?, (.*)$", "i")))){
    const verbs = m[1].split(/,? and |,? or |, /i).map(v => VERB[v.trim().toLowerCase()]).filter(Boolean);
    return [verbs.map(v => ({ on:v })), m[2]];
  }
  return null;
}
// Builds an item's rules. Returns null when nothing on the card could be read.
function itemRules(db, tier, ench){
  if (!db) return null;
  const V = s => tierVal(s, db[4], tier), R = { val:{}, fx:[], reacts:[], nth:[], atStart:[], mods:{}, side:[], read:0, missed:[] };
  const lines = db[7].map(l => [l.replace(/^(Active|Passive): /, ""), /^Active/.test(l)]);
  if (ench && db[9] && db[9][ench]) lines.push([db[9][ench], null]);
  const own = list => list.map(f => { if (f.ownable && R.val[f.kind] === undefined){ R.val[f.kind] = f.amt; return { kind:f.kind, own:true }; } if (f.ownable && R.val[f.kind] === f.amt) return { kind:f.kind, own:true }; const { ownable, ...g } = f; return g; });
  for (const [line, active] of lines){
    let m;
    // Modifiers that change the item itself
    if ((m = line.match(/^This has \+(\d+) Multicast/i))){ R.mods.mc = (R.mods.mc || 0) + +m[1]; R.read++; continue; }
    if ((m = line.match(/^This has \+([\d.\/]+) ?% Crit Chance$/i))){ R.mods.crit = (R.mods.crit || 0) + V(m[1]); R.read++; continue; }
    if ((m = line.match(/^This has double (Damage|Burn|Shield|Heal|Poison|Regen)$/i))){ (R.mods.double = R.mods.double || []).push(STAT[m[1].toLowerCase()]); R.read++; continue; }
    if ((m = line.match(/^This (Slows|Hastes|Freezes|Charges) for twice as long$/i))){ R.mods[VERB[m[1].toLowerCase()] || "charge"] = 2; R.read++; continue; }
    if (/^This has double Charge$/i.test(line)){ R.mods.charge = 2; R.read++; continue; }
    if (/^This is immune to Freeze,? (?:and )?Slow/i.test(line)){ R.mods.immune = true; R.read++; continue; }
    if ((m = line.match(/^(Your items|Adjacent items|The item to the (left|right)|Your ([A-Za-z]+?)s) ha(?:ve|s) \+([\d.\/]+) ?% Crit Chance$/i))){
      R.side.push({ crit:V(m[4]), who:/^your items/i.test(m[1]) ? "all" : /^adjacent/i.test(m[1]) ? "adj" : m[2] ? m[2].toLowerCase() : "tag", tag:m[3] ? TAGWORD(m[3]) : undefined }); R.read++; continue; }
    if (/^When you sell this|Enchant the item|with (Heavy|Icy|Turbo|Shielded|Restorative|Toxic|Fiery|Shiny|Deadly|Radiant|Obsidian|Mossy)$|double Value|Value/i.test(line)){ continue; }
    const trig = parseTrigger(line);
    if (trig){
      const eff = parseEff(trig[1], V);
      if (!eff){ R.missed.push(line); continue; }
      const e2 = own(eff);
      [].concat(trig[0]).forEach(t => { if (t.on === "start") R.atStart.push(...e2); else if (t.on === "nth") R.nth.push({ n:t.n, eff:e2 }); else R.reacts.push({ ...t, eff:e2 }); });
      R.read++; continue;
    }
    const eff = parseEff(line, V);
    if (eff){ const e2 = own(eff); if (eff.length === 1 && eff[0].kind === "fly" && eff[0].who === "self" && active !== false) R.atStart.push(...e2); else R.fx.push(...e2); R.read++; continue; }
    R.missed.push(line);
  }
  (R.mods.double || []).forEach(k => { if (R.val[k] !== undefined) R.val[k] *= 2; });
  return R.read ? R : null;
}
// What kinds of numbers a rule set can make, to know which recap numbers still need averages
function ruleKinds(R){
  const k = new Set(), add = f => { if (f.kind === "dmg") k.add("dmg"); else if (f.kind === "gain") return; else k.add(f.kind); };
  R.fx.forEach(add); R.atStart.forEach(add); R.nth.forEach(r => r.eff.forEach(add)); R.reacts.forEach(r => r.eff.forEach(add));
  return k;
}
// A skill's rules: reactions run as the skill; static bonuses are applied to the board once
function skillRules(s){
  const db = findSkill(s.name); if (!db) return null;
  const tiers = db[3] && db[3].length ? db[3] : TIERS, V = str => tierVal(str, tiers, s.tier || tiers[0]);
  const out = { reacts:[], statics:[], missed:[] };
  for (const line of db[2]){
    let m;
    if ((m = line.match(/^Your (leftmost|rightmost) (Burn|Poison|Shield|Heal|Regen|Damage) item has \+([\d.\/]+)/i))){ out.statics.push({ pos:m[1].toLowerCase(), stat:STAT[m[2].toLowerCase()], amt:V(m[3]) }); continue; }
    if ((m = line.match(/^Your items have \+([\d.\/]+) (Burn|Poison|Shield|Heal|Regen|Damage)$/i))){ out.statics.push({ pos:"all", stat:STAT[m[2].toLowerCase()], amt:V(m[1]) }); continue; }
    if ((m = line.match(/^Your (items|[A-Za-z]+?s) have \+([\d.\/]+) ?% Crit Chance$/i))){ out.statics.push({ crit:V(m[2]), tag:m[1].toLowerCase() === "items" ? null : TAGWORD(m[1]) }); continue; }
    const trig = parseTrigger(line);
    if (trig){ let eff = parseEff(trig[1], V); if (!eff && (m = trig[1].match(/^an? (Burn|Poison|Shield|Heal|Regen) item gains ([\d.\/]+) (Burn|Poison|Shield|Heal|Regen)$/i))) eff = [{ kind:"gain", who:"has", has:STAT[m[1].toLowerCase()], n:1, stat:STAT[m[3].toLowerCase()], amt:V(m[2]) }];
      if (eff){ const say = eff.map(f => f.kind === "gain" ? `+${f.amt}${f.stat === "crit" ? "% crit" : " " + f.stat}` : f.secs ? `${f.kind[0].toUpperCase() + f.kind.slice(1)} ${f.secs}s` : `${f.kind} ${f.amt || ""}`).join(", "); [].concat(trig[0]).forEach(t => out.reacts.push({ ...t, eff:eff.map(({ ownable, ...f }) => f), say })); continue; } }
    out.missed.push(line);
  }
  return out;
}

function genItem(b, rec, foeHits){
  const db = findItem(b.name), tier = b.tier || (db ? db[4][db[4].length - 1] : "Gold");
  const cd = db && (db[5][tier] || Object.values(db[5])[0]) || 0, mc = db && db[6][tier] || 1;
  const r = rec || {}, U = r.uses || 0, per = v => U ? Math.round((v || 0) / U) : 0;
  const it = { slug: db ? db[0] : b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: db ? db[1] : b.name, ench: b.ench || undefined,
    tier, size: db ? db[2] : 1, tags: db ? db[3] : [], cd: 0, anim: "glow", gen: true,
    real: Object.fromEntries(Object.entries(r).filter(([k, v]) => k !== "name" && v)),
    text: (db ? db[7] : []).map(l => [l, "avg", ""]) };
  const RR = itemRules(db, tier, b.ench);
  if (RR && (cd > 0 || RR.reacts.length || RR.nth.length || RR.atStart.length)){
    Object.assign(it, { rules:true, cd, val:RR.val, fx:RR.fx.slice(), reacts:RR.reacts, nth:RR.nth, atStart:RR.atStart, sideMods:RR.side, missed:RR.missed });
    const M = RR.mods, m2 = mc + (M.mc || 0); if (m2 > 1) it.multicast = m2;
    if (M.crit) it.crit = M.crit; if (M.slow) it.slowMul = M.slow; if (M.haste) it.hasteMul = M.haste; if (M.freeze) it.freezeMul = M.freeze; if (M.charge) it.chargeMul = M.charge; if (M.immune) it.immune = true;
    // Recap numbers that nothing on the card explains still come in as per-use averages
    const kinds = ruleKinds(RR), casts = Math.max(1, U / m2), n = v => Math.max(1, Math.round(v / casts));
    if (cd > 0 && U > 0){
      ["dmg", "burn", "poison", "shield", "heal", "regen"].forEach(k => { if (r[k] && !kinds.has(k)){ it.fx.push({ kind:k, amt:Math.max(1, per(r[k])) }); it.avgFor = (it.avgFor || []).concat(k); } });
      if (r.slow && !kinds.has("slow")){ it.fx.push({ kind:"slow", n:n(r.slow), secs:cardSeconds(db, "Slow", tier) || 1 }); it.avgFor = (it.avgFor || []).concat("slow"); }
      if (r.freeze && !kinds.has("freeze")){ it.fx.push({ kind:"freeze", n:n(r.freeze), secs:cardSeconds(db, "Freeze", tier) || 1 }); it.avgFor = (it.avgFor || []).concat("freeze"); }
      if (r.haste && !kinds.has("haste")){ it.fx.push({ kind:"haste", n:n(r.haste), secs:cardSeconds(db, "Haste", tier) || 1 }); it.avgFor = (it.avgFor || []).concat("haste"); }
    } else if (!(cd > 0) && r.dmg && !kinds.has("dmg") && foeHits){ it.reacts = it.reacts.concat({ on:"enemyUse", eff:[{ kind:"dmg", amt:Math.round(r.dmg / foeHits) }] }); }
    const has = k => kinds.has(k) || (it.avgFor || []).includes(k);
    it.anim = has("dmg") ? "slash" : has("burn") || has("poison") ? "nitro" : has("haste") ? "haste" : "glow";
    const miss = new Set(RR.missed);
    it.text = (db ? db[7] : []).map(l => [l, miss.has(l.replace(/^(Active|Passive): /, "")) ? "partial" : "yes", ""]);
    return it;
  }
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
  const db = findSkill(s.name), SR = skillRules(s);
  if (SR && (SR.reacts.length || SR.statics.length))
    return { slug: db[0], name: db[1], tier: s.tier || "Gold", kind: SR.reacts.length ? "rules" : "none", reacts: SR.reacts, statics: SR.statics, missed: SR.missed,
      text: db[2].join(" "), m: SR.missed.length ? "partial" : "yes", why: "" };
  return { slug: db ? db[0] : s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: db ? db[1] : s.name, tier: s.tier || "Gold", kind: "none",
    text: db ? db[2].join(" ") : "", m: "n/a", why: "Its effect is already inside the item averages." };
}
// Times each item was used in one fight with nobody dying, so cooldowns can be fitted to the recap
function useTimes(D, seed){
  const r = simulate({ ...D, seed }), u = D.sides.map(p => p.items.map(() => []));
  r.events.forEach(e => { if (e.kind === "use" && e.si >= 0 && e.ii >= 0) u[e.si][e.ii].push(e.t); });
  return { u, r };
}
// Crit bonuses an item gives others, and skills' fixed bonuses ("Your leftmost Heal item has +80")
function applySideRules(items, skills){
  const addCrit = (j, c) => { if (items[j]) items[j].crit = (items[j].crit || 0) + c; };
  items.forEach((it, i) => (it.sideMods || []).forEach(sm => {
    if (sm.who === "all") items.forEach((x, j) => addCrit(j, sm.crit));
    else if (sm.who === "adj"){ addCrit(i - 1, sm.crit); addCrit(i + 1, sm.crit); }
    else if (sm.who === "left") addCrit(i - 1, sm.crit); else if (sm.who === "right") addCrit(i + 1, sm.crit);
    else if (sm.who === "tag") items.forEach((x, j) => { if (x.tags.includes(sm.tag) || (sm.tag === "Flying" && (x.atStart || []).some(f => f.kind === "fly"))) addCrit(j, sm.crit); });
  }));
  skills.forEach(sk => (sk.statics || []).forEach(st => {
    if (st.crit) items.forEach((x, j) => { if (!st.tag || x.tags.includes(st.tag)) addCrit(j, st.crit); });
    else { const hold = items.map((x, j) => j).filter(j => items[j].val && items[j].val[st.stat] !== undefined);
      (st.pos === "all" ? hold : st.pos === "leftmost" ? hold.slice(0, 1) : hold.slice(-1)).forEach(j => { items[j].val[st.stat] += st.amt; }); }
  }));
  // Anything on this side that adds crit chance means every item rolls for crits
  const critSrc = items.some(x => x.crit) || skills.some(sk => (sk.reacts || []).some(r => r.eff.some(f => f.stat === "crit")));
  if (critSrc) items.forEach(x => { if (x.rules && x.cd > 0 && x.crit === undefined) x.crit = 0; });
}
function genFight(P){
  const hits = P.sides.map(p => p.did.reduce((a, x) => a + (x.uses || 0), 0));
  const D = {
    key: "gen-" + P.run + "-" + P.day, run: P.run, day: P.day, gen: true,
    label: `Day ${P.day} ${P.winner === 0 ? "win" : "loss"} vs ${P.sides[1].name}`,
    title: `${P.sides[0].name} vs ${P.sides[1].name}`,
    eyebrow: `Day ${P.day}${P.hour ? " · Hour " + P.hour : ""} · Built from BazaarHub`,
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
      const sks = p.skills.map(genSkill); applySideRules(items, sks);
      return { name: p.name, hero: `${p.hero || "Monster"}${p.level ? " · Level " + p.level : ""}`, heroKey: (p.hero || "").toLowerCase().replace(/ /g, ""),
        hp: p.hp || 1e7, hpSrc: p.hp ? "page" : "est", items, skills: sks };
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
  // Card rules give the timing (Bass grows with every slow, Flame Skirt burns when its neighbours slow);
  // BazaarHub's recap gives the totals. Scale each item's numbers so its totals by the real end match.
  const KS = ["dmg", "burn", "poison", "shield", "heal", "regen"];
  for (let pass = 0; pass < 4; pass++){
    const runs = SEEDS.map(s => simulate({ ...F, seed: s, maxT: T }).S);
    F.sides.forEach((p, si) => p.items.forEach((it, ii) => {
      if (!it.rules) return;
      KS.forEach(k => { const want = it.real[k]; if (!want) return;
        const got = runs.map(S => S[si].items[ii].st[k] || 0).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
        if (!got) return; it.scale = it.scale || {}; it.scale[k] = Math.max(0.1, Math.min(10, (it.scale[k] || 1) * want / got)); });
    }));
  }
  D.sides.forEach((p, si) => p.items.forEach((it, ii) => { if (F.sides[si].items[ii].scale) it.scale = F.sides[si].items[ii].scale; }));
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
