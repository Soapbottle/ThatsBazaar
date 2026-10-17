// ---------- Simulation ----------
function simulate(D){
  const dt = D.dt, R = n => Math.round(n*1000)/1000;
  const OV = (si, ii) => (D.ov && D.ov[si + "_" + ii]) || {};
  let seed = D.seed || 7; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;
  const S = D.sides.map((p, si) => ({ si, name:p.name, hpMax:p.hp, hp:p.hp, shield:0, burn:0, poison:0, regen:0, tempo:0, tempoGained:0, tempoPerSec:p.tempoPerSec||0, burnBonus:0, critBonus:0, crits:0,
    items: p.items.map((it, ii) => ({ ...it, ii, chargeCfg:it.charge, charge:0, hasteLeft:0, slowLeft:0, freezeLeft:0, dmgBonus:0, burnGain:0, critAdd:0, shieldNow: it.shield || 0,
      flying:!!it.startsFlying, st:{ uses:0, casts:0, dmg:0, burn:0, poison:0, regen:0, shield:0, heal:0, haste:0, slow:0, crit:0, gotCharge:0, gotHaste:0, gotSlow:0, gotFreeze:0, tempo:0, tempoSpent:0 } })),
    skills: (p.skills || []).map(s => ({ ...s, count:0, st:{ triggers:0, did:{} } })) }));
  S.forEach(s => {
    s.cdItems = s.items.filter(x => x.cd > 0).map(x => x.ii);
    s.fastest = s.cdItems.reduce((a, j) => a < 0 || s.items[j].cd < s.items[a].cd ? j : a, -1);
    s.leftmost = 0;
  });
  const events = [], frames = [], queue = [];
  let t = 0, end = null, step = 0;
  const ev = e => events.push({ t, ...e });
  const pick = arr => arr.length ? arr[Math.floor(rnd()*arr.length)] : -1;

  function hit(target, amount, kind){
    const s = S[target]; let a = amount;
    if (kind !== "poison" && s.shield > 0){
      if (kind === "burn"){ const take = Math.min(s.shield, a/2); s.shield -= take; a -= take*2; }
      else { const take = Math.min(s.shield, a); s.shield -= take; a -= take; }
    }
    if (a > 0) s.hp -= a;
  }
  function heal(si, amt, src, direct){ const s = S[si]; s.hp = Math.min(s.hpMax, s.hp + amt); if (direct && s.burn > 0) s.burn *= 0.95; if (src >= 0) s.items[src].st.heal += amt; ev({ si, ii:src, kind:"heal", amt }); trigger("heal", { si, src }); }
  function addBurn(target, amt, si, ii){ S[target].burn += amt; if (ii >= 0) S[si].items[ii].st.burn += amt; ev({ si, ii, kind:"burn", amt, on:target }); if (target !== si) trigger("burn", { si, ii }); }
  function chargeItem(si, j, amt, fromIi){ const it = S[si].items[j]; if (!it || !(it.cd > 0)) return; it.charge = Math.min(it.cd, it.charge + amt); it.st.gotCharge += amt; ev({ si, ii:fromIi, kind:"charge", target:j, amt }); }
  function freezeItem(si, j, amt, fromSi, fromIi){ const it = S[si].items[j]; if (!it) return; if (OV(si, j).immune || it.immune){ ev({ si:fromSi, ii:fromIi, kind:"blocked", on:si, target:j }); return; } if (it.flying) amt /= 2; it.freezeLeft += amt; it.st.gotFreeze += amt; if (fromIi >= 0) S[fromSi].items[fromIi].st.freeze = (S[fromSi].items[fromIi].st.freeze||0) + 1; ev({ si:fromSi, ii:fromIi, kind:"freeze", target:j, on:si, amt }); trigger("freeze", { si:fromSi }); }
  function slowItem(si, j, amt, fromSi, fromIi){ const it = S[si].items[j]; if (!it) return; if (OV(si, j).immune || it.immune){ ev({ si:fromSi, ii:fromIi, kind:"blocked", on:si, target:j }); return; } if (it.flying) amt /= 2; it.slowLeft += amt; it.st.gotSlow += amt; if (fromIi >= 0) S[fromSi].items[fromIi].st.slow++; ev({ si:fromSi, ii:fromIi, kind:"slow", target:j, on:si, amt }); trigger("slow", { si:fromSi, ii:fromIi }); }
  function gainTempo(si, amt, ii){ const s = S[si]; s.tempo += amt; s.tempoGained += amt; if (ii >= 0) s.items[ii].st.tempo += amt; }
  function spendTempo(si, amt, ii){ const s = S[si]; if (s.tempo < amt - 1e-9) return false; s.tempo -= amt; if (ii >= 0) s.items[ii].st.tempoSpent += amt; ev({ si, ii, kind:"tempo", amt:-amt }); return true; }
  // What if: an item that never gets hasted, or one that always wins the random haste roll (the roll still happens, so later luck stays the same)
  function pickHaste(si, pool){ const r = pick(pool), mag = pool.filter(j => OV(si, j).hasteMagnet), ok = pool.filter(j => !OV(si, j).missRandHaste);
    if (mag.length) return mag[0]; if (r >= 0 && OV(si, r).missRandHaste) return ok.length ? ok[pool.indexOf(r) % ok.length] : -1; return r; }
  function hasteItem(si, j, amt, fromIi){ const me = S[si], x = me.items[j]; if (OV(si, j).noHaste){ if (fromIi >= 0) me.items[fromIi].st.haste++; ev({ si, ii:fromIi, kind:"blocked", on:si, target:j }); return; } x.hasteLeft += amt; x.st.gotHaste += amt; if (fromIi >= 0) me.items[fromIi].st.haste++; ev({ si, ii:fromIi, kind:"haste", amt, target:j }); if (x.tempoOnHasted) gainTempo(si, x.tempoOnHasted, j); }
  function skillEv(si, k, text){ const sk = S[si].skills[k]; sk.st.triggers++; sk.st.did[text] = (sk.st.did[text]||0) + 1; ev({ si, ii:-1, kind:"skill", skill:k, text }); }

  // Card rules (generated fights): each item's effects and reactions read from its card, enchant and skills.
  // it.val holds the item's own numbers, it.gain what it gained during the fight, it.fx what it does when used,
  // it.reacts what it does when something happens. Passive reactions never crit.
  let depth = 0;
  const val = (me, it, k) => !it ? 0 : k === "crit" ? (it.crit || 0) + me.critBonus + it.critAdd :
    ((it.val && it.val[k]) || 0) + ((it.gain && it.gain[k]) || 0) + (k === "burn" && it.val && it.val.burn ? me.burnBonus : 0);
  function pickN(pool, n){ const p = pool.slice(), out = []; for (let q = 0; q < n && p.length; q++) out.push(p.splice(Math.floor(rnd()*p.length), 1)[0]); return out; }
  function targets(me, ii, f){
    const w = f.who || "random", n = f.n || 1, cdOnly = f.kind === "haste" || f.kind === "charge", ok = j => me.items[j] && (!cdOnly || me.items[j].cd > 0);
    const all = me.items.map((x, j) => j).filter(ok);
    if (w === "self") return ii >= 0 && ok(ii) ? [ii] : [];
    if (w === "adj") return [ii - 1, ii + 1].filter(ok);
    if (w === "left") return [ii - 1].filter(ok);
    if (w === "right") return [ii + 1].filter(ok);
    if (w === "all") return all;
    if (w === "allOther") return all.filter(j => j !== ii);
    if (w === "flyOthers") return all.filter(j => j !== ii && me.items[j].flying);
    if (w === "tag") return f.n ? pickN(all.filter(j => j !== ii && me.items[j].tags.includes(f.tag)), n) : all.filter(j => me.items[j].tags.includes(f.tag));
    if (w === "has") return pickN(all.filter(j => val(me, me.items[j], f.has) > 0 || (me.items[j].val && me.items[j].val[f.has])), n);
    if (w === "size") return f.n ? pickN(all.filter(j => j !== ii && me.items[j].size === f.size), n) : all.filter(j => me.items[j].size === f.size);
    return pickN(all.filter(j => j !== ii), n);
  }
  function doEff(si, ii, f, m){
    if (depth > 40) return; depth++;
    const me = S[si], foe = 1 - si, it = ii >= 0 ? me.items[ii] : null;
    let a = f.of ? val(me, it, f.of) * f.f : f.own ? val(me, it, f.kind) : (f.amt || 0);
    const k = f.kind;
    // Scale fitted so the item's totals match BazaarHub's recap (see fitGen)
    a = Math.round(a * m * ((it && it.scale && it.scale[k]) || 1) * 10) / 10;
    if (k === "dmg" && a > 0){ hit(foe, a, "dmg"); if (it) it.st.dmg += a; ev({ si, ii, kind:"dmg", amt:a, crit:m > 1, anim:it && it.anim }); if (it && it.lifesteal) heal(si, a*it.lifesteal/100, ii); }
    else if (k === "burn" && a > 0){ addBurn(foe, a, si, ii); if (ii >= 0) ev({ si, ii, kind:"fire" }); }
    else if (k === "poison" && a > 0){ S[foe].poison += a; if (it) it.st.poison += a; ev({ si, ii, kind:"poison", amt:a, on:foe }); trigger("poison", { si, ii }); }
    else if (k === "shield" && a > 0){ me.shield += a; if (it) it.st.shield += a; ev({ si, ii, kind:"shield", amt:a }); trigger("shield", { si, ii }); }
    else if (k === "heal" && a > 0){ heal(si, a, ii, true); }
    else if (k === "regen" && a > 0){ me.regen += a; if (it) it.st.regen += a; ev({ si, ii, kind:"regen", amt:a }); trigger("regen", { si, ii }); }
    else if (k === "slow" || k === "freeze"){ const mul = (it && it[k + "Mul"]) || 1; pickN(S[foe].cdItems, f.n || 1).forEach(j => (k === "slow" ? slowItem : freezeItem)(foe, j, f.secs * mul, si, ii)); }
    else if (k === "haste"){ const pool = me.cdItems.filter(j => j !== ii), tg = (f.who || "random") !== "random" ? targets(me, ii, f) : (f.n || 1) === 1 ? [pickHaste(si, pool)].filter(j => j >= 0) : pickN(pool, f.n).filter(j => !OV(si, j).missRandHaste); const mul = (it && it.hasteMul) || 1;
      tg.forEach(j => hasteItem(si, j, f.secs * mul, ii)); if (tg.length) trigger("haste", { si, ii }); }
    else if (k === "charge"){ const mul = (it && it.chargeMul) || 1; targets(me, ii, f).forEach(j => chargeItem(si, j, f.secs * mul, ii)); }
    else if (k === "gain"){
      if (f.who === "side"){ if (f.stat === "crit") me.critBonus += f.amt; }
      else targets(me, ii, { ...f, kind:"gain" }).forEach(j => { const x = me.items[j]; if (f.stat === "crit") x.critAdd += f.amt; else { x.gain = x.gain || {}; x.gain[f.stat] = (x.gain[f.stat] || 0) + f.amt; if (f.stat === "dmg") x.dmgBonus += f.amt; } });
      if (it){ it.st.gains = (it.st.gains || 0) + 1; }
    }
    else if (k === "fly"){ targets(me, ii, f).forEach(j => { me.items[j].flying = true; }); }
    depth--;
  }
  function reactOK(r, type, e, me, owner){
    const on = r.on === "enemyUse" ? "use" : r.on;
    if (on !== type) return false;
    if (r.on === "enemyUse" ? e.si === me.si : e.si !== me.si) return false;
    const src = e.ii !== undefined && e.ii >= 0 ? (r.on === "enemyUse" ? S[e.si] : me).items[e.ii] : null;
    if (r.adj && !(owner >= 0 && src && Math.abs(e.ii - owner) === 1)) return false;
    if (r.notSelf && e.ii === owner) return false;
    if (r.flying && !(src && src.flying)) return false;
    if (r.tag && !(src && r.tag.some(g => src.tags.includes(g)))) return false;
    if (r.size && !(src && src.size === r.size)) return false;
    return true;
  }
  function runReacts(type, e){
    S.forEach(me => {
      me.items.forEach(it => { if (!it.reacts) return; it.reacts.forEach((r, q) => { if (!reactOK(r, type, e, me, it.ii)) return; it.rc = it.rc || {}; if (r.once && it.rc[q]) return; it.rc[q] = (it.rc[q] || 0) + 1; it.st.react = (it.st.react || 0) + 1; ev({ si:me.si, ii:it.ii, kind:"fire" }); r.eff.forEach(f => doEff(me.si, it.ii, f, 1)); }); });
      me.skills.forEach((sk, k) => { if (!sk.reacts || (D.skillOff && D.skillOff[me.si + "_" + k])) return; sk.rc = sk.rc || {}; sk.reacts.forEach((r, q) => { if (!reactOK(r, type, e, me, -1)) return; if (r.once && sk.rc[q]) return; sk.rc[q] = (sk.rc[q] || 0) + 1; r.eff.forEach(f => doEff(me.si, -1, f, 1)); skillEv(me.si, k, r.say || sk.name); }); });
    });
  }

  // Event triggers: items and skills listening to what happens in the fight
  function trigger(type, e){
    runReacts(type, e);
    S.forEach(me => {
      const foe = S[1 - me.si];
      me.items.forEach(it => {
        if (type === "use" && e.si !== me.si && it.onEnemyFastest && e.ii === foe.fastest){
          const d = it.onEnemyFastest.dmg; hit(foe.si, d, "dmg"); it.st.dmg += d; ev({ si:me.si, ii:it.ii, kind:"dmg", amt:d, anim:it.anim });
          if (it.lifesteal) heal(me.si, d*it.lifesteal/100, it.ii);
          if (it.onEnemyFastest.regen){ me.regen += it.onEnemyFastest.regen; it.st.regen += it.onEnemyFastest.regen; ev({ si:me.si, ii:it.ii, kind:"regen", amt:it.onEnemyFastest.regen }); trigger("regen", { si:me.si }); }
          ev({ si:me.si, ii:it.ii, kind:"fire" });
        }
        if (type === "use" && e.si === me.si && e.ii !== it.ii){
          const u = me.items[e.ii];
          if (it.chargeOnUse && (it.chargeOnUse.sizes?.includes(u.size) || it.chargeOnUse.tags.some(g => u.tags.includes(g)))) chargeItem(me.si, it.ii, it.chargeOnUse.amt, it.ii);
          if (it.chargeOnUseLeft && e.ii < it.ii) chargeItem(me.si, it.ii, it.chargeOnUseLeft, it.ii);
        }
        if (type === "burn" && e.si === me.si && it.chargeOnOwnBurn) chargeItem(me.si, it.ii, it.chargeOnOwnBurn, it.ii);
        if (type === "haste" && e.si === me.si && it.chargeOnAdjHaste && Math.abs(e.ii - it.ii) === 1) chargeItem(me.si, it.ii, it.chargeOnAdjHaste, it.ii);
        if (type === "slow" && e.si === me.si && it.chargeOnAdjHaste && Math.abs(e.ii - it.ii) === 1) chargeItem(me.si, it.ii, it.chargeOnAdjHaste, it.ii);
        if (type === "use" && e.si !== me.si && it.onEnemyUseDmg){
          const cp = OV(me.si, it.ii).critPct, c = it.crit !== undefined && rnd()*100 < (cp !== undefined ? cp : it.crit) + me.critBonus + it.critAdd, d = it.onEnemyUseDmg * (c ? 2 : 1);
          hit(foe.si, d, "dmg"); it.st.dmg += d; ev({ si:me.si, ii:it.ii, kind:"dmg", amt:d, crit:c, anim:it.anim });
        }
        if (type === "use" && e.si !== me.si && it.chargeOnEnemyUse) chargeItem(me.si, it.ii, it.chargeOnEnemyUse, it.ii);
        if (type === "use" && e.si === me.si && it.toyCharge && me.items[e.ii].tags.includes("Toy")){
          const j = pick(me.cdItems.filter(j => j !== e.ii && me.items[j].tags.includes("Toy"))); if (j >= 0) chargeItem(me.si, j, it.toyCharge, it.ii);
        }
        if (type === "crit" && e.si === me.si && it.cdCutOnAnyCrit){ if (it.cd > it.cdFloor){ it.cd = Math.max(it.cdFloor, R(it.cd - it.cdCutOnAnyCrit)); it.charge = Math.min(it.charge, it.cd); it.st.cdCut = (it.st.cdCut||0) + it.cdCutOnAnyCrit; ev({ si:me.si, ii:it.ii, kind:"cdcut", amt:it.cd }); } if (it.fliesOnCrit) it.flying = true; }
        if (type === "crit" && e.si === me.si && it.slowOnRightCrit && e.ii === it.ii + 1){
          const j = pick(foe.cdItems); if (j >= 0) slowItem(foe.si, j, it.slowOnRightCrit, me.si, it.ii);
        }
        if (type === "slow" && e.si === me.si && it.burnOnAdjSlow && Math.abs(e.ii - it.ii) === 1){
          addBurn(foe.si, it.burnOnAdjSlow + me.burnBonus, me.si, it.ii); ev({ si:me.si, ii:it.ii, kind:"fire" });
        }
      });
      me.skills.forEach((sk, k) => {
        if (D.skillOff && D.skillOff[me.si + "_" + k]) return;
        if (sk.kind === "flurry" && type === "use" && e.si === me.si && me.items[e.ii].tags.includes("Weapon") && sk.count < sk.n){
          sk.count++; const j = pick(me.cdItems.filter(j => j !== e.ii)); if (j >= 0){ chargeItem(me.si, j, sk.amt, -1); skillEv(me.si, k, `Charged ${me.items[j].name} 1s`); }
        }
        if (sk.kind === "medic" && (type === "heal" || type === "regen") && e.si === me.si){ me.burnBonus += sk.amt; sk.st.triggers++; sk.st.did = { [`Burn items +${me.burnBonus} burn`]: 1 }; }
        if (sk.kind === "stun" && type === "crit" && e.si === me.si && sk.count < 1){
          sk.count++; let j = pick(foe.cdItems); if (D.stunAt && D.stunAt[me.si] !== undefined) j = D.stunAt[me.si]; if (j >= 0 && OV(foe.si, j).immune){ skillEv(me.si, k, `Freeze on ${foe.items[j].name} blocked`); } else if (j >= 0){ const fa = foe.items[j].flying ? sk.amt/2 : sk.amt; foe.items[j].freezeLeft += fa; foe.items[j].st.gotFreeze += fa; skillEv(me.si, k, `Froze ${foe.items[j].name} ${sk.amt}s`); ev({ si:me.si, ii:-1, kind:"freeze", on:foe.si, target:j, amt:sk.amt }); trigger("freeze", { si:me.si }); }
        }
        if (sk.kind === "sharpened" && type === "use" && e.si === me.si && me.items[e.ii].tags.includes("Weapon")){ [e.ii-1, e.ii+1].forEach(j => { if (me.items[j]) me.items[j].critAdd += sk.amt; }); skillEv(me.si, k, `Items next to ${me.items[e.ii].name} +${sk.amt}% crit`); }
        if (sk.kind === "plowshares" && type === "use" && e.si === me.si && me.items[e.ii].tags.includes("Tool")){ [e.ii-1, e.ii+1].forEach(j => { const x = me.items[j]; if (x && x.tags.includes("Weapon") && x.dmg){ x.dmgBonus += sk.amt; skillEv(me.si, k, `${x.name} +${sk.amt} damage`); } }); }
        if (sk.kind === "firstflames" && type === "use" && e.si === me.si && me.items[e.ii].size === 3 && sk.count < 1){ sk.count++; addBurn(foe.si, sk.amt, me.si, -1); skillEv(me.si, k, `Burn ${sk.amt}`); }
        if (sk.kind === "heatlover" && type === "burn" && e.si === me.si){ me.regen += sk.amt; sk.total = (sk.total||0) + sk.amt; sk.st.triggers++; sk.st.did = { [`Regen +${sk.total} for the fight`]: 1 }; }
        if (sk.kind === "summit" && type === "freeze" && e.si === me.si){ me.critBonus += sk.amt; skillEv(me.si, k, `Items +${sk.amt}% crit`); }
        if (sk.kind === "hotspot" && type === "use" && e.si === me.si && e.ii === me.leftmost && sk.count < sk.n){ sk.count++; addBurn(foe.si, sk.amt + me.burnBonus, me.si, -1); skillEv(me.si, k, `Burn ${sk.amt + me.burnBonus}`); }
        if (sk.kind === "trained" && type === "slow" && e.si === me.si){
          const j = pick(me.items.filter(x => x.tags.includes("Weapon")).map(x => x.ii)); if (j >= 0){ me.items[j].dmgBonus += sk.amt; skillEv(me.si, k, `${me.items[j].name} +${sk.amt} damage`); }
        }
        if (sk.kind === "tremolo" && type === "use" && e.si === me.si && sk.count < 1 && (me.items[e.ii].burn || me.items[e.ii].burnBoth)){ sk.count++; me.tempo += sk.amt; skillEv(me.si, k, `Gained ${sk.amt} Tempo`); }
      });
    });
  }

  function cast(si, ii, k){
    const me = S[si], foe = 1 - si, it = me.items[ii];
    it.st.casts++;
    const ov = OV(si, ii), roll = it.crit !== undefined ? rnd()*100 : 0;
    const crit = it.crit !== undefined && (ov.crit === "always" ? true : ov.crit === "never" ? false : roll < (ov.critPct !== undefined ? ov.critPct : it.crit) + me.critBonus + it.critAdd);
    const m = crit ? 2 : 1;
    if (it.rules){
      (it.fx || []).forEach(f => doEff(si, ii, f, f.noCrit ? 1 : m));
      if (it.crit !== undefined && !ov.crit) ev({ si, ii, kind:"roll", crit, p:Math.min(100,(ov.critPct !== undefined ? ov.critPct : it.crit) + me.critBonus + it.critAdd) }); if (crit){ it.st.crit++; me.crits++; trigger("crit", { si, ii }); }
      return;
    }
    if (it.valueGain){ it.shieldNow += 2*it.valueGain; }
    if (it.dmg){
      const d = (it.dmg + it.dmgBonus) * m; hit(foe, d, "dmg"); it.st.dmg += d;
      ev({ si, ii, kind:"dmg", amt:d, crit, anim:it.anim });
      if (it.lifesteal) heal(si, d*it.lifesteal/100, ii);
      if (it.shieldFromDmg){ me.shield += d; it.st.shield += d; ev({ si, ii, kind:"shield", amt:d }); }
    }
    if (it.burnPctDmg){ it.burn = Math.round((it.dmg + it.dmgBonus) * it.burnPctDmg) + (it.burnFlat || 0); }
    if (it.burn){
      const b = (it.burn + it.burnGain + me.burnBonus) * m; addBurn(foe, b, si, ii);
      if (it.healFromBurn) heal(si, b*it.healFromBurn, ii, true);
      me.skills.forEach((sk, k) => { if (sk.kind === "conflag" && !(D.skillOff && D.skillOff[si + "_" + k])){ it.burnGain += sk.amt; skillEv(si, k, `${it.name} +${sk.amt} burn`); } });
      if (it.selfBurnGain) it.burnGain += it.selfBurnGain;
    }
    if (it.burnBoth){ const b = (it.burnBoth + me.burnBonus) * m; addBurn(foe, b, si, ii); S[si].burn += b; ev({ si, ii, kind:"burn", amt:b, on:si, self:true }); }
    if (it.shield){ const sh = it.shieldNow * m; me.shield += sh; it.st.shield += sh; ev({ si, ii, kind:"shield", amt:sh }); }
    if (it.heal){ heal(si, it.heal * m, ii, true); }
    if (it.poison){ const pz = it.poison * m; S[foe].poison += pz; it.st.poison += pz; ev({ si, ii, kind:"poison", amt:pz, on:foe }); }
    if (it.slowAct){ const pool = S[foe].cdItems.slice(); for (let q = 0; q < it.slowAct.n && pool.length; q++){ const j = pool.splice(Math.floor(rnd()*pool.length), 1)[0]; slowItem(foe, j, it.slowAct.amt, si, ii); } }
    if (it.freezeAct){ const pool = S[foe].cdItems.slice(); for (let q = 0; q < it.freezeAct.n && pool.length; q++){ const j = pool.splice(Math.floor(rnd()*pool.length), 1)[0]; freezeItem(foe, j, it.freezeAct.amt, si, ii); } }
    if (it.regen){ const rg = it.regen * m; me.regen += rg; it.st.regen += rg; ev({ si, ii, kind:"regen", amt:rg }); trigger("regen", { si }); }
    if (k === 0){
      if (it.haste){
        const targets = it.haste.mode === "adjacent" ? [ii-1, ii+1].filter(j => me.items[j] && me.items[j].cd > 0) : it.haste.mode === "others" ? me.cdItems.filter(j => j !== ii) : it.haste.mode === "self" ? [ii] :
          it.haste.mode === "friendAndOther" ? [pickHaste(si, me.cdItems.filter(j => j !== ii && me.items[j].tags.includes("Friend"))), pickHaste(si, me.cdItems.filter(j => j !== ii && !me.items[j].tags.includes("Friend")))].filter(j => j >= 0) :
          it.haste.n > 1 ? (() => { const pool = me.cdItems.filter(j => j !== ii), out = []; const mag = pool.filter(j => OV(si, j).hasteMagnet); for (let q = 0; q < it.haste.n && pool.length; q++) out.push(pool.splice(Math.floor(rnd()*pool.length), 1)[0]); if (mag.length && !out.includes(mag[0])) out[out.length - 1] = mag[0]; return out.filter(j => !OV(si, j).missRandHaste); })() : [pickHaste(si, me.cdItems.filter(j => j !== ii))].filter(j => j >= 0);
        targets.forEach(j => hasteItem(si, j, it.haste.amt, ii));
        if (targets.length) trigger("haste", { si, ii });
      }
      if (it.tempoDoubleRight && me.items[ii+1] && me.items[ii+1].dmg && spendTempo(si, it.tempoDoubleRight, ii)){ const x = me.items[ii+1]; x.dmgBonus += x.dmg + x.dmgBonus; ev({ si, ii, kind:"double", target:ii+1 }); }
      if (it.critAura){ me.critBonus += it.critAura; it.st.aura = (it.st.aura||0) + it.critAura; }
      if (it.allDmgGain) me.items.forEach(x => { if (x.dmg) x.dmgBonus += it.allDmgGain; });
      if (it.chargeCfg){ const j = pick(me.cdItems.filter(j => j !== ii)); if (j >= 0) chargeItem(si, j, it.chargeCfg.amt, ii); }
      if (it.chargeAllNonWeapons) me.cdItems.filter(j => j !== ii && !me.items[j].tags.includes("Weapon")).forEach(j => chargeItem(si, j, it.chargeAllNonWeapons, ii));
    }
    if (it.crit !== undefined && !ov.crit) ev({ si, ii, kind:"roll", crit, p:Math.min(100,(ov.critPct !== undefined ? ov.critPct : it.crit) + me.critBonus + it.critAdd) }); if (crit){ it.st.crit++; me.crits++; trigger("crit", { si, ii }); }
  }
  function use(si, ii){
    const me = S[si], it = me.items[ii];
    it.st.uses++;
    ev({ si, ii, kind:"use" });
    cast(si, ii, 0);
    (it.nth || []).forEach(r => { if (it.st.uses % r.n === 0) r.eff.forEach(f => doEff(si, ii, f, 1)); });
    const mc = (it.multicast || 1) + (it.mcPerTempo ? Math.floor(me.tempoGained / it.mcPerTempo) : 0);
    for (let k = 1; k < mc; k++) queue.push({ at:R(t + k*D.castGap), si, ii, k });
    trigger("use", { si, ii });
    if (it.tempoRecast && spendTempo(si, it.tempoRecast, ii)) queue.push({ at:R(t + Math.max(mc, 1)*D.castGap), si, ii, k:0, reuse:true });
  }
  function snap(){
    frames.push(S.map(s => ({ hp:Math.max(0, s.hp), sh:s.shield, burn:s.burn, poison:s.poison, regen:s.regen, tempo:s.tempo,
      items: s.items.map(it => ({ cd: it.cd, c: it.cd > 0 ? Math.min(1, it.charge/it.cd) : 0, h: it.hasteLeft > 0, hl: it.hasteLeft, sl: it.slowLeft > 0, fr: it.freezeLeft > 0, d: it.rules ? (it.val && it.val.dmg ? Math.round((it.val.dmg + it.dmgBonus) * ((it.scale && it.scale.dmg) || 1)) : null) : it.dmg ? it.dmg + it.dmgBonus : null })) })));
  }
  S.forEach((s, si) => s.items.forEach((it, ii) => { const f = OV(si, ii).startFreeze; if (f){ it.freezeLeft = f; it.st.gotFreeze += f; } }));
  S.forEach((s, si) => s.items.forEach((it, ii) => (it.atStart || []).forEach(f => doEff(si, ii, f, 1))));
  if (!D.fast) snap();
  while (t < D.maxT && !end){
    step++; t = R(step*dt);
    for (let si = 0; si < 2; si++){
      S[si].items.forEach((it, ii) => {
        if (!(it.cd > 0)) return;
        let rate = 1;
        if (it.freezeLeft > 0){ rate = 0; it.freezeLeft = Math.max(0, R(it.freezeLeft - dt)); }
        else {
          const h = it.hasteLeft > 0, s = it.slowLeft > 0;
          rate = h && !s ? 2 : s && !h ? 0.5 : 1;
        }
        if (it.hasteLeft > 0) it.hasteLeft = Math.max(0, R(it.hasteLeft - dt));
        if (it.slowLeft > 0) it.slowLeft = Math.max(0, R(it.slowLeft - dt));
        it.charge = Math.min(it.cd, it.charge + dt*rate);
        if (it.charge >= it.cd - 1e-9){ it.charge = 0; use(si, ii); }
      });
    }
    queue.sort((a, b) => a.at - b.at);
    while (queue.length && queue[0].at <= t + 1e-9){ const q = queue.shift(); if (q.reuse) use(q.si, q.ii); else cast(q.si, q.ii, q.k); }
    if (step % Math.round(0.5/dt) === 0) S.forEach((s, si) => {
      if (s.burn >= 1){ const b = Math.round(s.burn); hit(si, b, "burn"); ev({ si:-1, ii:-1, kind:"burntick", amt:b, on:si }); s.burn *= 0.97; }
    });
    if (step % Math.round(1/dt) === 0) S.forEach((s, si) => { if (s.tempoPerSec) gainTempo(si, s.tempoPerSec, -1); });
    if (step % Math.round(1/dt) === 0) S.forEach((s, si) => { if (s.poison >= 1){ hit(si, Math.round(s.poison), "poison"); ev({ si:-1, ii:-1, kind:"poisontick", amt:Math.round(s.poison), on:si }); } });
    if (step % Math.round(1/dt) === 0) S.forEach((s, si) => { if (s.regen > 0){ s.hp = Math.min(s.hpMax, s.hp + s.regen); ev({ si:-1, ii:-1, kind:"regentick", amt:s.regen, on:si }); } });
    if (t > D.sandstormAt && step % Math.round(0.2/dt) === 0){
      const sand = Math.min(1171, Math.round(2*Math.exp(0.67*(t - D.sandstormAt))));
      S.forEach((s, si) => hit(si, sand, "dmg"));
    }
    if (!D.fast) snap();
    const dead = S.map(s => s.hp <= 0);
    if (dead[0] || dead[1]) end = { t, winner: dead[0] && dead[1] ? -1 : dead[1] ? 0 : 1 };
  }
  if (!end) end = { t, winner: S[0].hp/S[0].hpMax >= S[1].hp/S[1].hpMax ? 0 : 1, timeout:true };
  return { frames, events, end, S, stats: S.map(s => s.items.map(it => it.st)), skillStats: S.map(s => s.skills.map(k => k.st)) };
}

// Crits under 100% and every random target (which item gets charged, hasted, slowed or frozen) change the fight.
// Run many possible fights and find the one closest to the real recap.
function scoreRun(r){
  let sc = 0, n = 0;
  r.S.forEach((s, si) => s.items.forEach((it, ii) => { const re = D_REAL[si][ii]; if (!re) return; for (const k in re){ sc += Math.abs((it.st[k]||0) - re[k]) / Math.max(re[k], 3); n++; } }));
  return n ? sc/n : 0;
}
let D_REAL = [];
function fitSeeds(D, N){
  D_REAL = D.sides.map(p => p.items.map(it => it.real));
  const runs = [];
  for (let seed = 1; seed <= N; seed++){
    const r = simulate({ ...D, seed, fast:true });
    runs.push({ seed, score: scoreRun(r) + (r.end.winner === D.winner ? 0 : 1), win: r.end.winner === D.winner, t: r.end.t,
      stats: r.S.map(s => s.items.map(it => it.st)), skills: r.S.map(s => s.skills.map(k => k.st)) });
  }
  runs.sort((a, b) => a.score - b.score);
  // Per stat: range across all fights and how often a fight lands within 5% of the real value
  const dist = D.sides.map((p, si) => p.items.map((it, ii) => {
    if (!it.real) return null; const o = {};
    for (const k in it.real){ const vals = runs.map(r => r.stats[si][ii][k] || 0), v = it.real[k];
      o[k] = { min: Math.min(...vals), max: Math.max(...vals), hit: vals.filter(x => Math.abs(x - v) <= Math.max(0.5, v*0.08)).length / vals.length }; }
    return o; }));
  // Per skill: how often it fires and what it most often does across all fights
  const skillDist = D.sides.map((p, si) => (p.skills || []).map((sk, k) => {
    const trig = runs.map(r => r.skills[si][k].triggers), outcomes = {};
    runs.forEach(r => new Set(Object.keys(r.skills[si][k].did).map(txt => txt.replace(/\d+/g, "#"))).forEach(key => { outcomes[key] = (outcomes[key]||0) + 1; }));
    return { min: Math.min(...trig), max: Math.max(...trig), avg: trig.reduce((a, b) => a + b, 0) / trig.length, outcomes };
  }));
  return { best: runs[0], runs, dist, skillDist, wins: runs.filter(r => r.win).length / runs.length, N };
}

// What if: run many fights with some luck locked in or removed, and report how often you win.
function whatIf(D, N){
  let wins = 0, tSum = 0, hpSum = 0; const res = [];
  for (let seed = 1; seed <= N; seed++){
    const r = simulate({ ...D, seed, fast:true });
    const w = r.end.winner === 0; if (w){ wins++; hpSum += Math.max(0, r.S[0].hp); }
    tSum += r.end.t; res.push({ seed, w, t: r.end.t });
  }
  res.sort((a, b) => a.t - b.t);
  const pool = res.filter(x => x.w === (wins*2 >= N));
  return { win: wins/N, t: tSum/N, hp: wins ? hpSum/wins : 0, sample: (pool[Math.floor(pool.length/2)] || res[0]).seed, N };
}
// Odds summary for one fight: win chance, health ladder, the single luck changes that flip it, and who got lucky.
// Shared by tools/precompute.js and the page (which builds generated fights on the spot with a smaller N).
function summarize(B, LAD, NN){
  const N = NN || 1000, E = { simulate, whatIf: (D, n) => whatIf(D, Math.min(n, N)), fitSeeds: (D, n) => fitSeeds(D, Math.min(n, N)) };
  const CONTROLS = p => p.items.some(it => it.slowOnRightCrit) || (p.skills||[]).some(sk => sk.kind === "stun");

// Who got lucky in the real fight: crit rolls against their chances, streaks, and where each freeze landed.
function luckReport(B, seed, winP){
  const lost = B.winner === 1, nm = it => (it.ench ? it.ench + " " : "") + it.name, W = D => E.whatIf(D, 1000).win;
  const r = E.simulate({ ...structuredClone(B), seed });
  const sides = B.sides.map((p, si) => {
    const items = [];
    p.items.forEach((it, ii) => {
      const rolls = r.events.filter(e => e.kind === "roll" && e.si === si && e.ii === ii);
      // Items that never had a crit chance have no luck to report
      if (!rolls.length || !rolls.some(e => e.p > 0)) return;
      const act = rolls.filter(e => e.crit).length, exp = rolls.reduce((a, e) => a + e.p/100, 0);
      // How much this item's crits move the fight: your win chance if it always vs never crits
      const D1 = structuredClone(B), D2 = structuredClone(B); D1.ov = { [si+"_"+ii]: { crit:"always" } }; D2.ov = { [si+"_"+ii]: { crit:"never" } };
      // Only the side's busiest critters are weighed; the rest barely move the fight
      const top = p.items.map((x, j) => ({ j, e: r.events.filter(q => q.kind === "roll" && q.si === si && q.ii === j).reduce((a, q) => a + q.p/100, 0) })).sort((a, b) => b.e - a.e).slice(0, 4).map(x => x.j);
      const weight = (exp < 0.3 && !act) || !top.includes(ii) ? 0 : Math.abs(E.whatIf(D1, 60).win - E.whatIf(D2, 60).win);
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
  for (let s = 1; s <= N; s++){
    const q = E.simulate({ ...B, seed:s, fast:true }), d = [0, 1].map(si => q.events.filter(e => e.kind === "roll" && e.si === si).reduce((a, e) => a + (e.crit ? 1 : 0) - e.p/100, 0));
    (q.end.winner === B.winner ? same : other).push(d);
  }
  const avg = (a, i) => a.length ? +(a.reduce((x, d) => x + d[i], 0) / a.length).toFixed(1) : 0;
  return { upset: (lost ? winP : 1 - winP) >= 0.65, sides, pop: { n: same.length, mine: avg(same, 0), theirs: avg(same, 1), otherMine: avg(other, 0), otherTheirs: avg(other, 1) } };
}

  const lost = B.winner === 1, nm = (it, si) => (it.ench ? it.ench + " " : "") + it.name;
  const odds = E.whatIf(structuredClone(B), N);
  const ladder = LAD.map(hp => { const D = structuredClone(B); D.sides[1].hp = hp; return { hp, win: E.whatIf(D, 1000).win }; });
  const F = E.fitSeeds(structuredClone(B), 1000);
  const seeds = F.runs.filter(r => r.win).slice(0, 40).map(r => r.seed);
  const sim = (seed, spec) => E.simulate({ ...B, ov:{ ...(spec?.ov || {}) }, skillOff:{}, stunAt:spec?.stunAt, seed, fast:true });
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
  return { luck, real: F.runs[0].seed, alt: alt ? alt.seed : null, win: odds.win, N, ladder, flips, of: seeds.length, margin: { min: margins[0], med: margins[Math.floor(margins.length/2)], max: margins[margins.length-1] } };
}

if (typeof module !== "undefined") module.exports = { simulate, fitSeeds, whatIf, summarize };
