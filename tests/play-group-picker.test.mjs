import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {t} from '../app/public/i18n.js';
const source=readFileSync(new URL('../app/public/play.js',import.meta.url),'utf8');
const chooser=source.slice(source.indexOf('export function chooseGroupParticipants(')).replace('export ','');
const start=source.slice(source.indexOf('  async function startGroup('),source.indexOf('  function renderGroupDialog('));
const people=['Ádám','Béla','Csaba','Dénes','Emil'].map((name,i)=>({id:'man-'+i,name:'Teszt '+name}));

test('A12 chooser validates counts locally and returns exactly the selected objects after explicit submit',async()=>{
  let dialog,focused=0;
  const ctx={t,document:{activeElement:{isConnected:true,focus(){focused++;}},body:{appendChild(){}},createElement(){
    const events={},form={},submit={},count={},cancel=[{},{}];
    dialog={boxes:[],setAttribute(){},set innerHTML(html){this.html=html;this.boxes=[...html.matchAll(/<input type="checkbox"[^>]*>/g)].map(m=>({checked:m[0].includes('checked'),focus(){}}));},
      querySelectorAll:s=>s.includes('checkbox')?dialog.boxes:cancel,querySelector:s=>s==='form'?form:s==='[data-group-confirm]'?submit:count,
      addEventListener:(name,fn)=>{events[name]=fn;},showModal(){},close(){events.close();},remove(){},form,submit,cancel};
    return dialog;
  }}};
  vm.createContext(ctx);vm.runInContext(chooser,ctx);
  const pending=ctx.chooseGroupParticipants(people,String);
  assert.equal(dialog.boxes.filter(b=>b.checked).length,4);assert.equal(dialog.submit.disabled,false);
  dialog.boxes[4].checked=true;dialog.boxes[4].onchange();assert.equal(dialog.submit.disabled,true);
  dialog.boxes[0].checked=false;dialog.boxes[0].onchange();dialog.form.onsubmit({preventDefault(){}});
  assert.deepEqual(Array.from(await pending,p=>p.id),people.slice(1).map(p=>p.id));assert.equal(focused,1);
  const cancelled=ctx.chooseGroupParticipants(people,String);dialog.cancel[0].onclick();assert.equal(await cancelled,null);
  assert.equal(await ctx.chooseGroupParticipants([people[0]],String),null);
});

test('A12 opener sends the chosen stable IDs once, and a failed start returns to the arrival state',async()=>{
  for(const failed of [false,true]){
    const calls=[],ctx={talk:null,groupTalk:false,showHistory:false,showShared:false,sharedFor:[],talkCharacter:null,talkChannel:null,busy:false,
      renderTalk(){},refreshStage(){},toast(){},$:()=>null,api:async(route,body)=>{calls.push({route,body});if(failed)throw Error('synthetic failure');return {id:'conversation'};}};
    vm.createContext(ctx);vm.runInContext(start,ctx);await ctx.startGroup([people[4],people[1]]);
    assert.equal(calls.length,1);assert.equal(calls[0].route,'/api/play/group-talk');assert.equal(calls[0].body.opener,true);
    assert.deepEqual(Array.from(calls[0].body.character_ids),[people[4].id,people[1].id]);assert.equal(ctx.busy,false);
    if(failed){assert.equal(ctx.groupTalk,false);assert.equal(ctx.talkCharacter,null);}
  }
});
