import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LEVELS,RANK,CONTENT_WORD,WORD_LEVEL,videoFrameLevelSql,aiLevelOf,aiLevelSql} from '../app/content-levels.mjs';
import {STAGE_ALLOW,BEAT_WANT} from '../app/play/rules.mjs';

test('content levels: félmeztelen sits between everyday and nude (owner, 2026-11-22)',()=>{
  assert.deepEqual(LEVELS,['non_intimate','shirtless','nudity','sexual_activity']);
  assert.ok(RANK.non_intimate<RANK.shirtless&&RANK.shirtless<RANK.nudity&&RANK.nudity<RANK.sexual_activity);
  for(const l of LEVELS)assert.equal(WORD_LEVEL[CONTENT_WORD[l]],l,'every level has a file-name word that reads back');
  assert.equal(CONTENT_WORD.shirtless,'felmeztelen');
  // The stage ceilings and beats keep their meaning: everyday stays everyday, flirt allows shirtless and nude.
  assert.equal(STAGE_ALLOW.none,'non_intimate');assert.ok(RANK.shirtless<=RANK[STAGE_ALLOW.flirt]);
  assert.equal(LEVELS[BEAT_WANT.talk],'non_intimate');assert.equal(LEVELS[BEAT_WANT.kiss],'shirtless','a kiss wants shirtless');assert.equal(LEVELS[BEAT_WANT.undress],'nudity');assert.equal(LEVELS[BEAT_WANT.sex],'sexual_activity');
});

test('content levels: a video counts as its most intimate analysed still',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE media_video_frames(media_id TEXT,t REAL,level TEXT)');
    const ins=db.prepare('INSERT INTO media_video_frames VALUES(?,?,?)');
    ins.run('v1',0,'non_intimate');ins.run('v1',1,'shirtless');ins.run('v2',0,'shirtless');ins.run('v2',1,'nudity');ins.run('v3',0,null);
    const level=id=>db.prepare(`SELECT ${videoFrameLevelSql('?')} level`).get(id).level;
    assert.equal(level('v1'),'shirtless');assert.equal(level('v2'),'nudity');assert.equal(level('v3'),null);
  }finally{db.close();}
});

test('content levels: AI "bare chest" / "bare torso" evidence means shirtless, never lower',()=>{
  const cases=[[{level:'non_intimate',evidence:'A bare chest is visible, with no exposed genitals or sexual activity.'},'shirtless'],
    [{level:'non_intimate',evidence:'A Bare Torso is visible in an ordinary desk scene.'},'shirtless'],
    [{level:'non_intimate',evidence:'He is bare-chested on the beach.'},'shirtless'],
    [{level:'non_intimate',evidence:'Fully clothed.'},'non_intimate'],
    [{level:'nudity',evidence:'Bare chest and exposed genitals.'},'nudity'],
    [{level:'unclear',evidence:'bare torso, partly hidden'},'unclear']];
  const db=new DatabaseSync(':memory:');
  try{
    for(const [content,want] of cases){
      assert.equal(aiLevelOf(content),want,content.evidence);
      assert.equal(db.prepare(`SELECT ${aiLevelSql('r.j')} l FROM (SELECT ? j) r`).get(JSON.stringify({world_details:{content}})).l,want,'SQL: '+content.evidence);
    }
  }finally{db.close();}
});
