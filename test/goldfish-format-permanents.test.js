import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeCardMetadata } from "../public/card-metadata.js";
import { createGoldfishGame, keepGoldfishHand, moveGoldfishCards, nextGoldfishTurn, endGoldfishTurn, advanceGoldfishGame, chooseGoldfishRule, drawGoldfishCards, beginGoldfishCombat, restoreGoldfishGame } from "../public/goldfish.js";
import { castGoldfishCard, setGoldfishMana, goldfishLandManaOptions, chooseGoldfishCast, planGoldfishCastPayment } from "../public/goldfish-mana.js";
import { activateGoldfishAction } from "../public/goldfish-actions.js";
import { goldfishCharacteristics, goldfishKeywords } from "../public/goldfish-rules.js";
import { goldfishReference as ref, moveGoldfishRuleObject } from "../public/goldfish-objects.js";
import { goldfishCardActions } from "../public/goldfish-action-definitions.js";
import { formatPermanentActions } from "../public/goldfish-format-permanents.js";
import { goldfishCombos, repeatGoldfishCombo } from "../public/goldfish-practice.js";
import { goldfishFinish } from "../public/goldfish-sideboard.js";
import { gameManaValue, damage, flushEngineEvents } from "../public/goldfish-engine.js";
import { castGoldfishAlternative } from "../public/goldfish-alternatives.js";
import { isType, makeGameToken } from "../public/goldfish-events.js";
import { settle } from "./helpers/goldfish-pilot.js";
const metadata = ["top10", "standard-top10", "legacy-top10", "pioneer-top10"].flatMap(n => JSON.parse(readFileSync(new URL(`./fixtures/goldfish-${n}.json`, import.meta.url))).metadata);
function position(names) {
  const rows = Object.entries(names).map(([name, count]) => ({ name, count }));
  rows.push({ name: "Forest", count: 60 - rows.reduce((n, c) => n + c.count, 0) });
  const s = keepGoldfishHand(createGoldfishGame(mergeCardMetadata(rows, metadata), { random: () => .5 }));
  return moveGoldfishCards(s, s.hand.map(c => c.id), "libraryBottom");
}
const card = (s, n, z = "battlefield") => s[z].find(c => c.name === n || c.faces?.[c.faceIndex || 0]?.name === n);
const put = (s, n, z = "hand") => moveGoldfishCards(s, card(s, n, "library").id, z);
const funds = (s, pool) => Object.entries(pool).reduce((s, [c,n]) => setGoldfishMana(s,c,n),s);
const cast = (s,n,o={}) => castGoldfishCard(s, card(s,n,o.fromGraveyard?"graveyard":o.fromExile?"exile":"hand").id,o);
const yes = c => c.kind === "buttons" && c.options.some(o=>o.value === "yes") ? {value:"yes"}:null;

test("Chrome Mox imprints exactly one card, produces only its colors and cannot use a removed imprint",()=>{
 let s=put(put(position({"Chrome Mox":1,"Thoughtseize":1}),"Chrome Mox"),"Thoughtseize");
 s=settle(cast(s,"Chrome Mox")); assert.equal(s.exile[0].name,"Thoughtseize");
 assert.deepEqual(goldfishLandManaOptions(card(s,"Chrome Mox"),s).map(o=>o.pool.B),[1]);
 s=moveGoldfishCards(s,s.exile[0].id,"graveyard"); assert.equal(goldfishLandManaOptions(card(s,"Chrome Mox"),s).length,0);
});
test("Delver checks the actual top, transforms optionally, and does not exile or draw it",()=>{
 let s=funds(put(position({"Delver of Secrets":1,"Ponder":1}),"Delver of Secrets"),{U:1});s=settle(cast(s,"Delver of Secrets"));
 s=moveGoldfishCards(s,card(s,"Ponder","library").id,"libraryTop"); s=settle(nextGoldfishTurn(s),[],yes);
 assert.equal(card(s,"Insectile Aberration").faceIndex,1); assert.ok(card(s,"Ponder","hand"));
});
test("Tamiyo third draw transforms once and loyalty recovery observes green mana bonus",()=>{
 let s=funds(put(put(position({"Tamiyo, Inquisitive Student":1,"Brainstorm":1}),"Tamiyo, Inquisitive Student"),"Brainstorm"),{U:2});
 s=settle(cast(s,"Tamiyo, Inquisitive Student")); s=settle(cast(s,"Brainstorm"));
 const t=card(s,"Tamiyo, Seasoned Scholar");assert.ok(t);assert.equal(t.counters.loyalty,2);
 s=settle(activateGoldfishAction(s,t.id,"engine:fp-tamiyo-plus"));assert.equal(card(s,"Tamiyo, Seasoned Scholar").counters.loyalty,4);
 assert.throws(()=>activateGoldfishAction(s,t.id,"engine:fp-tamiyo-return"),/起動済み/);
});
test("Kaito is an attacking creature only on own turn and keeps loyalty/emblems across turns",()=>{
 let s=funds(put(position({"Kaito, Bane of Nightmares":1}),"Kaito, Bane of Nightmares"),{U:2,B:2});s=settle(cast(s,"Kaito, Bane of Nightmares"));
 const id=card(s,"Kaito, Bane of Nightmares").id;s=settle(activateGoldfishAction(s,id,"engine:fp-kaito-plus"));
 assert.equal(goldfishCharacteristics(s,card(s,"Kaito, Bane of Nightmares")).power,"4");assert.ok(goldfishKeywords(s,card(s,"Kaito, Bane of Nightmares")).has("hexproof"));
 s=settle(endGoldfishTurn(s));assert.ok(!card(s,"Kaito, Bane of Nightmares").typeLine.includes("Creature"));assert.ok(!goldfishKeywords(s,card(s,"Kaito, Bane of Nightmares")).has("hexproof"));
});
test("Sneak Attack puts a real Emrakul into play without casting and sacrifices it at the next end step",()=>{
 let s=funds(put(put(position({"Sneak Attack":1,"Emrakul, the Aeons Torn":1}),"Sneak Attack"),"Emrakul, the Aeons Torn"),{R:5});s=settle(cast(s,"Sneak Attack"));
 s=settle(activateGoldfishAction(s,card(s,"Sneak Attack").id,"engine:fp-sneak"));assert.ok(goldfishKeywords(s,card(s,"Emrakul, the Aeons Torn")).has("haste"));assert.equal(s.rules.extraTurns||0,0);
 s=settle(endGoldfishTurn(s));assert.ok(!card(s,"Emrakul, the Aeons Torn"));assert.ok(card(s,"Emrakul, the Aeons Torn","library"));assert.equal(s.graveyard.length,0);
});
test("Bowmasters amasses onto an existing Army and creates a new 1/1 when there is none",()=>{
 let s=funds(put(put(position({"Orcish Bowmasters":2}),"Orcish Bowmasters"),"Orcish Bowmasters"),{B:4});s=settle(cast(s,"Orcish Bowmasters"),[],c=>c.type==="engine-target"?{target:{player:"opponent"}}:null);s=settle(cast(s,"Orcish Bowmasters"),[],c=>c.type==="engine-target"?{target:{player:"opponent"}}:null);
 const army=s.battlefield.filter(c=>c.name==="Orc Army");assert.equal(army.length,1);assert.equal(goldfishCharacteristics(s,army[0]).power,"2");assert.equal(s.players.opponent.life,18);
});
test("landfall doubles Hydra counters and Harmonizer uses power on resolution",()=>{
 let s=funds(put(put(position({"Mossborn Hydra":1,"Mightform Harmonizer":1}),"Mossborn Hydra"),"Mightform Harmonizer"),{G:7});s=settle(cast(s,"Mossborn Hydra"));s=settle(cast(s,"Mightform Harmonizer"));
 s=put(s,"Forest");s=settle(cast(s,"Forest"),[],c=>c.type==="engine-target"&&c.sourceName==="Mightform Harmonizer"?{target:ref(card(s,"Mossborn Hydra"),"battlefield")}:null);
 assert.equal(card(s,"Mossborn Hydra").counters["+1/+1"],2);assert.ok(goldfishCharacteristics(s,card(s,"Mossborn Hydra")).power>=3);
});
test("lifegain queues Cleric and Amalia explore instead of changing them outside the stack",()=>{
 let s=funds(position({"Hinterland Sanctifier":1,"Starscape Cleric":1,"Amalia Benavides Aguirre":1}),{W:3,B:3});
 for(const n of ["Hinterland Sanctifier","Starscape Cleric","Amalia Benavides Aguirre"]){s=put(s,n);s=settle(cast(s,n,{format:{offspring:"no"}}));}
 assert.equal(s.players.self.life,22);assert.equal(s.players.opponent.life,18);assert.ok(s.hand.some(c=>c.name==="Forest"));
});
test("room unlocks second door once and Annex draws then drains with a Demon",()=>{
 let s=funds(put(position({"Unholy Annex / Ritual Chamber":1}),"Unholy Annex / Ritual Chamber"),{B:8});s=settle(cast(s,"Unholy Annex / Ritual Chamber"));
 s=settle(activateGoldfishAction(s,card(s,"Unholy Annex / Ritual Chamber").id,"engine:fp-door-1"));assert.ok(card(s,"Demon"));
 assert.ok(!goldfishCardActions(card(s,"Unholy Annex / Ritual Chamber")).some(a=>a.id==="engine:fp-door-1"));s=settle(endGoldfishTurn(s));assert.equal(s.players.opponent.life,18);assert.equal(s.players.self.life,22);
});
test("Three Steps Ahead charges each selected spree mode and copies real permanent",()=>{
 let s=funds(put(put(position({"Three Steps Ahead":1,"Monastery Swiftspear":1}),"Three Steps Ahead"),"Monastery Swiftspear","battlefield"),{U:1,C:5});
 const before=s.hand.length;s=settle(cast(s,"Three Steps Ahead",{format:{modes:"6",target1:[ref(card(s,"Monastery Swiftspear"),"battlefield")]}}));
 assert.equal(s.battlefield.filter(c=>c.name==="Monastery Swiftspear").length,2);assert.equal(s.hand.length,before);assert.equal(s.manaPool.C,0);
});
test("Toxic Deluge pays life before resolution and cannot spend more life than available",()=>{
 let s=funds(put(put(position({"Toxic Deluge":1,"Monastery Swiftspear":1}),"Toxic Deluge"),"Monastery Swiftspear","battlefield"),{B:3});
 assert.throws(()=>cast(s,"Toxic Deluge",{format:{life:21}}),/ライフ/);s=settle(cast(s,"Toxic Deluge",{format:{life:3}}));assert.equal(s.players.self.life,17);assert.equal(s.battlefield.length,0);
});
test("Fanatical Offering sacrifice is a real cost, draws two and generates a Map",()=>{
 let s=funds(put(put(position({"Fanatical Offering":1,"Monastery Swiftspear":1}),"Fanatical Offering"),"Monastery Swiftspear","battlefield"),{B:2});
 s=settle(cast(s,"Fanatical Offering",{format:{cards:[ref(card(s,"Monastery Swiftspear"))]}}));assert.ok(card(s,"Monastery Swiftspear","graveyard"));assert.equal(s.hand.length,2);assert.ok(card(s,"Map"));
});
test("Fiery Temper madness from discard pays red, casts only once and resumes the ability",()=>{
 let s=funds(put(put(position({"Hardened Academic":1,"Fiery Temper":1}),"Hardened Academic","battlefield"),"Fiery Temper"),{R:1});
 s=settle(activateGoldfishAction(s,card(s,"Hardened Academic").id,"engine:fp-academic",{costCards:[ref(card(s,"Fiery Temper","hand"),"hand")]}));
 assert.equal(s.players.opponent.life,17);assert.equal(s.rules.spellsCast,1);assert.ok(card(s,"Fiery Temper","graveyard"));assert.equal(s.manaPool.R,0);
});
test("madness without red returns the discarded card to the graveyard",()=>{
 let s=put(put(position({"Hardened Academic":1,"Fiery Temper":1}),"Hardened Academic","battlefield"),"Fiery Temper");
 s=settle(activateGoldfishAction(s,card(s,"Hardened Academic").id,"engine:fp-academic",{costCards:[ref(card(s,"Fiery Temper","hand"),"hand")]}));
 assert.ok(card(s,"Fiery Temper","graveyard"));assert.equal(s.players.opponent.life,20);
});
test("unverified permanent text never gets an adapter",()=>{assert.deepEqual(formatPermanentActions({name:"Sneak Attack",oracleText:"wrong"}),[]);});

test("Superior Spider-Man copies cast ETBs, keeps 4/4 and name through the turn, and reverts in hand",()=>{
 let s=funds(put(put(position({"Superior Spider-Man":1,"Doomsday Excruciator":1}),"Superior Spider-Man"),"Doomsday Excruciator","graveyard"),{U:1,B:3});
 s=settle(cast(s,"Superior Spider-Man"),[],c=>c.type==="engine-copy-entry"?{refs:[c.candidates.find(v=>v.label==="Doomsday Excruciator").ref]}:null);
 const spider=card(s,"Superior Spider-Man");assert.equal(spider.power,"4");assert.equal(spider.toughness,"4");assert.equal(gameManaValue(spider),6);assert.equal(s.library.length,6);assert.ok(card(s,"Doomsday Excruciator","exile"));
 s=settle(nextGoldfishTurn(s));assert.equal(card(s,"Superior Spider-Man").power,"4");assert.equal(s.library.length,4);
 s=moveGoldfishCards(s,spider.id,"hand");assert.equal(card(s,"Superior Spider-Man","hand").copyRuleName,undefined);assert.equal(gameManaValue(card(s,"Superior Spider-Man","hand")),4);
});
test("Mockingbird respects total mana spent and copies ETB without copying counters or identity",()=>{
 let s=funds(put(put(position({"Mockingbird":1,"Faerie Miscreant":1,"Enduring Curiosity":1}),"Mockingbird"),"Faerie Miscreant","battlefield"),{U:1});
 s=put(s,"Enduring Curiosity","battlefield");s=advanceGoldfishGame(cast(s,"Mockingbird",{x:0}));
 assert.equal(s.rules.pendingChoice.type,"engine-copy-entry");assert.deepEqual(s.rules.pendingChoice.candidates.map(c=>c.label),["Faerie Miscreant"]);
 s=settle(chooseGoldfishRule(s,{refs:[s.rules.pendingChoice.candidates[0].ref]}));
 assert.equal(s.hand.length,1);assert.equal(new Set(s.battlefield.map(c=>c.id)).size,s.battlefield.length);
 s=settle(nextGoldfishTurn(s));assert.equal(s.battlefield.filter(c=>c.name==="Faerie Miscreant").length,2);
});
test("offspring creates only one copy and copied token never inherits the paid offspring option",()=>{
 let s=funds(put(position({"Starscape Cleric":1}),"Starscape Cleric"),{B:5});
 s=settle(cast(s,"Starscape Cleric",{format:{offspring:"yes"}}));
 const xs=s.battlefield.filter(c=>c.name==="Starscape Cleric");assert.equal(xs.length,2);assert.equal(new Set(xs.map(c=>c.id)).size,2);
 assert.equal(xs.find(c=>c.kind==="token").power,"1");assert.equal(xs.find(c=>c.kind==="token").castFormat,undefined);
});
test("daybound changes on active-player spell counts and entering at night uses the back face",()=>{
 let s=funds(put(position({"Graveyard Trespasser":2}),"Graveyard Trespasser"),{B:3});
 s=settle(cast(s,"Graveyard Trespasser"));assert.equal(s.rules.dayNight,"day");
 s=settle(nextGoldfishTurn(s));assert.equal(s.rules.dayNight,"night");assert.equal(s.battlefield[0].faceIndex,1);
 s=funds(put(s,"Graveyard Trespasser"),{B:3});s=settle(cast(s,"Graveyard Trespasser"));assert.ok(s.battlefield.every(c=>c.faceIndex===1));
});
test("Ygra/Familiar loop pays real Food sacrifices, keeps identities and gains/drains each repetition",()=>{
 let s=funds(position({"Ygra, Eater of All":1,"Cauldron Familiar":2}),{G:1,B:7});
 for(const n of ["Ygra, Eater of All","Cauldron Familiar"]) {s=put(s,n);s=settle(cast(s,n));}
 s=put(s,"Cauldron Familiar","graveyard");const y=card(s,"Ygra, Eater of All");
 assert.equal(goldfishCombos(s)[0].id,"ygra");s=repeatGoldfishCombo(s,"ygra",y.id,20);
 assert.equal(goldfishFinish(s).kind,"win");assert.equal(card(s,"Ygra, Eater of All").counters["+1/+1"],40);
 assert.equal(s.battlefield.filter(c=>c.name==="Cauldron Familiar").length,1);assert.equal(s.graveyard.filter(c=>c.name==="Cauldron Familiar").length,1);
});
test("Rottenmouth Viper sacrifices reduce cost and each blight asks for the opponent's actual choice",()=>{
 let s=funds(put(put(position({"Rottenmouth Viper":1,"Cauldron Familiar":1}),"Rottenmouth Viper"),"Cauldron Familiar","battlefield"),{B:5});
 s=settle(cast(s,"Rottenmouth Viper",{format:{cards:[ref(card(s,"Cauldron Familiar"),"battlefield")]}}),[],c=>c.kind==="buttons"?{value:"no"}:null);
 assert.equal(s.players.opponent.life,16);assert.equal(s.manaPool.B,0);assert.ok(card(s,"Cauldron Familiar","graveyard"));
});
test("curator remembers exiled types and loses the boost if a linked card leaves exile",()=>{
 let s=funds(put(position({"Keen-Eyed Curator":1,"Monastery Swiftspear":1,"Opt":1,"Ponder":1}),"Keen-Eyed Curator"),{G:2,C:4});
 s=settle(cast(s,"Keen-Eyed Curator"));for(const n of ["Forest","Monastery Swiftspear","Opt","Ponder"]){s=put(s,n,"graveyard");s=settle(activateGoldfishAction(s,card(s,"Keen-Eyed Curator").id,"engine:fp-linked-exile",{target:ref(card(s,n,"graveyard"),"graveyard")}));}
 assert.equal(goldfishCharacteristics(s,card(s,"Keen-Eyed Curator")).power,"7");assert.ok(goldfishKeywords(s,card(s,"Keen-Eyed Curator")).has("trample"));
 s=moveGoldfishCards(s,card(s,"Opt","exile").id,"hand");assert.equal(goldfishCharacteristics(s,card(s,"Keen-Eyed Curator")).power,"3");
});
test("Jace replaces empty draw with victory, without recording an empty-draw loss",()=>{
 let s=funds(put(position({"Jace, Wielder of Mysteries":1}),"Jace, Wielder of Mysteries"),{U:4});s=settle(cast(s,"Jace, Wielder of Mysteries"));
 s=moveGoldfishCards(s,s.library.map(c=>c.id),"exile");s=settle(drawGoldfishCards(s,1));assert.equal(goldfishFinish(s).kind,"win");assert.ok(!s.rules.emptyDraw);
});
test("Tablet offers double red with a spending restriction",()=>{
 let s=funds(put(position({"Tablet of Discovery":1}),"Tablet of Discovery"),{R:3});s=settle(cast(s,"Tablet of Discovery"));
 const options=goldfishLandManaOptions(card(s,"Tablet of Discovery"),s);assert.ok(options.some(o=>o.pool.R===2&&o.restriction==="instantSorcery"));
});

test("Fury evokes with a red pitch and fixes damage allocation before resolution",()=>{
 let s=put(put(put(put(position({"Fury":1,"Lightning Bolt":1,"Monastery Swiftspear":1,"Faerie Miscreant":1}),"Fury"),"Lightning Bolt"),"Monastery Swiftspear","battlefield"),"Faerie Miscreant","battlefield");
 s=advanceGoldfishGame(castGoldfishAlternative(s,card(s,"Fury","hand").id,"evoke",{refs:[ref(card(s,"Lightning Bolt","hand"),"hand")]}),{autoOrder:true});
 assert.equal(s.rules.pendingChoice.kind,"division");
 const refs=["Monastery Swiftspear","Faerie Miscreant"].map(n=>ref(card(s,n),"battlefield"));
 assert.throws(()=>chooseGoldfishRule(s,{allocation:refs.map(target=>({target,amount:1}))}),/合計/);
 s=chooseGoldfishRule(restoreGoldfishGame(JSON.parse(JSON.stringify(s))),{allocation:[{target:refs[0],amount:3},{target:refs[1],amount:1}]});
 s=settle(s); assert.ok(card(s,"Fury","graveyard")); assert.ok(card(s,"Lightning Bolt","exile")); assert.ok(card(s,"Monastery Swiftspear","graveyard")); assert.ok(card(s,"Faerie Miscreant","graveyard")); assert.equal(s.rules.spellsCast,1);
});
test("Fury permits zero targets, and an invalidated target does not reassign its damage",()=>{
 let s=funds(put(put(put(position({"Fury":1,"Monastery Swiftspear":1,"Faerie Miscreant":1}),"Fury"),"Monastery Swiftspear","battlefield"),"Faerie Miscreant","battlefield"),{R:5});
 s=advanceGoldfishGame(cast(s,"Fury"),{autoOrder:true});
 const zero=settle(chooseGoldfishRule(s,{allocation:[]})); assert.ok(card(zero,"Fury")); assert.ok(card(zero,"Faerie Miscreant"));
 const targets=["Monastery Swiftspear","Faerie Miscreant"].map(n=>ref(card(s,n),"battlefield"));
 s=chooseGoldfishRule(s,{allocation:[{target:targets[0],amount:3},{target:targets[1],amount:1}]});
 s=moveGoldfishCards(s,targets[0].id,"hand"); s=settle(s); assert.ok(card(s,"Monastery Swiftspear","hand")); assert.ok(card(s,"Faerie Miscreant","graveyard")); assert.ok(card(s,"Fury"));
});
test("Old-Growth Troll returns as an Aura, grants GG and land sacrifice makes a tapped 4/4",()=>{
 let s=funds(put(put(position({"Old-Growth Troll":1,"Umbral Collar Zealot":1}),"Old-Growth Troll"),"Umbral Collar Zealot","battlefield"),{G:3});
 s=put(s,"Forest","battlefield"); s=settle(cast(s,"Old-Growth Troll"));
 s=settle(activateGoldfishAction(s,card(s,"Umbral Collar Zealot").id,"engine:fp-zealot",{costCards:[ref(card(s,"Old-Growth Troll"),"battlefield")]}));
 const land=card(s,"Forest"); assert.ok(card(s,"Old-Growth Troll").trollAura); assert.ok(goldfishLandManaOptions(land,s).some(o=>o.pool.G===2));
 assert.throws(()=>activateGoldfishAction(s,land.id,"engine:fp-troll-land"),/マナ/);
 s=funds(s,{C:1}); s=settle(activateGoldfishAction(s,land.id,"engine:fp-troll-land"));
 assert.ok(card(s,"Forest","graveyard")); assert.ok(card(s,"Old-Growth Troll","graveyard")); assert.equal(card(s,"Troll Warrior").tapped,true); assert.equal(card(s,"Troll Warrior").power,"4");
});
test("Moloid attacks offer a mill; Obsessive Pursuit counts nonartifact sacrifices after attack declaration",()=>{
 let s=position({"Mole Man, Moloid Master":1,"Obsessive Pursuit":1,"Umbral Collar Zealot":1,"Monastery Swiftspear":1});
 for(const n of ["Mole Man, Moloid Master","Obsessive Pursuit"]){s=funds(put(s,n),n==="Obsessive Pursuit"?{B:2}:{G:3});s=settle(cast(s,n));}
 s=put(s,"Forest");s=settle(cast(s,"Forest"));assert.ok(card(s,"Moloid"));
 s=settle(nextGoldfishTurn(s)); s=put(s,"Umbral Collar Zealot","battlefield");s=put(s,"Monastery Swiftspear","battlefield");
 s=settle(activateGoldfishAction(s,card(s,"Umbral Collar Zealot").id,"engine:fp-zealot",{costCards:[ref(card(s,"Monastery Swiftspear"),"battlefield")]}));
 assert.equal(s.rules.permanentsSacrificed,1);assert.equal(s.rules.artifactsSacrificed,0);
 const before=s.library.length;
 s=settle(beginGoldfishCombat(s),[],c=>c.type==="attack"?{ids:[card(s,"Moloid").id]}:c.type==="engine-target"?{target:ref(card(s,"Moloid"),"battlefield")}:null);
 assert.equal(s.library.length,before-1);assert.equal(card(s,"Moloid").counters["+1/+1"],1);
});
test("Ygra grants Food to a double-faced creature and removes it on leaving",()=>{
 let s=funds(put(put(position({"Ygra, Eater of All":1,"Delver of Secrets":1}),"Ygra, Eater of All"),"Delver of Secrets","battlefield"),{G:1,B:4});
 s=settle(cast(s,"Ygra, Eater of All")); assert.ok(isType(card(s,"Delver of Secrets"),"Food"));
 s=moveGoldfishCards(s,card(s,"Ygra, Eater of All").id,"hand");s=settle(s);
 assert.ok(!isType(card(s,"Delver of Secrets"),"Artifact"));assert.ok(!isType(card(s,"Delver of Secrets"),"Food"));
});
test("Sarkhan gains Dragon type for the turn; Wolverine heals earlier damage on every hit",()=>{
 let s=funds(position({"Sarkhan, Dragon Ascendant":1,"Twinmaw Stormbrood":1,"Wolverine, Fierce Fighter":1}),{R:2,W:6});
 s=put(s,"Sarkhan, Dragon Ascendant"); s=settle(cast(s,"Sarkhan, Dragon Ascendant"),[],c=>c.kind==="cards"?{refs:[]}:null);
 s=put(s,"Twinmaw Stormbrood");s=settle(cast(s,"Twinmaw Stormbrood"));assert.ok(isType(card(s,"Sarkhan, Dragon Ascendant"),"Dragon"));
 s=settle(nextGoldfishTurn(s));assert.ok(!isType(card(s,"Sarkhan, Dragon Ascendant"),"Dragon"));
 s=put(s,"Wolverine, Fierce Fighter","battlefield");const w=ref(card(s,"Wolverine, Fierce Fighter"));
 damage(s,w,3);damage(s,w,2);assert.equal(card(s,"Wolverine, Fierce Fighter").damage,2);
});
test("Snuff Out validates its alternate cost and pays life only once",()=>{
 let s=put(put(position({"Snuff Out":1,"Swamp":1}),"Snuff Out"),"Swamp","battlefield");
 s=settle(cast(s,"Snuff Out",{format:{freeCast:"yes"},target:{player:"opponent",virtual:true}}));
 assert.equal(s.players.self.life,16);assert.equal(s.rules.spellsCast,1);assert.ok(card(s,"Snuff Out","graveyard"));
 let noSwamp=put(position({"Snuff Out":1}),"Snuff Out");
 assert.throws(()=>cast(noSwamp,"Snuff Out",{format:{freeCast:"yes"},target:{player:"opponent",virtual:true}}),/条件/);
});
test("Force of Vigor pitches a different green card only on the opponent turn",()=>{
 let s=put(put(position({"Force of Vigor":1,"Old-Growth Troll":1}),"Force of Vigor"),"Old-Growth Troll");
 const pitch=ref(card(s,"Old-Growth Troll","hand"),"hand");
 assert.throws(()=>cast(s,"Force of Vigor",{format:{freeCast:"yes",pitch:[pitch]}}),/条件/);
 s=settle(endGoldfishTurn(s));s=settle(cast(s,"Force of Vigor",{format:{freeCast:"yes",pitch:[pitch]}}));
 assert.ok(card(s,"Old-Growth Troll","exile"));assert.ok(card(s,"Force of Vigor","graveyard"));assert.equal(s.rules.spellsCast,1);
});
test("Hearse exiles both selected targets and uses their linked count for power",()=>{
 let s=funds(put(position({"Unlicensed Hearse":1,"Opt":1,"Ponder":1}),"Unlicensed Hearse"),{C:2});s=settle(cast(s,"Unlicensed Hearse"));
 s=put(s,"Opt","graveyard");s=put(s,"Ponder","graveyard");
 s=settle(activateGoldfishAction(s,card(s,"Unlicensed Hearse").id,"engine:fp-hearse",{targets:["Opt","Ponder"].map(n=>ref(card(s,n,"graveyard"),"graveyard"))}));
 assert.equal(card(s,"Unlicensed Hearse").linkedExile.length,2);assert.equal(goldfishCharacteristics(s,card(s,"Unlicensed Hearse")).power,"2");
});
test("waterbend may tap summoning-sick creatures, excludes them from mana and transforms Aang",()=>{
 let s=funds(put(position({"Aang, Swift Savior":1}),"Aang, Swift Savior"),{W:1,U:1,C:1});s=settle(cast(s,"Aang, Swift Savior"),[],c=>c.type==="engine-target"?{target:null}:null);
 const tokens=makeGameToken(s,{name:"Robot",typeLine:"Token Artifact Creature — Robot",power:"1",toughness:"1"},7);
 s=settle(flushEngineEvents(s));const aang=card(s,"Aang, Swift Savior");
 s=settle(activateGoldfishAction(s,aang.id,"engine:fp-aang-waterbend",{costCards:[ref(aang,"battlefield"),...tokens.map(c=>ref(c,"battlefield"))]}));
 assert.equal(s.battlefield.find(c=>c.id===aang.id).faceIndex,1);assert.ok(s.battlefield.every(c=>c.tapped));
});
