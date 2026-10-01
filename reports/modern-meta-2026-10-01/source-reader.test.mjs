import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeSource,extractReportDeck} from './source-reader.mjs';

const link={url:'https://mtgtop8.com/event?e=91444&d=894493&f=MO',name:'Scepter Chant'};
const row=(id,count,name,decoration='')=>`<div class="deck_line" id="${id}">${count} ${decoration}<span class="L14">${name}</span></div>`;

test('report source adapter preserves companion inside a nested decorative div',()=>{
 const html='<div>32 players - 30/09/26</div>'+row('md1',60,'Island')+row('sb1',14,'Plains')+row('sb2',1,'Kaheera, the Orphanguard','<div><img id="companion_sb2" src="companion.png"></div>');
 const d=extractReportDeck(html,link);
 assert.equal(d.mainboardCount,60);assert.equal(d.sideboardCount,15);
 assert.deepEqual(d.sideboard,[{name:'Plains',count:14},{name:'Kaheera, the Orphanguard',count:1}]);
 assert.equal(d.eventDate,'2026-09-30');
});

test('report source adapter decodes source charset before matching card names',()=>{
 const raw=Buffer.from(row('md1',4,'Lórien Revealed'),'latin1');
 const html=decodeSource(raw,'text/html; charset="iso-8859-1"');
 assert.deepEqual(extractReportDeck(html,link).mainboard,[{name:'Lórien Revealed',count:4}]);
 assert.equal(decodeSource(new TextEncoder().encode('対なす幻視')),'対なす幻視');
});

test('report source adapter ignores sidebar names outside explicit main and side rows',()=>{
 const html=row('md1',4,'Solitude')+row('sb1',1,'Ashiok, Dream Render')+'<div class="deck_line" id="other1">4 <span class="L14">The One Ring</span></div><p>4 unrelated cards</p>';
 const d=extractReportDeck(html,link);
 assert.deepEqual(d.mainboard,[{name:'Solitude',count:4}]);assert.deepEqual(d.sideboard,[{name:'Ashiok, Dream Render',count:1}]);
 assert(!d.cards.includes('The One Ring'));
});
