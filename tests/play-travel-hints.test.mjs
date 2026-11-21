import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app/public/play.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('export function installTravelHints('),source.indexOf('export function chooseGroupParticipants('));
function fixture(){
  const handlers={},timers=new Map();let seq=0,hint=null;
  const doc={addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn),defaultView:{innerWidth:375,innerHeight:812,addEventListener(){}},
    body:{appendChild(el){hint=el;}},createElement:()=>({style:{},setAttribute(){},getBoundingClientRect:()=>({width:300,height:80}),remove(){hint=null;}})};
  const attrs={'aria-describedby':'existing'},pin={isConnected:true,closest(){return this;},contains(el){return el===this;},getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],getBoundingClientRect:()=>({left:350,width:40,bottom:790})};
  const ctx={document:doc,Date,Math,MutationObserver:class{observe(){}disconnect(){}},setTimeout:f=>{timers.set(++seq,f);return seq;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(ctx);vm.runInContext(fn.replace('export function','function')+';this.install=installTravelHints;',ctx);
  const ui=ctx.install({doc,describe:()=> 'Teszt hely · 12 p · Teszt férfi'});
  const send=(type,extra={})=>{const e={target:pin,pointerType:'touch',clientX:20,clientY:20,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of handlers[type]||[])fn(e);return e;};
  return {send,pin,attrs,ui,tick:()=>{for(const [id,f] of [...timers]){timers.delete(id);f();}},hint:()=>hint};
}
test('A25 long press shows a clamped accessible hint and consumes only the following click',()=>{
  const f=fixture();f.send('pointerdown');assert.equal(f.hint(),null);f.tick();assert.ok(f.hint());
  assert.equal(f.hint().style.left,'67px');assert.equal(f.hint().style.top,'724px');assert.match(f.attrs['aria-describedby'],/existing play-travel-hint/);
  f.send('pointerup');const click=f.send('click');assert.ok(click.prevented&&click.stopped);assert.ok(!f.send('click').prevented);
  f.ui.hide();assert.equal(f.hint(),null);assert.equal(f.attrs['aria-describedby'],'existing');
});
test('A25 short tap and scroll gestures do not show a hint or consume navigation',()=>{
  for(const finish of ['pointerup','pointercancel','scroll','pointermove']){
    const f=fixture();f.send('pointerdown');f.send(finish,{clientX:50});f.tick();assert.equal(f.hint(),null);assert.ok(!f.send('click').prevented);
  }
  const f=fixture();f.send('pointerover',{pointerType:'mouse'});assert.ok(f.hint());f.send('keydown',{key:'Escape'});assert.equal(f.hint(),null);
});
