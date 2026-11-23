// Closing voice reminder (2026-11-23): built only from the card, last in the prompt, nothing invented.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {voiceReminder,groupVoiceReminder,REMINDER_HEAD,GROUP_REMINDER_HEAD} from '../app/voice-reminder.mjs';
import {conversationFocus} from '../app/conversation-focus.mjs';

const prof=values=>({values:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{value:v}]))});
const full=prof({play_voice:'Rövid, száraz mondatok.',play_rules:'Ha dicsérik, témát vált.',play_contradiction:'Kemény, de a kutyájával lágy.',speech:'ignored when the card voice exists'});

test('reminder uses voice, rules and contradiction, and says not to turn generic',()=>{
  const r=voiceReminder(full);
  assert.ok(r.startsWith(REMINDER_HEAD));
  for(const x of ['Rövid, száraz mondatok.','Ha dicsérik, témát vált.','Kemény, de a kutyájával lágy.','Ne válj általános'])assert.ok(r.includes(x),x);
  assert.ok(!r.includes('ignored when'));
});
test('voice falls back to the speech field; no card and no speech gives no reminder',()=>{
  assert.ok(voiceReminder(prof({speech:'Lassan, vontatottan beszél.'})).includes('Lassan, vontatottan beszél.'));
  assert.equal(voiceReminder(prof({personality:'csendes'})),'');
  assert.equal(voiceReminder(null),'');
});
test('group reminder lists each person, skips people without material, keeps lines short',()=>{
  const r=groupVoiceReminder([{name:'Aladár',profile:full},{name:'Béla',profile:prof({})},{name:'Cini',profile:prof({play_voice:'x'.repeat(500)})}]);
  assert.ok(r.startsWith(GROUP_REMINDER_HEAD)&&r.includes('- Aladár:')&&!r.includes('Béla')&&r.includes('- Cini:'));
  assert.ok(r.length<900);
  assert.equal(groupVoiceReminder([{name:'Béla',profile:prof({})}]),'');
});
test('both prompts keep the voice reminder followed by current-turn priority',async()=>{
  const src=await readFile(new URL('../app/play-mode.mjs',import.meta.url),'utf8');
  assert.ok(/voiceReminder\(c\.profile\)[^\n]*\n\s*conversationFocus\(\{opener\}\)/.test(src));
  assert.ok(/groupVoiceReminder\(people\)[^\n]*\n\s*conversationFocus\(\{opener,group:true\}\)/.test(src));
  assert.match(conversationFocus(),/Először Palor legutóbbi kérdésére/);
  assert.match(conversationFocus({group:true}),/A megszólított szereplő először/);
  assert.match(conversationFocus({opener:true}),/Palor még nem szólt/);
});
