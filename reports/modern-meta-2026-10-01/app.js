'use strict';
(() => {
 const data = window.MODERN_ATLAS_DATA;
 if (!data) return;
 const $ = selector => document.querySelector(selector);
 const $$ = selector => Array.from(document.querySelectorAll(selector));
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colorNames = {W:'白',U:'青',B:'黒',R:'赤',G:'緑',C:'無色'};
 const mana = value => esc(value).replace(/\{([^}]+)\}/g, (_,s)=>`<span class="mana-symbol mana-${s.replace(/[^WUBRGC]/g,'')}" title="${esc(colorNames[s]||s)}">${esc(s)}</span>`);
 const label = name => {const c=data.cards[name];return c.images.length===1&&c.name.includes(' // ')?c.ja.replace(' // ','／'):c.ja.split(' // ')[0];};
 let current = data.decks[0].id;
 const deckFor = id => data.decks.find(d=>d.id===id);
 const steps = new Map(data.decks.map(d=>[d.id,0]));
 const dialog = $('#card-dialog');
 let activeCard, activeFace = 0, opener;

 function showDeck(id, scroll=false, list=false) {
   const d=deckFor(id); if(!d) return;
   current=id;
   $$('[data-profile]').forEach(el=>el.hidden=el.dataset.profile!==id);
   $$('.deck-menu [data-deck]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.deck===id)));
   $('#deck-picker').value=id;
   $('#reader-status').textContent=`${String(d.rank).padStart(2,'0')} / 10 · ${d.name}`;
   $('#deck-prev').disabled=d.rank===1; $('#deck-next').disabled=d.rank===10;
   if (scroll) {
     const target=list?$('#'+id+'-list'):$('#atlas');
     const hash=list?'#'+id+'-list':'#deck-'+id;
     try {history.replaceState(null,'',hash);} catch {location.hash=hash;}
     target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
   }
 }
 function readHash() {
   const hash=decodeURIComponent(location.hash.slice(1));
   const d=data.decks.find(x=>hash==='deck-'+x.id || hash.startsWith(x.id+'-'));
   if(d) {showDeck(d.id); requestAnimationFrame(()=>document.getElementById(hash)?.scrollIntoView({block:'start'}));}
 }
 function showStep(id,index) {
   const d=deckFor(id), box=$(`[data-combo="${id}"]`);
   const i=Math.max(0,Math.min(d.combo.steps.length-1,index)), step=d.combo.steps[i]; steps.set(id,i);
   box.querySelector('[data-step-current]').textContent=i+1;
   box.querySelector('[data-step-title]').textContent=step[0];
   box.querySelector('[data-step-body]').innerHTML=mana(step[1]);
   box.querySelector('[data-step-state]').innerHTML=mana(step[2]);
   box.querySelector('[data-step-dir="-1"]').disabled=i===0;
   box.querySelector('[data-step-dir="1"]').disabled=i===d.combo.steps.length-1;
   box.querySelectorAll('[data-step]').forEach(el=>{if(Number(el.dataset.step)===i)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 }
 function cardRole(c) {
   if(c.role) return c.role;
   const type=c.type.split(' // ')[0];
   if(type.includes('Basic Land')) return '基本土地。対応する色のマナを出し、フェッチランドから探せる。基本土地は《血染めの月》の影響を受けない。';
   if(type.includes('Land')) return 'マナ基盤の1枚。出せる色、タップインの条件、追加の能力を画像で確認。土地タイプはフェッチランドやドメインの成立にも関係する。';
   return 'この代表リストに採用されたカード。カード画像でコストと能力を確認し、厳密な現行文面・裁定は下のリンクから参照できます。';
 }
 function renderCardFace() {
   const c=activeCard, f=c.faces[activeFace], img=c.images[activeFace]||c.images[0];
   $('#dialog-card-image').src=img.local;
   $('#dialog-card-image').alt=img.name+'の実物カード画像'+(c.imageLang==='en'?'（英語版）':'');
   $('#dialog-card-title').textContent=img.name||c.ja;
   $('#dialog-card-en').textContent=f?.name || c.name;
   $('#dialog-mana').innerHTML=mana(f?.mana??c.mana);
   const type=f?.type || c.type;
   const faceStats=f||c;
   const pt=faceStats.power!==undefined?`${faceStats.power}/${faceStats.toughness}`:'';
   $('#dialog-type').textContent=type+(pt?' · '+pt:'');
   $('#dialog-role').textContent=(activeFace?'表裏を含む、このカード全体の役割：':'')+cardRole(c);
   $('#dialog-flip').hidden=c.images.length<2;
   $('#dialog-flip').textContent=activeFace?'表面を見る ↻':'裏面を見る ↻';
   $('.dialog-note').textContent=(c.imageLang==='en'?'英語版の実物画像。日本語名と解説を併記。 ':'')+'印刷画像と現在の文面が異なる場合は、Oracleを優先。画像はScryfallより。';
 }
 function openCard(name,button) {
   const c=data.cards[name];if(!c)return;
   opener=button;activeCard=c;activeFace=0;
   $('#dialog-scryfall').href=c.url;
   const usage=[...data.decks,...data.referenceDecks].map(d=>{
     const match=rows=>rows.filter(x=>data.cards[x.name].oracleId===c.oracleId).reduce((n,x)=>n+x.count,0);
     const main=match(d.main), side=match(d.side);
     return main||side?`${d.name}（${main?'メイン'+main+'枚':''}${main&&side?' / ':''}${side?'サイド'+side+'枚':''}）`:null;
   }).filter(Boolean);
   $('#dialog-decks').textContent=usage.length?'この資料での採用：'+usage.join('、'):'対策・派生型の理解用カード。この代表75枚への採用は各リストで確認してください。';
   renderCardFace(); dialog.showModal();
 }
 function updateMatchup(a,b) {
   const da=deckFor(a), db=deckFor(b);if(!da||!db)return;
   $('#match-deck-a').value=a;$('#match-deck-b').value=b;
   $('#match-title').textContent=da.name+' × '+db.name;
   const s=data.stats.matrix[a]?.[b];
   const text=data.matchups.find(x=>x.a===a&&x.b===b || x.a===b&&x.b===a);
   if(a===b){
     $('#match-win').textContent='ミラー';$('#match-sample').textContent='同型同士';
     $('#match-uncertainty').textContent='同型戦の勝率は片側の有利不利を示しません。サイド構成・先手後手・リソースの使い方で差がつきます。';
     $('#match-main').textContent='相手も同じ勝ち筋を持つ。展開の速度だけでなく、妨害を使うタイミング、必要な部品の温存、通常展開への切替を意識する。';
     $('#match-post').textContent='相手が入れ得る対策を、このデッキの「対戦する側」「代表サイド」の項目で確認。対策だけの手札で自分の勝ち筋を失わないようにする。';
   } else {
     $('#match-win').textContent=s?s.win+'%':'—';
     $('#match-sample').innerHTML=s?`${s.n}対戦<br>掲載区間 ${s.low}〜${s.high}%`:'公開データなし';
     let uncertainty;
     if(!s)uncertainty='この組み合わせの公開数値を取得できていません。構成からの分析を読んでください。';
     else if(s.n<30)uncertainty=`${s.n}対戦だけの少数標本。掲載区間は${s.low}〜${s.high}%と広く、数字だけで有利不利を確定できません。`;
     else if(s.low>50)uncertainty=`行側に優位の兆候（掲載区間${s.low}〜${s.high}%）。リスト・操縦者・大会の混在があり、将来の勝率を保証しません。`;
     else if(s.high<50)uncertainty=`行側に劣位の兆候（掲載区間${s.low}〜${s.high}%）。リスト・操縦者・大会の混在があり、将来の勝率を保証しません。`;
     else uncertainty=`掲載区間${s.low}〜${s.high}%は50%をまたぎます。この標本だけでは有利不利の断定を避けます。構成・対策の差も確認してください。`;
     $('#match-uncertainty').textContent=uncertainty;
     $('#match-main').innerHTML=text?mana(text.main):'';
     $('#match-post').innerHTML=text?mana(text.post):'';
   }
   $('#match-source').textContent=`統計分類：${data.stats.mapping[a]} / ${data.stats.mapping[b]}。期間${data.stats.from.replaceAll('-','.')}〜${data.stats.to.replaceAll('-','.') }、マッチ全体の値。`;
   $('#match-open-buttons').innerHTML=`<button class="btn" data-deck="${a}">${esc(da.name)}の75枚を見る</button>${a===b?'':`<button class="btn" data-deck="${b}">${esc(db.name)}の75枚を見る</button>`}`;
   $$('[data-match-a]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.matchA===a&&el.dataset.matchB===b)));
 }
 document.addEventListener('click',event=>{
   const target=event.target.closest('button,a');if(!target)return;
   if(target.dataset.card){openCard(target.dataset.card,target);return;}
   if(target.dataset.deck){showDeck(target.dataset.deck,true,Boolean(target.closest('#match-open-buttons')));return;}
   const combo=target.closest('[data-combo]');
   if(combo && target.dataset.step!==undefined){showStep(combo.dataset.combo,Number(target.dataset.step));return;}
   if(combo && target.dataset.stepDir){showStep(combo.dataset.combo,steps.get(combo.dataset.combo)+Number(target.dataset.stepDir));return;}
   if(target.hasAttribute('data-toggle-gallery')){
     const profile=target.closest('[data-list-block]')||target.closest('[data-profile]'), gallery=profile.querySelector('[data-gallery-view]'), table=profile.querySelector('[data-table-view]');
     const show=gallery.hidden;gallery.hidden=!show;table.hidden=show;
     target.setAttribute('aria-pressed',String(show));target.textContent=show?'リスト表示に戻す':'画像一覧に切替';return;
   }
   if(target.dataset.matchA){updateMatchup(target.dataset.matchA,target.dataset.matchB);$('#match-detail').scrollIntoView({behavior:'smooth',block:'nearest'});return;}
   if(target.dataset.matchFrom){const a=target.dataset.matchFrom,b=$('#match-deck-b').value;updateMatchup(a,a===b?data.decks.find(x=>x.id!==a).id:b);return;}
   if(target.hasAttribute('data-print'))window.print();
 });
 $('#deck-prev').addEventListener('click',()=>{const d=deckFor(current);showDeck(data.decks[d.rank-2]?.id,true);});
 $('#deck-next').addEventListener('click',()=>{const d=deckFor(current);showDeck(data.decks[d.rank]?.id,true);});
 $('#deck-picker').addEventListener('change',event=>showDeck(event.target.value,true));
 $('#deck-search').addEventListener('input',event=>{
   const term=event.target.value.trim().toLocaleLowerCase('ja'),matches=data.decks.filter(d=>d.search.toLocaleLowerCase('ja').includes(term));
   $$('.deck-menu [data-deck]').forEach(el=>el.hidden=!matches.some(d=>d.id===el.dataset.deck));
   $('#search-state').textContent=matches.length?matches.length+'デッキ'+(term?'が一致':''):'一致なし。日本語名・英語名で検索できます。';
 });
 $('#match-deck-a').addEventListener('change',()=>updateMatchup($('#match-deck-a').value,$('#match-deck-b').value));
 $('#match-deck-b').addEventListener('change',()=>updateMatchup($('#match-deck-a').value,$('#match-deck-b').value));
 $('#dialog-close').addEventListener('click',()=>dialog.close());
 $('#dialog-flip').addEventListener('click',()=>{activeFace=activeFace?0:1;renderCardFace();});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>opener?.focus({preventScroll:true}));
 window.addEventListener('hashchange',readHash);
 const printState=new Map();
 window.addEventListener('beforeprint',()=>{
   $$('details').forEach(el=>{printState.set(el,el.open);el.open=true;});
 });
 window.addEventListener('afterprint',()=>{
   printState.forEach((open,el)=>el.open=open);printState.clear();
 });
 readHash();
})();
