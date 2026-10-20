import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, nextGoldfishTurn, endGoldfishTurn, advanceGoldfishGame, chooseGoldfishRule, drawGoldfishCards, restoreGoldfishGame, beginGoldfishCombat, resolveGoldfishCombat } from "../public/goldfish.js";
import { castGoldfishCard, setGoldfishMana, goldfishLandManaOptions, activateGoldfishLand } from "../public/goldfish-mana.js";
import { activateGoldfishAction, goldfishActionPayment } from "../public/goldfish-actions.js";
import { goldfishCardActions } from "../public/goldfish-action-definitions.js";
import { goldfishKeywords } from "../public/goldfish-rules.js";
import { goldfishReference as ref, moveGoldfishRuleObject as move } from "../public/goldfish-objects.js";
import { changeLife, makeGameToken } from "../public/goldfish-events.js";
import { damage, flushEngineEvents } from "../public/goldfish-engine.js";
import { settle } from "./helpers/goldfish-pilot.js";
import { route } from "./helpers/goldfish-route.js";
const files = ["top10", "standard-top10", "legacy-top10", "pioneer-top10"].map(n => JSON.parse(fs.readFileSync(new URL(`./fixtures/goldfish-${n}.json`, import.meta.url))));
const metadata = files.flatMap(f => f.metadata);
function position(names) {
  const rows = Object.entries(names).map(([name, count]) => ({ name, count }));
  rows.push({ name: "Forest", count: 60 - rows.reduce((n,c) => n + c.count, 0) });
  const s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, metadata), { random: () => .5 }));
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
const card = (s,n,z="battlefield") => s[z].find(c => c.name===n || c.faces?.[c.faceIndex||0]?.name===n);
const put = (s,n,z="hand") => moveGoldfishCards(s,card(s,n,"library").id,z);
const funds = (s,pool) => Object.entries(pool).reduce((s,[c,n])=>setGoldfishMana(s,c,n),s);
const cast = (s,n,o={}) => settle(castGoldfishCard(s,card(s,n,"hand").id,o));
const reload = s => restoreGoldfishGame(JSON.parse(JSON.stringify(s)));

test("Cauldron links a creature, grants only battlefield activations, and loses them when the linked card moves",()=>{
 let s=position({"Agatha's Soul Cauldron":1,"Guardian of New Benalia":1,"Hardened Academic":1,"Fiery Temper":1});
 s=put(put(put(put(s,"Agatha's Soul Cauldron"),"Guardian of New Benalia","graveyard"),"Hardened Academic","battlefield"),"Fiery Temper");
 s=cast(funds(s,{C:2}),"Agatha's Soul Cauldron");
 s=settle(activateGoldfishAction(s,card(s,"Agatha's Soul Cauldron").id,"engine:ext-cauldron",{target:ref(card(s,"Guardian of New Benalia","graveyard"),"graveyard")}));
 const receiver=card(s,"Hardened Academic");assert.equal(receiver.counters["+1/+1"],2,"Cauldron and Academic each trigger once");
 s=reload(s);
 const inherited=goldfishCardActions(card(s,"Hardened Academic")).find(a=>a.id.includes("cauldron")&&a.id.includes("discard-indestructible"));assert.ok(inherited);
 s=settle(activateGoldfishAction(s,receiver.id,inherited.id,{costCards:[ref(card(s,"Fiery Temper","hand"),"hand")]}));
 assert.ok(goldfishKeywords(s,card(s,"Hardened Academic")).has("indestructible"));
 assert.equal(s.battlefield.filter(c=>c.kind==="token").length,0,"Guardian's enlist is not inherited");
 s=moveGoldfishCards(s,card(s,"Guardian of New Benalia","exile").id,"graveyard");
 s=settle(s);assert.ok(!goldfishCardActions(card(s,"Hardened Academic")).some(a=>a.id.includes("cauldron")));
});

test("Cauldron grants mana and untap abilities without granting ETBs; summoning sickness and colorless costs remain",()=>{
 let s=position({"Agatha's Soul Cauldron":1,"Devoted Druid":1,"Llanowar Elves":1,"Thrun, the Last Troll":1});
 s=put(put(put(put(s,"Agatha's Soul Cauldron"),"Devoted Druid","graveyard"),"Llanowar Elves","battlefield"),"Thrun, the Last Troll","battlefield");
 s=cast(funds(s,{C:2}),"Agatha's Soul Cauldron");
 s=settle(activateGoldfishAction(s,card(s,"Agatha's Soul Cauldron").id,"engine:ext-cauldron",{target:ref(card(s,"Devoted Druid","graveyard"),"graveyard")}),[],c=>c.type==="engine-target"?{target:c.candidates.find(x=>x.label==="Thrun, the Last Troll").ref}:null);
 assert.equal(goldfishLandManaOptions(card(s,"Thrun, the Last Troll"),s).length,0);
 s=settle(nextGoldfishTurn(s));assert.ok(goldfishLandManaOptions(card(s,"Thrun, the Last Troll"),s).some(o=>o.pool.G===1));
 s=activateGoldfishLand(s,card(s,"Thrun, the Last Troll").id);
 const inherited=goldfishCardActions(card(s,"Thrun, the Last Troll")).find(a=>a.id.includes("cauldron")&&a.id.includes("druid-untap"));
 s=settle(activateGoldfishAction(s,card(s,"Thrun, the Last Troll").id,inherited.id));assert.equal(card(s,"Thrun, the Last Troll").tapped,false);
 assert.equal(card(s,"Thrun, the Last Troll").counters["+1/+1"]||0,0,"opposite counters cancel and the inherited ability then disappears");
 assert.ok(!goldfishCardActions(card(s,"Thrun, the Last Troll")).some(a=>a.id.includes("cauldron")));
 const action=goldfishCardActions(card(s,"Thrun, the Last Troll")).find(a=>a.id==="engine:fp-thrun");
 s=funds(s,{G:0,R:2});assert.ok(goldfishActionPayment(s,card(s,"Thrun, the Last Troll"),action,{autoTap:false}).payable);
 s=settle(activateGoldfishAction(s,card(s,"Thrun, the Last Troll").id,action.id,{autoTap:false}));
 assert.equal(card(s,"Thrun, the Last Troll").regeneration,1);
 // Color substitution does not pay a true colorless symbol.
 s=funds(s,{R:2,C:0});
 assert.equal(goldfishActionPayment(s,card(s,"Thrun, the Last Troll"),{cost:"{1}{C}"},{autoTap:false}).payable,false);
 s=funds(s,{C:1});
 assert.equal(goldfishActionPayment(s,card(s,"Thrun, the Last Troll"),{cost:"{1}{C}"},{autoTap:false}).payable,true);
});

test("a Cauldron ability resolves after its source leaves, but does not link a new incarnation",()=>{
 let s=put(put(put(position({"Agatha's Soul Cauldron":1,"Guardian of New Benalia":1,"Hardened Academic":1}),"Agatha's Soul Cauldron","battlefield"),"Guardian of New Benalia","graveyard"),"Hardened Academic","battlefield");
 s=activateGoldfishAction(s,card(s,"Agatha's Soul Cauldron").id,"engine:ext-cauldron",{target:ref(card(s,"Guardian of New Benalia","graveyard"),"graveyard")});
 move(s,card(s,"Agatha's Soul Cauldron").id,"battlefield","hand");
 move(s,card(s,"Agatha's Soul Cauldron","hand").id,"hand","battlefield");
 s=settle(flushEngineEvents(reload(s)));
 assert.ok(card(s,"Guardian of New Benalia","exile"));
 assert.equal(card(s,"Hardened Academic").counters["+1/+1"],2);
 assert.ok(!goldfishCardActions(card(s,"Hardened Academic")).some(a=>a.id.includes("cauldron")));
});

test("Power-up is discounted only on the entry turn, survives saving and cannot be activated twice",()=>{
 let s=funds(put(position({"Captain Marvel, Earth's Protector":1}),"Captain Marvel, Earth's Protector"),{W:2,C:5});
 s=cast(s,"Captain Marvel, Earth's Protector");
 const id=card(s,"Captain Marvel, Earth's Protector").id;
 s=settle(activateGoldfishAction(s,id,"engine:ext-power-up"));
 assert.equal(s.manaPool.C,0);assert.ok(goldfishKeywords(s,card(s,"Captain Marvel, Earth's Protector")).has("indestructible"));
 s=reload(s);assert.throws(()=>activateGoldfishAction(s,id,"engine:ext-power-up"),/起動済み/);
 s=settle(nextGoldfishTurn(s));assert.throws(()=>activateGoldfishAction(s,id,"engine:ext-power-up"),/起動済み/);
 s=moveGoldfishCards(s,id,"hand");s=cast(funds(s,{W:2,C:5}),"Captain Marvel, Earth's Protector");
 s=settle(activateGoldfishAction(s,id,"engine:ext-power-up"));assert.equal(card(s,"Captain Marvel, Earth's Protector").counters["+1/+1"],1);
});

test("MODOK connives with nonland and land discards, pays life once, and respects own-turn timing",()=>{
 let s=put(put(put(position({"M.O.D.O.K.":1,"Lightning Bolt":1}),"M.O.D.O.K.","battlefield"),"Lightning Bolt"),"Forest");
 s=settle(activateGoldfishAction(s,card(s,"M.O.D.O.K.").id,"engine:ext-connive",{confirmLife:true}),[],c=>c.kind==="cards"?{refs:[c.candidates.find(x=>x.label==="Lightning Bolt").ref]}:null);
 assert.equal(s.players.self.life,17);assert.equal(card(s,"M.O.D.O.K.").counters["+1/+1"],1);
 s=settle(activateGoldfishAction(s,card(s,"M.O.D.O.K.").id,"engine:ext-connive",{confirmLife:true}));
 assert.equal(s.players.self.life,14);assert.equal(card(s,"M.O.D.O.K.").counters["+1/+1"],1);
 s=settle(endGoldfishTurn(s));assert.throws(()=>activateGoldfishAction(s,card(s,"M.O.D.O.K.").id,"engine:ext-connive"),/自分のターン/);
});

test("Riverchurn mills either or both players and exhaust remains consumed across turns and saving",()=>{
 let s=funds(put(position({"Riverchurn Monument":1}),"Riverchurn Monument","battlefield"),{C:1});
 s=settle(activateGoldfishAction(s,card(s,"Riverchurn Monument").id,"engine:ext-river-mill",{targets:[{player:"self"},{player:"opponent"}]}));
 assert.equal(s.graveyard.length,2);assert.equal(s.rules.opponentGraveyardCount,2);
 s=settle(nextGoldfishTurn(s));s=funds(s,{U:2,C:2});
 s=activateGoldfishAction(s,card(s,"Riverchurn Monument").id,"engine:ext-river-exhaust",{targets:[{player:"self"},{player:"opponent"}]});
 s=settle(s);assert.equal(s.graveyard.length,4);assert.equal(s.rules.opponentGraveyardCount,4);
 s=settle(nextGoldfishTurn(reload(s)));assert.throws(()=>activateGoldfishAction(s,card(s,"Riverchurn Monument").id,"engine:ext-river-exhaust"),/起動済み/);
});

test("countering an activated power-up or exhaust does not restore its once-only use",()=>{
 for(const [name,ability,pool] of [["Captain Marvel, Earth's Protector","power-up",{C:5,W:2}],["Riverchurn Monument","river-exhaust",{C:2,U:2}]]) {
   let s=funds(put(position({[name]:1}),name,"battlefield"),pool);
   s=activateGoldfishAction(s,card(s,name).id,`engine:ext-${ability}`,ability==="river-exhaust"?{targets:[]}: {});
   assert.equal(s.stack.at(-1).kind,"ability");
   // Removal is the engine's countered-ability outcome; no resolution takes place.
   s.stack.pop();
   s=settle(nextGoldfishTurn(reload(s)));
   assert.throws(()=>activateGoldfishAction(s,card(s,name).id,`engine:ext-${ability}`),/起動済み/);
 }
});

test("Magda creates one tapped Treasure per turn from spell/ability targets and sacrifices three to make a Dragon",()=>{
 let s=funds(put(put(put(put(position({"Magda, the Hoardmaster":1,"Lightning Bolt":2}),"Magda, the Hoardmaster","battlefield"),"Lightning Bolt"),"Lightning Bolt"),"Forest"),{R:2});
 s=cast(s,"Lightning Bolt",{target:{player:"opponent"}});assert.equal(s.battlefield.filter(c=>c.name==="Treasure").length,1);assert.ok(card(s,"Treasure").tapped);
 s=cast(s,"Lightning Bolt",{target:{player:"opponent"}});assert.equal(s.battlefield.filter(c=>c.name==="Treasure").length,1);
 // Prepare two further Treasures for the independent activation/cost boundary.
 makeGameToken(s,{name:"Treasure",typeLine:"Token Artifact — Treasure",power:"",toughness:""},2);
 s=settle(activateGoldfishAction(s,card(s,"Magda, the Hoardmaster").id,"engine:ext-magda",{costCards:s.battlefield.filter(c=>c.name==="Treasure").map(c=>ref(c))}));
 assert.equal(s.battlefield.filter(c=>c.name==="Treasure").length,0);assert.equal(card(s,"Scorpion Dragon").power,"4");
 assert.ok(goldfishKeywords(s,card(s,"Scorpion Dragon")).has("haste"));
});

test("miracle casts from the first draw after the current spell finishes, never from a later draw",()=>{
 let s=put(position({"Triumph of Saint Katherine":2,"Brainstorm":1}),"Brainstorm");
 s=put(s,"Triumph of Saint Katherine","libraryTop");s=funds(s,{U:1,W:1,C:1});
 s=settle(castGoldfishCard(s,card(s,"Brainstorm","hand").id),[],(c,state)=>{
   if(c.type==="spell-return") return {ids:state.hand.filter(x=>x.name!=="Triumph of Saint Katherine").slice(0,2).map(x=>x.id)};
   return null;
 });
 assert.ok(card(s,"Triumph of Saint Katherine"));assert.equal(s.rules.spellsCast,2);assert.equal(s.manaPool.W,0);
 s=put(s,"Triumph of Saint Katherine","libraryTop");s=funds(s,{W:1,C:1});s=settle(drawGoldfishCards(s,1));
 assert.ok(card(s,"Triumph of Saint Katherine","hand"));assert.equal(s.rules.spellsCast,2);
});

test("Katherine returns a shuffled seven-card pile, but leaves a short pile face down in exile",()=>{
 for(const short of [false,true]) {
   let s=put(position({"Triumph of Saint Katherine":1}),"Triumph of Saint Katherine","battlefield");
   if(short)s=moveGoldfishCards(s,s.library.slice(0,-3).map(c=>c.id),"exile");
   const before=s.library.length, id=card(s,"Triumph of Saint Katherine").id;
   move(s,id,"battlefield","graveyard");s=settle(flushEngineEvents(s));
   if(short){assert.equal(s.library.length,0);assert.equal(s.exile.filter(c=>c.faceDown).length,4);}
   else{assert.equal(s.library.length,before+1);assert.ok(s.library.slice(-7).some(c=>c.id===id));assert.equal(s.exile.length,0);}
 }
});

test("Drop of Honey chooses the least power without targeting, ignores regeneration and sacrifices itself when empty",()=>{
 let s=put(put(position({"Drop of Honey":1,"Thrun, the Last Troll":1}),"Drop of Honey","battlefield"),"Thrun, the Last Troll","battlefield");
 card(s,"Thrun, the Last Troll").regeneration=1;s=settle(nextGoldfishTurn(s));
 assert.ok(card(s,"Thrun, the Last Troll","graveyard"));assert.ok(card(s,"Drop of Honey","graveyard"));
});

test("Nemesis lethal damage still reflects after death and prohibits future life gain",()=>{
 let s=put(position({"Screaming Nemesis":1}),"Screaming Nemesis","battlefield");
 damage(s,ref(card(s,"Screaming Nemesis")),3);s=settle(flushEngineEvents(s),[],c=>c.type==="engine-target"?{target:{player:"opponent"}}:null);
 assert.ok(card(s,"Screaming Nemesis","graveyard"));assert.equal(s.players.opponent.life,17);
 changeLife(s,8,"opponent");assert.equal(s.players.opponent.life,17);
 s=reload(s);changeLife(s,4,"opponent");assert.equal(s.players.opponent.life,17);
});

test("Elesh Norn doubles own ETBs and other entering triggers, not death triggers or Saga chapters",()=>{
 let s=put(put(put(position({"Elesh Norn, Mother of Machines":1,"Voldaren Epicure":1,"Guide of Souls":1,"The Legend of Roku":1,"Haywire Mite":1}),"Elesh Norn, Mother of Machines","battlefield"),"Guide of Souls","battlefield"),"Voldaren Epicure");
 s=cast(funds(s,{R:1}),"Voldaren Epicure");assert.equal(s.battlefield.filter(c=>c.name==="Blood").length,2);assert.equal(s.players.opponent.life,18);assert.equal(s.players.self.life,22);assert.equal(s.players.self.energy,2);
 s=put(s,"The Legend of Roku");s=cast(funds(s,{R:4}),"The Legend of Roku");assert.equal(s.exile.length,3);
 s=put(s,"Haywire Mite","battlefield");s=settle(s);
 const life=s.players.self.life;
 move(s,card(s,"Haywire Mite").id,"battlefield","graveyard");s=settle(flushEngineEvents(s));
 assert.equal(s.players.self.life,life+2);
});

test("Leatherhead starts with hexproof and only removes the chosen counter after combat",()=>{
 let s=cast(funds(put(position({"Leatherhead, Swamp Stalker":1}),"Leatherhead, Swamp Stalker"),{G:4}),"Leatherhead, Swamp Stalker");
 assert.equal(card(s,"Leatherhead, Swamp Stalker").counters.hexproof,1);
 s=settle(nextGoldfishTurn(s));s=settle(beginGoldfishCombat(s));s=settle(resolveGoldfishCombat(s),[],c=>c.kind==="buttons"&&c.sourceName==="Leatherhead, Swamp Stalker"?{value:"hexproof"}:null);
 assert.equal(card(s,"Leatherhead, Swamp Stalker").counters.hexproof||0,0);
});

test("real Pioneer Boros postboard uses Cauldron's inherited discard ability through a win",()=>{
 const f=files[3], d=f.decks.find(d=>d.sideboard.some(c=>c.name==="Agatha's Soul Cauldron")&&d.mainboard.some(c=>c.name==="Guardian of New Benalia"));
 assert.ok(d);
 const r=route(d.rank,["Sacred Foundry","Battlefield Forge","Inspiring Vantage","Flameblade Adept","Agatha's Soul Cauldron","Guardian of New Benalia","Guardian of New Benalia"],
   ["Mountain","Hardened Academic","Torch the Tower","Fear of Missing Out"],{"Agatha's Soul Cauldron":1,"Practiced Offense":-1},
   (c,s)=>c.type==="engine-target"&&c.sourceName==="Agatha's Soul Cauldron"?{target:c.candidates.find(x=>x.label==="Flameblade Adept").ref}:null,f);
 r.cast("Sacred Foundry");r.cast("Flameblade Adept");
 r.next();r.cast("Battlefield Forge");r.cast("Agatha's Soul Cauldron");
 r.attack();r.next();r.cast("Inspiring Vantage");r.cast("Guardian of New Benalia");
 const guardian=goldfishCardActions(r.card("Guardian of New Benalia")).find(a=>a.id.includes("discard-indestructible"));
 r.act("Guardian of New Benalia",guardian.id,{costCards:[r.ref("Guardian of New Benalia","hand")]});
 r.act("Agatha's Soul Cauldron","engine:ext-cauldron",{target:r.ref("Guardian of New Benalia","graveyard")});
 const inherited=goldfishCardActions(r.card("Flameblade Adept")).find(a=>a.id.includes("cauldron")&&a.id.includes("discard-indestructible"));
 assert.ok(inherited);
 r.act("Flameblade Adept",inherited.id,{costCards:[r.ref("Mountain","hand")]});
 assert.ok(goldfishKeywords(r.s,r.card("Flameblade Adept")).has("indestructible"));
 r.finish(20);
 assert.ok(r.s.players.opponent.life<=0);
});

test("Oildeep chooses the player before resolution, then optionally exchanges exactly one card",()=>{
 for(const exchange of [false,true]) {
   let s=put(put(position({"Oildeep Gearhulk":1,"Fiery Temper":1}),"Oildeep Gearhulk"),"Fiery Temper");
   s=funds(s,{U:2,B:2,R:0});
   s=settle(castGoldfishCard(s,card(s,"Oildeep Gearhulk","hand").id),[],c=>{
     if(c.type==="engine-target")return {target:{player:"self"}};
     if(c.kind==="cards"&&c.sourceName==="Oildeep Gearhulk")return {refs:exchange?[c.candidates.find(x=>x.label==="Fiery Temper").ref]:[]};
     return null;
   });
   assert.ok(card(s,"Oildeep Gearhulk"));
   assert.equal(s.hand.length,1);
   assert.equal(Boolean(card(s,"Fiery Temper","graveyard")),exchange,"discard still uses madness before the new draw");
   assert.equal(s.rules.cardsDrawn||0,exchange?1:0);
 }
});
