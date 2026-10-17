(()=>{
const T=['bronze','silver','gold','diamond','legendary'];
const secs=[];
document.querySelectorAll('*').forEach(h=>{
 if(h.children.length||!/^What .+'s items did$/.test(h.textContent.trim()))return;
 let s=h;while(s&&!/max health/.test(s.innerText))s=s.parentElement;
 if(s&&!secs.includes(s))secs.push(s);
});
if(!secs.length){alert('No fight boards found. Open a BazaarHub run page (?day=N), wait until the boards finish loading, then click again.');return;}
let out='';
secs.forEach(s=>{
 const txt=s.innerText;
 const title=(txt.match(/Hour \d+\n[^\n]+/)||[''])[0].replace('\n',' · ');
 const heads=[...txt.matchAll(/\n([^\n]+)\n(Vanessa|Dooley|Mak|Stelle|Karnok|Pygmalien|Jules|The Dragons)?\n? ?· (Level[^\n]*)/g)].map(m=>m[1]+' ('+(m[2]||'monster')+', '+m[3].replace(/ · /g,', ')+')');
 const P=[];let cur=null,last=null,mode='';
 for(const i of s.querySelectorAll('img')){
  const src=(i.currentSrc||i.src||'').split('?')[0];
  if(/avatar-/.test(src))continue;
  const fm=src.match(/frames\/(\w+)-(small|medium|large|skill)\./);
  if(fm&&last&&!last.t){last.t=fm[1];last.k=fm[2]=='skill'?'s':'i';
   if(last.k==='i'&&(mode!=='i'||!cur)){ if(!cur||mode==='s'){cur={items:[],skills:[]};P.push(cur);} }
   mode=last.k; (last.k==='i'?cur.items:cur.skills).push(last); continue;}
  if(i.alt&&/cards\//.test(src)){last={n:i.alt};}
 }
 const ench={};
 [...txt.matchAll(/\n(SHINY|TURBO|MOSSY|DEADLY|RESTORATIVE|TOXIC|FIERY|ICY|HEAVY|SHIELDED|GOLDEN|RADIANT|OBSIDIAN)\n([^\n]+)/g)].forEach(m=>{ench[m[2]]=(ench[m[2]]||[]).concat(m[1][0]+m[1].slice(1).toLowerCase());});
 const used={};
 const fmt=o=>{let e='';if(ench[o.n]&&ench[o.n].length){const k=used[o.n]||0;e=ench[o.n][k]?', '+ench[o.n][k]:'';used[o.n]=k+1;}return o.n+' ['+(o.t||'?')[0].toUpperCase()+(o.t||'?').slice(1)+e+']';};
 out+='=== '+title+' ===\n';
 P.slice(0,2).forEach((p,ix)=>{
  out+=(heads[ix]||('Player '+(ix+1)))+'\n  Board: '+p.items.map(fmt).join(' | ')+'\n  Skills: '+(p.skills.map(o=>o.n+' ['+o.t+']').join(', ')||'-')+'\n';
 });
 const w=txt.indexOf('What ');if(w>=0)out+=txt.slice(w).replace(/\n(SHINY|TURBO|MOSSY|DEADLY|RESTORATIVE|TOXIC|FIERY|ICY|HEAVY|SHIELDED|GOLDEN|RADIANT|OBSIDIAN)\n/g,'\n$1 ').trim()+'\n';
 out+='\n';
});
const d=document.createElement('div');
d.style.cssText='position:fixed;z-index:99999;inset:5% 10%;background:#1b120c;color:#f3e2c4;border:2px solid #c8903c;border-radius:8px;padding:12px;display:flex;flex-direction:column;font:13px monospace;box-shadow:0 0 30px #000';
d.innerHTML='<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center"><b style="flex:1;font:bold 15px sans-serif">Board reader: '+secs.length+' fight(s)</b><button id="bhrc">Copy</button><button id="bhrx">Close</button></div>';
const ta=document.createElement('textarea');ta.value=out;ta.style.cssText='flex:1;background:#0f0a06;color:#f3e2c4;border:1px solid #6b4a22;padding:8px;font:12px monospace;white-space:pre';
d.appendChild(ta);document.body.appendChild(d);
d.querySelector('#bhrc').onclick=()=>{ta.select();navigator.clipboard.writeText(ta.value);d.querySelector('#bhrc').textContent='Copied';};
d.querySelector('#bhrx').onclick=()=>d.remove();
})();
