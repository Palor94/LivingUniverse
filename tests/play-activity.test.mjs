import {test} from 'node:test';
import assert from 'node:assert/strict';
import {describeActivity,ROLE_TEXT} from '../app/play/rules.mjs';

// Owner, 2026-11-21 ("Magyarázatok"): the line about what someone is doing must carry information,
// not only "Dolgozik." / "Itt tölti az idejét.". Synthetic characters only.
test('activity line uses the place note and the fitting routine sentence',()=>{
  const routine='Műszakokban dolgozik biztonsági őrként a Teszt Plázában; a szüneteiben kimegy a pláza előtti térre dohányozni. Este otthon tévézik.';
  const work=describeActivity({role:'work',slotIndex:1,note:'Biztonsági őr',routine,place:'Teszthely - Teszt Pláza'});
  assert.match(work,/Műszakokban dolgozik biztonsági őrként/);
  assert.ok(!/^Biztonsági őr, /.test(work),'a routine sentence that says the same replaces the bare note');
  const smoke=describeActivity({role:'routine',slotIndex:1,note:'Cigarettaszünet',routine,place:'Teszt Pláza előtti tér'});
  assert.match(smoke,/Cigarettaszünet/);assert.match(smoke,/dohányozni/);
  const evening=describeActivity({role:'home',slotIndex:2,note:'',routine,place:'Teszt háza'});
  assert.match(evening,/^Otthon van, esti pihenő\. Este otthon tévézik\.$/);
});

test('approval boilerplate and owner stamps never reach the player',()=>{
  const a=describeActivity({role:'home',slotIndex:1,note:'Profil alapján javasolva, a tulajdonos jóváhagyta (2026-11-13).'});
  assert.equal(a,'Otthon van.');
  const b=describeActivity({role:'home',slotIndex:3,note:'A brigád szállása a Teszt Munkásszálló (tulajdonos, 2026-11-13).'});
  assert.equal(b,'Otthon van, éjszaka. A brigád szállása a Teszt Munkásszálló.');
  assert.ok(!/tulajdonos|2026/.test(b));
});

test('no routine match falls back to a short, time-aware line, never a random sentence',()=>{
  const r=describeActivity({role:'work',slotIndex:0,note:'',routine:'Szereti a kutyákat. Nyáron horgászik.',place:'Teszt Műhely'});
  assert.equal(r,'Reggeli műszakban dolgozik.');
  assert.equal(describeActivity({role:'unknown'}),'Éppen itt van.');
  // Prompts keep their own fixed wording.
  assert.equal(ROLE_TEXT.work,'Dolgozik.');
});
