import {test} from 'node:test';
import assert from 'node:assert/strict';
import {declaredNudity} from './pilot-selection-labels.mjs';

test('private metadata selection distinguishes shirtless labels from full nudity words and negation',()=>{
  for(const text of ['félmeztelen testreferencia','Félmeztelenül ül','shirtless adult','semi-nude reference'])assert.equal(declaredNudity(text),'partial',text);
  for(const text of ['#meztelen','teljesen meztelen felnőtt','meztelenül áll','fully nude adult'])assert.equal(declaredNudity(text),'full',text);
  for(const text of ['nem meztelen','ne legyen meztelen','not nude','meztelenség','ordinary portrait',null])assert.equal(declaredNudity(text),'not_declared',String(text));
});
