// Precomputes the odds summary shown at the top of the page, so the page doesn't run thousands of fights on load.
const fs = require('fs'), path = require('path'), E0 = require('../engine/sim.js');
const FILES = fs.readdirSync(path.join(__dirname, '../fights')).filter(f => f.endsWith('.json')).map(f => path.join(__dirname, '../fights', f));
const E = { ...E0, FIGHTS: FILES.map(f => JSON.parse(fs.readFileSync(f, 'utf8')).fight) };
const LADDER = { d10:[7600, 8500, 9500, 10500], d11:[4800, 8000, 10000, 12000], dr11:[6000, 7000, 8000, 10000] };
const CONTROLS = p => p.items.some(it => it.slowOnRightCrit) || (p.skills||[]).some(sk => sk.kind === "stun");
const out = {};
// Who got lucky in the real fight: crit rolls against their chances, streaks, and where each freeze landed.
function luckReport(B, seed, winP){
  const lost = B.winner === 1, nm = it => (it.ench ? it.ench + " " : "") + it.name, W = D => E.whatIf(D, 1000).win;
  const r = E.simulate({ ...structuredClone(B), seed });
  const sides = B.sides.map((p, si) => {
    const items = [];
    p.items.forEach((it, ii) => {
      const rolls = r.events.filter(e => e.kind === "roll" && e.si === si && e.ii === ii);
      if (!rolls.length) return;
      const act = rolls.filter(e => e.crit).length, exp = rolls.reduce((a, e) => a + e.p/100, 0);
      // How much this item's crits move the fight: your win chance if it always vs never crits
      const D1 = structuredClone(B), D2 = structuredClone(B); D1.ov = { [si+"_"+ii]: { crit:"always" } }; D2.ov = { [si+"_"+ii]: { crit:"never" } };
      const wAlways = W(D1), wNever = W(D2), weight = Math.abs(wAlways - wNever);
      // Longest miss streak at good odds and lucky crits at poor odds
      let run = 1, best = { n:0, p:1, at:0 }, cur = { n:0, p:1 };
      rolls.forEach(e => { if (!e.crit && e.p >= 50){ cur.n++; cur.p *= 1 - e.p/100; if (cur.p < best.p) best = { n:cur.n, p:cur.p, at:e.p }; } else cur = { n:0, p:1 }; });
      const longShots = rolls.filter(e => e.crit && e.p <= 40).map(e => ({ p:Math.round(e.p), t:+e.t.toFixed(1) }));
      items.push({ ii, name:nm(it), n:rolls.length, act, exp:+exp.toFixed(1), weight:+weight.toFixed(2), streak: best.n >= 2 && best.p < 0.05 ? { n:best.n, p:+best.p.toFixed(4), at:Math.round(best.at) } : null, longShots });
    });
    const act = items.reduce((a, x) => a + x.act, 0), exp = items.reduce((a, x) => a + x.exp, 0);
    // Where this side's Stunning Strike freeze landed, and your win chance with it on each target
    let freeze = null; const fe = r.events.find(e => e.kind === "freeze" && e.si === si);
    if (fe){
      const foe = B.sides[1 - si], opts = foe.items.map((it, j) => it.cd > 0 ? { j, name:nm(it), win: W({ ...structuredClone(B), stunAt:{ [si]: j } }) } : null).filter(Boolean);
      freeze = { on:fe.target, name:nm(foe.items[fe.target]), t:+fe.t.toFixed(1), win: opts.find(o => o.j === fe.target).win, opts };
    }
    return { name:p.name, act, exp:+exp.toFixed(1), items, freeze };
  });
  // Across every fight that went the way the real one did, how far each side's crits ran from normal
  const same = [], other = [];
  for (let s = 1; s <= 1000; s++){
    const q = E.simulate({ ...structuredClone(B), seed:s }), d = [0, 1].map(si => q.events.filter(e => e.kind === "roll" && e.si === si).reduce((a, e) => a + (e.crit ? 1 : 0) - e.p/100, 0));
    (q.end.winner === B.winner ? same : other).push(d);
  }
  const avg = (a, i) => a.length ? +(a.reduce((x, d) => x + d[i], 0) / a.length).toFixed(1) : 0;
  return { upset: (lost ? winP : 1 - winP) >= 0.65, sides, pop: { n: same.length, mine: avg(same, 0), theirs: avg(same, 1), otherMine: avg(other, 0), otherTheirs: avg(other, 1) } };
}
for (const B of E.FIGHTS){
  const lost = B.winner === 1, nm = (it, si) => (it.ench ? it.ench + " " : "") + it.name;
  const odds = E.whatIf(structuredClone(B), 1000);
  const ladder = LADDER[B.key].map(hp => { const D = structuredClone(B); D.sides[1].hp = hp; return { hp, win: E.whatIf(D, 1000).win }; });
  const F = E.fitSeeds(structuredClone(B), 1000);
  const seeds = F.runs.filter(r => r.win).slice(0, 40).map(r => r.seed);
  const sim = (seed, spec) => { const D = structuredClone(B); D.ov = { ...(spec?.ov || {}) }; D.skillOff = {}; D.stunAt = spec?.stunAt; return E.simulate({ ...D, seed }); };
  const margins = seeds.map(s => { const r = sim(s); return Math.round(Math.max(0, lost ? r.S[1].hp : r.S[0].hp)); }).sort((a, b) => a - b);
  const sc = [];
  B.sides.forEach((p, si) => p.items.forEach((it, ii) => {
    const key = si + "_" + ii, mine = si === 0;
    if (it.crit !== undefined && it.crit < 100 && (mine ? it.crit > 0 || lost : true)){
      const want = mine === lost ? "always" : "never"; // help you when you lost, hurt you when you won
      if (!(want === "never" && it.crit === 0 && mine)) sc.push({ label: `${mine ? "" : p.name + "'s "}${nm(it)} ${want === "always" ? "crits every time" : "never crits"}`, spec: { ov: { [key]: { crit: want } } } });
    }
    const HASTES = B.sides[si].items.some(x => x.haste), RAND = B.sides[si].items.some(x => x.haste && (x.haste.mode === "random" || x.haste.mode === "friendAndOther"));
    if (it.cd > 0 && mine === lost && RAND) sc.push({ label: `${mine ? "" : p.name + "'s "}${nm(it)} gets every random haste`, spec: { ov: { [key]: { hasteMagnet: true } } } });
    if (it.cd > 0 && mine !== lost && RAND) sc.push({ label: `${mine ? "" : p.name + "'s "}${nm(it)} misses every random haste`, spec: { ov: { [key]: { missRandHaste: true } } } });
    if (it.cd > 0 && CONTROLS(B.sides[1 - si])){
      // Same fight, same rolls; only which item the Stunning Strike freeze hits changes.
      const by = 1 - si, k = B.sides[by].skills.findIndex(x => x.kind === "stun");
      if (k >= 0 && mine !== lost) sc.push({ label: mine ? `${B.sides[1].name}'s freeze hits your ${nm(it)}` : `Your freeze hits ${nm(it)}`, spec: { stunAt: { [by]: ii } } });
    }
  }));
  const flips = sc.map(s => { const won = seeds.filter(seed => sim(seed, s.spec).end.winner === (lost ? 0 : 1)); return { label: s.label, spec: s.spec, n: won.length, seed: won[0] }; })
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 7);
  // The fight closest to your recap, and the closest one that went the other way
  const alt = F.runs.find(r => !r.win);
  const luck = luckReport(B, F.runs[0].seed, odds.win);
  out[B.key] = { luck, real: F.runs[0].seed, alt: alt ? alt.seed : null, win: odds.win, N: 1000, ladder, flips, of: seeds.length, margin: { min: margins[0], med: margins[Math.floor(margins.length/2)], max: margins[margins.length-1] } };
  console.error(B.key, JSON.stringify(out[B.key]));
}
// Write each fight's summary back into its file
FILES.forEach(f => { const x = JSON.parse(fs.readFileSync(f, 'utf8')); x.summary = out[x.fight.key]; fs.writeFileSync(f, JSON.stringify(x, null, 1)); });
