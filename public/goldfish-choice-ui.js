import { goldfishSpellProgram, goldfishSpellTargets } from "./goldfish-spells.js?v=20261020-public30b";
import { goldfishFindObject, goldfishReference } from "./goldfish-objects.js?v=20261020-public30b";
import { goldfishFlashbackSacrifices } from "./goldfish-mana.js?v=20261020-public30b";
import { goldfishAttackers } from "./goldfish-combat.js?v=20261020-public30b";
import { goldfishCardActions } from "./goldfish-action-definitions.js?v=20261020-public30b";
import { goldfishActionTargets, goldfishActionPayment, engineActionOptions } from "./goldfish-actions.js?v=20261020-public30b";
import { goldfishCharacteristics } from "./goldfish-rules.js?v=20261020-public30b";
import { goldfishAlternativeModes, alternativeCandidates } from "./goldfish-alternatives.js?v=20261020-public30b";
import { engineCandidates } from "./goldfish-engine.js?v=20261020-public30b";

// Render only explicit choices. This module never changes game state itself.
export function renderGoldfishSpellChoice({ state, choice, content, title, action, paragraph, imageUrl, answer, saveDraft }) {
  const cardTile = (card, onClick, label = card.name) => {
    const button = document.createElement(onClick ? "button" : "div");
    button.className = "goldfish-choice-card";
    if (onClick) { button.type = "button"; button.addEventListener("click", onClick); }
    const token = card.kind === "token" && !card.imageUrl;
    const img = document.createElement(token ? "span" : "img");
    if (token) { img.className = "goldfish-choice-token"; const stats = goldfishCharacteristics(state, card); img.textContent = `${card.name}\n${stats.power}/${stats.toughness}\nTOKEN`; }
    else { img.src = imageUrl(card); img.alt = ""; img.loading = "lazy"; img.addEventListener("error", () => { img.hidden = true; }); }
    const text = document.createElement("span"); text.textContent = label;
    button.append(img, text); return button;
  };
  if (choice.type === "cast-alternative") {
    const card = goldfishFindObject(state, choice.card), mode = goldfishAlternativeModes(card, choice.card.zone).find(m => m.id === choice.modeId);
    title.textContent = mode.label; paragraph(choice.sourceName, "goldfish-mana-card-name");
    let ids = choice.draft?.ids || [], target = choice.draft?.target || null, x = choice.draft?.x || 0;
    const candidates = alternativeCandidates(state, card, mode), list = document.createElement("div"); list.className = "goldfish-choice-targets"; content.append(list);
    const persist = () => saveDraft({ ids, target, x });
    const render = () => { list.replaceChildren(); for (const option of candidates) { const selected = ids.includes(option.ref.id); list.append(cardTile(option.card, () => { ids = selected ? ids.filter(id => id !== option.ref.id) : [...ids, option.ref.id]; persist(); render(); }, (selected ? "✓ " : "") + option.label)); } };
    render();
    if (mode.target) {
      paragraph("授与先を選ぶ");
      for (const option of engineCandidates(state, { zone: "battlefield", filter: { types: ["Creature"] }, target: true })) {
        const tile = cardTile(option.card, () => { target = option.ref; persist(); for (const other of content.querySelectorAll("[data-bestow-target]")) other.setAttribute("aria-pressed", String(other.dataset.bestowTarget === option.ref.id)); });
        tile.dataset.bestowTarget = option.ref.id; tile.setAttribute("aria-pressed", String(target?.id === option.ref.id)); content.append(tile);
      }
    }
    if (mode.spellTarget) {
      paragraph("打ち消す対象を選ぶ");
      for (const option of goldfishSpellTargets(state, card)) { const button = document.createElement("button"); button.type = "button"; button.textContent = option.label; button.addEventListener("click", () => { target = option.ref; persist(); for (const other of content.querySelectorAll("[data-spell-target]")) other.setAttribute("aria-pressed", String(other === button)); }); button.dataset.spellTarget = "true"; content.append(button); }
    }
    if (mode.x) { const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.max = "99"; input.value = String(x); input.setAttribute("aria-label", "Xの値"); input.addEventListener("input", () => { x = Number(input.value); persist(); }); content.append(input); }
    action("コストを支払って唱える", () => answer({ refs: ids.map(id => candidates.find(c => c.ref.id === id).ref), target, x }), true);
    action("キャンセル", () => answer({ cancel: true }));
    return true;
  }
  if (choice.type === "action") {
    const card = goldfishFindObject(state, choice.card);
    const ability = goldfishCardActions(card).find((item) => item.id === choice.actionId);
    title.textContent = ability.label;
    paragraph(choice.sourceName, "goldfish-mana-card-name");
    if (ability.description !== ability.label) paragraph(ability.description);
    if (ability.id.startsWith("engine:")) {
      const data = engineActionOptions(state, card, ability);
      let draft = { ...choice.options, ...choice.draft }, ids = draft.costIds || [];
      if (ability.x) { const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.max = "99"; input.value = String(draft.x || 0); input.setAttribute("aria-label", "Xの値"); input.addEventListener("input", () => { draft.x = Number(input.value); saveDraft({ ...draft, costIds: ids }); }); content.append(input); }
      const list = document.createElement("div"); list.className = "goldfish-choice-targets"; content.append(list);
      const render = () => {
        list.replaceChildren();
        if (ability.divideDamage) {
          for (const option of data.targets) {
            const row = document.createElement("label"); row.textContent = option.label + " ";
            const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.max = String(ability.divideDamage); input.value = String((draft.allocation || []).find(a => JSON.stringify(a.target) === JSON.stringify(option.ref))?.amount || 0); input.setAttribute("aria-label", option.label + "へのダメージ");
            input.addEventListener("input", () => { draft.allocation = (draft.allocation || []).filter(a => JSON.stringify(a.target) !== JSON.stringify(option.ref)); if (Number(input.value)) draft.allocation.push({ target: option.ref, amount: Number(input.value) }); saveDraft({ ...draft, costIds: ids }); }); row.append(input); list.append(row);
          }
        } else if (ability.targetSpec) {
          for (const option of data.targets) {
            const selected = ability.targetSpec.count ? (draft.targets || []).some(r=>JSON.stringify(r) === JSON.stringify(option.ref)) : JSON.stringify(draft.target) === JSON.stringify(option.ref);
            const select = () => {
              if (ability.targetSpec.count) { draft.targets ||= []; if(selected) draft.targets = draft.targets.filter(r=>JSON.stringify(r)!==JSON.stringify(option.ref)); else if(draft.targets.length < ability.targetSpec.count) draft.targets.push(option.ref); }
              else draft.target = option.ref;
              saveDraft({ ...draft, costIds: ids }); render();
            };
            if (option.card) list.append(cardTile(option.card, select, (selected ? "✓ " : "") + option.label));
            else { const button = document.createElement("button"); button.type = "button"; button.textContent = (selected ? "✓ " : "") + option.label; button.addEventListener("click", select); list.append(button); }
          }
        }
        for (const option of data.costs) {
          const selected = ids.includes(option.ref.id);
          list.append(cardTile(option.card, () => { ids = selected ? ids.filter(id => id !== option.ref.id) : [...ids, option.ref.id]; saveDraft({ ...draft, costIds: ids }); render(); }, (selected ? "✓ コスト：" : "コスト：") + option.label));
        }
      };
      render();
      const payment = goldfishActionPayment(state, card, ability, draft);
      paragraph("支払い " + payment.cost + ((payment.life || ability.lifeCost) ? "・ライフ " + ((payment.life || 0) + (ability.lifeCost || 0)) : ""));
      action("確定して起動", () => answer({ ...draft, x: Number(draft.x || 0), target: draft.target || null, ...(ability.targetSpec?.count ? {targets:draft.targets||[]} : {}), costCards: data.costs.filter(c => ids.includes(c.ref.id)).map(c => c.ref), confirmLife: true }), true);
      action("キャンセル", () => answer({ cancel: true }));
      return true;
    }
    const payment = goldfishActionPayment(state, card, ability, choice.options);
    const lands = payment.activations?.map((ref) => state.battlefield.find((item) => item.id === ref.id)?.name).join("・");
    paragraph(`支払い ${ability.cost}${lands ? ` ／ タップ：${lands}` : ""}${payment.life ? ` ／ ライフ −${payment.life}` : ""}。確定するまで支払いません。`);
    const list = document.createElement("div"); list.className = "goldfish-choice-targets"; content.append(list);
    if (ability.target) {
      for (const target of goldfishActionTargets(state, card)) {
        const stats = goldfishCharacteristics(state, target);
        list.append(cardTile(target, () => answer({ target: goldfishReference(target), confirmLife: true }), `${target.name} ${stats.power}/${stats.toughness}${card.attachedTo?.id === target.id ? "（装着中）" : ""} に装備`));
      }
    } else if (ability.cards) {
      let ids = choice.draft?.ids || [];
      const confirm = action("選択を確定", () => answer({ cards: ids.map((id) => goldfishReference(state[ability.cards.zone].find((item) => item.id === id), ability.cards.zone)), confirmLife: true }), true);
      const render = () => {
        list.replaceChildren();
        for (const item of state[ability.cards.zone]) {
          const selected = ids.includes(item.id);
          const tile = cardTile(item, () => { ids = selected ? ids.filter((id) => id !== item.id) : [...ids, item.id]; saveDraft({ ids }); render(); }, `${selected ? "✓ " : ""}${item.name}`);
          tile.setAttribute("aria-pressed", String(selected));
          tile.disabled = !selected && ids.length >= ability.cards.count; list.append(tile);
        }
        confirm.disabled = ids.length !== ability.cards.count;
        confirm.textContent = ability.cards.zone === "hand" ? `${ids.length}/${ability.cards.count}枚を捨てて起動` : `${ids.length}/${ability.cards.count}枚を追放して起動`;
      };
      render();
    } else action(`ライフ${payment.life}点を含めて支払う`, () => answer({ confirmLife: true }), true);
    action("キャンセル", () => answer({ cancel: true }));
    return true;
  }
  if (choice.type === "engine-legend") {
    title.textContent = "伝説のルール：残す1枚を選ぶ"; paragraph(choice.sourceName);
    const list = document.createElement("div"); list.className = "goldfish-choice-targets"; content.append(list);
    for (const id of choice.ids) {
      const card = state.battlefield.find(c => c.id === id);
      if (!card) continue;
      const details = [];
      if (card.copyBase?.name) details.push(`元のカード：${card.copyBase.name}`);
      details.push(card.tapped ? "タップ状態" : "アンタップ状態");
      const counters = Object.entries(card.counters || {}).filter(([, count]) => count > 0);
      details.push(counters.length ? counters.map(([type, count]) => `${type === "ice" ? "氷" : type} ${count}`).join("・") : "カウンターなし");
      list.append(cardTile(card, () => answer({ keep: id }), `${choice.sourceName} — ${details.join("／")}`));
    }
    return true;
  }
  if (["engine-choice", "engine-target", "engine-entry", "engine-copy-entry", "engine-draw", "engine-combat-crew", "engine-opening", "engine-opening-exile", "cast-preflight", "cleanup"].includes(choice.type)) {
    title.textContent = choice.label; paragraph(choice.sourceName, "goldfish-mana-card-name");
    const list = document.createElement("div"); list.className = "goldfish-choice-targets"; content.append(list);
    if (choice.kind === "division") {
      let allocation = structuredClone(choice.draft?.allocation || []);
      const confirm = action("配分を確定", () => answer({ allocation }), true);
      const update = () => {
        const total = allocation.reduce((n, a) => n + a.amount, 0);
        confirm.textContent = allocation.length ? `${total}/${choice.divideDamage}点で確定` : "対象にしない";
        confirm.disabled = allocation.length ? total !== choice.divideDamage : !choice.optional;
        saveDraft({ allocation });
      };
      for (const option of choice.candidates) {
        const row = document.createElement("label"); row.textContent = option.label;
        const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.max = String(choice.divideDamage);
        input.value = String(allocation.find(a => JSON.stringify(a.target) === JSON.stringify(option.ref))?.amount || 0);
        input.setAttribute("aria-label", `${option.label}へのダメージ`);
        input.addEventListener("input", () => {
          allocation = allocation.filter(a => JSON.stringify(a.target) !== JSON.stringify(option.ref));
          if (Number(input.value) > 0) allocation.push({ target: option.ref, amount: Number(input.value) });
          update();
        });
        row.append(input); list.append(row);
      }
      update();
    } else if (choice.type === "engine-target" && !choice.multipleTargets || choice.kind === "copy-target") {
      for (const option of choice.candidates) {
        const card = goldfishFindObject(state, option.ref);
        if (card) list.append(cardTile(card, () => answer({ target: option.ref })));
        else action(option.label, () => answer({ target: option.ref }));
      }
      if (!choice.min) action("対象にしない", () => answer({ target: null }));
    } else if (choice.kind === "cards") {
      const key = option => option.ref.id ?? `player:${option.ref.player}${option.ref.virtual ? ":virtual" : ""}`;
      let ids = choice.draft?.ids || [];
      const confirm = action("選択を確定", () => answer({ refs: ids.map(id => choice.candidates.find(c => key(c) === id).ref) }), true);
      const render = () => {
        list.replaceChildren();
        for (const option of choice.candidates) {
          const card = goldfishFindObject(state, option.ref), index = ids.indexOf(key(option));
          const select = () => { ids = index >= 0 ? ids.filter(id => id !== key(option)) : [...ids, key(option)]; saveDraft({ ids }); render(); };
          const label = (index >= 0 ? (index + 1) + ". " : "") + option.label;
          const tile = card ? cardTile(card, select, label) : document.createElement("button");
          if (!card) { tile.type = "button"; tile.textContent = label; tile.addEventListener("click", select); }
          tile.disabled = index < 0 && ids.length >= choice.max; tile.setAttribute("aria-pressed", String(index >= 0)); list.append(tile);
        }
        confirm.disabled = ids.length < choice.min || ids.length > choice.max;
        confirm.textContent = ids.length ? ids.length + "枚で確定" : "選ばず進む";
      }; render(); paragraph(choice.min === choice.max ? `${choice.min}枚を選んでください。` : `${choice.min}〜${choice.max}枚を選べます。`);
      if (choice.seen || /順/.test(choice.label || "")) paragraph("並べる場合は、選んだ順が上からの順番です。");
    } else if (choice.kind === "name") {
      const input = document.createElement("input"); input.type = "text"; input.setAttribute("aria-label", choice.label); input.value = choice.draft?.value || "";
      const names = document.createElement("datalist"); names.id = "goldfish-card-names";
      for (const n of choice.names) { const option = document.createElement("option"); option.value = n; names.append(option); }
      input.setAttribute("list", names.id); input.addEventListener("input", () => saveDraft({ value: input.value })); content.append(input, names);
      action("カード名を確定", () => answer({ value: input.value }), true);
    } else if (choice.kind === "comparisons") {
      const inputs = choice.options.map(o => { const row = document.createElement("label"), input = document.createElement("input"); input.type = "checkbox"; input.value = o.value; row.append(input, document.createTextNode(o.label)); content.append(row); return input; });
      paragraph("ライフは画面の値で自動比較します。相手の土地・クリーチャー・手札は必要な条件だけ指定してください。");
      action("条件を確定", () => answer({ values: inputs.filter(i => i.checked).map(i => i.value) }), true);
    } else if (choice.kind === "number") {
      const input = document.createElement("input"); input.type = "number"; input.min = choice.min; input.max = choice.max; input.value = String(choice.draft?.value ?? choice.min); input.setAttribute("aria-label", choice.label); input.addEventListener("input", () => saveDraft({ value: Number(input.value) })); content.append(input);
      action("確定", () => answer({ value: Number(input.value) }), true);
    } else if (choice.kind === "mana") {
      const colors = [];
      for (let i = 0; i < (choice.sameColor ? 1 : choice.count); i++) { const select = document.createElement("select"); for (const color of choice.colors || ["W", "U", "B", "R", "G"]) { const option = document.createElement("option"); option.value = color; option.textContent = color; select.append(option); } select.setAttribute("aria-label", choice.sameColor ? "加えるマナの色" : (i + 1) + "マナ目"); select.value = choice.draft?.colors?.[i] || select.value; colors.push(select); select.addEventListener("change", () => saveDraft({ colors: colors.map(c => c.value) })); content.append(select); }
      action("確定", () => answer({ colors: choice.sameColor ? Array(choice.count).fill(colors[0].value) : colors.map(c => c.value) }), true);
    } else if (choice.kind === "buttons") {
      let values = choice.draft?.values || [];
      for (const option of choice.options) {
        const button = action(option.label, () => {
          if (!choice.multiple) return answer({ value: option.value });
          values = values.includes(option.value) ? values.filter(v => v !== option.value) : [...values, option.value];
          saveDraft({ values }); button.setAttribute("aria-pressed", String(values.includes(option.value)));
        });
      }
      if (choice.multiple) action(choice.multiple + "つで確定", () => answer({ values }), true);
    }
    if (choice.type === "cast-preflight") action("キャンセル", () => answer({ cancel: true }));
    return true;
  }
  if (["cast-target", "cast-sacrifice", "land-count"].includes(choice.type)) {
    const card = goldfishFindObject(state, choice.card);
    title.textContent = choice.type === "cast-target" ? "対象を選ぶ" : choice.type === "cast-sacrifice" ? "生け贄にする山を選ぶ" : "土地を出しましたか？";
    paragraph(choice.sourceName, "goldfish-mana-card-name");
    paragraph("まだコストは支払っていません。確定すると、支払い・誘発へ進みます。");
    if (choice.type === "cast-target") {
      paragraph(goldfishSpellProgram(card)?.label || "対象を選んでください。");
      const list = document.createElement("div"); list.className = "goldfish-choice-targets";
      for (const option of goldfishSpellTargets(state, card, choice.options)) {
        if (option.card) list.append(cardTile(option.card, () => answer({ target: option.ref }), option.label));
        else { const button = document.createElement("button"); button.type = "button"; button.className = "goldfish-player-target"; button.textContent = option.label; button.addEventListener("click", () => answer({ target: option.ref })); list.append(button); }
      }
      content.append(list);
    } else if (choice.type === "cast-sacrifice") {
      for (const land of goldfishFlashbackSacrifices(state, card)) content.append(cardTile(land, () => answer({ sacrifice: goldfishReference(land) })));
    } else {
      paragraph("以前の保存データには土地の回数がありません。このターンに手札や追放からプレイした回数を一度だけ指定してください。フェッチで出した土地は含みません。");
      action("まだ出していない → この土地を出す", () => answer({ count: 0 }), true);
      action("すでに出した → 今回は中止", () => answer({ count: 1 }));
    }
    action("キャンセル", () => answer({ cancel: true }));
    return true;
  }
  if (choice.type === "bauble-target") {
    title.textContent = "どちらの山札を見ますか？";
    paragraph("確定するとガラクタを生け贄にします。ドローは次のターンのアップキープです。");
    action("自分の山札", () => answer({ player: "self" }), true);
    action("相手の山札（カード表示なし）", () => answer({ player: "opponent" }));
    action("キャンセル", () => answer({ cancel: true }));
    return true;
  }
  if (choice.type === "bauble-look") {
    title.textContent = "ガラクタ：山札の一番上";
    const card = state.library.find((item) => item.id === choice.cardId);
    if (card) content.append(cardTile(card));
    else paragraph(choice.player === "opponent" ? "相手の山札は用意していないため表示しません。" : "山札が空です。");
    paragraph("カードは動かしません。次のターンのアップキープに1枚引きます。");
    action("確認した", () => answer({ acknowledge: true }), true);
    return true;
  }
  if (choice.type === "attack") {
    title.textContent = "攻撃するクリーチャーを選ぶ";
    paragraph("ブロックなしの戦闘です。宣言後、ダメージの前に強化呪文を唱えられます。");
    const available = goldfishAttackers(state);
    let ids = choice.draft?.ids || available.filter((item) => item.required).map((item) => item.card.id);
    const list = document.createElement("div"); list.className = "goldfish-choice-targets"; content.append(list);
    const confirm = action("選んだクリーチャーで攻撃", () => answer({ ids }), true);
    const render = () => {
      list.replaceChildren();
      for (const item of available) {
        const selected = ids.includes(item.card.id);
        const tile = cardTile(item.card, () => {
          ids = selected ? ids.filter((id) => id !== item.card.id) : [...ids, item.card.id];
          saveDraft({ ids }); render();
        }, `${selected ? "✓ " : ""}${item.card.name} ${item.power}/${item.toughness}${item.reason ? ` — ${item.reason}` : item.required ? " — 可能なら攻撃" : ""}`);
        tile.disabled = Boolean(item.reason) || !Number.isFinite(item.power); tile.setAttribute("aria-pressed", String(selected)); list.append(tile);
      }
      confirm.textContent = `${ids.length}体で攻撃を宣言`;
      confirm.disabled = available.some((item) => item.required && !ids.includes(item.card.id));
    };
    action("攻撃できる全員を選ぶ", () => { ids = available.filter((item) => !item.reason && Number.isFinite(item.power)).map((item) => item.card.id); saveDraft({ ids }); render(); });
    action("キャンセル", () => answer({ cancel: true }));
    render(); return true;
  }
  if (!choice.type.startsWith("spell-")) return false;
  paragraph(choice.sourceName, "goldfish-mana-card-name");
  if (choice.type === "spell-arrange") {
    title.textContent = ({ scry: "占術", surveil: "諜報", iteration: "3枚の行き先を選ぶ", sleight: "手札に入れるカードを選ぶ", order: "山札の上を並べる" })[choice.mode];
    const destinations = choice.mode === "scry" ? ["top", "bottom"] : choice.mode === "surveil" ? ["top", "graveyard"] : choice.mode === "iteration" ? ["hand", "bottom", "exile"] : choice.mode === "sleight" ? ["hand", "bottom"] : ["top"];
    const names = { top: "山札の上", bottom: "山札の下", graveyard: "墓地", hand: "手札", exile: "追放（このターン使用可）" };
    let allocation = choice.draft?.allocation || choice.cardIds.map((id, index) => ({ id, destination: ["iteration", "sleight"].includes(choice.mode) ? destinations[index] : "top" }));
    paragraph(["iteration", "sleight"].includes(choice.mode) ? "各カードの行き先を選んで確定してください。追放からも通常のコストでプレイできます。" : "上に並ぶカードほど先に引きます。行き先と順番を選び、確定すると次の処理へ進みます。");
    const list = document.createElement("div"); list.className = "goldfish-arrange-list"; content.append(list);
    const render = () => {
      list.replaceChildren();
      allocation.forEach((row, index) => {
        const card = state.library.find((item) => item.id === row.id);
        const tile = cardTile(card, null, `${index + 1}. ${card.name}`);
        const controls = document.createElement("div"); controls.className = "goldfish-arrange-controls";
        const select = document.createElement("select"); select.setAttribute("aria-label", `${card.name}の行き先`);
        for (const destination of destinations) { const option = document.createElement("option"); option.value = destination; option.textContent = names[destination]; select.append(option); }
        select.value = row.destination;
        select.addEventListener("change", () => { row.destination = select.value; saveDraft({ allocation }); refresh(); });
        controls.append(select);
        if (!["iteration", "sleight"].includes(choice.mode) && allocation.length > 1) for (const [delta, name] of [[-1, "先に引く"], [1, "後に引く"]]) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = delta < 0 ? "↑" : "↓"; button.setAttribute("aria-label", `${card.name}を${name}`);
          button.disabled = index + delta < 0 || index + delta >= allocation.length;
          button.addEventListener("click", () => { [allocation[index], allocation[index + delta]] = [allocation[index + delta], allocation[index]]; saveDraft({ allocation }); render(); }); controls.append(button);
        }
        tile.append(controls); list.append(tile);
      });
    };
    const confirm = action("この内容で解決を続ける", () => answer({ allocation }), true);
    const refresh = () => {
      confirm.disabled = ["iteration", "sleight"].includes(choice.mode) && (allocation.filter((row) => row.destination === "hand").length !== 1 || allocation.filter((row) => row.destination === "bottom").length !== Math.min(1, allocation.length - 1) || allocation.filter((row) => row.destination === "exile").length !== Math.max(0, allocation.length - 2));
    };
    render(); refresh();
  } else if (choice.type === "spell-return") {
    const discard = choice.destination === "graveyard";
    title.textContent = discard ? `捨てる手札を${choice.count}枚選ぶ` : `手札${choice.count}枚を山札の上へ`;
    paragraph(discard ? "捨てるカードを押してください。もう一度押すと選択を外せます。" : "次に引く順にカードを押してください。もう一度押すと選択を外せます。");
    let ids = choice.draft?.ids || [];
    const list = document.createElement("div"); list.className = "goldfish-choice-targets"; content.append(list);
    const confirm = action(discard ? `選んだ${choice.count}枚を捨てる` : "この順で山札の上へ戻す", () => answer({ ids }), true);
    const render = () => {
      list.replaceChildren();
      for (const id of choice.cardIds) {
        const card = state.hand.find((item) => item.id === id);
        const index = ids.indexOf(id);
        const tile = cardTile(card, () => { if (index >= 0) ids = ids.filter((value) => value !== id); else if (ids.length < choice.count) ids.push(id); saveDraft({ ids }); render(); }, `${index >= 0 ? `${index + 1}番目：` : ""}${card.name}`);
        tile.setAttribute("aria-pressed", String(index >= 0)); list.append(tile);
      }
      confirm.disabled = ids.length !== choice.count;
    }; render();
  } else if (choice.type === "spell-shuffle") {
    title.textContent = "シャッフルしますか？";
    paragraph("この後、1枚引きます。");
    action("この並び順で引く", () => answer({ shuffle: false }), true);
    action("シャッフルして引く", () => answer({ shuffle: true }));
  } else if (choice.type === "spell-mana") {
    title.textContent = `${choice.count}マナの色を選ぶ`;
    const colors = choice.draft?.colors || Array(choice.count).fill("U");
    for (let index = 0; index < choice.count; index += 1) {
      const label = document.createElement("label"); label.textContent = `${index + 1}点目 `;
      const select = document.createElement("select"); select.setAttribute("aria-label", `${index + 1}点目のマナ`);
      for (const [color, name] of [["W", "白"], ["U", "青"], ["B", "黒"], ["R", "赤"], ["G", "緑"]]) { const option = document.createElement("option"); option.value = color; option.textContent = `${name} ${color}`; select.append(option); }
      select.value = colors[index]; select.addEventListener("change", () => { colors[index] = select.value; saveDraft({ colors }); }); label.append(select); content.append(label);
    }
    action("マナを加えて1枚引く", () => answer({ colors }), true);
  }
  return true;
}
