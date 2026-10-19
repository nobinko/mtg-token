const KEY_PREFIX = "v2:";

export function isVirtualObject(object) {
  return object.virtual === true || /\bhelper$/i.test(object.typeLine || "");
}

// Shared by aggregation, checklist storage and deferred asset enrichment.
export function objectKey(object) {
  const identity = isVirtualObject(object)
    ? ["helper", object.name, object.typeLine]
    : object.oracleId
      ? ["oracle", object.oracleId]
      : ["print", object.printId || object.id];
  return KEY_PREFIX + JSON.stringify([object.set, ...identity]);
}

export function tokenSignature(card) {
  const face = (item) => [item.name, item.type_line ?? item.typeLine, item.oracle_text ?? item.oracleText ?? "",
    item.power ?? "", item.toughness ?? "", item.loyalty ?? "", item.defense ?? "", [...(item.colors || [])].sort()];
  return JSON.stringify([face(card), (card.card_faces || card.cardFaces || []).map(face)]);
}

// Preparation is shared across printings; aggregation still keeps each set row.
export function preparationKey(object) {
  // A reminder's purpose survives a missing image or a different printing.
  // This never changes physical-token identity (size/color/abilities).
  if (object.auxiliaryId) return `prep:auxiliary:${object.auxiliaryId}`;
  return legacyPreparationKey(object);
}

function legacyPreparationKey(object) {
  if (isVirtualObject(object)) return `prep:helper:${JSON.stringify([object.name, object.typeLine])}`;
  return `prep:physical:${JSON.stringify([object.oracleId || object.printId || object.id, tokenSignature(object)])}`;
}

export function preparedRecord(object, records) {
  let record = records.get(preparationKey(object));
  if (!record && object.auxiliaryId) {
    record = records.get(legacyPreparationKey(object));
    for (const name of object.legacyHelperNames || []) {
      if (record) break;
      record = records.get(legacyPreparationKey({ virtual: true, name, typeLine: "Marker helper" }));
    }
  }
  return record?.picked === true ? record : null;
}

export function setPrepared(object, records, picked, location = {}) {
  records.set(preparationKey(object), { picked, set: location.set || object.set,
    setName: location.setName || object.setName, printId: location.printId || object.printId || "",
    name: object.name, sourceObjectKey: objectKey(object) });
}

export function migratePreparedRecords(objects, legacyChecks, records) {
  let changed = false;
  for (const object of objects) {
    const key = preparationKey(object);
    const previous = preparedRecord(object, records);
    if (!records.has(key) && (previous || legacyChecks.has(objectKey(object)))) {
      setPrepared(object, records, true, previous || {});
      changed = true;
    }
  }
  return changed;
}

export function migrateCheckedObjects(keys) {
  const checked = new Set();
  let resetCount = 0;
  let changed = false;
  for (const key of keys) {
    if (typeof key !== "string") continue;
    if (key.startsWith(KEY_PREFIX)) {
      checked.add(key);
      continue;
    }
    changed = true;
    const parts = key.split("|");
    const helper = { set: parts.shift(), typeLine: parts.pop(), name: parts.join("|") };
    // Helpers remain identifiable even when absent from the current search.
    if (helper.name && isVirtualObject(helper)) checked.add(objectKey(helper));
    // Old physical-token keys cannot tell us which variant was checked.
    else resetCount += 1;
  }
  return { checked, resetCount, changed };
}

export function objectCharacteristics(object) {
  if (isVirtualObject(object)) return "";
  const colors = { W: "白", U: "青", B: "黒", R: "赤", G: "緑" };
  return [
    Array.isArray(object.colors) ? (object.colors.map((color) => colors[color] || color).join("・") || "無色") : "",
    object.power !== undefined && object.toughness !== undefined && object.power !== "" && object.toughness !== ""
      ? `${object.power}/${object.toughness}` : "",
    object.oracleText || ""
  ].filter(Boolean).join(" / ");
}
