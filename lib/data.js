import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const tokenJapaneseNameMap = new Map([
  ["Treasure", "宝物"],
  ["Food", "食物"],
  ["Clue", "手掛かり"],
  ["Blood", "血"],
  ["Map", "地図"],
  ["Powerstone", "パワーストーン"],
  ["Copy", "コピー"],
  ["Copy token / copy marker", "コピー・トークン/コピー用マーカー"],
  ["Face-down / Manifest helper", "裏向き/予示用補助"],
  ["Drone", "ドローン"],
  ["Lander", "着陸船"],
  ["Faerie", "フェアリー"],
  ["Scion of the Deep", "深海の末裔"],
  ["Kithkin", "キスキン"],
  ["Detective", "探偵"],
  ["Skeleton Pirate", "スケルトン・海賊"],
  ["Skeleton", "スケルトン"],
  ["Ox", "雄牛"],
  ["Elk", "大鹿"],
  ["Goat", "ヤギ"],
  ["Boar", "猪"],
  ["Wolf", "狼"],
  ["Bear", "熊"],
  ["Horse", "馬"],
  ["Pegasus", "ペガサス"],
  ["Squirrel", "リス"],
  ["Badger", "アナグマ"],
  ["Mole", "モグラ"],
  ["Snake", "蛇"],
  ["Spider", "蜘蛛"],
  ["Turtle", "海亀"],
  ["Wurm", "ワーム"],
  ["Fractal", "フラクタル"],
  ["Inkling", "墨獣"],
  ["Mutagen", "ミュータジェン"],
  ["Golem", "ゴーレム"],
  ["Gnome", "ノーム"],
  ["Rat", "ネズミ"],
  ["Elf Warrior", "エルフ・戦士"],
  ["Army", "軍団"],
  ["Incubator", "培養器"],
  ["Fish", "魚"],
  ["Otter", "カワウソ"],
  ["Monk", "モンク"],
  ["Robot", "ロボット"],
  ["Construct", "構築物"],
  ["Servo", "霊気装置"],
  ["Drake", "ドレイク"],
  ["Soldier", "兵士"],
  ["Human Soldier", "人間・兵士"],
  ["Pilot", "操縦士"],
  ["Vehicle", "機体"],
  ["Ally", "同盟者"],
  ["Bat", "コウモリ"],
  ["Rabbit", "兎"],
  ["Wall", "壁"],
  ["Horror", "ホラー"],
  ["Toy", "玩具"],
  ["Warrior", "戦士"],
  ["Assassin", "暗殺者"],
  ["Berserker", "狂戦士"],
  ["Cleric", "クレリック"],
  ["Druid", "ドルイド"],
  ["Knight", "騎士"],
  ["Wizard", "ウィザード"],
  ["Rogue", "ならず者"],
  ["Pirate", "海賊"],
  ["Samurai", "侍"],
  ["Ninja", "忍者"],
  ["Merfolk", "マーフォーク"],
  ["Shark", "サメ"],
  ["Demon", "デーモン"],
  ["Angel", "天使"],
  ["Dragon", "ドラゴン"],
  ["Insect", "昆虫"],
  ["Saproling", "苗木"],
  ["Citizen", "市民"],
  ["Mercenary", "傭兵"],
  ["Mouse", "ハツカネズミ"],
  ["Raccoon", "アライグマ"],
  ["Lizard", "トカゲ"],
  ["Frog", "カエル"],
  ["Glimmer", "光霊"],
  ["Zombie", "ゾンビ"],
  ["Spirit", "スピリット"],
  ["Goblin", "ゴブリン"],
  ["Shaman", "シャーマン"],
  ["Illusion", "イリュージョン"],
  ["Germ", "細菌"],
  ["Pest", "邪魔者"],
  ["Thopter", "飛行機械"],
  ["Bird", "鳥"],
  ["Cat", "猫"],
  ["Dog", "犬"],
  ["Beast", "ビースト"],
  ["Elemental", "エレメンタル"],
  ["Dinosaur", "恐竜"],
  ["Vampire", "吸血鬼"],
  ["Phyrexian", "ファイレクシアン"]
]);

// Wizards公式のCard Image Gallery / token記事から確認できた画像を優先するための上書き表。
// 公式ページはセットごとに構造が違うため、安定APIとして自動収集せず、確認済みURLだけを手で登録する。
// 例:
// { name: "Fish", set: "BLB", lang: "en", image: "https://magic.wizards.com/...", sourceUrl: "https://magic.wizards.com/..." }
export const officialImageOverrides = [];

export const mtgJpProductIds = new Map([
  ["ecl", "0000305"]
]);

export const officialJapaneseCardOverrides = new Map([
  [
    "ecl|Oko, Lorwyn Liege // Oko, Shadowmoor Scion",
    {
      japaneseName: "ローウィンの主、オーコ // シャドウムーアの末裔、オーコ",
      printedText: "あなたの第１メイン・フェイズの開始時に、{G}を支払ってもよい。そうしたなら、これを変身させる。\n+2：クリーチャー最大１体を対象とする。それはすべてのクリーチャー・タイプを得る。（この効果は終了しない。）\n+1：クリーチャー１体を対象とする。次のあなたのターンまで、それは－２/－０の修整を受ける。\n//\nあなたの第１メイン・フェイズの開始時に、{U}を支払ってもよい。そうしたなら、これを変身させる。\n-1：カード３枚を切削する。その中からパーマネント・カード１枚をあなたの手札に加えてもよい。\n-3：緑の３/３の大鹿・クリーチャー・トークン２体を生成する。\n-6：クリーチャー・タイプ１つを選ぶ。「あなたがコントロールしていてその選ばれたタイプであるすべてのクリーチャーは、＋３/＋３の修整を受け警戒と呪禁を持つ。」の紋章を得る。",
      sourceUrl: "https://mtg-jp.com/products/card-gallery/0000305/540294/"
    }
  ]
]);

export const defaultSources = {
  // 起点はメタゲームページ（条件に合ったデッキに絞り込み済み）のみ。
  // mtggoldfish.com は Cloudflare で弾かれやすいため除外。
  // magic.gg / mtgo.com は不安定なため優先度を下げ末尾に配置。
  standard: [
    "https://www.hareruyamtg.com/ja/deck/1/metagame/",
    "https://mtgtop8.com/format?f=ST",
    "https://magic.gg/decklists"
  ],
  pioneer: [
    "https://www.hareruyamtg.com/ja/deck/20/metagame/",
    "https://mtgtop8.com/format?f=PI",
    "https://magic.gg/decklists"
  ],
  modern: [
    "https://www.hareruyamtg.com/ja/deck/2/metagame/",
    "https://mtgtop8.com/format?f=MO",
    "https://magic.gg/decklists"
  ],
  legacy: [
    "https://www.hareruyamtg.com/ja/deck/3/metagame/",
    "https://mtgtop8.com/format?f=LE",
    "https://magic.gg/decklists"
  ]
};

export const formatEnvironmentEvents = require("../data/environment-events.json");
