import assert from "node:assert/strict";
import test from "node:test";
import { objectKey, preparationKey, preparedRecord, setPrepared, migratePreparedRecords } from "../public/object-identity.js";

const treasure = { set: "OTJ", setName: "Outlaws of Thunder Junction", printId: "otj-treasure", oracleId: "treasure",
  name: "Treasure", typeLine: "Token Artifact — Treasure", oracleText: "{T}, Sacrifice this token: Add one mana of any color.", colors: [], power: "", toughness: "" };

test("Treasure, Food and Clue preparation shares an exact specification across sets and preserves the extraction location", () => {
  for (const name of ["Treasure", "Food", "Clue"]) {
    const original = { ...treasure, name, oracleId: name, typeLine: `Token Artifact — ${name}` };
    const duplicate = { ...original, set: "MH3", printId: `mh3-${name}` };
    const records = new Map();
    setPrepared(original, records, true);
    assert.equal(preparationKey(original), preparationKey(duplicate));
    assert.notEqual(objectKey(original), objectKey(duplicate), "Each physical set row keeps its own aggregation identity");
    assert.equal(preparedRecord(duplicate, records).set, "OTJ");
    const restored = new Map(JSON.parse(JSON.stringify([...records])));
    assert.equal(preparedRecord(duplicate, restored).set, "OTJ");
    setPrepared(duplicate, restored, false);
    assert.equal(preparedRecord(original, restored), null);
  }
});

test("same-name or same-oracle tokens with different physical specifications never share preparation", () => {
  const records = new Map();
  setPrepared(treasure, records, true);
  for (const delta of [{ oracleId: "other" }, { colors: ["R"] }, { power: "1", toughness: "1" },
    { oracleText: "Add two mana." }, { typeLine: "Token Creature — Treasure" },
    { cardFaces: [{ name: "Treasure", oracle_text: "A different ability" }] }]) {
    assert.equal(preparedRecord({ ...treasure, ...delta, set: "FRA" }, records), null);
  }
});

test("an alternative printing records the actual set; clearing it cannot be undone by migration of old checks", () => {
  const records = new Map();
  const oldChecks = new Set([objectKey(treasure)]);
  assert.equal(migratePreparedRecords([treasure], oldChecks, records), true);
  setPrepared(treasure, records, true, { set: "ELD", setName: "Throne of Eldraine", printId: "eld-treasure" });
  assert.equal(preparedRecord(treasure, records).set, "ELD");
  setPrepared(treasure, records, false);
  assert.equal(migratePreparedRecords([treasure], oldChecks, records), false);
  assert.equal(preparedRecord(treasure, records), null);
});

test("virtual helper preparation shares the same helper but keeps different helpers apart", () => {
  const helper = { set: "MH3", virtual: true, name: "Copy token / copy marker", typeLine: "Marker helper" };
  const records = new Map();
  setPrepared(helper, records, true);
  assert.equal(preparedRecord({ ...helper, set: "ELD" }, records).set, "MH3");
  assert.equal(preparedRecord({ ...helper, name: "Day/Night marker" }, records), null);
});
