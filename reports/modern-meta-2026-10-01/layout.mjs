export function pageLayout({assetVersion,audit,snapshot,decks,profiles,stats,esc,image,prose,label,articles,options,matrix,initialStats,initialText,hate,glossary,variantHTML,supplementalHTML,coverageHTML}) {
 const date=audit.date.replaceAll('-','.');
 const jst=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(snapshot.fetchedAt));
 const period=stats.from.replaceAll('-','.')+'〜'+stats.to.replaceAll('-','.');
 const categoryNames=['ブルードスケール','青赤アグロ','ブリンク','生物ツールボックス','親和','ウルザトロン','御霊系リアニメイト','ボロス・アグロ','4〜5色アグロ','ルビー・ストーム'];
 const total=decks.reduce((n,d)=>n+d.sharePercent,0);
 const guideRows=[
  ['鱗','鱗＋刃 → 無色マナ','エムラクール／巨大な鱗','本体・死亡・起動への対策'],
  ['果敢','短刀＋低コスト連打','速攻・飛行・火力','短刀／呪文数制限'],
  ['ブリンク','想起・ワープ＋明滅','飛行と繰り返す除去','明滅の対象／登場時能力'],
  ['ドルイド','ドルイド＋侍臣 → 緑マナ','生物サーチから全体強化','本体／起動禁止／サーチ制限'],
  ['親和','特使・武器製造＋置物','河童／軍需品の火力','エンジン／点火前の妨害'],
  ['トロン','ウルザ3種／2マナ土地','カーンの制限／ウギン','土地／大型の唱えたとき'],
  ['御霊','伝説を捨てる → 御霊','大型を明滅して維持','墓地／釣り上げ／明滅'],
  ['ボロス','導き手・猫・アジャニ','横展開／砲撃','小型の要／全体除去'],
  ['ドメイン','力線＋ドラコ／5土地タイプ','呪禁・絆魂を持つ大型','力線／全体除去／唱える前'],
  ['ストーム','軽減＋儀式＋補充','願い → ぶどう弾','呪文数制限／コスト増加']
 ];
 const beginner=`<details class="beginner-note"><summary>最初に：マナ・ターン・サイドの読み方</summary><p><b>目的とターン：</b>通常はライフ20で開始。土地は原則、自分のターンに1枚置き、土地などから出るマナで呪文を唱えます。1T・2Tは「自分の1・2ターン目」。生物は通常、出したターンには攻撃できず、速攻があれば攻撃できます。</p><p><b>カードのコスト：</b>右上がマナ・コスト。W＝白、U＝青、B＝黒、R＝赤、G＝緑、C＝無色。数字は好きな種類のマナで払える点数、Cは無色マナが必要な枠です。Xは唱えるときに選ぶ値。B/P等のファイレクシア・マナは、その色かライフ2点で払えます。右下の2/2等はパワー／タフネス。</p><p><b>初手とサイド：</b>最初に7枚。マリガンは7枚を引き直し、キープ時にその回数ぶん山札の下へ戻します。ゲーム間はサイドとカードを交換して対策。モダンはメイン60枚以上・サイド最大15枚で、この資料の実例はすべて60＋15枚です。</p></details>`;
 return `<!doctype html>
<html lang="ja">
<head>
 <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <meta name="description" content="2026年10月2日確認。モダンの短期トップ10と圏外9分類を、実物カード画像、実在する75枚、コンボ手順、紙・主要大会の比較、対戦データで読む日本語資料。">
 <meta name="theme-color" content="#19212d"><title>MODERN ATLAS — モダンの現在地 / ${date}</title>
 <link rel="icon" type="image/svg+xml" href="favicon.svg"><link rel="stylesheet" href="styles.css?v=${assetVersion}">
 <script src="data.js?v=${assetVersion}" defer></script><script src="app.js?v=${assetVersion}" defer></script>
 <noscript><style>.deck-profile[hidden]{display:block!important}.deck-sidebar,.reader-toolbar,.mobile-picker,.step-navigation,.step-dots,.matchup-controls{display:none}.print-steps{display:block}</style></noscript>
</head>
<body>
 <a class="skip-link" href="#overview">本文へ移動</a>
 <header class="masthead"><div class="container">
  <a class="brand" href="#top"><b>M</b>MODERN ATLAS</a>
  <nav class="header-nav" aria-label="主な内容"><a href="#overview">環境</a><a href="#atlas">トップ10</a><a href="#frontier">圏外と派生型</a><a href="#matchups">相性</a><a href="#counterplay">対策</a><a href="#glossary">用語</a></nav>
  <a class="edition" href="#method">2026 / OCTOBER 02</a>
 </div></header>
 <main>
 <section class="hero" id="top"><div class="container hero-inner">
  <div class="hero-copy"><p class="eyebrow">MAGIC: THE GATHERING / METAGAME STUDY</p><div class="hero-wordmark" aria-hidden="true">MODERN<span>.</span></div>
   <h1>モダンの現在地。</h1><p>鱗19%。青赤10%。ブリンク8%。<br>実戦の75枚から、攻め方と止め方を読む。</p>
   <p class="hero-boundary"><a href="#release-boundary">FRA導入直後の観測版。発売後の勢力図は、まだ未確定。 ↘</a></p>
   <div class="btn-row"><a class="btn primary" href="#overview">環境を見る ↓</a><a class="btn light" href="#atlas">デッキを選ぶ →</a></div>
   <div class="hero-meta"><div><strong>${snapshot.totalDecks}</strong><span>掲載リスト / 2週間</span></div><div><strong>10<span>＋9</span></strong><span>上位分類＋圏外の要点</span></div><div><strong>22</strong><span>実在する60＋15枚</span></div></div>
  </div>
  <div class="hero-art" aria-label="上位分類の代表カード">${[['Basking Broodscale','01 / BROODSCALE'],['Cori-Steel Cutter','02 / IZZET'],['Quantum Riddler','03 / BLINK']].map(([n,s])=>`<figure>${image(n,true)}<figcaption>${s}<span>${esc(label(n))}</span></figcaption></figure>`).join('')}<p class="hero-art-caption">カードから読む、いまの対戦相手。</p></div>
 </div><div class="container hero-source">${date} 確認 <span>MTGTop8・短期集計 / 紙・Magic Onlineの公開結果</span><a href="#method">出典と範囲 ↗</a></div></section>

 <section class="section" id="overview"><div class="container">
  <div class="section-heading"><div><p class="eyebrow">01 / 環境</p><h2>まず、何が多いか。</h2></div><p>MTGTop8「直近2週間」${snapshot.totalDecks}件。<br>同率は掲載順。強さの順位ではなく、掲載結果の分布です。</p></div>
  <div class="release-boundary" id="release-boundary"><div><p class="eyebrow">新セットと集計の境界</p><h3>FRAの初動は入った。定着はこれから。</h3><p>『リアリティ・フラクチャー』は紙で9月25日から使用可能。MTGOは9月29日17:00 UTC（日本時間9月30日02:00）に導入、一般発売は10月2日です。<a href="https://wpn.wizards.com/en/news/reality-fracture-dates-and-details" target="_blank" rel="noopener">公式日程 ↗</a>・<a href="https://www.mtgo.com/news/fra-on-mtgo" target="_blank" rel="noopener">MTGO ↗</a></p><p><b>集計期間には導入前の大会も含まれます。</b>短期も2か月も「FRA導入後だけ」の順位ではありません。新カードの定着、発売後だけの使用率・相性は、まだこの資料から判断できません。</p></div><figure>${image('Twinned Vision')}<figcaption><b>新カードの採用を確認</b><span>9月30日のストーム実例に<br>《${esc(label('Twinned Vision'))}》2枚。</span><a href="https://mtgtop8.com/event?e=91444&amp;d=894494&amp;f=MO" target="_blank" rel="noopener">採用リスト ↗</a><small>22実例とFRA新規268種のOracle IDを照合。採用の確認であり、使用率ではありません。</small></figcaption></figure></div>
  <div class="overview-grid"><div><div class="ranking-list">${profiles.map((p,i)=>`<button class="rank-row" data-deck="${p.id}"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-name">${esc(categoryNames[i])}<small>代表：${esc(p.name)}</small></span><span class="rank-track"><span class="rank-fill" style="display:block;width:${decks[i].sharePercent/19*100}%"></span></span><span class="rank-share">${decks[i].sharePercent}%</span></button>`).join('')}</div><p class="rank-note">上位10の掲載値合計は${total}%。残る約30%は下の「圏外と派生型」で補います。割合は広い分類全体の値で、代表型1つの使用率ではありません。</p></div>
   <div class="environment-notes"><div class="environment-note">${image('Basking Broodscale')}<div><h3>鱗は、ループを止めても大型を出す。</h3><p>本体だけを除去して安心しない。寺院・迷宮・菌糸生物から、エムラクールを普通に唱える路線もあります。</p></div></div><div class="environment-note">${image('Quantum Riddler')}<div><h3>ブリンクは、1枚の除去を何度も使う。</h3><p>孤独・大主・謎かけ屋を明滅。除去とドローを繰り返し、想起やワープの期限から大型を外します。</p></div></div><div class="environment-note">${image("Urza's Saga")}<div><h3>土地と置物へ届く対策も必要。</h3><p>物語のサーチ、短刀の僧侶、軍需品の火力、トロンの大量マナ。生物除去だけでは届かない勝ち筋があります。</p></div></div><div class="coverage-number"><strong>70<span>%</span></strong><p>短期トップ10の合計<br><b>使われるデッキ全体の7割、とは断定できません。</b></p></div></div>
  </div>
  <p class="notice overview-note"><b>母集団：</b>公開された結果リストの集計。大会の掲載・勝ち残り・MTGOリーグ等に偏りがあり、全参加者や全プレイヤーの使用率ではありません。モダンは紙・Magic Onlineのフォーマットとして扱います。<a href="#method">集計方法</a></p>
  ${coverageHTML}
  <details class="quick-reference"><summary>10デッキの勝ち筋と、止める場所を一覧する</summary><div class="comparison-scroll"><table class="quick-table"><thead><tr><th scope="col">代表型</th><th scope="col">準備・エンジン</th><th scope="col">勝ち方</th><th scope="col">主な干渉点</th></tr></thead><tbody>${guideRows.map((row,i)=>`<tr><th scope="row"><button data-deck="${profiles[i].id}">${row[0]} →</button></th>${row.slice(1).map(t=>`<td>${esc(t)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="chart-foot">構成からの要点整理。対策1枚で必ず勝てる表ではありません。各デッキの「残る勝ち筋」と合わせて読みます。</p></details>
 </div></section>

 <section class="section" id="atlas"><div class="container">
  <div class="section-heading"><div><p class="eyebrow">02 / トップ10</p><h2>実際のカードで、動きを追う。</h2></div><p>重要カード、基本進行、コンボ、構成、対策、全75枚。<br>カード名や画像を押すと拡大。表裏も確認できます。</p></div>
  ${beginner}
  <div class="atlas-layout"><aside class="deck-sidebar"><p class="eyebrow">読むデッキ</p><label class="search-label" for="deck-search">デッキ名・採用カードで検索</label><input class="search-input" id="deck-search" type="search" placeholder="例：アトラクサ / Storm" autocomplete="off"><div class="search-state" id="search-state" aria-live="polite">10デッキ</div><nav class="deck-menu" aria-label="デッキ選択">${profiles.map((p,i)=>`<button data-deck="${p.id}" aria-pressed="${i===0}"><span class="nav-rank">${String(i+1).padStart(2,'0')}</span><span>${esc(p.name)}</span><span class="nav-share">${decks[i].sharePercent}%</span></button>`).join('')}</nav><p class="sidebar-foot">割合は分類全体。<br>代表リストは2026.09.27〜30。<br>画像も同梱し、オフラインで閲覧できます。</p><button class="btn" data-print>資料を印刷</button></aside>
   <div class="atlas-reader"><label class="mobile-picker" for="deck-picker">読むデッキを選ぶ<select id="deck-picker">${options('broodscale')}</select></label><div class="reader-toolbar"><span id="reader-status">01 / 10 · ブルードスケール</span><div class="btn-row"><button class="btn" id="deck-prev" disabled>← 前</button><button class="btn" id="deck-next">次 →</button></div></div>${articles}</div>
  </div>
 </div></section>

 <section class="section frontier-section" id="frontier"><div class="container">
  <div class="section-heading"><div><p class="eyebrow">03 / 圏外と派生型</p><h2>トップ10だけでは、足りない。</h2></div><p>同じ分類の別型3つと、短期1%以上の圏外9分類。<br>上位19分類の掲載値合計は約90%。小さな分類も索引に残します。</p></div>
  <h3 class="frontier-subtitle">同じ分類でも、勝ち方が変わる。</h3><p class="frontier-intro">派生型に独立した割合は付けていません。上の10分類の中に含まれ、比較用リストは各1件です。</p><div class="variant-grid">${variantHTML}</div>
  <h3 class="frontier-subtitle">対戦で見落とせない、残る9分類。</h3><p class="frontier-intro">短期の掲載値合計は20%。各分類から直近の実在リスト1件を使い、動きと干渉点を短く整理しています。相性の数値は上位10代表型だけの表に分けています。</p>
  <div class="extra-grid">${supplementalHTML}</div>
  <details class="all-archetypes"><summary>掲載された全${snapshot.entries.length}分類の索引</summary><div class="taxonomy-grid">${snapshot.entries.map(e=>`<a href="${esc(e.archetypeUrl)}" target="_blank" rel="noopener"><span><small>${String(e.rank).padStart(2,'0')}</small>${esc(e.name)}</span><b>${e.sharePercent}%</b></a>`).join('')}</div><p class="chart-foot">掲載値の合計は約${snapshot.entries.reduce((n,e)=>n+e.sharePercent,0).toFixed(1)}%。丸められた割合のため100%になりません。この索引は原典の分類を落とさず記載していますが、全分類の全派生型を解説するものではありません。</p></details>
 </div></section>

 <section class="section" id="matchups"><div class="container">
  <div class="section-heading"><div><p class="eyebrow">04 / 相性</p><h2>通したいカード、止めたいカード。</h2></div><p>公開対戦の数字と、代表構成からの分析。<br>勝率だけでサイドや立ち回りを決めないための表です。</p></div>
  <div class="matchup-intro"><div><p><b>公開対戦：</b><a href="${esc(stats.url)}" target="_blank" rel="noopener">MTG DECKS ↗</a>。${period}、原典全体は${stats.sourceTotal.toLocaleString('en-US')}対戦超。セルは行側の勝率と、その組み合わせの対戦数。</p></div><div><p><b>構成の分析：</b>本資料の代表75枚から、メイン戦の焦点とサイド後の変化を解説。統計は型の混在したマッチ全体で、ゲーム1・サイド後を分けた勝率ではありません。</p></div></div>
  <div class="matchup-controls"><label for="match-deck-a">自分 / 行<select id="match-deck-a">${options('broodscale')}</select></label><span class="vs-label">VS</span><label for="match-deck-b">相手 / 列<select id="match-deck-b">${options('devoted')}</select></label></div>
  <div class="matrix-legend"><span><i class="legend-dot signal-up"></i>優位の兆候</span><span><i class="legend-dot signal-down"></i>劣位の兆候</span><span><i class="legend-dot low-sample"></i>n &lt; 30：少数標本</span><span>灰色：掲載区間が50%をまたぐ / 判断保留</span></div><p class="matrix-tip">セルを押すと詳細へ。横スクロール対応。<b>n＝この組み合わせの対戦数。</b></p>
  <div class="matrix-scroll">${matrix}</div>
  <div class="match-detail" id="match-detail" aria-live="polite"><div class="match-detail-header"><div><p class="eyebrow">選択中の対戦</p><h3 id="match-title">ブルードスケール × 献身のドルイド</h3></div><div class="match-result"><strong id="match-win">${initialStats.win}%</strong><div id="match-sample">${initialStats.n}対戦<br>掲載区間 ${initialStats.low}〜${initialStats.high}%</div></div></div>
   <p class="match-uncertainty" id="match-uncertainty">鱗側に劣位の兆候（掲載区間${initialStats.low}〜${initialStats.high}%）。リスト・操縦者・大会の混在があり、将来の勝率を保証しません。</p>
   <div class="match-analysis"><div><h4>メイン戦の焦点 <span class="pill">構成の分析</span></h4><p id="match-main">${prose(initialText[4])}</p></div><div><h4>サイド後に変わる点 <span class="pill">構成の分析</span></h4><p id="match-post">${prose(initialText[5])}</p></div></div>
   <p class="match-source" id="match-source">統計分類：Eldrazi Bloodchief Combo / Devoted Druid Combo。${period}、マッチ全体。</p><div class="btn-row" id="match-open-buttons"><button class="btn" data-deck="broodscale">鱗の75枚を見る</button><button class="btn" data-deck="devoted">ドルイドの75枚を見る</button></div>
  </div>
  <details class="mapping-details"><summary>統計分類との対応・色の条件</summary><p class="small muted">分類名が異なるため、カード構成と同大会のリストを照合して対応させています。UR Aggroの割合に対し勝率はIzzet Prowess、Blinkに対しEsper Blinkを使います。広い分類全体や、この代表リスト1件だけの勝率ではありません。</p><div class="comparison-scroll"><table class="mapping-table"><thead><tr><th>代表型</th><th>MTGTop8 / 掲載割合</th><th>MTG DECKS / 対戦統計</th></tr></thead><tbody>${profiles.map((p,i)=>`<tr><td>${esc(p.name)}</td><td>${esc(decks[i].name)}</td><td>${esc(stats.mapping[p.id])}</td></tr>`).join('')}</tbody></table></div><p class="small muted">強調は対戦数30以上、かつ原典の掲載区間が50%をまたがない場合のみ。本資料の表示ルールです。区間算出法を独自に再定義していません。丸め・少数標本・リストの混在を考慮してください。</p></details>
 </div></section>

 <section class="section" id="counterplay"><div class="container">
  <div class="section-heading"><div><p class="eyebrow">05 / 対策</p><h2>効く場所と、残る動き。</h2></div><p>「墓地対策」「起動禁止」だけで覚えず、<br>どの処理が止まるかを確認します。</p></div>
  <div class="hate-grid">${hate.map(h=>`<article class="hate-card">${image(h.card)}<div><h3>${esc(label(h.card))}</h3><div class="targets">${esc(h.targets)}</div><p>${prose(h.reason)}</p><p class="limit"><b>残る動き：</b>${prose(h.limit)}</p></div></article>`).join('')}</div>
 </div></section>
 <section class="section" id="glossary"><div class="container">
  <div class="section-heading"><div><p class="eyebrow">06 / 用語</p><h2>わからない言葉を、ここで確認。</h2></div><p>この資料の説明を読むための短い定義。<br>厳密な処理は現行Oracle・公式ルールを優先します。</p></div><div class="glossary-grid">${glossary.map(([term,meaning])=>`<article class="glossary-item"><h3>${esc(term)}</h3><p>${prose(meaning)}</p></article>`).join('')}</div>
 </div></section>
 <section class="section" id="method"><div class="container">
  <div class="section-heading"><div><p class="eyebrow">07 / 出典と方法</p><h2>何を確認し、どこまで言えるか。</h2></div><p>${date}確認の固定資料。<br>公開集計の限界と、実在リストの選び方を示します。</p></div>
  <div class="method-grid"><div><h3>集計と鮮度</h3><p>短期集計はMTGTop8のModern / Last 2 Weeks、${snapshot.totalDecks}件。${esc(jst)} JSTに再取得し、上位10の順番・割合が前版と一致することを確認。取得日と、大会開催日は別です。採用リストの大会日は9月27〜30日。10月2日の大会結果を網羅した資料ではありません。</p><p>原典は短期期間の厳密な開始日を明示していないため推定していません。紙・主要大会・全体の2か月集計も同日に取得。公開結果やリーグ掲載は全参加者の無作為標本ではなく、割合には選択と掲載の偏りがあります。地域別・全MTGO利用者の使用率は算出していません。</p><h3>新セットの導入境界</h3><p>FRAは紙で9月25日から構築に適用（<a href="https://magic.wizards.com/en/news/announcements/format-legality-shifts-to-prerelease-with-phyrexia-all-will-be-one" target="_blank" rel="noopener">適用方針</a>）。MTGO導入は9月29日17:00 UTC、日本時間9月30日02:00。4つの集計はいずれも導入前の結果を含みます。22実例とScryfallのFRA新規カード268種（reprint=false）をOracle IDで照合すると、採用を確認できた新カードは《対なす幻視》。これは22実例だけの確認で、環境全体で他のFRAカードが使われていないという意味ではありません。</p><h3>22件の実在リスト</h3><p>トップ10は完全リストを最大6件、計59件比較。メイン・サイド別の枚数差を正規化し、他リストとの平均距離が最小の実在リストを代表に選択しました。合成デッキではありません。各重要カードの採用頻度は、この5〜6件だけの参考値です。</p><p>圏外9分類は直近の実在リストを各1件、派生型3つも各1件追加。すべてメイン60・サイド15枚。相棒はサイド枚数に含みます。広い分類と代表型の相違は各項目に明記しています。小分類は全40分類の索引から原典へ辿れます。</p></div>
   <div><h3>対戦統計と分析</h3><p>勝率表はMTG DECKSの${period}。原典全体は${stats.sourceTotal.toLocaleString('en-US')}対戦超。数字は公開マッチの統計で、リスト・先手後手・操縦者等を統制した実験ではありません。メイン戦・サイド後の文章は本資料の構成分析で、その別集計の勝率は取得していません。</p><h3>カードと現行ルール</h3><p>公式Modern禁止一覧を${date}に再確認。収録カードはScryfallの現行OracleとModern適法性を再照合しました。フレージ・一つの指輪・死の国からの脱出等の禁止カードを掲載リストへ混ぜていません。寺院からコジレックの命令へマナを使えること、督励・続唱・明滅・サイクリング・相棒の処理を補足しています。</p><ul class="sources-list"><li><a href="${esc(snapshot.sourceUrl)}" target="_blank" rel="noopener">MTGTop8 — 短期集計</a> / 紙・主要大会等は比較表の原典へ。</li><li><a href="${esc(stats.url)}" target="_blank" rel="noopener">MTG DECKS — Modern Win Rates</a></li><li><a href="https://magic.wizards.com/en/banned-restricted-list" target="_blank" rel="noopener">Wizards of the Coast — 禁止・制限カード</a></li><li><a href="https://magic.wizards.com/en/rules" target="_blank" rel="noopener">Wizards of the Coast — 総合ルール</a></li><li><a href="https://scryfall.com/docs/api" target="_blank" rel="noopener">Scryfall — 画像・Oracle</a> / 拡大画面に個別カードリンク。</li></ul><p>画像は実物カードのスキャン。日本語を優先し、取得できなかった《信仰の繕い》は英語画像と日本語解説を使用。カード画像と現行文面が違う場合はOracleを優先してください。</p><h3>保存・印刷</h3><p>HTML・CSS・JavaScript・カード画像を同梱。閲覧と拡大は外部通信不要で、出典リンクは通信が必要です。印刷は全デッキ・全コンボ手順・全リストを展開します。Magic: The Gathering、カード名・画像等の権利はWizards of the Coast等の権利者に帰属。非公式の学習用資料です。</p></div>
  </div>
 </div></section>
 </main>
 <footer class="container footer"><div class="footer-row"><span class="brand"><b>M</b>MODERN ATLAS</span><span>${date} / 日本語版 · 22実例 · 全1,650枚</span><a href="#top">先頭へ ↑</a></div></footer>
 <dialog id="card-dialog" class="card-dialog" aria-labelledby="dialog-card-title"><div class="dialog-top"><span class="eyebrow">カードを確認</span><button class="btn" id="dialog-close" autofocus>閉じる ×</button></div><div class="dialog-body"><div><img id="dialog-card-image" class="dialog-image" width="488" height="680" alt=""><div class="btn-row dialog-tools"><button id="dialog-flip" class="btn" hidden>裏面を見る ↻</button></div></div><div class="dialog-copy"><div id="dialog-mana"></div><h2 id="dialog-card-title"></h2><p id="dialog-card-en" class="card-en"></p><p id="dialog-type" class="type-line"></p><p id="dialog-role" class="dialog-role"></p><p id="dialog-decks" class="dialog-decks"></p><div class="dialog-tools"><a id="dialog-scryfall" class="btn" target="_blank" rel="noopener">現行文面・裁定を確認 ↗</a></div><p class="dialog-note">印刷画像と現在の文面が異なる場合は、Oracleを優先。画像はScryfallより。</p></div></div></dialog>
 <div class="toast" id="toast" role="status" hidden></div><noscript><p class="container notice">JavaScript無効時は、トップ10と全コンボ手順を展開します。リストの開閉は使えますが、拡大・画像一覧切替はブラウザー機能をご利用ください。</p></noscript>
</body></html>`;
}
