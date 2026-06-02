# デッキリストソース実測メモ

このメモは、MTG Token Finder がデッキリストを自動取得するためのソース判断を残すためのものです。ソース側のWAF/Cloudflare/HTML構造は変わるため、実装やデフォルト巡回元を変える前に、ここに近い形で再測定する。

実測日: 2026-06-02 JST

## 結論

- MTGO公式とMTGTop8は、通常HTTP取得でカード名まで抽出できるため、デフォルト巡回元として維持する。
- magic.ggは構造化された `<deck-list>` を読めるが、2026-06-02時点の `/decklists` からはLegacyのイベントリンクを拾えなかった。フォーマット一致リンクがある時だけ有効。
- 晴れる屋はメタゲームページをアーキタイプ名の補助として読む。検索結果ページ `/ja/deck/result?...` はAWS WAF challengeで本文が返らないため、自動巡回元にしない。
- 晴れる屋の個別 `/ja/deck/{id}/show/` は通常HTTPで取得できる例がある。ただし検索結果ページがWAFで止まるため一覧から自動発見できず、現行パーサでもカード名を抽出できない。直接URLを入れても完全なデッキソースとしては未対応。
- MTGGoldfishとMTGDecksは、メタ情報の確認には使えても、通常HTTP取得で個別デッキを安定して集めるソースにはしない。

## 実測結果

通常のNode.js `fetch` で確認した。ブラウザ自動操作やCookie突破は、このローカル準備ツールの巡回方針に入れない。

| ソース | 試したURL | HTTP結果 | 実装上の扱い | 根拠 |
|---|---|---:|---|---|
| 晴れる屋メタゲーム | `https://www.hareruyamtg.com/ja/deck/3/metagame/` | 200 / 約3.1MB | アーキタイプ補助のみ | HTMLは取得可能。メタページ内に `/ja/deck/result?archetypeIds=...&dateFrom=...` リンクが大量にあるが、カードリスト本体ではない |
| 晴れる屋検索結果 | `https://www.hareruyamtg.com/ja/deck/result?formats%5B3%5D=3&dateFrom=2026/05/19&pageSize=20` | 202 / 0 bytes | 自動巡回しない | レスポンスヘッダに `x-amzn-waf-action: challenge`。通常UAでも同じ。本文が空で `/show/` リンクを拾えない |
| 晴れる屋個別show | `https://www.hareruyamtg.com/ja/deck/1156836/show/` | 200 / 約3.1MB | 未対応 | HTMLは取得でき、「Magic Online用テキスト」等のデッキ表示はある。ただし現行 `extractDeckEntries` では1エントリ/カード0件で、カード名抽出に失敗する |
| MTGO公式 | `https://www.mtgo.com/decklist/legacy-league-2026-06-0210612` | 200 | デフォルト巡回元 | ページ内の `window.MTGO.decklists.data` JSONから7デッキを抽出。先頭例は `Legacy League - Nedus`、公開日 `2026-06-02`、カード名29種 |
| MTGTop8 | `https://mtgtop8.com/format?f=LE` → `https://mtgtop8.com/event?e=85974&d=852939&f=LE` | 200 | デフォルト巡回元 | フォーマットページからイベント/個別デッキリンクを抽出可能。個別デッキ例 `Boros Aggro - Blungoreus` はイベント日 `2026-05-31`、カード名28種 |
| magic.gg | `https://magic.gg/decklists` | 200 | 条件付き巡回元 | ページ取得は可能。ただし2026-06-02の実測ではLegacyに一致するリンクが0件だった。フォーマット名がURLや `<deck-list format>` に出る時だけ採用 |
| MTGGoldfishメタ | `https://www.mtggoldfish.com/metagame/legacy.legacy` | 200 | メタ補助のみ | メタページは取れるが、個別デッキ取得が安定しない |
| MTGGoldfish個別 | `https://www.mtggoldfish.com/deck/7149824` | 403 | 自動巡回しない | Cloudflare `Just a moment...` が返る |
| MTGDecks | `https://mtgdecks.net/Legacy/decklists` | 403 | 自動巡回しない | Cloudflare `Just a moment...` が返る |

## 晴れる屋について忘れないこと

「晴れる屋は全部ダメ」ではない。2026-06-02時点では、メタゲームページと一部の個別 `/show/` ページは取得できる。

ただし、デッキを大量に集めるための入口である `/ja/deck/result?...` がAWS WAF challengeになる。実測では `202 Accepted`、本文0バイト、`x-amzn-waf-action: challenge` だった。ここを突破できないため、メタページから個別デッキ一覧へ自動で進めない。

さらに、直接 `/show/` URLを指定しても、現行パーサは晴れる屋のカード表からカード名を抽出できない。実測では `extractDeckEntries` が1件のページエントリを作ったものの、`cards.length` は0だった。晴れる屋を完全なデッキソースに戻すには、少なくとも次の2点が必要。

- WAFに触れない範囲で個別 `/show/` URLを安定して集める方法。
- 晴れる屋 `/show/` のカード表またはMagic Online用テキストを読む専用パーサ。

## 再測定用スニペット

```powershell
@'
const urls = [
  ["Hareruya result", "https://www.hareruyamtg.com/ja/deck/result?formats%5B3%5D=3&dateFrom=2026/05/19&pageSize=20"],
  ["Hareruya show", "https://www.hareruyamtg.com/ja/deck/1156836/show/"],
  ["MTGO Legacy", "https://www.mtgo.com/decklist/legacy-league-2026-06-0210612"],
  ["MTGTop8 Legacy", "https://mtgtop8.com/format?f=LE"],
  ["MTGGoldfish deck", "https://www.mtggoldfish.com/deck/7149824"],
  ["MTGDecks Legacy", "https://mtgdecks.net/Legacy/decklists"],
];

for (const [label, url] of urls) {
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  console.log({
    label,
    finalUrl: res.url,
    status: res.status,
    bytes: text.length,
    waf: res.headers.get("x-amzn-waf-action") || "",
    cloudflare: /Cloudflare|Just a moment/i.test(text),
    mtgoJson: /window\.MTGO\.decklists\.data\s*=/.test(text),
    deckListTag: /<deck-list\b/i.test(text),
  });
}
'@ | node -
```
