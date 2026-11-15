// Game clock (owner decision D1, 2026-11-12): the world's time runs with real time, so the
// characters live and act while nobody plays, and Palor's actions move it on further: a trip
// takes its travel minutes, each spoken line a few minutes, waiting jumps to the next day part,
// sleeping to the next morning. Game time = real time + an offset that only grows.
//
// Every world and play module reads the time from here (now). Cost accounting keeps real days
// (realNow), so sleeping through days never resets the daily AI cap.
import {SLOTS} from './world-common.mjs';

const KEY='world:clock';
export const TALK_MINUTES=4,MAX_STEP_MINUTES=3*24*60,MORNING_HOUR=7;

export function createGameClock({one,run,realNow=()=>new Date()}){
  let state=null;
  const read=()=>{if(state)return state;try{state=JSON.parse(one('SELECT value FROM application_settings WHERE key=?',KEY)?.value||'null');}catch{state=null;}state??={offset_ms:0,last:null};return state;};
  const now=()=>new Date(realNow().getTime()+read().offset_ms);
  function advance(minutes,reason){
    const m=Math.round(Number(minutes));
    if(!Number.isFinite(m)||m<=0)return {advanced:0,now:now().toISOString()};
    const step=Math.min(m,MAX_STEP_MINUTES),s=read();
    state={offset_ms:s.offset_ms+step*60_000,last:{minutes:step,reason:String(reason||'').slice(0,60),at:realNow().toISOString()}};
    run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',KEY,JSON.stringify(state));
    return {advanced:step,now:now().toISOString()};
  }
  // Minutes from now to the start of the next day part (the night part ends at the morning hour).
  function toNextSlot(){
    const d=now(),h=d.getHours(),target=new Date(d);target.setSeconds(0,0);
    if(h<SLOTS[0].hour)target.setHours(SLOTS[0].hour,0);
    else{const next=SLOTS.find(s=>s.hour>h);if(next)target.setHours(next.hour,0);else{target.setDate(target.getDate()+1);target.setHours(SLOTS[0].hour,0);}}
    return Math.max(1,Math.ceil((target-d)/60_000));
  }
  // Minutes to the next morning (07:00): asleep through the night.
  function toMorning(){
    const d=now(),target=new Date(d);target.setSeconds(0,0);target.setHours(MORNING_HOUR,0);
    if(target<=d)target.setDate(target.getDate()+1);
    return Math.max(1,Math.ceil((target-d)/60_000));
  }
  const info=()=>({now:now().toISOString(),offset_minutes:Math.round(read().offset_ms/60_000),last:read().last});
  // Tests and restores: drop the cached state so the next read sees the database.
  const reload=()=>{state=null;};
  return {now,realNow,advance,toNextSlot,toMorning,info,reload};
}
