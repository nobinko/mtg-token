import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { route } from "./helpers/goldfish-route.js";
import { goldfishFinish } from "../public/goldfish-sideboard.js";
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/goldfish-legacy-top10.json", import.meta.url)));
const opponent = { player: "opponent" }, opposing = { player: "opponent", virtual: true };
for (const post of [false, true]) {
  test(`Legacy Show and Tell ${post ? "postboard" : "main"}: Omniscience into Emrakul's extra turn`, () => {
    const r = route(4, ["Island", "Ancient Tomb", "Show and Tell", "Omniscience", "Emrakul, the Aeons Torn", "Lotus Petal", post ? "Consign to Memory" : "Brainstorm"], ["Island"], post ? { Brainstorm: -1, "Consign to Memory": 1 } : {}, c => {
      if (c.kind === "cards" && c.sourceName === "Show and Tell") return { refs: [c.candidates.find(v => v.label === "Omniscience").ref] };
      return null;
    }, fixture);
    r.cast("Island");
    if (post) r.cast("Consign to Memory", { target: opposing, replicate: 0 });
    r.next(); r.cast("Ancient Tomb"); r.cast("Show and Tell"); r.cast("Emrakul, the Aeons Torn");
    assert.equal(r.s.rules.extraTurns, 1); assert.equal(r.s.rules.spellsCast, 2);
    r.next(); assert.equal(r.s.turn, 3);
    r.attack(); assert.equal(r.s.players.opponent.life, 5);
    r.next(); r.attack(); assert.equal(goldfishFinish(r.s)?.kind, "win");
  });
  test(`Legacy Lands ${post ? "postboard" : "main"}: Stage copies Depths without ice`, () => {
    const r = route(9, ["Forest", "Exploration", "Dark Depths", "Thespian's Stage", "Ancient Tomb", "Life from the Loam", post ? "Pithing Needle" : "Crop Rotation"], ["Yavimaya, Cradle of Growth"], post ? { "Crop Rotation": -1, "Pithing Needle": 1 } : {}, (c,s) => {
      if (c.type === "engine-legend") return { keep: s.battlefield.find(x => x.stageAbility).id };
      return null;
    }, fixture);
    r.cast("Forest"); r.cast("Exploration"); r.cast("Dark Depths");
    assert.equal(r.card("Dark Depths").counters.ice, 10);
    r.next(); r.cast("Ancient Tomb"); r.cast("Thespian's Stage");
    if (post) r.cast("Pithing Needle");
    r.act("Thespian's Stage", "engine:fp-stage", { target: r.ref("Dark Depths") });
    assert.ok(r.s.battlefield.some(c => c.name === "Marit Lage"));
    assert.equal(r.s.graveyard.filter(c => ["Dark Depths", "Thespian's Stage"].includes(c.name)).length, 2);
    r.next(); r.attack(); assert.equal(goldfishFinish(r.s)?.kind, "win");
  });
  test(`Legacy Storm ${post ? "postboard" : "main"}: bargain Will, replay rituals, Tendrils`, () => {
    let tutors = 0;
    const r = route(10, ["Underground Sea", "Badlands", "Dark Ritual", "Dark Ritual", "Lotus Petal", "Chrome Mox", "Beseech the Mirror"], ["Lotus Petal", ...(post ? ["Thoughtseize"] : [])], post ? { "Veil of Summer": -1, Thoughtseize: 1 } : {}, (c,s) => {
      if (c.sourceName === "Chrome Mox" && c.kind === "cards") return { refs: [] };
      if (c.kind === "cards" && c.sourceName === "Beseech the Mirror" && c.label.includes("山札")) { const wanted = ++tutors === 1 ? "Gaea's Will" : "Tendrils of Agony"; return { refs: [c.candidates.find(v => v.label === wanted).ref] }; }
      if (c.kind === "buttons" && c.options.some(v => v.value === "cast")) return { value: "cast" };
      if (c.type === "cast-target") return { target: opponent };
      return null;
    }, fixture);
    r.cast("Underground Sea"); r.next(); r.cast("Badlands");
    if (post) { r.next(); r.cast("Thoughtseize", { target: opponent }); }
    r.cast("Chrome Mox"); r.cast("Lotus Petal"); r.cast("Lotus Petal");
    r.cast("Dark Ritual"); r.cast("Dark Ritual");
    r.cast("Beseech the Mirror", { costCards: [r.ref("Lotus Petal")] });
    assert.equal(r.s.rules.gaeaWillSerial, r.s.rules.turnSerial);
    r.cast("Lotus Petal", { fromGraveyard: true });
    r.cast("Dark Ritual", { fromGraveyard: true }); r.cast("Dark Ritual", { fromGraveyard: true });
    r.cast("Beseech the Mirror", { fromGraveyard: true, costCards: [r.ref("Chrome Mox")] });
    assert.equal(goldfishFinish(r.s)?.kind, "win"); assert.ok(r.s.exile.some(c => c.name === "Dark Ritual"));
  });
}
for (const post of [false, true]) test(`Pioneer Jund ${post ? "postboard" : "main"}: Ygra and two Familiars drain to a win`,()=>{
 const source=JSON.parse(fs.readFileSync(new URL("./fixtures/goldfish-pioneer-top10.json",import.meta.url)));
 const r=route(4,["Overgrown Tomb","Stomping Ground","Swamp","Cauldron Familiar","Cauldron Familiar","Witch's Oven","Ygra, Eater of All"],post?["Thoughtseize","Overgrown Tomb","Overgrown Tomb"]:["Overgrown Tomb","Overgrown Tomb"],post?{"Deadly Dispute":-1,Thoughtseize:1}:{},()=>null,source);
 r.cast("Overgrown Tomb");r.cast("Cauldron Familiar");
 r.next();r.cast("Swamp");r.cast("Witch's Oven");
 r.act("Witch's Oven","engine:oven",{costCards:[r.ref("Cauldron Familiar")]});
 r.cast("Cauldron Familiar");
 r.next();r.cast("Stomping Ground");if(post)r.cast("Thoughtseize",{target:opponent});
 r.next();r.cast("Overgrown Tomb");r.next();r.cast("Overgrown Tomb");r.cast("Ygra, Eater of All");
 r.combo("ygra","Ygra, Eater of All",20);
 assert.equal(goldfishFinish(r.s)?.kind,"win");assert.equal(r.card("Ygra, Eater of All").counters["+1/+1"],40);
});
