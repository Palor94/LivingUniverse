// Game clock (owner decision D1, 2026-11-12): the world's time runs with real time, so the
// characters live and act while nobody plays, and Palor's actions move it on further: a trip
// takes its travel minutes, each spoken line a few minutes, waiting jumps to the next day part,
// sleeping to the next morning. Actions grow the offset; an explicit owner rewind may reset it.
//
// Break cap (owner decision C, 2026-11-23): unless the world engine runs all the time, game time
// goes on during a break only until the next morning (07:00) after the last play activity, then
// holds there; the next play activity continues from that moment and records what the break
// covered ('away'), so the play screen can say what happened while Palor was away. Skipped day
// parts are covered by the deterministic rules (routines, whereabouts, missed meetings).
//
// Every world and play module reads the time from here (now). Cost accounting keeps real days
// (realNow), so sleeping through days never resets the daily AI cap.
import {SLOTS} from './world-common.mjs';
import {randomUUID} from 'node:crypto';

const KEY='world:clock';
export const TALK_MINUTES=4,MAX_STEP_MINUTES=3*24*60,MORNING_HOUR=7,BREAK_MS=20*60_000,SEEN_EVERY_MS=15_000;

export function createGameClock({one,run,realNow=()=>new Date(),capBreaks=()=>true}){
  // Database state is authoritative, including after restore and rolled-back transactions.
  const read=()=>{const raw=one('SELECT value FROM application_settings WHERE key=?',KEY)?.value;if(raw===undefined)return {offset_ms:0,last:null};
    let state;try{state=JSON.parse(raw);}catch{}
    if(!state||!Number.isFinite(state.offset_ms)||!Number.isFinite(new Date(realNow().getTime()+state.offset_ms).getTime()))throw Object.assign(Error('A játékóra mentett állapota hibás; helyreállítás szükséges.'),{code:'CLOCK_STATE_INVALID',status:409});return state;};
  const write=state=>run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',KEY,JSON.stringify(state));
  // The first 07:00 strictly after a moment (game time, local).
  const morningAfter=ms=>{const t=new Date(ms);t.setHours(MORNING_HOUR,0,0,0);if(t.getTime()<=ms)t.setDate(t.getDate()+1);return t.getTime();};
  const capped=s=>Number.isFinite(s.seen_ms)&&capBreaks();
  const valueOf=s=>{const natural=realNow().getTime()+s.offset_ms;return capped(s)?Math.min(natural,morningAfter(s.seen_ms+s.offset_ms)):natural;};
  const now=()=>new Date(valueOf(read()));
  function advance(minutes,reason){
    const m=Math.round(Number(minutes));
    if(!Number.isFinite(m)||m<=0)return {advanced:0,now:now().toISOString()};
    const step=Math.min(m,MAX_STEP_MINUTES),s=read(),real=realNow().getTime();
    // Continues from the shown (possibly held) time; an action is play activity too.
    const state={...s,offset_ms:valueOf(s)+step*60_000-real,seen_ms:real,action_revision:randomUUID(),last:{minutes:step,reason:String(reason||'').slice(0,60),at:new Date(real).toISOString()}};
    write(state);
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
  // Play activity (any play request). After a break the held time becomes the new starting point.
  // Returns the break summary when this activity ends a break, else null.
  function notePlay(){
    // No saved clock yet (fresh or not yet restored catalogue): nothing to hold; the first action creates it.
    if(one('SELECT 1 FROM application_settings WHERE key=?',KEY)===undefined)return null;
    const s=read(),real=realNow().getTime(),seen=Number.isFinite(s.seen_ms);
    if(seen&&real-s.seen_ms>=0&&real-s.seen_ms<SEEN_EVERY_MS)return null;
    const natural=real+s.offset_ms,value=valueOf(s),state={...s,offset_ms:value-real,seen_ms:real};let away=null;
    if(seen&&real-s.seen_ms>BREAK_MS){
      const from=s.seen_ms+s.offset_ms;
      away={from:new Date(from).toISOString(),to:new Date(value).toISOString(),minutes:Math.max(0,Math.round((value-from)/60_000)),held_minutes:Math.max(0,Math.round((natural-value)/60_000)),at:new Date(real).toISOString()};
      state.away=away;state.last={minutes:away.minutes,reason:'break',at:away.at};
    }
    write(state);return away;
  }
  const info=()=>{const s=read();return {now:new Date(valueOf(s)).toISOString(),offset_minutes:Math.round(s.offset_ms/60_000),last:s.last,away:s.away||null,held:capped(s)&&valueOf(s)<realNow().getTime()+s.offset_ms};};
  const snapshot=()=>one('SELECT value FROM application_settings WHERE key=?',KEY)?.value??null;
  const restore=raw=>raw===null?run('DELETE FROM application_settings WHERE key=?',KEY):run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',KEY,raw);
  function rewindTo(time){const target=Date.parse(time);if(!Number.isFinite(target))throw Error('INVALID_CLOCK_TARGET');const real=realNow().getTime();restore(JSON.stringify({offset_ms:target-real,seen_ms:real,action_revision:randomUUID(),last:{reason:'owner-rewind',at:new Date(real).toISOString()}}));}
  return {now,realNow,advance,notePlay,toNextSlot,toMorning,info,reload:()=>{},snapshot,restore,rewindTo};
}
