// Consistency checks (2026-11-23): each rule fires on its own broken case and stays quiet on a sound world.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkInvariants,checkReply} from '../app/invariants.mjs';

const nodes=[
  {id:'home',location_id:'L-home',name:'Ház',has_entry_room:true},
  {id:'liv',parent_id:'home',location_id:'L-liv',name:'Nappali'},
  {id:'street',location_id:'L-street',name:'Utca',walk_through:true},
  {id:'ward',location_id:'L-ward',name:'Szekrény',in_wardrobe:true},
  {id:'pub',location_id:'L-pub',name:'Kocsma'}
];
const cast=[{id:'a',name:'Aladár'},{id:'b',name:'Béla'},{id:'g',name:'Goblin',wardrobe_only:true}];
const sound={nodes,cast,positions:[['a','L-liv'],['b','L-pub'],['g','L-ward']],palorNodeId:'liv',presentAtPalor:['a'],openConversations:[],groupLinesWithoutSpeaker:0,appointmentsWithoutPlace:[]};
const codes=r=>r.errors.map(e=>e.code);

test('a sound world passes',()=>{const r=checkInvariants(sound);assert.equal(r.ok,true,JSON.stringify(r.errors));assert.equal(r.warnings.length,0);});
test('each broken fact gives its own error',()=>{
  const cases=[
    [{palorNodeId:'gone'},'PALOR_NOWHERE'],
    [{positions:[['a','L-nowhere']]},'LOST_PERSON'],
    [{positions:[['a','L-street']]},'ON_WALK_THROUGH'],
    [{positions:[['a','L-home']]},'IN_NO_ROOM'],
    [{positions:[['g','L-pub']]},'WARDROBE_ESCAPE'],
    [{nodes:[...nodes,{id:'pub2',location_id:'L-pub',name:'Kocsma 2'}]},'SHOWN_TWICE'],
    [{streetMeet:{node_id:'nope',character_id:'a'}},'STREET_MEET_BROKEN'],
    [{groupLinesWithoutSpeaker:2},'GROUP_LINE_NO_SPEAKER'],
    [{appointmentsWithoutPlace:[{id:'x',character_id:'b'}]},'APPOINTMENT_NO_PLACE']
  ];
  for(const [patch,code] of cases)assert.ok(codes(checkInvariants({...sound,...patch})).includes(code),code);
});
test('archived places do not count',()=>{
  const r=checkInvariants({...sound,nodes:[...nodes,{id:'old',location_id:'L-pub',name:'régi',archived:true}]});assert.equal(r.ok,true);
});
test('a face-to-face talk with someone who is not here is flagged, phone talk is not',()=>{
  const w=checkInvariants({...sound,openConversations:[{id:'c1',character_id:'b',channel:'in_person'},{id:'c2',character_id:'b',channel:'phone'}]}).warnings.map(x=>x.code);
  assert.ok(w.includes('TALK_PARTNER_ABSENT')&&w.includes('SEVERAL_OPEN_TALKS'));
  const g=checkInvariants({...sound,openConversations:[{id:'c3',mode:'group',channel:'in_person',participants:['a','b']}]}).warnings;
  assert.ok(g.some(x=>x.code==='TALK_PARTNER_ABSENT'&&x.ids.includes('b')&&!x.ids.includes('a')));
});
test('reply checks: empty, Palor written, prompt leak, repeat, cut short; a normal reply passes',()=>{
  const c=(t,o)=>checkReply(t,o).map(x=>x.code);
  assert.deepEqual(c('*Rád néz.* Na, mi újság?'),[]);
  assert.ok(c('  ').includes('EMPTY_REPLY'));
  assert.ok(c('Jó.\nPalor: Szia!').includes('WROTE_PALOR'));
  assert.ok(c('SZEREPKÁRTYA: hang…').includes('PROMPT_LEAK'));
  assert.ok(c('Na, mi újság?',{previous:['na mi újság']}).includes('REPEATED_REPLY'));
  assert.ok(c('x'.repeat(1500)).includes('CUT_SHORT'));
});
