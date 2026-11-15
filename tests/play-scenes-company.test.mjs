import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayScenes} from '../app/play/scenes.mjs';

// Group scene pictures (owner 2026-11-15): intimate ones too, capped by the most reserved person.
test('a company scene picture is capped by the most reserved person and by the beat',async()=>{
  const asked=[];const stages={a:'intimate',b:'intimate',c:'flirt'};
  const director={pick:async q=>{asked.push(q);return {items:[]};}};
  const scenes=createPlayScenes({one:()=>null,all:()=>[],fail:e=>new Error(e),w:{palor:()=>({id:'p'})},director,intimacyStage:id=>stages[id],clock:()=>({slot_index:0}),tree:async()=>[],currentNode:()=>null});
  await scenes.sceneFor({cid:'a',conv:null,beat:'sex',context:'',here:null,company:['a','b']});
  assert.equal(asked.at(-1).allow,'sexual_activity');assert.deepEqual(asked.at(-1).characters,['a','b','p']);
  await scenes.sceneFor({cid:'a',conv:null,beat:'sex',context:'',here:null,company:['a','b','c']});
  assert.equal(asked.at(-1).allow,'nudity','one of them only flirts: no sexual picture');
  await scenes.sceneFor({cid:'a',conv:null,beat:'talk',context:'',here:null,company:['a','b']});
  assert.equal(asked.at(-1).allow,'non_intimate','the beat is the ceiling');
});
