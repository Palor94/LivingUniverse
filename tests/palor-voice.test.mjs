import {test} from 'node:test';
import assert from 'node:assert/strict';
import {palorVoice,speechOf} from '../app/play/palor-voice.mjs';

// Synthetic speech text only (AGENTS.md: no real character data in tests).
const TEXT=['Általános beszédstílus','Halkan, gondolkodva beszél.','Gyakori fordulatai:','“Hát, figyelj…”','Hétköznapi beszélgetés','“Ma fáradt vagyok.”',
  'Teszt Márkkal','“Márk, gyere.” M1','Teszt Márkóval','“Márkó, ülj le.” M2','Attilával','“Attila, elég.” A1','A vonzalomról beszélve','“Az a kar…” FL1',
  'Flörtölés és puhatolózás','“Na, mesélj.” FL2','Intim kommunikáció','IN1 Közvetlen lesz.','Intimitás után','“Kérsz vizet?” IN2',
  'Dialogue Consistency','* Márk: Casual, playful banter.','* Márkó: Rivalry, attraction.'].join('\n');

test('Palor voice: general style, the section about this person, flirting; intimacy only in an intimate scene',()=>{
  const m=palorVoice(TEXT,'Kovács Márk');
  assert.ok(m.includes('Halkan')&&m.includes('Hát, figyelj')&&m.includes('M1')&&m.includes('Márk: Casual'));
  assert.ok(!m.includes('M2'),'"Márkóval" is not Márk');assert.ok(!m.includes('A1')&&!m.includes('Ma fáradt'));
  assert.ok(m.includes('FL1')&&m.includes('FL2'),'flirting and attraction go in (owner 2026-11-15)');
  assert.ok(!m.includes('IN1')&&!m.includes('IN2'),'no intimacy sections outside an intimate scene');
  const mi=palorVoice(TEXT,'Kovács Márk',{intimate:true});assert.ok(mi.includes('IN1')&&mi.includes('IN2'));
  const mo=palorVoice(TEXT,'Márkó');assert.ok(mo.includes('M2')&&!mo.includes('M1')&&mo.includes('Márkó: Rivalry, attraction'));
  assert.ok(palorVoice(TEXT,'Szabó Attila').includes('A1'),'a final a lengthens: Attilával');
  assert.ok(palorVoice('Aladárral\n“Na.” AL1\nCecillel\n“Jó.” C1','Teszt Aladár').includes('AL1'),'-val assimilates: Aladárral');
  assert.ok(!palorVoice('Aladárral\n“Na.” AL1','Teszt Ala').includes('AL1'),'a shorter name does not match a longer one');
  const s=palorVoice('Sanyival\n“Nem pirulok.” S1\nS2 Sanyival a vonzalom és a megvetés között ingadozik.','Sanyi');
  assert.ok(s.includes('S1')&&s.includes('S2'),'describing lines stay too');
  const nobody=palorVoice(TEXT,'Ismeretlen Béla');assert.ok(nobody.includes('Ma fáradt'),'nobody named: everyday talk');
  assert.equal(palorVoice('','Márk'),'');
});

test('speech text: the filled field wins, an accepted empty field stays empty, else the older text',()=>{
  assert.equal(speechOf({values:{speech:{value:'Új.'}},legacy:{speech_style:'Régi.'}}),'Új.');
  assert.equal(speechOf({values:{speech:{value:''}},legacy:{speech_style:'Régi.'}}),'');
  assert.equal(speechOf({values:{},legacy:{speech_style:'Régi.'}}),'Régi.');
  assert.equal(speechOf(null),'');
});
