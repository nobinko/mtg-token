// Gameplay reminder inventory, checked against paper prints and CR 2026-09-25.
// IDs locate a reference print; normal print selection still enforces product,
// language and release-date policy. Do not accept arbitrary Card/combo_piece links.
export const auxiliaryRules = [
  {
    id: "city-blessing", name: "City's Blessing", japaneseName: "都市の承認", category: "都市の承認",
    hint: "昇殿（都市の承認）", keywords: /^ascend$/i, pattern: /\bascend\b|\bcity['’]s blessing\b/i,
    search: ['keyword:ascend', 'o:"city\'s blessing"'], referenceId: "0f6a6dc8-1c3c-45d2-be4f-bfab58a5a66f",
    note: "昇殿で得る「都市の承認」を示す補助カード。昇殿を持つパーマネントをコントロールしているとき、または昇殿を持つ呪文の解決時に、パーマネントが10個以上なら得る。一度得たら、その後10個未満になってもゲーム終了まで維持する。"
  },
  {
    id: "enduring-story", name: "Enduring Story", japaneseName: "不朽の物語", category: "不朽の物語",
    hint: "物語り（不朽の物語）", keywords: /^storied$/i, pattern: /\bstoried\b|\benduring story\b/i,
    search: ['o:storied', 'o:"enduring story"'], referenceId: "53bfaac7-07cf-4637-8f64-aba93ec7fd1a",
    note: "物語りで得た「不朽の物語」を記録する。アーティファクト・伝説・英雄譚のいずれかであるパーマネントが合計3つ以上必要。同じパーマネントを重複して数えず、一度得たらゲーム終了まで維持する。"
  },
  {
    id: "monarch", name: "The Monarch", japaneseName: "統治者", category: "統治者",
    hint: "統治者", pattern: /\b(?:the|a) monarch\b/i, search: ['o:monarch'],
    referenceId: "11608fa5-2c53-4008-ad82-555380f5e6f1",
    note: "現在の統治者を示す。統治者の終了ステップ開始時に1枚引く。統治者へ戦闘ダメージを与えたクリーチャーのコントローラーへ移る。"
  },
  {
    id: "initiative", name: "Undercity // The Initiative", aliases: ["Undercity", "The Initiative"], japaneseName: "地下街／イニシアチブ", category: "イニシアチブ・地下街",
    hint: "イニシアチブ（地下街）", pattern: /\b(?:the initiative|venture into Undercity)\b/i,
    search: ['o:"the initiative"', 'o:"venture into Undercity"'], referenceId: "2c65185b-6cf0-451d-985e-56aa45d9a57d", dungeon: true,
    note: "イニシアチブの所有者とダンジョンの現在位置を示す。獲得時と自分のアップキープに地下街探索を行う。通常のダンジョン探索では地下街を開始できない。部屋から出る宝物と4/1威迫のスケルトンも用意する。"
  },
  ...[
    ["dungeon-mad-mage", "Dungeon of the Mad Mage", "狂える魔道士の迷宮", "6f509dbe-6ec7-4438-ab36-e20be46c9922"],
    ["dungeon-lost-mine", "Lost Mine of Phandelver", "ファンデルヴァーの失われた鉱山", "59b11ff8-f118-4978-87dd-509dc0c8c932"],
    ["dungeon-tomb", "Tomb of Annihilation", "魂を喰らう墓", "70b284bd-7a8f-4b60-8238-f746bdc5b236"]
  ].map(([id, name, japaneseName, referenceId]) => ({
    id, name, japaneseName, referenceId, category: "ダンジョン", hint: "ダンジョン探索（3種類の選択肢）", dungeon: true,
    pattern: /\bventure into (?:the|a) dungeon\b/i, keywords: /^venture into the dungeon$/i, search: ['o:"venture into the dungeon"', 'o:"venture into a dungeon"'],
    note: "通常のダンジョン探索で選べる3種類のうち1つ。入る前は3種類とも選択肢として用意し、探索中は現在の部屋を示す。部屋から出るトークンも準備表に含める。"
  })),
  {
    id: "ring", name: "The Ring // The Ring Tempts You", aliases: ["The Ring"], japaneseName: "指輪（指輪の誘惑）", category: "指輪の誘惑",
    hint: "指輪の誘惑・指輪所持者", pattern: /\bthe Ring (?:tempts|has tempted)|\bRing-bearer\b/i,
    search: ['o:"the Ring tempts"', 'o:"Ring-bearer"', 'o:"Ring has tempted"'], referenceId: "7215460e-8c06-47d0-94e5-d1832d0218af",
    note: "指輪の紋章で解放済みの能力と、現在の指輪所持者を示す。誘惑のたびに次の能力を得て所持者を選ぶ。クリーチャーがいなくても紋章の段階は進む。"
  },
  {
    id: "day-night", name: "Day // Night", aliases: ["Day/Night marker"], japaneseName: "昼／夜", category: "昼夜",
    hint: "昼夜（現在の昼・夜を追跡）", keywords: /^(?:daybound|nightbound)$/i,
    pattern: /\b(?:daybound|nightbound)\b|\b(?:becomes|neither|it's|is) (?:day|night)\b/i,
    search: ['o:daybound', 'o:nightbound', 'o:"becomes day"', 'o:"becomes night"', 'o:"neither day"'], referenceId: "dc26e13b-7a0f-4e7f-8593-4f22234f4517",
    note: "ゲーム全体の昼／夜を示す補助。ターン開始時、前ターンのアクティブ・プレイヤーが呪文を唱えなかったなら昼→夜、2回以上唱えたなら夜→昼。カードの効果による変更も追跡する。"
  },
  {
    id: "speed", name: "Start Your Engines! // Max Speed", aliases: ["Start Your Engines helper", "Start Your Engines!"], japaneseName: "エンジン始動！／最高速度", category: "速度",
    hint: "エンジン始動（速度）", keywords: /^start your engines!?$/i, pattern: /\bstart your engines\b|\bmax speed\b|\byour speed\b/i,
    search: ['o:"Start Your Engines"', 'o:"max speed"', 'o:"your speed"'], referenceId: "c287becf-fc36-4c58-9d53-7b5870174c7d",
    note: "自分の速度を1〜4で記録する。速度が1以上なら、自分のターンに対戦相手がライフを失ったとき、毎ターン1回だけ速度が上がる。最高速度は4。"
  },
  {
    id: "energy", name: "Energy Reserve", japaneseName: "エネルギー・リザーブ", category: "エネルギー",
    hint: "エネルギー（プレイヤーのカウンター）", pattern: /\{E\}|\benergy counters?\b/i, search: ['o:"{E}"', 'o:"energy counter"'],
    referenceId: "1c516212-ad39-4396-8e05-ae57f100309f", note: "プレイヤーが持つエネルギーの総数を示す補助。発生源が戦場を離れても残る。増減はダイス等で記録できる。"
  },
  {
    id: "poison", name: "Poison Counter", japaneseName: "毒カウンター", category: "毒カウンター",
    hint: "毒カウンター", keywords: /^(?:infect|toxic|poisonous)$/i, pattern: /\b(?:infect|toxic|poisonous)\b|\bpoison counters?\b/i,
    search: ['o:infect', 'o:toxic', 'o:poisonous', 'o:"poison counter"'], referenceId: "8a9cb417-8709-4336-be36-2fb0cea31fe1",
    note: "プレイヤーごとの毒カウンターを記録する補助。通常は10個以上で敗北する。双頭巨人戦はチームで15個。ダイス等でも管理できる。"
  },
  {
    id: "experience", name: "Experience", japaneseName: "経験カウンター", category: "経験カウンター", hint: "経験カウンター",
    pattern: /\bexperience counters?\b/i, search: ['o:"experience counter"'], referenceId: "1374bfa2-9714-486d-90aa-7a9b8d8ef3a8",
    note: "プレイヤーが持つ経験カウンターを示す。クリーチャー上のカウンターと区別し、発生源が戦場を離れても保持する。ダイス等で数を記録する。"
  },
  {
    id: "radiation", name: "Radiation", japaneseName: "放射能", category: "放射能", hint: "放射能カウンター",
    pattern: /\brad counters?\b/i, search: ['o:"rad counter"'], referenceId: "0886657d-afb0-4f1f-9af7-960724793077",
    note: "プレイヤーの放射能カウンターを示す。戦闘前メイン・フェイズにその数だけ切削し、切削した土地でないカード1枚につき1点のライフとカウンター1個を失う。"
  },
  {
    id: "foretell", name: "Foretell", japaneseName: "予顕", category: "予顕", hint: "予顕（裏向きの追放）",
    keywords: /^foretell$/i, pattern: /\bforetell\b|\bforetold\b/i, search: ['o:foretell', 'o:foretold'], referenceId: "207b3d62-2541-4a51-8152-3c54218ab6f7",
    note: "予顕して裏向きに追放したカードと追放ターンを区別する。後のターンに予顕コストで通常のタイミングに従って唱える。裏向きの戦場のクリーチャーとは別。"
  },
  {
    id: "adventure", name: "On an Adventure", japaneseName: "出来事中", category: "出来事", hint: "出来事（追放中の本体）",
    keywords: /^adventure$/i, layout: "adventure", pattern: /\bon an adventure\b|\bAdventure spell\b/i,
    search: ['keyword:adventure', 'o:"on an adventure"'], referenceId: "5e289bb3-f6de-450d-9f7e-77e2e70cb7cc",
    note: "出来事の解決で追放したカードを示す。本体を追放領域から通常の条件でプレイできる。出来事が打ち消された場合など、出来事の解決で追放していないカードは含めない。"
  },
  {
    id: "plot", name: "Plot", aliases: ["Plotted card marker"], japaneseName: "計画済み", category: "計画マーカー",
    hint: "計画（Plot・計画済み）", keywords: /^plot$/i, pattern: /\bplot\s+\{|\bplotted\b|\b(?:has|have|gains?)\s+plot\b/i,
    search: ['keyword:plot', 'o:plotted', 'o:plot'], referenceId: "f07677af-88a4-4ff5-b591-e1e3ac05235d",
    note: "計画済みのカードを追放領域で区別する。計画したターンには唱えられず、後のターンにソーサリーのタイミングでマナ・コストを支払わずに唱える。追加コストは別途必要。"
  },
  {
    id: "manifest", name: "Manifest", aliases: ["Face-down / Manifest helper"], japaneseName: "予示／戦慄予示", category: "裏向き",
    hint: "裏向き（予示・戦慄予示）", keywords: /^manifest(?: dread)?$/i, pattern: /\bmanifests?(?: dread)?\b/i,
    search: ['o:manifest'], referenceId: "0eb1e449-d7ce-4d87-a589-7ae5e3f0951d",
    note: "予示・戦慄予示したカードに重ねる補助。基本は無色の2/2で能力を持たない。クリーチャー・カードならマナ・コストを払い表向きにできる。変異等の別の方法があればそれも使える。"
  },
  {
    id: "morph", name: "Morph", japaneseName: "変異／大変異", category: "裏向き", hint: "裏向き（変異・大変異）",
    keywords: /^(?:morph|megamorph)$/i, pattern: /\b(?:morph|megamorph)\b/i, search: ['o:morph', 'o:megamorph'], referenceId: "5430da88-b72e-4d64-bd3c-b21062cac1c2",
    note: "変異・大変異で出した裏向きの2/2を示す。表向きにするには該当する変異コストを支払う。大変異で表向きになった場合は+1/+1カウンターも置く。"
  },
  {
    id: "cloak", name: "Cloaked card marker", japaneseName: "偽装（2/2・護法{2}）", category: "裏向き", hint: "裏向き（偽装・護法{2}）",
    keywords: /^cloak$/i, pattern: /\bcloak(?:s|ed)?\b/i, search: ['o:cloak'],
    note: "偽装したカードに重ねる補助。裏向きでは無色の2/2で護法{2}を持つ。クリーチャー・カードならマナ・コストを払って表向きにできる。予示とは護法の有無が違う。"
  },
  {
    id: "disguise", name: "Disguised card marker", japaneseName: "変装（2/2・護法{2}）", category: "裏向き", hint: "裏向き（変装・護法{2}）",
    keywords: /^disguise$/i, pattern: /\bdisguise\b/i, search: ['o:disguise'],
    note: "変装で出したカードに重ねる補助。裏向きでは無色の2/2で護法{2}を持つ。表向きにするには変装コストを支払う。偽装の表向きにする条件とは異なる。"
  },
  {
    id: "warp", name: "Warped card marker", japaneseName: "ワープ・追放中マーカー", category: "ワープ追跡",
    hint: "ワープ: 終了ステップの追放・後のターンの再唱", keywords: /^warp$/i, pattern: /\bwarp\s+\{|\b(?:has|have|gains?)\s+warp\b/i, search: ['keyword:warp', 'o:warp'],
    note: "ワープで唱えたパーマネントは次の終了ステップ開始時に追放。追放したターンとカードを記録し、後のターンに通常のタイミング・コストで唱えられる状態を区別する。追放領域からワープ・コストは使えない。"
  },
  {
    id: "prepared", name: "Prepared state marker", japaneseName: "準備済み／未準備マーカー", category: "準備済み状態",
    hint: "準備済み状態（Prepare）", keywords: /^(?:prepare|prepared)$/i, pattern: /\bprepared\b|\bprepare (?:a|an|another|each|every|up to|target|that|this|it|them|all)\b/i,
    layout: "prepare", search: ['o:prepared', 'o:prepare', 'layout:prepare'],
    note: "ゲーム中の「準備済み／未準備」を示す補助。準備済みの間、対応する準備呪文のコピーを追放領域から通常のタイミングでコストを払い唱えられる。唱えると未準備になり、戦場を離れてもそのコピーは使えなくなる。"
  },
  {
    id: "companion", name: "Companion", japaneseName: "相棒（公開時のみ）", category: "相棒", hint: "相棒として公開する場合の補助",
    keywords: /^companion$/i, pattern: /\bcompanion\b/i, search: ['keyword:companion'], referenceId: "6b95e8bd-2686-4790-afeb-9b17d482f156",
    note: "相棒として公開して使う場合だけ用意する。メイン／サイドに通常採用するだけなら不要。現行ルールはソーサリーのタイミングに{3}を払い1回だけ手札へ加える。古い補助カードの「直接唱える」という説明は使わない。"
  },
  {
    id: "substitute", name: "Double-Faced Substitute Card", japaneseName: "両面カード用差し替えカード（必要な場合）", category: "両面カード補助",
    hint: "両面カードの差し替え（必要な場合）", layouts: ["transform", "modal_dfc", "meld", "reversible_card"],
    search: ['layout:transform', 'layout:modal_dfc', 'layout:meld'], referenceId: "d96ed5bd-b45c-4de0-99f7-aeb4071a80a2",
    note: "両面／合体カードを非公開領域で代用する場合の補助。不透明スリーブ等で足りるなら不要。差し替えるカード名を明記し、実物も用意する。表向きの公開領域では実物を使う。"
  },
  {
    id: "storm", name: "Storm Counter", japaneseName: "ストーム・カウント", category: "呪文回数", hint: "ストーム（このターンの呪文回数）",
    keywords: /^storm$/i, pattern: /\bstorm\s*(?:\(|$)|\b(?:number of|each) spells? (?:you['’]ve |you have |you )?cast (?:before it )?this turn\b/i,
    search: ['keyword:storm', 'o:"cast this turn"'], referenceId: "1c9fc622-bc1d-4be0-9f47-e753e18b4d78",
    note: "このターンに唱えた呪文を数える補助。コピーしただけの呪文は数えない。ストーム自身より前に、対戦相手も含めて唱えた呪文を数える。"
  },
  ...[
    ["gravestorm", "Gravestorm count marker", "墓地ストーム・墓地へ置かれた数", /\bgravestorm\b/i, 'keyword:gravestorm', "このターンに戦場から墓地へ置かれたパーマネント数を記録する。トークンも含む。呪文回数を数えるストームとは別の補助。"],
    ["unearth", "Unearthed marker", "蘇生・終了ステップの追放", /\bunearth(?:ed)?\b/i, 'keyword:unearth', "蘇生で戻したパーマネントを示す。速攻を持ち、次の終了ステップに追放される。それより前に戦場を離れる場合も、他の領域へ置く代わりに追放する。"],
    ["dash", "Dashed marker", "疾駆・終了ステップに手札へ", /\bdash\b/i, 'keyword:dash', "疾駆コストで唱えたパーマネントを示す。速攻を持ち、次の終了ステップ開始時にオーナーの手札へ戻す。通常のコストで唱えたものと区別する。"],
    ["blitz", "Blitzed marker", "奇襲・終了ステップに生け贄", /\bblitz\b/i, 'keyword:blitz', "奇襲コストで唱えたパーマネントを示す。速攻と死亡時の1枚ドローを持ち、次の終了ステップ開始時に生け贄にする。追放された場合には死亡時のドローは誘発しない。"],
    ["phasing", "Phased-out marker", "フェイズ・アウト中", /\bphasing\b|\bphas(?:e|es|ed) (?:in|out)\b/i, 'o:phas', "フェイズ・アウト中のパーマネントをタップ状態と区別する。通常は自分のアンタップ・ステップに戻るが、特定の期限や条件を指定する効果もある。戦場を出入りした扱いにはしない。"],
    ["champion", "Championed card marker", "覇権・追放したカード", /\bchampion (?:a|an|another)\b|\bchampioned\b/i, 'keyword:champion', "覇権で追放したカードと発生源を対応付ける。発生源が戦場を離れたときに戻すカードを区別し、複数の覇権カードを混同しない。"],
    ["suspend", "Suspended card marker", "待機中", /\bsuspend\b|\bsuspended\b/i, 'o:suspend', "待機で追放中のカードと時間カウンターを示す。最後のカウンターが取り除かれたときの誘発を処理し、唱えられるかを確認する。"],
    ["rebound", "Rebound card marker", "反復・次のアップキープ", /\brebound\b/i, 'o:rebound', "手札から唱えた反復呪文の解決で追放したカードを示す。次の自分のアップキープに1回だけ、コストを払わず唱えてよい。唱えない場合も繰り返し誘発しない。"],
    ["hideaway", "Hideaway card marker", "秘匿・裏向きの追放", /\bhideaway\b/i, 'o:hideaway', "秘匿で裏向きに追放したカードを発生源と対応付ける。公開・プレイできる条件とコストは発生源の能力を確認する。予顕や予示と混同しない。"],
    ["imprint", "Imprinted card marker", "刻印・関連する追放カード", /\bimprint\b/i, 'o:imprint', "刻印で追放したカードを発生源と対応付ける。参照する特性やプレイできる条件はそれぞれの発生源を確認する。"],
    ["cipher", "Encoded card marker", "暗号・暗号化先", /\bcipher\b|\bencoded on\b/i, 'o:cipher', "暗号で追放した呪文を、暗号化したクリーチャーと対応付ける。クリーチャーが戦場を離れた後に同名のカードが戻っても対応は引き継がない。"],
    ["haunt", "Haunted card marker", "憑依・憑依先", /\bhaunt(?:s|ing)?\b/i, 'o:haunt', "追放された憑依カードと憑依先のクリーチャーを対応付ける。憑依先が死亡したときの能力を確認するための補助。"],
    ["airbend", "Airbent card marker", "エアベンド・カード・マーカー", /\bairbend\b|\bairbent\b/i, 'o:airbend', "エアベンドで追放されたカードを発生源と区別して置く。所有者は通常のタイミングで{2}を支払い、マナ・コストを支払わず唱えてよい。"],
    ["paradigm", "Paradigm card marker", "パラダイム・カード・マーカー", /\bparadigm\b/i, 'o:paradigm', "パラダイムで解決後に追放したカードを示す。毎ターン最初のメイン・フェイズに生成するコピーと、追放中の実物を区別する。"],
    ["exert", "Exerted marker", "督励・次のアンタップを飛ばす", /\bexert(?:s|ed)?\b/i, 'o:exert', "督励したパーマネントを示す。自分の次のアンタップ・ステップではアンタップしない。そのステップを過ぎたらこの印を外す。"],
    ["exhaust", "Exhaust used marker", "消尽・起動済み", /\bexhaust\b/i, 'keyword:exhaust', "消尽能力を起動済みか記録する。能力ごとに1回だけ起動可能。戦場を離れて戻ったものは新しいオブジェクトとして扱う。"],
    ["monstrous", "Monstrous marker", "怪物的", /\bmonstrosity\b|\bmonstrous\b/i, 'o:monstr', "怪物化したパーマネントの「怪物的」を示す。+1/+1カウンターがなくなっても怪物的のまま。カウンターの数とは別に記録する。"],
    ["renowned", "Renowned marker", "高名", /\brenown(?:ed)?\b/i, 'o:renown', "高名になったクリーチャーを示す。+1/+1カウンターがなくなっても高名のままなので、カウンターだけで判別しない。"],
    ["suspected", "Suspected marker", "容疑・威迫／ブロック不可", /\bsuspect(?:ed|s)?\b/i, 'o:suspect', "容疑をかけられたクリーチャーを示す。容疑中は威迫を持ちブロックできない。効果で容疑が晴れるか、戦場を離れるまで追跡する。"],
    ["solved", "Solved case marker", "事件・解明済み", /\bto solve\b|\bsolved\b/i, 't:case', "事件が解明済みかを示す。解明条件を後で満たさなくなっても解明済みのまま。どの事件に対応する印かを区別する。"],
    ["goad", "Goaded marker", "使嗾・期限／使嗾した人", /\bgoad(?:ed|s)?\b/i, 'o:goad', "使嗾されたクリーチャー、使嗾したプレイヤー、期限を記録する。継続的に使嗾する能力もあるため、解除の条件は発生源を確認する。"],
    ["detain", "Detained marker", "留置・期限", /\bdetain(?:ed|s)?\b/i, 'o:detain', "留置したパーマネントと留置した人を示す。その人の次のターンまで攻撃・ブロック・起動型能力の起動ができない。"],
    ["soulbond", "Paired marker", "結魂・組の対応", /\bsoulbond\b|\bpaired with\b/i, 'o:soulbond', "結魂で組にした2体を対応付ける。どちらかが戦場を離れる、クリーチャーでなくなる、コントローラーが変わる等で組が解消する。"],
    ["room", "Room unlocked marker", "部屋・開放済みのドア", /\bunlock(?:ed)?\b|\blocked (?:half|door)\b/i, 't:room', "部屋の左右どちらのドアが開放済みかを示す。片方または両方を開放でき、現在有効な能力を区別する。両面カードとは異なる。"]
  ].map(([id, name, japaneseName, pattern, search, note]) => ({ id, name, japaneseName, category: japaneseName.split("・")[0], hint: japaneseName, pattern,
    ...(id === "room" ? { typePattern: /\bRoom\b/i } : id === "solved" ? { typePattern: /\bCase\b/i } : {}), search: [search], note })),
  {
    id: "class", name: "Class level marker", japaneseName: "クラス・現在のレベル", category: "クラス", hint: "クラスのレベル",
    typePattern: /\bClass\b/i, search: ['t:class'], note: "クラスごとの現在のレベルを示す。クラスのレベルはカウンターではなく、レベルアップした後はそれ以前のレベルの能力も保持する。"
  }
];

export function auxiliaryForObject(item) {
  return auxiliaryRules.find(rule => (item.auxiliaryId && rule.id === item.auxiliaryId)
    || rule.name === item.name || rule.aliases?.includes(item.name));
}

export function auxiliaryRulesFor(card) {
  let text = [card.oracle_text, ...(card.card_faces || []).map(face => face.oracle_text)].filter(Boolean).join("\n");
  // Self-references such as Monstrous War-Leech or O-Kagachi Made Manifest
  // are names, not mechanic instructions. Faces can reference either name.
  const names = [card.name, ...(card.card_faces || []).map(face => face.name)].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of names) text = text.replaceAll(name, "this card");
  return auxiliaryRules.filter(rule => (rule.layout && card.layout === rule.layout) || rule.layouts?.includes(card.layout)
    || rule.typePattern?.test(card.type_line || "") || (card.keywords || []).some(keyword => rule.keywords?.test(keyword))
    || rule.pattern?.test(text));
}

export function isPreparationRelatedObject(part) {
  const type = part.type_line || "";
  if (/\btoken\b|\bemblem\b/i.test(type) || /^(?:token|emblem)$/.test(part.component || "")) return true;
  const rule = auxiliaryForObject(part);
  return Boolean(rule?.referenceId && (/\bCard\b|\bDungeon\b/.test(type)
    || (["manifest", "morph"].includes(rule.id) && /^Creature\b/.test(type))));
}

export const auxiliarySearchTerms = [...new Set(auxiliaryRules.flatMap(rule => rule.search))];
