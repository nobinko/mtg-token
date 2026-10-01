import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {profiles,hate} from './content.mjs';
import {supplements,variants} from './supplemental-content.mjs';
import {matchups} from './matchups.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'));
const decks=read('decks'),cards=read('cards'),stats=read('matchup-stats'),audit=read('audit-data'),snapshot=read('snapshot');
const count=(rows,name)=>rows.filter(x=>x.name===name||cards[x.name]?.oracleId===cards[name]?.oracleId).reduce((n,x)=>n+x.count,0);
const total=rows=>rows.reduce((n,x)=>n+x.count,0);
const examples=[...profiles.map((p,i)=>({id:p.id,deck:decks[i].representative.deck})),...supplements.map(p=>({id:p.id,deck:audit.supplemental.find(s=>s.rank===p.rank).representative})),...variants.map(p=>({id:p.id,deck:audit.variants.find(s=>s.rank===p.rank).deck}))];
assert.equal(profiles.length,10);assert.equal(decks.length,10);assert.equal(matchups.length,45);
assert.equal(supplements.length,9);assert.equal(variants.length,3);assert.equal(examples.length,22);
assert.equal(new Set(examples.map(e=>e.id)).size,22);assert.equal(new Set(examples.map(e=>e.deck.url)).size,22);
assert.deepEqual(snapshot,audit.windows.recent);assert.equal(snapshot.entries.length,40);
assert.equal(audit.date,'2026-10-02');
for(const w of Object.values(audit.windows)){
 assert(w.totalDecks>0);assert.equal(new Date(w.fetchedAt).toISOString().slice(0,10),'2026-10-01');
 assert.equal(new Set(w.entries.map(e=>e.name)).size,w.entries.length);
 w.entries.forEach((e,i)=>{assert.equal(e.rank,i+1);assert(e.sharePercent>=0&&e.sharePercent<=100);assert(e.archetypeUrl.startsWith('https://mtgtop8.com/'));});
}
assert.equal(stats.from,'2026-09-16');assert.equal(stats.to,'2026-10-01');assert.equal(stats.sourceTotal,4278);
assert.equal(audit.transition.paperLegalDate,'2026-09-25');assert.equal(audit.transition.mtgoReleaseUTC,'2026-09-29T17:00:00Z');
assert.equal(audit.transition.adoptionCheck.lists,22);assert.deepEqual(audit.transition.adoptionCheck.adoptedNewCards.map(c=>c.name),['Twinned Vision']);

for(const {id,deck:d} of examples){
 assert.equal(total(d.mainboard),60,id+' main');assert.equal(total(d.sideboard),15,id+' side');
 assert(d.url.startsWith('https://mtgtop8.com/event?'));assert(d.eventDate>='2026-09-27'&&d.eventDate<='2026-09-30');
 const copies=new Map();
 for(const x of [...d.mainboard,...d.sideboard]){
  const c=cards[x.name];assert(c,'Unknown '+x.name);assert.equal(c.legal,'legal',x.name);assert(Number.isInteger(x.count)&&x.count>0);
  copies.set(c.oracleId,(copies.get(c.oracleId)||0)+x.count);
  if(!c.type.includes('Basic Land'))assert(copies.get(c.oracleId)<=4,'Too many copies of '+x.name);
 }
 const txt=fs.readFileSync(path.join(root,'decklists',id+'.txt'),'utf8').split('\n\nSideboard\n');assert.equal(txt.length,2);
 const rows=z=>z.trim().split('\n').map(l=>{const m=l.match(/^(\d+) (.+)$/);assert(m,'Malformed deck line '+l);return {name:m[2],count:Number(m[1])};});
 assert.deepEqual(rows(txt[0]),d.mainboard,id+' exported main');assert.deepEqual(rows(txt[1]),d.sideboard,id+' exported side');
}
for(let i=0;i<profiles.length;i++){
 const p=profiles[i],d=decks[i].representative.deck;
 assert.equal(decks[i].rank,i+1);assert.equal(decks[i].name,snapshot.entries[i].name);assert.equal(decks[i].sharePercent,snapshot.entries[i].sharePercent);
 for(const [name] of p.key)assert(count(d.mainboard,name)||count(d.sideboard,name),'Key absent '+name);
 for(const [name] of p.side)assert(count(d.sideboard,name),'Side absent '+name);
 for(const h of p.hands){assert.equal(h.cards.length,7);for(const name of new Set(h.cards))assert(h.cards.filter(x=>x===name).length<=count(d.mainboard,name),'Hand unavailable '+name);}
 for(const name of p.combo.cards)assert(cards[name]);assert(p.combo.steps.length>=4);
 for(const q of profiles){
  if(p.id===q.id)continue;
  assert.equal(matchups.filter(x=>x[0]===p.id&&x[1]===q.id||x[0]===q.id&&x[1]===p.id).length,1);
  const s=stats.matrix[p.id][q.id],r=stats.matrix[q.id][p.id];assert(s&&r);assert.equal(s.n,r.n);assert(Math.abs(s.win+r.win-100)<=1);
  assert(s.win>=0&&s.win<=100);assert(s.low<=s.win&&s.high>=s.win);assert(s.n>=0);
 }
}
for(const p of [...supplements,...variants]){
 const d=examples.find(e=>e.id===p.id).deck;
 for(const [name] of p.cards)assert(count(d.mainboard,name)||count(d.sideboard,name),'Extra key absent '+name);
}
for(const h of hate)assert(cards[h.card]);
for(const c of Object.values(cards))assert.equal(c.legal,'legal',c.name);
const images=new Set(Object.values(cards).flatMap(c=>c.images.map(i=>i.local)));
for(const name of images){const b=fs.readFileSync(path.join(root,name));assert.equal(b[0],255);assert.equal(b[1],216);assert(b.length>10000);}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate HTML ids');
for(const [,id] of html.matchAll(/href="#([^"]+)"/g))assert(ids.includes(id),'Broken anchor '+id);
for(const [,file]of html.matchAll(/(?:src|href)="((?:images|decklists)\/[^\"]+)"/g))assert(fs.existsSync(path.join(root,file)),'Missing asset '+file);
for(const [,name]of html.matchAll(/data-card="([^\"]+)"/g))assert(cards[name.replaceAll('&#39;',"'").replaceAll('&amp;','&')],'Missing rendered card '+name);
assert(!html.includes('undefined'));assert(!/src="https?:/.test(html),'Remote runtime image');
assert.equal([...html.matchAll(/class="reference-details"/g)].length,12);assert(html.includes('FRA導入直後'));assert(html.includes('2026.09.16〜2026.10.01'));
const js=fs.readFileSync(path.join(root,'data.js'),'utf8');
const payload=JSON.parse(js.slice('window.MODERN_ATLAS_DATA = '.length).trim().slice(0,-1));
assert.equal(payload.decks.length,10);assert.equal(payload.referenceDecks.length,12);assert.deepEqual(payload.stats,stats);
for(const d of [...payload.decks,...payload.referenceDecks]){
 const expected=examples.find(e=>e.id===d.id).deck;assert.deepEqual(d.main,expected.mainboard);assert.deepEqual(d.side,expected.sideboard);
}
console.log(JSON.stringify({status:'PASS',date:audit.date,profiles:10,supplemental:9,variants:3,completeDecks:22,totalCards:1650,uniqueCardIds:new Set(Object.values(cards).map(c=>c.oracleId)).size,localJPEGs:images.size,handExamples:20,matchupPairs:45,aggregateWindows:4,indexedCategories:snapshot.entries.length,fraAdoptionCheck:audit.transition.adoptionCheck.adoptedNewCards.map(c=>c.name),uniqueIds:ids.length},null,2));
