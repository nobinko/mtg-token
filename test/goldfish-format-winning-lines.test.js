import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { route } from "./helpers/goldfish-route.js";
import { goldfishFinish } from "../public/goldfish-sideboard.js";
import { planGoldfishCastPayment } from "../public/goldfish-mana.js";
import { goldfishSpellTargets } from "../public/goldfish-spells.js";
import { goldfishCardActions } from "../public/goldfish-action-definitions.js";
import { goldfishActionPayment, goldfishActionReason } from "../public/goldfish-actions.js";
import { goldfishFetchRule, goldfishFetchTargets, goldfishFetchEntry, resolveGoldfishFetch } from "../public/goldfish-fetch.js";
import { isType } from "../public/goldfish-events.js";
import { gameLandPlayLimit } from "../public/goldfish-engine.js";
import { goldfishReference as ref } from "../public/goldfish-objects.js";
import { mergeCardMetadata } from "../public/card-metadata.js";
// Every opening and draw is selected from this real registered 75 before play.
// No resources are supplied during a route. Main and postboard each must win,
// cast their defining permanent/spell and actually use the sideboard card.
const configs = {
 standard: [
  [1,["Watery Grave","Island","Swamp"],["Spyglass Siren","Enduring Curiosity","Kaito, Bane of Nightmares","Bitter Triumph"],"Duress"],
  [2,["Hallowed Fountain","Island","Plains"],["The Theorist, Jace Beleren","Jace's Machinations","Fatehold Charm","No More Lies"],"Flashfreeze"],
  [3,["Steam Vents","Island","Spirebluff Canal"],["Hearth Elemental","Eddymurk Crab","Sunderflock","Opt"],"Annul"],
  [4,["Forest","Forest","Forest"],["Llanowar Elves","Mossborn Hydra","Mightform Harmonizer","Carnivorous Cultivator"],"Warg Tactics"],
  [5,["Godless Shrine","Plains","Swamp"],["Hinterland Sanctifier","Starscape Cleric","Amalia Benavides Aguirre","Case of the Uneaten Feast"],"Duress"],
  [6,["Blood Crypt","Overgrown Tomb","Stomping Ground"],["Biotech Specialist","Callous Inspector","Sentinel of the Nameless City","Fanatical Offering"],"Duress"],
  [7,["Sacred Foundry","Mountain","Plains"],["Momo, Friendly Flier","Sarkhan, Dragon Ascendant","Twinmaw Stormbrood","Smaug the Magnificent"],"Boros Charm"],
  [8,["Watery Grave","Swamp","Swamp"],["Seasoned Cryomancer","Overlord of the Balemurk","Uldaros Theorix","Theorix Charm"],"Flashfreeze"],
  [9,["Watery Grave","Watery Grave","Swamp"],["Seasoned Cryomancer","Doomsday Excruciator","Uldaros Theorix","Winternight Stories"],"Negate"],
  [10,["Hallowed Fountain","Blood Crypt","Sacred Foundry"],["North Wind Avatar","Jeskai Revelation","Firebending Lesson","Lightning Helix"],"Get Lost"]
 ],
 legacy: [
  [1,["Underground Sea","Island","Swamp"],["Tamiyo, Inquisitive Student","Orcish Bowmasters","Kaito, Bane of Nightmares","Brainstorm"],"Nihil Spellbomb"],
  [2,["Plateau","Mountain","Plains"],["Sand Scout","Guide of Souls","Ocelot Pride","Forth Eorlingas!"],"Abrade"],
  [3,["Tundra","Island","Plains"],["Phelia, Exuberant Shepherd","Quantum Riddler","Tamiyo, Inquisitive Student","Brainstorm"],"Erode"],
  [7,["Volcanic Island","Volcanic Island","Island"],["Delver of Secrets","Dragon's Rage Channeler","Cori-Steel Cutter","Ponder"],"Price of Progress"],
  [8,["Ancient Tomb","Eldrazi Temple","Cavern of Souls"],["Glaring Fleshraker","Eldrazi Linebreaker","It That Heralds the End","Thought-Knot Seer"],"Warping Wail"]
 ],
 pioneer: [
  [1,["Steam Vents","Mountain","Island"],["Monastery Swiftspear","Emberheart Challenger","Pompous Battlemage","Flow State"],"Accumulate Wisdom"],
  [2,["Overgrown Tomb","Forest","Swamp"],["Sheoldred, the Apocalypse","Unholy Annex / Ritual Chamber","Professor Dellian Fel","Thoughtseize"],"Go Blank"],
  [3,["Mountain","Mountain","Mountain"],["Monastery Swiftspear","Kumano Faces Kakkazan","Screaming Nemesis","Lightning Strike"],"Scorching Shot"],
  [4,["Stomping Ground","Overgrown Tomb","Swamp"],["Cauldron Familiar","Mayhem Devil","Ygra, Eater of All","Witch's Oven"],"Thoughtseize"],
  [5,["Forest","Forest","Forest"],["Llanowar Elves","Kiora, Behemoth Beckoner","Cavalier of Thorns","Storm the Festival"],"Setessan Petitioner"],
  [6,["Steam Vents","Island","Spirebluff Canal"],["Hearth Elemental","Eddymurk Crab","Sunderflock","Consider"],"Annul"],
  [8,["Watery Grave","Island","Swamp"],["Faerie Miscreant","Moon-Circuit Hacker","Kaito, Bane of Nightmares","Unholy Annex / Ritual Chamber"],"Duress"],
  [9,["Sacred Foundry","Mountain","Inspiring Vantage"],["Flameblade Adept","Marauding Mako","Inti, Seneschal of the Sun","Fiery Temper"],"Monument to Endurance"],
  [10,["Hallowed Fountain","Island","Plains"],["Quantum Riddler","Aang, Swift Savior","Sage of the Skies","Bilbo, Thief in the Night"],"Surge of Salvation"]
 ]
};
function decision(c,s) {
 if(c.formatField==="offspring"||c.formatField==="impending")return {value:"no"};
 if(c.kind==="buttons"&&c.options.some(o=>o.value==="decline"))return {value:"decline"};
 if(c.kind==="buttons"&&c.options.some(o=>o.value==="no"))return {value:"no"};
 if(c.kind==="buttons"&&c.options.some(o=>o.value==="surveil"))return {value:"surveil"};
 if(c.kind==="cards"&&c.candidates.some(x=>x.ref.player==="opponent"))return {refs:c.candidates.filter(x=>x.ref.player==="opponent").slice(0,Math.max(1,c.min)).map(x=>x.ref)};
 if(c.type==="engine-target"&&!c.multipleTargets){const opp=c.candidates.find(x=>x.ref.player==="opponent"&&!x.ref.virtual)||c.candidates.find(x=>x.ref.player==="opponent");return {target:opp?.ref||(c.min?c.candidates[0]?.ref:null)};}
 return null;
}
for(const [format,list] of Object.entries(configs))for(const [rank,lands,core,side] of list)for(const post of [false,true])test(`${format} ${rank} ${post?"postboard":"main"}: registered list to a win`,t=>{
 const fixture=JSON.parse(fs.readFileSync(new URL(`./fixtures/goldfish-${format}-top10.json`,import.meta.url)));
 const deck=fixture.decks.find(d=>d.rank===rank), counts=Object.fromEntries(deck.mainboard.map(c=>[c.name,c.count]));
 const opening=[...lands,...core.slice(0,3),post?side:core[3]], swaps=post?{[core[3]]:-1,[side]:1}:{};
 const left={...counts};for(const [n,v]of Object.entries(swaps))left[n]=(left[n]||0)+v;
 for(const n of opening){assert.ok(left[n]>0,`${format}${rank} opening ${n}`);left[n]--;}
 const rows=mergeCardMetadata(deck.mainboard,fixture.metadata), draws=[];
 for(const row of rows.filter(c=>isType(c,"Land")&&!goldfishFetchRule(c)).sort((a,b)=>Number(!lands.includes(a.name))-Number(!lands.includes(b.name))))while(left[row.name]>0&&draws.length<7){draws.push(row.name);left[row.name]--;}
 const r=route(rank,opening,draws,swaps,decision,fixture);let sidePlayed=!post;
 const defining=core[0];let definingPlayed=false;
 for(let turn=0;turn<30&&!goldfishFinish(r.s);turn++){
   while(r.s.rules.landsPlayed<gameLandPlayLimit(r.s)) {const land=r.s.hand.find(c=>isType(c,"Land"));if(!land)break;r.cast(land.name);}
   for(const land of [...r.s.battlefield].filter(c=>goldfishFetchRule(c)&&!c.tapped)){
     const target=goldfishFetchTargets(r.s,land.id)[0],entries=target&&goldfishFetchEntry(r.s,land.id,target).choices;
     r.update(resolveGoldfishFetch(r.s,land.id,target?.id,{entry:entries?.find(e=>!e.tapped)?.key||entries?.[0].key}),`fetch ${land.name}`);
   }
   for(let k=0;k<15&&!goldfishFinish(r.s);k++){
     const candidates=r.s.hand.filter(c=>!isType(c,"Land")).filter(c=>[...core,side].includes(c.name)).sort((a,b)=>Number(b.name===side)-Number(a.name===side));
     const spell=candidates.find(c=>planGoldfishCastPayment(r.s,c,{preview:true,format:{offspring:"no",impending:"no"}}).payable);
     if(!spell)break;
     const targets=goldfishSpellTargets(r.s,spell), target=targets.find(x=>x.ref.player==="opponent")?.ref||targets[0]?.ref;
     r.cast(spell.name,{target,format:{offspring:"no",impending:"no"}});if(spell.name===side)sidePlayed=true;if(spell.name===defining)definingPlayed=true;
   }
   for(const c of [...r.s.battlefield]){
     const actions=goldfishCardActions(c).filter(a=>a.loyalty!=null&&!goldfishActionReason(r.s,c,a)&&goldfishActionPayment(r.s,c,a).payable);
     const action=actions.find(a=>a.id==="engine:theorist-token")||actions.find(a=>a.loyalty>0)||actions.find(a=>a.id==="engine:fp-kaito-zero");
     if(action)r.act(c.name,action.id,{confirmLife:true});
   }
   if(!goldfishFinish(r.s))r.attack();if(!goldfishFinish(r.s))r.next();
 }
 assert.equal(goldfishFinish(r.s)?.kind,"win",r.log.slice(-30).join(" / "));
 assert.ok(definingPlayed,`defining card ${defining}`);assert.ok(sidePlayed,`postboard card ${side}`);
 t.diagnostic(`${deck.archetype}: T${r.s.turn}, opponent ${r.s.players.opponent.life}; ${deck.url}`);
});
