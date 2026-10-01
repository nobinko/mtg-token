import fs from 'node:fs';
import path from 'node:path';
import {supplements,variants} from './supplemental-content.mjs';

export function renderExtras({audit,root,esc,prose,image,label,table,sum}) {
 const referenceDecks=[];
 const archive=(id,name,d)=>{
  if(sum(d.mainboard)!==60||sum(d.sideboard)!==15)throw Error('Incomplete reference '+id);
  const main=d.mainboard,side=d.sideboard;
  referenceDecks.push({id,name,main,side});
  fs.writeFileSync(path.join(root,'decklists',id+'.txt'),main.map(c=>`${c.count} ${c.name}`).join('\n')+'\n\nSideboard\n'+side.map(c=>`${c.count} ${c.name}`).join('\n')+'\n');
  return `<details class="reference-details"><summary>実在リストの全75枚を見る <span>60＋15</span></summary>
   <div class="reference-list" data-list-block>
    <p class="deck-list-source"><b>${esc(d.player)}</b> · ${esc(d.event)} · ${esc(d.eventDate)}${/League/i.test(d.event)?' · 順位なし':` · ${esc(d.placement)}位`}<br><a href="${esc(d.url)}" target="_blank" rel="noopener">個別リストの原典 ↗</a></p>
    <div class="list-tools"><span class="small muted">画像・カード名で拡大</span><div class="btn-row"><button class="btn" data-toggle-gallery aria-pressed="false">画像一覧に切替</button><a class="btn" href="decklists/${id}.txt" download>リストを保存 ↓</a></div></div>
    <div data-table-view class="table-view"><div class="deck-tables">${table(main,'MAIN DECK')}${table(side,'SIDEBOARD')}</div></div>
    <div class="gallery-view" data-gallery-view hidden>${[['MAIN',main],['SIDE',side]].map(([zone,rows])=>rows.map(c=>`<figure class="gallery-card">${image(c.name)}<figcaption><b>${c.count}枚</b> <span>${zone}</span><br>${esc(label(c.name))}</figcaption></figure>`).join('')).join('')}</div>
   </div></details>`;
 };
 const keyCards=rows=>`<div class="extra-cards">${rows.map(([n,role])=>`<figure>${image(n)}<figcaption><strong>${esc(label(n))}</strong><p>${prose(role)}</p></figcaption></figure>`).join('')}</div>`;
 const variantHTML=variants.map(v=>{
  const d=audit.variants.find(x=>x.rank===v.rank)?.deck;if(!d)throw Error('Missing variant '+v.name);
  return `<article class="variant-profile" id="variant-${v.id}"><div class="extra-title"><span class="extra-rank">${String(v.rank).padStart(2,'0')}</span><div><span class="extra-category">トップ10内の派生型</span><h3>${esc(v.name)}</h3></div></div><p class="extra-plan">${prose(v.description)}</p>${keyCards(v.cards)}${archive(v.id,v.name,d)}</article>`;
 }).join('\n');
 const supplementalHTML=supplements.map(p=>{
  const s=audit.supplemental.find(s=>s.rank===p.rank);if(!s?.representative)throw Error('Missing supplement '+p.name);
  return `<article class="extra-profile" id="extra-${p.id}">
   <header class="extra-title"><span class="extra-rank">${p.rank}</span><div><span class="extra-category">${esc(p.category)} · ${esc(s.name)}</span><h3>${esc(p.name)}</h3><p class="extra-style">${esc(p.style)}</p></div><div class="extra-share">${s.sharePercent}<small>% / 短期分類</small></div></header>
   <p class="extra-plan">${prose(p.plan)}</p>${keyCards(p.cards)}
   <ol class="extra-sequence">${p.steps.map(([title,description])=>`<li><h4>${esc(title)}</h4><p>${prose(description)}</p></li>`).join('')}</ol>
   <div class="extra-stop"><b>対戦する側</b><p>${prose(p.stop)}</p></div><p class="extra-caution"><b>間違えやすい点</b> ${prose(p.caution)}</p>
   ${archive(p.id,p.name,s.representative)}
  </article>`;
 }).join('\n');
 return {variantHTML,supplementalHTML,referenceDecks};
}

export function renderCoverage({audit,esc}) {
 const names={ 'Broodscale Bloodchief':'ブルードスケール','UR Aggro':'青赤アグロ','Blink':'ブリンク','Creatures Toolbox':'生物ツールボックス','Affinity':'親和','UrzaTron':'ウルザトロン','Instant Reanimator':'御霊系','Boros Aggro':'ボロス・アグロ','4/5c Aggro':'4〜5色アグロ','Ruby Storm':'ルビー・ストーム','UW Control':'青白コントロール','Dimir Control':'ディミーア','Boros Ponza':'ボロス・土地攻め','Living End':'リビング・エンド','Eldrazi Ramp':'エルドラージ・ランプ','Landless':'土地なしコンボ','Allosaurus Combo':'アロサウルス','Other - Control':'その他コントロール','Amulet Titan':'アミュレット'};
 const w=audit.windows;
 const cell=(window,name)=>{const e=window.entries.find(x=>x.name===name);return e?`<td${e.rank<=10?' class="window-top"':''}><b>${e.sharePercent}%</b><small>${e.rank}位</small></td>`:'<td>—</td>';};
 return `<div class="window-comparison">
  <div class="comparison-lead"><div><p class="eyebrow">集計の見方</p><h3>紙・主要大会でも、同じ10分類か。</h3></div><p>紙の2か月ではディミーアとランプが上位10へ。<br>主要大会ではリビング・エンドも入ります。</p></div>
  <div class="window-highlights">${[['Dimir Control','ディミーア'],['Eldrazi Ramp','エルドラージ・ランプ'],['Living End','リビング・エンド']].map(([n,label])=>`<div><h4>${label}</h4><dl>${[['短期',w.recent],['紙',w.paper],['主要大会',w.major]].map(([label,s])=>{const e=s.entries.find(x=>x.name===n);return `<div><dt>${label}</dt><dd>${e.sharePercent}<small>%</small></dd></div>`;}).join('')}</dl></div>`).join('')}</div>
  <details class="coverage-details"><summary>19分類を4つの集計で比較する</summary><div class="comparison-scroll"><table class="window-table"><caption>割合は各集計に掲載されたデッキの分布。背景色は各集計の上位10。</caption><thead><tr><th scope="col">分類</th>${Object.values(w).map(s=>`<th scope="col"><a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${esc(s.windowLabel)} ↗</a><small>${s.totalDecks.toLocaleString('en-US')}件</small></th>`).join('')}</tr></thead><tbody>${w.recent.entries.slice(0,19).map(e=>`<tr><th scope="row">${esc(names[e.name]||e.name)}</th>${Object.values(w).map(s=>cell(s,e.name)).join('')}</tr>`).join('')}</tbody></table></div></details>
  <p class="chart-foot">短期は2週間、他の3集計は2か月。期間・収録大会・母数が異なり、相互に重複します。差をそのまま増減率や勝率には読み替えません。各割合は丸められた掲載値です。</p>
 </div>`;
}
