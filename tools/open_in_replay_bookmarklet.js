// Open in Replay: on a BazaarHub run page, reads the day on screen like the Board Reader and opens its fights in the replay site.
(async()=>{
// Open the tab now, while the click still counts, or the popup blocker stops it after the wait below
const win=window.open('about:blank','_blank');
const read=(root,dayN)=>{
const secs=[];
root.querySelectorAll('*').forEach(h=>{
 if(h.children.length||!/^What .+'s items did$/.test(h.textContent.trim()))return;
 let s=h;while(s&&!/max health/.test(s.innerText))s=s.parentElement;
 if(s&&!secs.includes(s))secs.push(s);
});
if(!secs.length)return '';
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
 out+='=== Day '+dayN+' · '+title+' ===\n';
 P.slice(0,2).forEach((p,ix)=>{
  out+=(heads[ix]||('Player '+(ix+1)))+'\n  Board: '+p.items.map(fmt).join(' | ')+'\n  Skills: '+(p.skills.map(o=>o.n+' ['+o.t+']').join(', ')||'-')+'\n';
 });
 const w=txt.indexOf('What ');if(w>=0)out+=txt.slice(w).replace(/\n(SHINY|TURBO|MOSSY|DEADLY|RESTORATIVE|TOXIC|FIERY|ICY|HEAVY|SHIELDED|GOLDEN|RADIANT|OBSIDIAN)\n/g,'\n$1 ').trim()+'\n';
 out+='\n';
});
return out;
};
const T=['bronze','silver','gold','diamond','legendary'];
const day=new URLSearchParams(location.search).get('day')||((document.body.innerText.match(/\bDay (\d+)\b/)||[])[1])||'';
// Only the day on screen, so the replay opens fast
const out=read(document.body,day);
if(!out){if(win)win.close();alert('No fight boards found. Open a BazaarHub run page, wait until the boards finish loading, then click again.');return;}
// Hand the text to the replay site in its link, deflated to keep the link short
const raw=new TextEncoder().encode(out);
const z=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
let b='';z.forEach(c=>b+=String.fromCharCode(c));
const d64=btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const run=(location.pathname.match(/runs\/([a-z0-9]+)/i)||[])[1]||'';
const url='https://soapbottle.github.io/ThatsBazaar/'+String.fromCharCode(35)+'run='+run+'&day='+day+'&d='+d64;
if(win)win.location.href=url;else location.href=url;
})();
