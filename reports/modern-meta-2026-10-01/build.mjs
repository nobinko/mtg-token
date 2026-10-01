import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {profiles, glossary, hate, generalRoles} from './content.mjs';
import {matchups} from './matchups.mjs';
import {pageLayout} from './layout.mjs';
import {renderExtras,renderCoverage} from './extras-layout.mjs';
import {supplements,variants} from './supplemental-content.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name + '.json'), 'utf8'));
const snapshot = read('snapshot'), decks = read('decks'), cards = read('cards'), stats = read('matchup-stats'), audit = read('audit-data');
const assetVersion=createHash('sha256').update(['build.mjs','content.mjs','supplemental-content.mjs','matchups.mjs','decks.json','cards.json','matchup-stats.json','audit-data.json','app.js','styles.css'].map(n=>fs.readFileSync(path.join(root,n),'utf8')).join('\n')).digest('hex').slice(0,12);
// These Japanese face names were checked against the included printed images.
const printedNames = {
 'Ajani, Nacatl Pariah // Ajani, Nacatl Avenger':['ナカティルの最下層民、アジャニ','ナカティルの報復者、アジャニ'],
 'Ral, Monsoon Mage // Ral, Leyline Prodigy':['モンスーンの魔道士、ラル','力線の神童、ラル'],
 'Wear // Tear':['摩耗','損耗']
};
for(const c of Object.values(cards))if(printedNames[c.name]){
 const names=printedNames[c.name];c.ja=names.join(' // ');
 c.images.forEach((img,i)=>img.name=c.images.length===1?names.join('／'):names[i]);
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const card = name => { if (!cards[name]) throw new Error('Missing card: ' + name); return cards[name]; };
const label = name => {const c=card(name);return c.images.length===1&&c.name.includes(' // ')?c.ja.replace(' // ','／'):c.ja.split(' // ')[0];};
const colorNames = {W:'白',U:'青',B:'黒',R:'赤',G:'緑',C:'無色'};
const mana = value => esc(value).replace(/\{([^}]+)\}/g, (_, s) => `<span class="mana-symbol mana-${s.replace(/[^WUBRGC]/g,'')}" title="${esc(colorNames[s] || s)}">${esc(s)}</span>`);
const prose = value => mana(value);
const sum = rows => rows.reduce((n,c) => n + c.count,0);
const countIn = (rows,name) => rows.filter(c => c.name === name || cards[c.name]?.oracleId === card(name).oracleId).reduce((n,c)=>n+c.count,0);
const image = (name, eager=false) => `<button type="button" class="card-image" data-card="${esc(name)}" aria-label="${esc(label(name))}を拡大"><img src="${esc(card(name).images[0].local)}" alt="${esc(label(name))}の実物カード画像${card(name).lang==='en'?'（英語版）':''}" width="488" height="680" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async"></button>`;
const link = name => `<button type="button" class="card-link" data-card="${esc(name)}"><span>${esc(label(name))}</span><small>${esc(name)}</small></button>`;
const groups = [ ['Land','土地','land'],['Creature','クリーチャー','creature'],['Instant','インスタント','instant'],['Sorcery','ソーサリー','sorcery'],['Artifact','アーティファクト','artifact'],['Enchantment','エンチャント','enchantment'],['Planeswalker','プレインズウォーカー','planeswalker'] ];
function groupFor(name) { const type = card(name).type.split(' // ')[0].split(' — ')[0]; return groups.find(([key])=>type.includes(key)) || groups[4]; }
function grouped(rows) {return groups.map(g=>({g,rows:rows.filter(c=>groupFor(c.name)[0]===g[0])})).filter(g=>g.rows.length);}
function heading(index,title,note='') {return `<div class="sub-heading"><span class="section-index">${index}</span><h4>${esc(title)}</h4>${note?`<span class="pill">${esc(note)}</span>`:''}</div>`;}
function table(rows,title) {return `<table class="deck-table"><caption>${esc(title)} · ${sum(rows)}枚</caption><thead><tr><th scope="col">枚数</th><th scope="col">カード</th><th scope="col">コスト</th></tr></thead><tbody>${grouped(rows).map(({g,rows})=>`<tr class="group-row"><th colspan="3" scope="colgroup">${g[1]} ${sum(rows)}枚</th></tr>${rows.map(c=>`<tr><td class="quantity">${c.count}</td><td>${link(c.name)}</td><td class="cost">${mana(card(c.name).mana)||'—'}</td></tr>`).join('')}`).join('')}</tbody></table>`;}

const slimDecks = [];
function profile(p,index) {
 const meta = decks[index], rep = meta.representative, d = rep.deck;
 if (sum(d.mainboard)!==60 || sum(d.sideboard)!==15) throw new Error('Incomplete deck: '+p.id);
 const composition = grouped(d.mainboard), curve = [0,0,0,0,0,0,0];
 d.mainboard.filter(c=>groupFor(c.name)[0]!=='Land').forEach(c=>curve[Math.min(6,Math.floor(card(c.name).cmc))]+=c.count);
 const landCount = composition.find(c=>c.g[0]==='Land')?.rows.reduce((n,c)=>n+c.count,0)||0;
 const mdfc = d.mainboard.filter(c=>groupFor(c.name)[0]!=='Land' && card(c.name).faces.some(f=>f.type.includes('Land'))).reduce((n,c)=>n+c.count,0);
 const core = p.key.map(([name,role,description])=>{
   const n = countIn(d.mainboard,name), sb = countIn(d.sideboard,name);
   const frequency = meta.candidates.filter(x=>countIn(x.mainboard,name)>0).length;
   return `<div class="key-card">${image(name)}<div class="role">${esc(role)}</div><h5>${esc(label(name))}</h5><div class="card-en">${esc(name)}</div><div class="key-meta"><span>代表：${n?`メイン${n}枚`:`サイド${sb}枚`}</span><span>比較${rep.sampleSize}件中${frequency}件がメイン採用</span></div><p>${prose(description)}</p></div>`;
 }).join('');
 const step = p.combo.steps[0];
 const combo = `<div class="combo-box" data-combo="${p.id}"><div class="combo-top"><span class="pill gold">${esc(p.combo.kind)}</span><h5>${esc(p.combo.title)}</h5><p>${prose(p.combo.setup)}</p></div><div class="combo-body"><div class="combo-cards">${p.combo.cards.map(n=>`<div>${image(n)}<div class="card-name">${esc(label(n))}</div></div>`).join('')}</div><div class="combo-stage" aria-live="polite"><div class="step-kicker">STEP <span data-step-current>1</span> / ${p.combo.steps.length}</div><h6 data-step-title>${esc(step[0])}</h6><p class="step-body" data-step-body>${prose(step[1])}</p><div class="step-state" data-step-state>${prose(step[2])}</div><div class="step-navigation"><button class="btn light" data-step-dir="-1" disabled>← 戻る</button><button class="btn light" data-step-dir="1">次の動き →</button></div></div></div><div class="step-dots" aria-label="コンボの手順">${p.combo.steps.map((s,i)=>`<button data-step="${i}" ${i===0?'aria-current="step"':''} aria-label="手順${i+1}：${esc(s[0])}">${i+1}</button>`).join('')}</div><ol class="print-steps">${p.combo.steps.map(s=>`<li><strong>${esc(s[0])}</strong>${prose(s[1])} <em>${prose(s[2])}</em></li>`).join('')}</ol><div class="combo-result"><b>この動きで得るもの：</b>${prose(p.combo.result)}</div></div><div class="stop-point"><strong>相手側：ここを止める</strong>${prose(p.combo.stop)}</div><ul class="pitfalls">${p.combo.pitfalls.map(x=>`<li>${prose(x)}</li>`).join('')}</ul>`;
 const compositionHTML = `<div class="composition"><div class="composition-chart"><p class="chart-title">メイン60枚の内訳</p><div class="composition-bar" role="img" aria-label="${esc(composition.map(({g,rows})=>g[1]+sum(rows)+'枚').join('、'))}">${composition.map(({g,rows})=>`<span class="part-${g[2]}" style="width:${sum(rows)/60*100}%"></span>`).join('')}</div><div class="composition-legend">${composition.map(({g,rows})=>`<span><i class="legend-dot part-${g[2]}"></i>${g[1]} <b>${sum(rows)}</b></span>`).join('')}</div><p class="chart-foot">カード表面のタイプで1分類。土地・クリーチャーのドライアドの東屋は土地、アーティファクト・クリーチャーはクリーチャーに集計。${mdfc?`両面カードの土地面を使えば、土地として置ける枠は最大${landCount+mdfc}枚（表面土地${landCount}＋裏面土地${mdfc}）。`:''}</p></div><div class="curve-chart"><p class="chart-title">土地以外のマナ総量</p><div class="curve-bars" role="img" aria-label="${curve.map((n,i)=>`${i===6?'6以上':i}マナ${n}枚`).join('、')}">${curve.map((n,i)=>`<div class="curve-col"><span class="curve-value">${n}</span><span class="curve-bar" style="height:${n/Math.max(...curve)*65}px"></span><span class="curve-label">${i===6?'6+':i}</span></div>`).join('')}</div><p class="chart-foot">印刷上のマナ総量。召集・想起・ワープ・親和・ドメイン・軽減やXの支払いを含む実際のコストとは異なる。両面カードは表面で集計。</p></div></div>`;
 const hands = `<div class="hands">${p.hands.map((h,i)=>`<div class="hand-example ${i===1?'bad':''}"><h5>${esc(h.label)} · 7枚の例</h5><div class="hand-cards">${h.cards.map(n=>`<button class="hand-chip" data-card="${esc(n)}">${esc(label(n))}</button>`).join('')}</div><p>${prose(h.why)}</p></div>`).join('')}</div><p class="chart-foot">相手不明・通常の初手を想定した学習例。先手後手、相手のデッキ、既に何回マリガンしたかで判断は変わる。</p>`;
 const placement = /League/i.test(d.event)?'掲載リスト（順位なし）':`${d.placement}位`;
 const source = `<div class="deck-list-source"><b>${esc(d.player)}</b> · ${esc(d.event)} · ${esc(d.eventDate)} · ${esc(placement)}<br><a href="${esc(d.url)}" target="_blank" rel="noopener">実際の75枚を原典で確認 ↗</a> · 比較した完全リスト${rep.sampleSize}件から選んだ代表例。他の比較リストとの平均的な枚数差が最小の実在リストを使用。</div>`;
 const gallery = `<div class="gallery-view" data-gallery-view hidden>${[['MAIN',d.mainboard],['SIDE',d.sideboard]].map(([zone,rows])=>rows.map(c=>`<figure class="gallery-card">${image(c.name)}<figcaption><b>${c.count}枚</b> <span>${zone}</span><br>${esc(label(c.name))}</figcaption></figure>`).join('')).join('')}</div>`;
 fs.mkdirSync(path.join(root,'decklists'),{recursive:true});
 fs.writeFileSync(path.join(root,'decklists',p.id+'.txt'),`${d.mainboard.map(c=>`${c.count} ${c.name}`).join('\n')}\n\nSideboard\n${d.sideboard.map(c=>`${c.count} ${c.name}`).join('\n')}\n`,'utf8');
 slimDecks.push({id:p.id,name:p.name,short:p.short,english:p.english,rank:meta.rank,share:meta.sharePercent,main:d.mainboard,side:d.sideboard,combo:p.combo,search:[p.name,p.english,p.style,meta.name,...d.mainboard.map(c=>c.name+' '+label(c.name)),...d.sideboard.map(c=>c.name+' '+label(c.name))].join(' ')});
 return `<article class="deck-profile" id="deck-${p.id}" data-profile="${p.id}" ${index?'hidden':''} aria-labelledby="title-${p.id}"><div class="deck-cover"><div><div class="cover-rank">${String(meta.rank).padStart(2,'0')}</div><h3 id="title-${p.id}">${esc(p.name)}</h3><div class="english">${esc(p.english)}</div><div class="tagline"><span class="color-dots" aria-label="${p.colors.map(x=>colorNames[x]).join('・')}">${p.colors.map(x=>mana('{'+x+'}')).join('')}</span><span class="pill dark">${esc(p.style)}</span><span class="pill gold">分類全体 ${meta.sharePercent}%</span></div><p class="lead">${esc(p.lead)}</p></div><div class="cover-cards">${p.key.slice(0,2).map(x=>image(x[0])).join('')}</div></div><p class="profile-summary">${prose(p.summary)}</p><div class="scope-note"><b>分類と代表型：</b>${prose(p.scope)}</div><p class="identity-note"><b>相手のデッキを見分ける：</b>${prose(p.identity)}</p><nav class="local-nav" aria-label="${esc(p.name)}の内容"><a href="#${p.id}-key">重要カード</a><a href="#${p.id}-turns">ターンの流れ</a><a href="#${p.id}-combo">コンボ・連動</a><a href="#${p.id}-build">構成・初手</a><a href="#${p.id}-side">対策・サイド</a><a href="#${p.id}-list">全75枚</a></nav><section class="profile-section" id="${p.id}-key">${heading('01','このカードで理解する','クリックで拡大')}<div class="card-grid">${core}</div></section><section class="profile-section" id="${p.id}-turns">${heading('02','ターンごとの基本プラン',p.pace)}<div class="timeline">${p.turns.map(t=>`<div class="turn"><span class="turn-label">${esc(t[0])}</span><h5>${esc(t[1])}</h5><p>${prose(t[2])}</p></div>`).join('')}</div><p class="chart-foot">理想的な進行例。毎回この順番や速度で成立するわけではない。妨害に応じて迂回する。</p></section><section class="profile-section" id="${p.id}-combo">${heading('03','動きを1手ずつ見る')}${combo}</section><section class="profile-section" id="${p.id}-build">${heading('04','構成と初手の考え方')}${compositionHTML}<div style="margin-top:24px">${hands}</div></section><section class="profile-section" id="${p.id}-side">${heading('05','操縦する側 / 対戦する側')}<div class="play-sides"><div><h5>自分が使うなら</h5><ol>${p.pilot.map(x=>`<li>${prose(x)}</li>`).join('')}</ol></div><div><h5>相手が使うなら</h5><ol>${p.against.map(x=>`<li>${prose(x)}</li>`).join('')}</ol></div></div><h5 class="side-heading">代表サイドの役割</h5><div class="side-grid">${p.side.map(([n,role,why])=>`<div class="side-item">${image(n)}<div><h6>${esc(label(n))} <small>×${countIn(d.sideboard,n)}</small></h6><div class="side-role">${esc(role)}</div><p>${prose(why)}</p></div></div>`).join('')}</div><div class="variant-note"><b>構築によって変わる点：</b>${prose(p.switches)}${variants.some(v=>v.rank===meta.rank)?` <a href="#variant-${variants.find(v=>v.rank===meta.rank).id}">別型の実在リストを見る →</a>`:''}</div><div class="btn-row" style="margin-top:18px"><a class="btn" href="#matchups" data-match-from="${p.id}">このデッキの対戦相性を見る →</a></div></section><section class="profile-section" id="${p.id}-list">${heading('06','実在する代表リスト：60＋15枚')}<div class="list-tools"><span class="small muted">日本語名＋英語名。全カードを拡大できます。</span><div class="btn-row"><button class="btn" data-toggle-gallery aria-pressed="false">画像一覧に切替</button><a class="btn" href="decklists/${p.id}.txt" download="modern-${p.id}-2026-10-02.txt">リストを保存 ↓</a></div></div>${source}<div class="table-view" data-table-view><div class="deck-tables">${table(d.mainboard,'MAIN DECK')}${table(d.sideboard,'SIDEBOARD')}</div></div>${gallery}</section></article>`;
}

const articles = profiles.map(profile).join('');
const options = selected => profiles.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
const initialA = 'broodscale', initialB = 'devoted';
const matchupText = (a,b) => matchups.find(x=>x[0]===a&&x[1]===b||x[0]===b&&x[1]===a);
const initialStats = stats.matrix[initialA][initialB], initialText = matchupText(initialA,initialB);
const matrix = `<table class="matrix"><caption class="sr-only">行のデッキから列のデッキへの公開マッチ勝率。各セルに対戦数を併記。</caption><thead><tr><th scope="col">行 → 列</th>${profiles.map(p=>`<th scope="col" title="${esc(p.name)}">${esc(p.short)}</th>`).join('')}</tr></thead><tbody>${profiles.map(a=>`<tr><th scope="row">${esc(a.short)}</th>${profiles.map(b=>{const s=stats.matrix[a.id]?.[b.id];if(a.id===b.id)return '<td class="mirror">—</td>';const cls=!s?'':s.n<30?'low-sample':s.low>50?'signal-up':s.high<50?'signal-down':'';return `<td><button class="${cls}" data-match-a="${a.id}" data-match-b="${b.id}" aria-label="${esc(a.name)}から${esc(b.name)}、${s?`勝率${s.win}%、${s.n}対戦`:'データなし'}" ${a.id===initialA&&b.id===initialB?'aria-pressed="true"':'aria-pressed="false"'}><b>${s?s.win+'%':'—'}</b><small>${s?'n='+s.n:'資料なし'}</small></button></td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
const {variantHTML,supplementalHTML,referenceDecks}=renderExtras({audit,root,esc,prose,image,label,table,sum});
const coverageHTML=renderCoverage({audit,esc});
const body=pageLayout({assetVersion,audit,snapshot,decks,profiles,stats,esc,image,prose,label,articles,options,matrix,initialStats,initialText,hate,glossary,variantHTML,supplementalHTML,coverageHTML});

const roles = {...generalRoles};
for (const p of [...supplements,...variants]) for (const [name,description] of p.cards) if (!roles[name]) roles[name]=description;
for (const p of profiles) for (const [name,,description] of p.key) if (!roles[name]) roles[name] = description;
for (const h of hate) if (!roles[h.card]) roles[h.card] = h.reason;
const slimCards = Object.fromEntries(Object.entries(cards).map(([n,c])=>[n,{name:c.name,ja:c.ja,imageLang:c.lang,mana:c.mana,cmc:c.cmc,type:c.type,power:c.power,toughness:c.toughness,images:c.images.map(x=>({local:x.local,name:x.name})),faces:c.faces.map(f=>({name:f.name,mana:f.mana,type:f.type,power:f.power,toughness:f.toughness})),url:c.url,oracleId:c.oracleId,role:roles[n]||roles[c.name]||''}]));
const payload = {decks:slimDecks,referenceDecks,cards:slimCards,stats,matchups:matchups.map(([a,b,,,main,post])=>({a,b,main,post}))};
const output = body;
fs.writeFileSync(path.join(root,'index.html'),output,'utf8');
fs.writeFileSync(path.join(root,'data.js'),'window.MODERN_ATLAS_DATA = '+JSON.stringify(payload).replace(/</g,'\\u003c')+';\n','utf8');
console.log(JSON.stringify({profiles:profiles.length,main:decks.reduce((n,d)=>n+sum(d.representative.deck.mainboard),0),side:decks.reduce((n,d)=>n+sum(d.representative.deck.sideboard),0),cards:Object.keys(slimCards).length,matchups:matchups.length,htmlBytes:Buffer.byteLength(body)},null,2));
