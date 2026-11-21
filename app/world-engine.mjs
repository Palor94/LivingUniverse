// World engine: the world lives on without the player (Concordia pattern, built here).
// Each due day part: every autonomous character states an intention (agent turn), then
// a game master resolves what happens (GM turn). Everyday events save automatically as
// memories and relationship-level changes; serious events wait for the owner's
// accept/refuse. Palor stays frozen at home while away; characters may message him.
// Rules (DECISIONS.md 2026-11-09): off by default, daily cost cap, never kill
// characters, never invent characters or biography facts, only characters with a
// Szellemprofil act on their own, explicit profile fields stay out of daily prompts.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {DEFAULT_MODEL,DEFAULT_PRICES,TEXT_MODELS,pricesFor,priceOf,estimateTokens,parseJson} from './world-ai.mjs';
import {LEVELS,WEEKDAYS,SLOTS,WHOLE_DAY,LIVE,slotLabel,localDay,addDays,pairKey,clip,parse,worldDayAt,slotIndexAt} from './world-common.mjs';
import {agentPrompt,gmPrompt,pacingHint,normalizeEvents,LEVELS_SYSTEM,GM_TOKENS,salvageEvents} from './world-prompts.mjs';
// At most this many character turns at the same time (2026-11-13; a round sent 39 at once).
const AGENT_PARALLEL=5;
// Runs fn over items with at most `limit` running at once; the results keep the items' order.
export async function mapLimit(items,limit,fn){
  // After a failure no new item starts (no further paid calls); those already running finish.
  const out=new Array(items.length);let next=0,failed=false;
  const worker=async()=>{while(!failed&&next<items.length){const i=next++;try{out[i]=await fn(items[i],i);}catch(e){failed=true;throw e;}}};
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}
import {installWorldSocial} from './world-social.mjs';
import {installInnerState} from './inner-state.mjs';
export {LEVELS,SLOTS,localDay} from './world-common.mjs';

const SETTINGS_KEY='world:engine';
const ROLES=['home','work','routine','other'];
// Profile → prompt text (explicit fields kept out of everyday prompts, meta fields never sent).
import {profileText,profileScale} from './profile-prompt.mjs';
// Memories that carry a hurt (quarrel, letdown, lie …): weighted by the character's grievances.
const HURT=/veszeked|sért|csalód|harag|dühö|bánt|elmaradt|cserben|hazud|megaláz|szakít|vereked|kiabál|féltékeny|elárul/i;
const MAX_CATCH_UP_DAYS=7;
const DEFAULT_SETTINGS=Object.freeze({enabled:false,world_provider:'xai',daily_cap_usd:1.5,model:DEFAULT_MODEL,prices:DEFAULT_PRICES,last_day:null,last_slot:null,last_run_at:null,last_error:null});

// Season from the month, so the world dresses and behaves accordingly.
const SEASON=['tél','tél','tavasz','tavasz','tavasz','nyár','nyár','nyár','ősz','ősz','ősz','tél'];
// Fixed Hungarian holidays (month-day) the characters live by.
const HOLIDAYS={'01-01':'újév','03-15':'nemzeti ünnep (március 15.)','05-01':'a munka ünnepe','08-20':'államalapítás ünnepe (augusztus 20.)','10-23':'nemzeti ünnep (október 23.)','11-01':'mindenszentek','12-24':'szenteste','12-25':'karácsony','12-26':'karácsony másnapja','12-31':'szilveszter'};
// Owner-chosen tempo: how many events a round may produce and how lively the hint is.
const TEMPO={calm:{max:3,hint:'Nyugodt ütem: kevés, hétköznapi esemény.'},normal:{max:8,hint:''},lively:{max:8,hint:'Pörgős ütem: több találkozás és fordulat, de hihetően.'}};
// Two titles about the same thing (word overlap) count as a repeat.
const titleWords=s=>new Set(String(s).toLocaleLowerCase('hu').match(/\p{L}{4,}/gu)||[]);
const similar=(a,b)=>{const x=titleWords(a),y=titleWords(b);if(!x.size||!y.size)return false;let n=0;for(const w of x)if(y.has(w))n++;return n/Math.min(x.size,y.size)>=0.6;};

export function installWorldEngine({db,one,all,run,transaction,fail,ghostProfiles,provider=null,locationTree=null,now=()=>new Date(),realNow=now}){
  // Full place path for prompts ("Káloz › Cigánytelep › Sanyi háza"), else the plain name.
  const placePath=async(id,name)=>locationTree?await locationTree.pathOf(id,name):name;
  db.exec(readFileSync(new URL('./migrations/027-world-engine.up.sql',import.meta.url),'utf8'));
  // 029: rewind marks events and messages as undone instead of deleting them.
  for(const table of ['world_events','world_messages'])if(!all(`PRAGMA table_info(${table})`).some(c=>c.name==='rewound_at'))db.exec(`ALTER TABLE ${table} ADD COLUMN rewound_at TEXT`);
  // Run log: one row per simulated day part (what happened, what it cost).
  db.exec('CREATE TABLE IF NOT EXISTS world_runs(id TEXT PRIMARY KEY,world_day TEXT NOT NULL,slot TEXT NOT NULL,events INTEGER NOT NULL,messages INTEGER NOT NULL,dropped INTEGER NOT NULL,cost_usd REAL NOT NULL,created_at TEXT NOT NULL)');
  db.exec(readFileSync(new URL('./migrations/030-world-threads.up.sql',import.meta.url),'utf8'));
  // Cached prompt tokens per day (provider prompt cache), shown next to the cost.
  if(!all('PRAGMA table_info(world_usage)').some(c=>c.name==='cached_tokens'))db.exec('ALTER TABLE world_usage ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE INDEX IF NOT EXISTS world_events_live_day ON world_events(world_day) WHERE rewound_at IS NULL;
    CREATE INDEX IF NOT EXISTS world_level_revisions_time ON world_level_revisions(created_at);
    CREATE INDEX IF NOT EXISTS world_places_character ON world_places(character_id);`);
  const hasGroups=!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_groups'");
  // 031: who heard what from whom, and characters' own beliefs (world-social.mjs).
  const social=installWorldSocial({db,one,all,run,remember:(...a)=>remember(...a),now});
  // E2 (2026-11-21): each character's inner state, carried between conversations.
  const inner=installInnerState({db,one,all,run,now});
  let running=false,timer=null;
  const iso=()=>now().toISOString();

  // ---- settings & cost ------------------------------------------------------------------
  // The prices always follow the chosen model, so the daily cap stays true after a switch.
  function settings(){const row=one('SELECT value FROM application_settings WHERE key=?',SETTINGS_KEY);const s={...DEFAULT_SETTINGS,...(row?parse(row.value):{})};return {...s,prices:pricesFor(s.model,s.prices)};}
  function writeSettings(next){run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',SETTINGS_KEY,JSON.stringify(next));return next;}
  function updateSettings(body){
    const s=settings();
    if(body.enabled!==undefined){if(typeof body.enabled!=='boolean')throw fail('Choose on or off.');
      // Switching off is a pause (2026-11-12): switching back on continues from the current day
      // part instead of replaying every missed day at once (up to 7 rounds, their cost and a
      // pile of old phone messages). The skipped span is kept in the settings for the record.
      if(body.enabled&&!s.enabled)skipPaused(s);
      if(!body.enabled&&s.enabled)s.paused_at=iso();
      s.enabled=body.enabled;}
    // Owner (2026-11-12): until development is finished the world may live only while he plays.
    if(body.while_playing!==undefined){if(typeof body.while_playing!=='boolean')throw fail('Choose on or off.');s.while_playing=body.while_playing;}
    if(body.tempo!==undefined){if(!TEMPO[body.tempo])throw fail('Choose calm, normal or lively.');s.tempo=body.tempo;}
    // Grok text model (owner 2026-11-13): one of TEXT_MODELS; used from the next reply on.
    if(body.model!==undefined){if(!Object.hasOwn(TEXT_MODELS,body.model))throw fail('Unknown Grok model.');s.model=body.model;s.prices=TEXT_MODELS[body.model].prices;}
    // Model of the background world rounds (2026-11-13), separate from the talks' model.
    if(body.world_provider!==undefined){if(!['xai','ollama'].includes(body.world_provider))throw fail('Válassz Grok vagy helyi Ollama szolgáltatót.');s.world_provider=body.world_provider;}
    if(body.world_model!==undefined){if(!Object.hasOwn(TEXT_MODELS,body.world_model))throw fail('Unknown Grok model.');s.world_model=body.world_model;}
    if(body.daily_cap_usd!==undefined){const cap=Number(body.daily_cap_usd);if(!Number.isFinite(cap)||cap<0||cap>20)throw fail('The daily cap must be between 0 and 20 USD.');s.daily_cap_usd=Math.round(cap*100)/100;}
    return writeSettings(s);
  }
  // Cost is counted by real days (2026-11-12): game time may run ahead (waiting, sleeping), the cap may not.
  const costDay=()=>localDay(realNow());
  // Parts before the current one count as skipped; the current part runs on the next check.
  function skipPaused(s){
    if(!s.last_day)return s;
    const today=worldDayAt(now()),current=slotIndexAt(now())-1,doneToday=s.last_day===today?(s.last_slot??SLOTS.length-1):-1;
    if(s.last_day<today||doneToday<current){s.resumed={from_day:s.last_day,from_slot:s.last_slot??null,at:iso()};s.last_day=today;s.last_slot=Math.max(doneToday,current);}
    return s;
  }
  // Play activity (travel, talk, waiting) is reported by Play mode. Within PLAY_WINDOW of the last
  // action the player counts as playing; a longer break starts a new session.
  const PLAY_WINDOW=20*60_000;let lastPlayAt=0,resumeNeeded=false;
  const playing=()=>realNow().getTime()-lastPlayAt<=PLAY_WINDOW;
  // Returns true when a new session starts in "only while playing" mode (the caller then checks the world).
  function notePlay(){const t=realNow().getTime(),fresh=t-lastPlayAt>PLAY_WINDOW;if(fresh)resumeNeeded=true;lastPlayAt=t;if(!fresh)return false;const s=settings();return !s.enabled&&s.while_playing===true;}
  const spentToday=()=>one('SELECT cost_usd FROM world_usage WHERE day=?',costDay())?.cost_usd||0;
  function record(usage,cost){run('INSERT INTO world_usage(day,calls,input_tokens,output_tokens,cost_usd,cached_tokens) VALUES(?,1,?,?,?,?) ON CONFLICT(day) DO UPDATE SET calls=calls+1,input_tokens=input_tokens+excluded.input_tokens,output_tokens=output_tokens+excluded.output_tokens,cost_usd=cost_usd+excluded.cost_usd,cached_tokens=cached_tokens+excluded.cached_tokens',costDay(),usage?.input||0,usage?.output||0,cost,usage?.cached||0);}
  const UNCERTAIN_KEY=day=>'world:uncertain-usd:'+day;
  const uncertainToday=()=>{try{return Number(JSON.parse(one('SELECT value FROM application_settings WHERE key=?',UNCERTAIN_KEY(costDay()))?.value||'0'))||0;}catch{return 0;}};
  function recordUncertain(estimate){
    const day=costDay();
    transaction(()=>{
      run('INSERT INTO world_usage(day,calls,input_tokens,output_tokens,cost_usd) VALUES(?,1,0,0,?) ON CONFLICT(day) DO UPDATE SET calls=calls+1,cost_usd=cost_usd+excluded.cost_usd',day,estimate);
      run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',UNCERTAIN_KEY(day),JSON.stringify(Math.round((uncertainToday()+estimate)*1e6)/1e6));
    });
  }
  // One priced, capped AI call. Calls may run in parallel: each reserves its worst-case
  // price first, so parallel calls can never overrun the daily cap together.
  let reserved=0;
  // onText (optional): called with the raw answer text received so far (streamed replies).
  // purpose 'world' (2026-11-13): background rounds use their own model (world_model, the fast one
  // by default) and its prices; Play talks keep the owner's chosen model.
  async function ask(system,user,maxTokens,{onText=null,purpose='play'}={}){
    const ai=provider?.(purpose);if(!ai)throw Object.assign(fail('No Grok key is configured. Run Connect Grok first.',409),{code:'NO_PROVIDER'});
    const s0=settings(),s=purpose==='world'?{...s0,prices:pricesFor(s0.world_model||DEFAULT_MODEL,s0.prices)}:s0,estimate=ai.local?0:priceOf({input:estimateTokens(system+user),output:maxTokens},s.prices);
    if(spentToday()+reserved+estimate>s.daily_cap_usd)throw Object.assign(fail('The daily AI cost cap is reached. The world continues tomorrow.',429),{code:'CAP_REACHED'});
    reserved+=estimate;
    try{const result=await ai.complete({system,user,maxTokens,...(onText?{onDelta:onText}:{})});record(result.usage,ai.name==='mock'||ai.local?0:priceOf(result.usage,s.prices));
      const parsed=parseJson(result.text);
      // An answer cut at maxTokens is invalid JSON: hand the raw text back so the caller can keep
      // what arrived (the reply) instead of throwing away a paid answer.
      if(parsed===null&&result.finish==='length'){console.warn('World AI: answer cut at '+maxTokens+' tokens.');return {__truncated:true,raw:String(result.text)};}
      return parsed;}
    // The player sees what happened (timeout, refusal, key) instead of a generic server error.
    catch(e){if(e.status)throw e;
      // Timed out or cut: it may still be billed. Count the worst-case estimate against today's
      // cap (kept apart as "uncertain"), so repeated timeouts cannot pass the cap unnoticed.
      if(e.code==='AI_UNCERTAIN'&&ai.name!=='mock')recordUncertain(estimate);
      throw Object.assign(fail(e.code==='AI_UNCERTAIN'?'Grok did not answer in time. Try again in a moment.':e.code==='AI_KEY'?'The Grok key was refused. Run Connect Grok again.':'Grok could not answer this time. Try again.',e.code==='AI_UNCERTAIN'?504:502),{code:e.code||'AI_FAILED'});}
    finally{reserved-=estimate;}
  }

  // ---- characters -----------------------------------------------------------------------
  const groupIds=()=>new Set(hasGroups?all('SELECT character_id FROM character_groups').map(r=>r.character_id):[]);
  const ACTIVE_CHARACTERS='SELECT c.id,c.name FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL'+(hasGroups?' AND c.id NOT IN (SELECT character_id FROM character_groups)':'');
  const people=()=>all(ACTIVE_CHARACTERS+' ORDER BY c.name');
  const palor=()=>one(ACTIVE_CHARACTERS+" AND lower(trim(c.name))='palor' LIMIT 1")||null;
  function profile(cid){try{return ghostProfiles.get(cid);}catch{return null;}}
  const filled=(p,id)=>{const v=p?.values?.[id]?.value;return v!==undefined&&v!==null&&String(v).trim()!=='';};
  // Only characters with goals or a routine in their Szellemprofil act on their own.
  // Only the few characters that have a Szellemprofil record are loaded at all.
  // One request asks for the cast several times (positions, scene, prompts): a 1-second
  // memo avoids re-reading the same profiles; any profile change shows within a second.
  let castMemo={at:0,value:null};
  function autonomous(){
    const t=Date.now();if(castMemo.value&&t-castMemo.at<1000)return castMemo.value;
    castMemo={at:t,value:loadCast()};return castMemo.value;
  }
  // Meetable in Play (owner, 2026-11-15): everyone with a Szellemprofil record or older profile
  // text, also without goals or a routine. They do not act in world rounds (no agent turn, no
  // cost); they stand at their linked places by time of day and can be talked to.
  // Cached until any database write (this connection's total_changes, another's data_version).
  let meetMemo={key:null,value:null};
  function meetable(){
    const key=one('SELECT total_changes() n').n+'|'+one('PRAGMA data_version').data_version;if(meetMemo.key===key)return meetMemo.value;
    castMemo.at=0;
    const acting=autonomous(),ids=new Set(acting.map(c=>c.id)),pid=palor()?.id;
    // The default "Nem: férfi." line of a new character is not profile text.
    const text=r=>[r.biography,r.personality,r.speech_style].map(s=>String(s||'').replace(/^\s*Nem:[^\n]*$/gim,'')).join('').trim();
    const rest=all(ACTIVE_CHARACTERS.replace('SELECT c.id,c.name','SELECT c.id,c.name,c.biography,c.personality,c.speech_style,EXISTS(SELECT 1 FROM application_settings s WHERE s.key=\'ghost:character:\'||c.id) ghost')+' ORDER BY c.name')
      .filter(c=>c.id!==pid&&!ids.has(c.id)&&(c.ghost||text(c))).map(c=>({id:c.id,name:c.name,profile:profile(c.id)})).filter(c=>c.profile);
    meetMemo={key,value:[...acting,...rest].sort((a,b)=>a.name.localeCompare(b.name,'hu'))};return meetMemo.value;
  }
  function loadCast(){
    const pid=palor()?.id;
    return all(ACTIVE_CHARACTERS+" AND EXISTS(SELECT 1 FROM application_settings s WHERE s.key='ghost:character:'||c.id) ORDER BY c.name")
      .filter(c=>c.id!==pid).map(c=>({...c,profile:profile(c.id)})).filter(c=>filled(c.profile,'goals')||filled(c.profile,'weekly_routine'));
  }

  // ---- places -----------------------------------------------------------------------------
  const placesOf=cid=>all('SELECT p.id,p.location_id,l.name location_name,p.role,p.note,p.source FROM world_places p JOIN locations l ON l.id=p.location_id WHERE p.character_id=? ORDER BY p.role,l.name',cid);
  function addPlace(body,source='creator'){
    if(!one('SELECT 1 FROM characters WHERE id=?',body.character_id))throw fail('Character not found',404);
    if(!one('SELECT 1 FROM locations WHERE id=?',body.location_id))throw fail('Location not found',404);
    if(!ROLES.includes(body.role))throw fail('Choose home, work, routine or other.');
    run('INSERT OR IGNORE INTO world_places VALUES(?,?,?,?,?,?,?)',randomUUID(),body.character_id,body.location_id,body.role,clip(body.note,300),source,iso());
    return placesOf(body.character_id);
  }
  function removePlace(id){const row=one('SELECT character_id FROM world_places WHERE id=?',id);if(!row)throw fail('Not found',404);run('DELETE FROM world_places WHERE id=?',id);return placesOf(row.character_id);}
  // Free, local suggestions: the character's own named places plus a few keyword places
  // from residence/occupation/routine text. Nothing is invented; the owner edits the list.
  const KEYWORDS=[[/edz|terem|súlyz/i,/^edzőterem$/i,'routine'],[/orvos|kórház|ügyelet|pszichiát|osztály/i,/kórház|ügyeletes szoba/i,'work'],[/vonat/i,/^(vonat|vasútállomás)$/i,'routine'],[/bolt|bevásárl|piac/i,/^supermarket$/i,'routine'],[/székesfehérvár/i,/^székesfehérvár - /i,'routine'],[/kávé/i,/^kávézó$/i,'routine']];
  const OWN_PLACE=/háza|lakása|szobája|nappali|háló|kert|fürdő|autója|pihenőhely/i,ESCAPE=/[.*+?^${}()|[\]\\]/g;
  function suggestPlaces(){
    const locations=all('SELECT id,name FROM locations');let added=0;
    // Everyone meetable in Play (2026-11-15), not only the characters who act on their own.
    transaction(()=>{for(const c of meetable()){
      const text=['residence','occupation','weekly_routine','habits'].map(k=>c.profile.values?.[k]?.value||'').join(' ');
      const names=c.name.split(/[\s-]+/).filter(w=>w.length>=4&&/^\p{Lu}/u.test(w)).map(n=>new RegExp('(^|\\s)'+n.replace(ESCAPE,'\\$&')+'(\\s|$)','iu'));
      for(const l of locations){
        let role=null;
        if(OWN_PLACE.test(l.name)&&names.some(re=>re.test(l.name.split(' - ')[0])))role=/autója|pihenőhely/i.test(l.name)?'other':'home';
        else for(const [need,match,r] of KEYWORDS)if(need.test(text)&&match.test(l.name)){role=r;break;}
        if(role)added+=Number(run('INSERT OR IGNORE INTO world_places VALUES(?,?,?,?,?,?,?)',randomUUID(),c.id,l.id,role,'','suggested',iso()).changes);
      }
    }});
    return {added};
  }

  // ---- relationship levels --------------------------------------------------------------
  const levelOf=(s,t)=>one('SELECT level FROM world_relationship_levels WHERE source_id=? AND target_id=?',s,t)?.level;
  function setLevel(source,target,level,{reason,actor,eventId=null}){
    level=Math.max(-2,Math.min(5,Math.round(level)));const previous=levelOf(source,target);
    if(previous===level)return;
    run('INSERT INTO world_relationship_levels VALUES(?,?,?,?) ON CONFLICT(source_id,target_id) DO UPDATE SET level=excluded.level,updated_at=excluded.updated_at',source,target,level,iso());
    run('INSERT INTO world_level_revisions VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),source,target,level,previous??null,clip(reason,500),actor,eventId,iso());
  }
  function levels(){
    const names=new Map(people().map(c=>[c.id,c.name])),map=new Map();
    for(const r of all('SELECT source_id,target_id,description FROM relationships'))map.set(r.source_id+'|'+r.target_id,{source_id:r.source_id,target_id:r.target_id,note:clip(r.description,240),level:null});
    for(const l of all('SELECT source_id,target_id,level FROM world_relationship_levels')){const k=l.source_id+'|'+l.target_id;map.set(k,{...(map.get(k)||{source_id:l.source_id,target_id:l.target_id,note:''}),level:l.level});}
    return [...map.values()].filter(r=>names.has(r.source_id)&&names.has(r.target_id)).map(r=>({...r,source_name:names.get(r.source_id),target_name:names.get(r.target_id)}))
      .sort((a,b)=>a.source_name.localeCompare(b.source_name,'hu')||a.target_name.localeCompare(b.target_name,'hu'));
  }
  // AI-proposed starting levels from the relationship notes (accepted by the owner on
  // 2026-11-09). Existing levels are never overwritten.
  async function proposeLevels(){
    const open=levels().filter(r=>r.level===null&&r.note);let set=0,truncated=0;
    for(let start=0;start<open.length;start+=60){
      const batch=open.slice(start,start+60);
      let data=await ask(LEVELS_SYSTEM,batch.map((r,i)=>`${i}. FORRÁS: ${r.source_name} → CÉL: ${r.target_name}: ${r.note}`).join('\n'),1500);
      // A cut answer is reported instead of silently setting nothing (it was still paid for).
      if(data?.__truncated){truncated++;data=null;}
      transaction(()=>{for(const x of data?.levels||[]){const r=batch[x?.i];if(r&&Number.isFinite(x.level)&&levelOf(r.source_id,r.target_id)===undefined){setLevel(r.source_id,r.target_id,x.level,{reason:'Kezdő szint a kapcsolati jegyzetből',actor:'world_engine_initial'});set++;}}});
    }
    return truncated?{set,truncated_batches:truncated,warning:'Grok answer was cut off; some relationships got no starting level. Run it again for the rest.'}:{set};
  }
  // Pairs that already know each other: a relationship note or a level in either direction.
  const knownPairs=()=>new Set(all('SELECT source_id,target_id FROM relationships UNION SELECT source_id,target_id FROM world_relationship_levels').map(r=>pairKey(r.source_id,r.target_id)));

  // ---- memories and effects ---------------------------------------------------------------
  // reason: memories that do not come from a world event (an answered invitation) say so.
  // Rewind recognises both "Világmotor esemény …" and "Meghívás válasza …".
  function remember(cid,text,eventId,{reason:own=null}={}){
    const id=randomUUID(),t=iso(),reason=own?clip(own,300):'Világmotor esemény '+eventId,body=clip(text,1000);
    run('INSERT INTO character_memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,cid,1,'memory',body,null,'participants','approved','accurate',reason,t,t);
    run('INSERT INTO character_memory_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),id,1,'memory',body,null,'participants','approved','accurate',reason,'world_engine',t);
  }
  const recentMemories=cid=>all("SELECT text FROM character_memories WHERE character_id=? AND status='approved' ORDER BY rowid DESC LIMIT 12",cid).map(r=>r.text).reverse();
  // Recall (2026-11-12, plan step 2.1): the memories that matter now instead of simply the last
  // 12. Score = recency + mentions of the people present, the place and words of the moment.
  // Local and free (no embedding, no AI call); the newest three always stay in, so nothing that
  // just happened is forgotten. Returned oldest first, like recentMemories.
  const stem=w=>{w=w.toLocaleLowerCase('hu');return w.length>4&&/[aeáé]$/.test(w)?w.slice(0,-1):w;};
  const wordsOf=s=>[...new Set((String(s).toLocaleLowerCase('hu').match(/\p{L}{5,}/gu)||[]).map(x=>x.slice(0,5)))];
  function recallMemories(cid,{about=[],place='',text='',limit=12}={}){
    const rows=all("SELECT text FROM character_memories WHERE character_id=? AND status='approved' ORDER BY rowid DESC LIMIT 300",cid).map(r=>r.text);
    if(rows.length<=limit)return rows.reverse();
    const names=[...new Set(about.flatMap(n=>String(n||'').split(/[\s-]+/)).filter(n=>n.length>=3).map(stem))];
    const placeWords=wordsOf(place),moment=new Set(wordsOf(text));
    // Profile memory traits (2026-11-15): "Érzelmi emlékek tartóssága" (0–5) slows or speeds the
    // recency fade (8 memories when unknown, 4–12); "Sérelmek megőrzése" (0–5) lifts memories of
    // hurts, up to +4. Unknown values keep the earlier behaviour.
    const p=profile(cid),emo=profileScale(p,'emotional_memory'),grudge=profileScale(p,'grievances');
    const fade=emo===null?8:4+1.6*emo,hurt=grudge===null?0:0.8*grudge;
    const scored=rows.map((m,i)=>{const low=m.toLocaleLowerCase('hu'),own=wordsOf(m);
      // Recency fades over the last couple of dozen memories; a person +3, the place +2, each
      // shared word (first five letters, a rough Hungarian stem) +1 up to 3.
      let s=2*Math.exp(-i/fade);
      if(hurt&&HURT.test(m))s+=hurt;
      for(const n of names)if(low.includes(n))s+=3;
      if(placeWords.some(p=>own.includes(p)))s+=2;
      s+=Math.min(3,own.filter(x=>moment.has(x)).length);
      return {m,i,s:i<3?99:s};});
    return scored.sort((a,b)=>b.s-a.s||a.i-b.i).slice(0,limit).sort((a,b)=>b.i-a.i).map(x=>x.m);
  }
  // ---- open threads: promises and plans between Palor and a character (030) --------------
  const THREAD_LIMIT=6;
  // Open ones (soonest first) and lapsed ones not yet brought up. A plan lapses one day after
  // its due day; only the conversation summary marks one kept or dropped.
  function openThreadsFor(cid,day){
    run(`UPDATE world_threads SET status='lapsed',updated_at=? WHERE character_id=? AND status='open' AND rewound_at IS NULL AND due_day IS NOT NULL AND due_day<?`,iso(),cid,day);
    const rows=all(`SELECT id,promised_by,text,due_day,status FROM world_threads WHERE character_id=? AND rewound_at IS NULL AND (status='open' OR (status='lapsed' AND noted_at IS NULL)) ORDER BY status DESC,coalesce(due_day,'9999'),created_at LIMIT ?`,cid,THREAD_LIMIT*2);
    return {open:rows.filter(r=>r.status==='open').slice(0,THREAD_LIMIT),lapsed:rows.filter(r=>r.status==='lapsed').slice(0,3)};
  }
  const DAY_RE=/^\d{4}-\d{2}-\d{2}$/;
  // New threads from a summary (at most 3 per conversation, due day within 60 days or none).
  function addThreads(cid,conversationId,list,day){
    let n=0;
    for(const p of Array.isArray(list)?list:[]){
      if(n>=3||!p||typeof p.text!=='string'||!p.text.trim()||!['palor','character'].includes(p.by))continue;
      const due=typeof p.due==='string'&&DAY_RE.test(p.due)&&p.due>=day&&p.due<=addDays(day,60)?p.due:null;
      run('INSERT INTO world_threads(id,character_id,promised_by,text,due_day,status,conversation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),cid,p.by,clip(p.text,300),due,'open',conversationId,iso(),iso());n++;
    }
    return n;
  }
  // The summary says which listed threads were kept or dropped (by their number in the list).
  function resolveThreads(listed,{kept=[],dropped=[]}={}){
    const pick=v=>(Array.isArray(v)?v:[]).map(Number).filter(i=>Number.isInteger(i)&&listed[i-1]).map(i=>listed[i-1].id);
    for(const id of pick(kept))run("UPDATE world_threads SET status='kept',updated_at=? WHERE id=? AND status IN ('open','lapsed')",iso(),id);
    for(const id of pick(dropped))run("UPDATE world_threads SET status='dropped',updated_at=? WHERE id=? AND status IN ('open','lapsed')",iso(),id);
  }
  const noteLapsed=ids=>{for(const id of ids)run('UPDATE world_threads SET noted_at=? WHERE id=? AND noted_at IS NULL',iso(),id);};
  const threadsOf=cid=>all(`SELECT promised_by,text,due_day,status,created_at FROM world_threads WHERE character_id=? AND rewound_at IS NULL ORDER BY created_at DESC LIMIT 12`,cid);

  function applyEffects(eventId,payload,actor){
    // A first meeting makes both sides acquaintances before any other level change.
    for(const [a,b] of payload.acquaintances||[])for(const [s,t] of [[a,b],[b,a]])if(levelOf(s,t)===undefined)setLevel(s,t,1,{reason:'Első találkozás',actor,eventId});
    for(const m of payload.memories)remember(m.character_id,m.text,eventId);
    for(const l of payload.level_changes)setLevel(l.source_id,l.target_id,(levelOf(l.source_id,l.target_id)??0)+l.delta,{reason:l.reason,actor,eventId});
  }

  // ---- round progress (2026-11-13) --------------------------------------------------------
  // The last round's steps (agents → game master → saving → reflection → done), kept in one
  // settings row: the Élő világ page shows a round that stopped half-way and why. As before, a
  // round that did not finish is not marked done, so it is due again at the next check.
  const ROUND_KEY='world:round-status';
  function roundProgress(base){
    const s={...base,id:randomUUID(),step:'agents',agents_done:0,started_at:iso(),finished_at:null,error:null};
    const save=()=>run('INSERT INTO application_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',ROUND_KEY,JSON.stringify(s));
    save();
    return {agentDone(){s.agents_done++;if(s.agents_done%5===0||s.agents_done===s.agents_total)save();},
      step(name,extra={}){Object.assign(s,extra,{step:name});save();},note(extra){Object.assign(s,extra);save();},
      failed(step,e){Object.assign(s,{step,error:{code:e.code||'FAILED',message:clip(e.message,300)},finished_at:iso()});save();},
      done(extra={}){Object.assign(s,extra,{step:'done',finished_at:iso()});save();}};
  }
  const lastRound=()=>{try{return JSON.parse(one('SELECT value FROM application_settings WHERE key=?',ROUND_KEY)?.value||'null');}catch{return null;}};

  // ---- one simulated day part ---------------------------------------------------------------
  function pacing(day){
    const recent=all(`SELECT world_day,kind FROM world_events WHERE ${LIVE} AND world_day<? AND status IN ('applied','accepted','proposed') ORDER BY world_day DESC LIMIT 40`,day);
    return pacingHint({day,recent,firstDay:one(`SELECT min(world_day) d FROM world_events WHERE ${LIVE}`)?.d});
  }
  async function agentTurn(c,{when,byId,cast,pid,day,messaging=true,roundIndex=-1}){
    const relations=all('SELECT r.target_id,r.description,l.level FROM relationships r LEFT JOIN world_relationship_levels l ON l.source_id=r.source_id AND l.target_id=r.target_id WHERE r.source_id=?',c.id).filter(r=>byId.has(r.target_id)).map(r=>({...r,name:byId.get(r.target_id).name}));
    // People he met in the world (a level, no written note) are relations too (2026-11-12): before,
    // the agent saw them only as names, without knowing how they stand.
    const noted=new Set(relations.map(r=>r.target_id));
    for(const l of all('SELECT target_id,level FROM world_relationship_levels WHERE source_id=?',c.id))if(!noted.has(l.target_id)&&byId.has(l.target_id))relations.push({target_id:l.target_id,description:'(a világban ismerkedtetek meg)',level:l.level,name:byId.get(l.target_id).name});
    const known=new Map(relations.map(r=>[r.target_id,r.name]));for(const o of cast)if(o.id!==c.id)known.set(o.id,o.name);
    const places=await Promise.all(placesOf(c.id).map(async p=>({...p,location_name:await placePath(p.location_id,p.location_name)})));
    const doneToday=all(`SELECT title FROM world_events WHERE ${LIVE} AND world_day=? AND status IN ('applied','accepted') AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.character_ids') WHERE value=?) ORDER BY rowid`,day,c.id).map(e=>e.title);
    // His last real conversation with Palor (Play mode), so Palor stays on his mind.
    let palorTalk='';try{const t=one("SELECT summary_json,world_day FROM play_conversations WHERE character_id=? AND status='closed' AND rewound_at IS NULL ORDER BY closed_at DESC LIMIT 1",c.id);const s=t?parse(t.summary_json):null;if(s)palorTalk=`${t.world_day}: ${s.summary||s.title||''}`;}catch{}
    // Recall: memories about the people closest to him and what is on his mind today.
    const close=relations.filter(r=>(r.level??0)>=2).map(r=>r.name),memories=recallMemories(c.id,{about:[...close,...(pid?['Palor']:[])],text:[...doneToday,palorTalk,clip(c.profile?.values?.goals?.value,300)].join(' ')});
    const threads=openThreadsFor(c.id,day);
    const prompt=agentPrompt({name:c.name,when,profile:profileText(c.profile,{use:'agent',secrets:true}),places,relations,known,memories,doneToday,palorTalk,threads,messaging:messaging&&!!pid,canInvite:messaging&&roundIndex>=0&&canInvite(c.id,pid,day)});
    const out=await ask(prompt.system,prompt.user,prompt.maxTokens,{purpose:'world'})||{};
    // An empty or broken answer is not retried (it may be billed): he follows his routine.
    if(typeof out.intention!=='string'||!out.intention.trim())out.intention=filled(c.profile,'weekly_routine')?'A szokásos rutinját követi: '+clip(c.profile.values.weekly_routine.value,200):'A szokásos dolgait intézi.';
    const place=places.find(p=>p.location_id===out.location_id);
    // At most one message to Palor per character per day, and only if he knows Palor. Catch-up
    // rounds for past days send none (2026-11-12): they arrived as a pile of stale messages.
    const wroteToday=!!one(`SELECT 1 FROM world_messages WHERE ${LIVE} AND from_character_id=? AND world_day=? LIMIT 1`,c.id,day);
    const knowsPalor=messaging&&pid&&!wroteToday&&(levelOf(c.id,pid)!==undefined||relations.some(r=>r.target_id===pid));
    let message=knowsPalor&&typeof out.message_to_palor==='string'&&out.message_to_palor.trim()?clip(out.message_to_palor,600):null;
    // Initiative (2026-11-12, plan step 3.3): someone friendly towards Palor may invite him to one
    // of his own places for a coming day part. Palor accepts or declines on the phone.
    let invite=null;const ask_=out.invite_palor;
    if(knowsPalor&&roundIndex>=0&&canInvite(c.id,pid,day)&&ask_&&typeof ask_==='object'){
      const at=places.find(p=>p.location_id===ask_.location_id),slotIdx=SLOTS.findIndex(s=>s.id===ask_.slot);
      if(at&&slotIdx>=0){
        const inviteDay=slotIdx>roundIndex?day:addDays(day,1);
        invite={location_id:at.location_id,place:at.location_name,slot:SLOTS[slotIdx].id,day:inviteDay};
        if(!message)message=clip(typeof ask_.text==='string'&&ask_.text.trim()?ask_.text:`Lenne kedved találkozni? ${at.location_name}, ${inviteDay} ${SLOTS[slotIdx].label}.`,600);
      }
    }
    return {id:c.id,name:c.name,intention:clip(out.intention,400),place:place?{id:place.location_id,name:place.location_name}:null,
      wants_to_meet:(Array.isArray(out.wants_to_meet)?out.wants_to_meet:[]).filter(id=>known.has(id)&&id!==pid).slice(0,3),
      message,invite};
  }
  // An invitation needs a friendly level (≥ 2) and no other invitation of his still waiting.
  const hasTable=name=>!!one("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",name);
  function canInvite(cid,pid,day){
    if(!pid||(levelOf(cid,pid)??0)<2||!hasTable('play_appointments'))return false;
    return !one("SELECT 1 FROM play_appointments WHERE character_id=? AND status='invited' AND world_day>=? LIMIT 1",cid,day);
  }
  // Tiers: characters close to Palor act in every day part; the rest every other day part
  // (a fixed alternation per character and day). Lively tempo and catch-up days: everyone.
  const parity=s=>{let h=0;for(const ch of s)h=(h*31+ch.charCodeAt(0))>>>0;return h%2;};
  function closeToPalor(cid,pid,day){
    if(!pid)return false;
    if((levelOf(cid,pid)??0)>=1||(levelOf(pid,cid)??0)>=1)return true;
    try{if(one("SELECT 1 FROM play_appointments WHERE character_id=? AND world_day=? AND status='accepted' LIMIT 1",cid,day))return true;}catch{}
    try{if(one('SELECT 1 FROM play_conversations WHERE character_id=? AND world_day>=? AND rewound_at IS NULL LIMIT 1',cid,addDays(day,-3)))return true;}catch{}
    return false;
  }
  function roundCast(cast,day,slot){
    const idx=SLOTS.findIndex(s=>s.id===slot.id);
    if(idx<0||settings().tempo==='lively')return {acting:cast,resting:0};
    const pid=palor()?.id,acting=cast.filter(c=>closeToPalor(c.id,pid,day)||parity(c.id+day)===idx%2);
    return acting.length?{acting,resting:cast.length-acting.length}:{acting:cast,resting:0};
  }
  async function simulateDay(day,slot=WHOLE_DAY){
    const fullCast=autonomous();if(!fullCast.length)return {day,slot:slot.id,events:0,messages:0,note:'Nincs Szellemprofillal rendelkező szereplő.'};
    const {acting:cast,resting}=roundCast(fullCast,day,slot);
    const everyone=people(),byId=new Map(everyone.map(c=>[c.id,c])),pid=palor()?.id;
    const date=new Date(day+'T12:00:00'),holiday=HOLIDAYS[day.slice(5)],weekend=date.getDay()===0||date.getDay()===6;
    const when=`Dátum: ${day} (${WEEKDAYS[date.getDay()]}${weekend?', hétvége':''}${holiday?', ünnep: '+holiday:''}), évszak: ${SEASON[date.getMonth()]}, napszak: ${slot.label}.`;
    const tempo=TEMPO[settings().tempo]||TEMPO.normal;
    // Start a round only if the whole round fits in today's remaining budget (no half rounds).
    const s0=settings(),roundEstimate=provider?.('world')?.local?0:priceOf({input:3500*(cast.length+1),output:300*cast.length+GM_TOKENS},pricesFor(s0.world_model||DEFAULT_MODEL,s0.prices));
    if(provider?.('world')?.name!=='mock'&&spentToday()+roundEstimate>s0.daily_cap_usd)throw Object.assign(fail('The daily AI cost cap is reached. The world continues tomorrow.',429),{code:'CAP_REACHED'});
    // A round may cross real midnight: its cost is then what it added to both days.
    const startDay=costDay(),spentBefore=spentToday();
    const roundCost=()=>{const day=costDay();if(day===startDay)return Math.max(0,spentToday()-spentBefore);const first=one('SELECT cost_usd FROM world_usage WHERE day=?',startDay)?.cost_usd||0;return Math.max(0,first-spentBefore)+spentToday();};
    // Round progress (2026-11-13): which step the round is at, so a half-finished round shows.
    const progress=roundProgress({day,slot:slot.id,agents_total:cast.length});
    // Agent turns run a few at a time (2026-11-13; before: all at once, 39 calls in one burst),
    // each call still reserving its cost against the cap.
    // Messages and invitations only from rounds of the current world day (not catch-up days).
    const messaging=day===worldDayAt(now()),roundIndex=SLOTS.findIndex(s=>s.id===slot.id);
    let intentions;
    try{intentions=await mapLimit(cast,AGENT_PARALLEL,async c=>{const r=await agentTurn(c,{when,byId,cast,pid,day,messaging,roundIndex});progress.agentDone();return r;});}
    catch(e){progress.failed('agents',e);throw e;}
    progress.step('gm');
    // Game-master turn.
    const castIds=new Set(cast.map(c=>c.id)),allowed=new Set(everyone.map(c=>c.id).filter(id=>id!==pid));
    const placeRows=await Promise.all(all(`SELECT DISTINCT l.id,l.name FROM world_places p JOIN locations l ON l.id=p.location_id WHERE p.character_id IN (SELECT value FROM json_each(?))`,JSON.stringify([...castIds])).map(async l=>({id:l.id,name:await placePath(l.id,l.name)})));
    const known=knownPairs(),present=[...new Set([...castIds,...intentions.flatMap(i=>i.wants_to_meet)])];
    const knownList=[];for(const a of present)for(const b of present)if(a<b&&known.has(pairKey(a,b)))knownList.push(`${byId.get(a)?.name} – ${byId.get(b)?.name}`);
    const prompt=gmPrompt({when,slotLabel:slot.label,pacing:[pacing(day),tempo.hint].filter(Boolean).join(' '),
      today:all(`SELECT title,summary FROM world_events WHERE ${LIVE} AND world_day=? AND status IN ('applied','accepted') ORDER BY rowid`,day),
      knownList,intentions,cast,
      levels:all('SELECT source_id,target_id,level FROM world_relationship_levels').filter(l=>castIds.has(l.source_id)&&castIds.has(l.target_id)).map(l=>`${byId.get(l.source_id).name} → ${byId.get(l.target_id).name}: ${LEVELS[l.level]}`),
      extras:[...new Set(intentions.flatMap(i=>i.wants_to_meet))].filter(id=>!castIds.has(id)).map(id=>byId.get(id)).filter(Boolean),
      places:placeRows,
      recent:all(`SELECT world_day,title,summary FROM world_events WHERE ${LIVE} AND world_day<? AND status IN ('applied','accepted') ORDER BY world_day DESC,rowid DESC LIMIT 10`,day).reverse()});
    let plan;
    try{plan=await ask(prompt.system,prompt.user,prompt.maxTokens,{purpose:'world'})||{};}catch(e){progress.failed('gm',e);throw e;}
    // A game-master answer cut at its token limit (2026-11-13: one round was lost this way): the
    // events that arrived complete are kept; only the unfinished last one is dropped.
    if(plan.__truncated){const saved=salvageEvents(plan.raw);console.warn(`World AI: game master cut off; ${saved.length} complete event(s) kept.`);progress.note({truncated:true,salvaged:saved.length});plan={events:saved};}
    progress.step('saving');
    const events=normalizeEvents(plan,{allowed,knownPairs:known,slotId:slot.id,
      locationExists:id=>!!one('SELECT 1 FROM locations WHERE id=?',id),
      seriousSoFar:one(`SELECT count(*) n FROM world_events WHERE ${LIVE} AND world_day=? AND kind='serious'`,day).n});
    const model=provider?.('world')?.model||'unknown';let messages=0;
    // Drop repeats of what the same people already did today or yesterday; cap by tempo.
    const lately=all(`SELECT title,payload_json FROM world_events WHERE ${LIVE} AND world_day IN (?,?) AND status IN ('applied','accepted','proposed')`,day,addDays(day,-1)).map(e=>({title:e.title,ids:parse(e.payload_json).character_ids||[]}));
    const fresh=events.filter(e=>!lately.some(l=>similar(l.title,e.title)&&l.ids.some(id=>e.payload.character_ids.includes(id)))).slice(0,tempo.max);
    // An event without a place happens where its first character meant to be.
    for(const e of fresh)if(!e.payload.location_id){const i=intentions.find(x=>e.payload.character_ids.includes(x.id)&&x.place);if(i)e.payload.location_id=i.place.id;}
    const dropped=events.length-fresh.length;
    let told=[];
    transaction(()=>{
      const meetings=[];
      for(const e of fresh){
        const id=randomUUID();
        run('INSERT INTO world_events(id,world_day,kind,status,title,summary,payload_json,model,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,day,e.kind,e.serious?'proposed':'applied',e.title,e.summary,JSON.stringify(e.payload),model,iso());
        if(!e.serious){applyEffects(id,e.payload,'world_engine');if((e.payload.character_ids||[]).length>=2)meetings.push({id,character_ids:e.payload.character_ids});}
      }
      // News travels only through these meetings (plan step 2.5).
      told=social.spread(meetings,day,{palorId:pid});
      for(const i of intentions)if(i.message){const mid=randomUUID();run('INSERT INTO world_messages(id,from_character_id,text,world_day,event_id,read_at,created_at) VALUES(?,?,?,?,?,?,?)',mid,i.id,i.message,day,null,null,iso());messages++;
        if(i.invite&&hasTable('play_invitations')){const aid=randomUUID();run("INSERT INTO play_appointments(id,character_id,location_id,world_day,slot,status,created_at) VALUES(?,?,?,?,?,'invited',?)",aid,i.id,i.invite.location_id,i.invite.day,i.invite.slot,iso());run('INSERT INTO play_invitations VALUES(?,?,?)',aid,mid,iso());}}
      run('INSERT INTO world_runs VALUES(?,?,?,?,?,?,?,?)',randomUUID(),day,slot.id,fresh.length,messages,dropped,roundCost(),iso());
    });
    // Reflection (plan step 2.4): characters with enough new memories condense them into beliefs.
    // Its calls are capped like every other; a reached cap or a failed call never undoes the round.
    let beliefs=[];
    progress.step('reflection',{events:fresh.length,messages});
    try{beliefs=await social.reflect(cast,day,{ask:(s,u,m,o={})=>ask(s,u,m,{...o,purpose:'world'}),model,people:()=>everyone.map(c=>({id:c.id,name:c.name}))});}catch(e){if(e.code!=='CAP_REACHED')console.error('Reflection skipped: '+e.message);}
    progress.done({beliefs:beliefs.length});
    return {day,slot:slot.id,events:fresh.length,messages,dropped,acting:cast.length,resting,told:told.length,beliefs:beliefs.length};
  }

  // ---- runs ---------------------------------------------------------------------------------
  // Which rounds are due now: missed whole days (compressed), then today's due parts.
  // last_slot: index of the last finished part of last_day (3 = whole day done).
  function duePlan(){
    // World day: between midnight and the morning hour the night part of yesterday is due
    // (a sleeping PC woken at 01:00 still lives last night instead of skipping it).
    const s=settings(),today=worldDayAt(now()),dueIdx=slotIndexAt(now()),plan=[];
    if(!s.last_day)return [{day:today,index:Math.max(dueIdx,0)}];
    if(s.last_day<today){
      const missed=[];for(let d=addDays(s.last_day,1);d<today;d=addDays(d,1))missed.push(d);
      for(const d of missed.slice(-MAX_CATCH_UP_DAYS))plan.push({day:d,index:null});
      for(let i=0;i<=dueIdx;i++)plan.push({day:today,index:i});
    }else for(let i=(s.last_slot??SLOTS.length-1)+1;i<=dueIdx;i++)plan.push({day:today,index:i});
    return plan;
  }
  async function runWorld({extra=false}={}){
    if(running)throw fail('The world engine is already running.',409);
    const s=settings();if(!s.enabled&&!(s.while_playing&&playing()))throw fail('The world engine is switched off.',409);
    expireProposals();
    let plan=duePlan();
    if(!plan.length&&extra){
      const next=(s.last_slot??SLOTS.length-1)+1;
      if(next>=SLOTS.length)throw fail('Every part of today has already run. The world continues tomorrow.',409);
      plan=[{day:s.last_day,index:next}];
    }
    running=true;const results=[];let stopped=null;
    try{
      for(const step of plan){
        try{
          results.push(await simulateDay(step.day,step.index===null?WHOLE_DAY:SLOTS[step.index]));
          writeSettings({...settings(),last_day:step.day,last_slot:step.index===null?SLOTS.length-1:step.index,last_run_at:iso(),last_error:null});
        }catch(e){stopped={code:e.code||'FAILED',message:e.message};writeSettings({...settings(),last_run_at:iso(),last_error:stopped});break;}
      }
    }finally{running=false;}
    return {days:results,stopped};
  }
  async function maybeRun(){
    const s=settings();if(!(s.enabled||s.while_playing&&playing())||running||!provider?.())return null;
    // A new play session after a break: the break counts as paused, like switching the engine on.
    if(!s.enabled&&resumeNeeded){resumeNeeded=false;writeSettings(skipPaused(settings()));}
    if(!duePlan().length)return null;
    try{return await runWorld();}catch(e){console.error('World engine: '+e.message);return null;}
  }
  // While playing the world is checked every 5 minutes; otherwise every 30.
  function startScheduler(){if(timer)return;setTimeout(maybeRun,60_000).unref?.();let ticks=0;timer=setInterval(()=>{ticks++;if(ticks%6===0||playing())maybeRun();},5*60_000);timer.unref?.();}
  function stopScheduler(){if(timer)clearInterval(timer);timer=null;}

  // ---- owner review ---------------------------------------------------------------------------
  function decide(id,accept){
    if(typeof accept!=='boolean')throw fail('Choose accept or refuse.');
    return transaction(()=>{
      const e=one(`SELECT * FROM world_events WHERE ${LIVE} AND id=?`,id);if(!e)throw fail('Not found',404);
      if(e.status!=='proposed')throw fail('This event was already decided.',409);
      run('UPDATE world_events SET status=?,decided_at=? WHERE id=?',accept?'accepted':'refused',iso(),id);
      if(accept)applyEffects(id,parse(e.payload_json),'creator_accepted');
      return {id,status:accept?'accepted':'refused'};
    });
  }
  function markSeen(){const t=iso();run(`UPDATE world_events SET seen_at=? WHERE seen_at IS NULL AND status<>'proposed' AND ${LIVE}`,t);run(`UPDATE world_messages SET read_at=? WHERE read_at IS NULL AND ${LIVE}`,t);return {ok:true};}
  function eventViews(rows,names){
    const places=new Map(all('SELECT id,name FROM locations').map(l=>[l.id,l.name]));
    return rows.map(e=>{const p=parse(e.payload_json);return {id:e.id,world_day:e.world_day,slot:slotLabel(p.slot),kind:e.kind,status:e.status,title:e.title,summary:e.summary,
      characters:(p.character_ids||[]).map(id=>({id,name:names.get(id)||'?'})),location:p.location_id?places.get(p.location_id)||null:null,
      level_changes:(p.level_changes||[]).map(l=>({...l,source_name:names.get(l.source_id),target_name:names.get(l.target_id)}))};});
  }
  // A serious proposal nobody decided on within 7 world days lapses (it simply did not happen).
  function expireProposals(){run(`UPDATE world_events SET status='refused',decided_at=? WHERE ${LIVE} AND status='proposed' AND world_day<?`,iso(),addDays(worldDayAt(now()),-7));}
  function state(){
    expireProposals();
    const s=settings(),names=new Map(people().map(c=>[c.id,c.name])),ai=provider?.(),cast=autonomous();
    // With tiers, distant characters act in half of the day parts.
    const pidNow=palor()?.id,today=worldDayAt(now()),close=cast.filter(c=>closeToPalor(c.id,pidNow,today)).length;
    const perRound=s.tempo==='lively'?cast.length:close+(cast.length-close)/2;
    const perDay=priceOf({input:3500,cached:1500,output:400},s.prices)*SLOTS.length*(perRound+1);
    // What is due right now and when the scheduler looks next (every 30 minutes).
    const due=s.enabled||(s.while_playing&&playing())?duePlan().map(d=>({day:d.day,slot:d.index===null?WHOLE_DAY.label:SLOTS[d.index].label})):[];
    const nextSlot=SLOTS.find(x=>x.hour>now().getHours());
    return {due,next_slot:nextSlot?nextSlot.label+' ('+nextSlot.hour+':00)':SLOTS[0].label+' (holnap '+SLOTS[0].hour+':00)',
      today:{events:one(`SELECT count(*) n FROM world_events WHERE ${LIVE} AND world_day=?`,today).n,messages:one(`SELECT count(*) n FROM world_messages WHERE ${LIVE} AND world_day=?`,today).n},
      // Cached share of the prompt tokens (provider prompt cache), to see that the prompt order pays off.
      usage_history:all('SELECT day,calls,cost_usd,input_tokens,cached_tokens FROM world_usage ORDER BY day DESC LIMIT 7'),
      runs:all('SELECT world_day,slot,events,messages,dropped,cost_usd,created_at FROM world_runs ORDER BY created_at DESC LIMIT 12').map(r=>({...r,slot:slotLabel(r.slot)})),
      round:lastRound(),
      settings:{tempo:s.tempo||'normal',enabled:s.enabled,daily_cap_usd:s.daily_cap_usd,model:s.model,world_model:s.world_model||DEFAULT_MODEL,world_provider:s.world_provider||'xai',world_provider_status:(()=>{const selected=provider?.('world');return selected?{name:selected.name,model:selected.model,local:!!selected.local}:null;})(),last_day:s.last_day,last_slot:s.last_day?SLOTS[s.last_slot??SLOTS.length-1]?.label??null:null,last_run_at:s.last_run_at,last_error:s.last_error,paused_at:s.enabled?null:s.paused_at||null,resumed:s.resumed||null},
      provider:ai?{name:ai.name,model:ai.model}:null,models:Object.entries(TEXT_MODELS).map(([id,m])=>({id,label:m.label,prices:m.prices})),running,playing:playing(),spent_today_usd:spentToday(),uncertain_today_usd:uncertainToday(),estimate_per_day_usd:Math.round(perDay*1e4)/1e4,
      palor:palor(),
      characters:cast.map(c=>({id:c.id,name:c.name,places:placesOf(c.id)})),
      locations:all('SELECT id,name FROM locations ORDER BY name'),
      proposed:eventViews(all(`SELECT * FROM world_events WHERE ${LIVE} AND status='proposed' ORDER BY world_day,rowid`),names),
      // "Amíg távol voltál" lists only what happened: a refused proposal never did (2026-11-13: a
      // refused 'serious' event from four days earlier showed up there with its level change).
      unseen:eventViews(all(`SELECT * FROM world_events WHERE ${LIVE} AND seen_at IS NULL AND status IN ('applied','accepted') ORDER BY world_day,rowid LIMIT 100`),names),
      messages:all(`SELECT * FROM world_messages WHERE ${LIVE} AND read_at IS NULL ORDER BY world_day,rowid`).map(m=>({id:m.id,from:names.get(m.from_character_id)||'?',text:m.text,world_day:m.world_day})),
      level_labels:LEVELS};
  }

  // ---- HTTP ---------------------------------------------------------------------------------
  const routes={
    'GET /api/world-engine':()=>state(),
    'POST /api/world-engine/settings':b=>updateSettings(b),
    'POST /api/world-engine/run':b=>runWorld({extra:b.extra===true}),
    'POST /api/world-engine/seen':()=>markSeen(),
    'POST /api/world-engine/places':b=>addPlace(b),
    'POST /api/world-engine/places/suggest':()=>suggestPlaces(),
    'GET /api/world-engine/levels':()=>({levels:levels(),labels:LEVELS}),
    'POST /api/world-engine/levels':b=>{
      if(!Number.isInteger(b.level)||b.level<-2||b.level>5)throw fail('Choose a level between -2 and 5.');
      if(!one('SELECT 1 FROM characters WHERE id=?',b.source_id)||!one('SELECT 1 FROM characters WHERE id=?',b.target_id))throw fail('Character not found',404);
      transaction(()=>setLevel(b.source_id,b.target_id,b.level,{reason:'Kézi beállítás',actor:'creator'}));return {ok:true};},
    'POST /api/world-engine/levels/propose':()=>proposeLevels(),
    // Owner only: characters' beliefs and who heard what from whom.
    'GET /api/world-engine/social':()=>social.overview()
  };
  async function handle({p,req,body,json}){
    if(!p.startsWith('/api/world-engine'))return false;
    const route=routes[req.method+' '+p];if(route){json(await route(body));return true;}
    let x=p.match(/^\/api\/world-engine\/places\/([0-9a-f-]{36})$/);if(x&&req.method==='DELETE'){json(removePlace(x[1]));return true;}
    // Change what a linked place is to the character (home / work / routine / other).
    if(x&&req.method==='POST'){if(!ROLES.includes(body.role))throw fail('Choose home, work, routine or other.');const row=one('SELECT character_id,role FROM world_places WHERE id=?',x[1]);if(!row)throw fail('Not found',404);
      // A conflicting row (the same place already linked with that role) used to make this a silent no-op.
      if(row.role!==body.role&&!Number(run("UPDATE OR IGNORE world_places SET role=?,source='creator' WHERE id=?",body.role,x[1]).changes))throw fail('This place is already linked to the character with that role.',409);
      if(row.role===body.role)run("UPDATE world_places SET source='creator' WHERE id=?",x[1]);
      json(placesOf(row.character_id));return true;}
    x=p.match(/^\/api\/world-engine\/events\/([0-9a-f-]{36})$/);if(x&&req.method==='POST'){json(decide(x[1],body.accept));return true;}
    return false;
  }
  // Shared with Play mode and rewind (same cost cap, same memories and levels).
  const internals={inner,ask,people,palor,profile,profileText,autonomous,meetable,placesOf,levelOf,setLevel,remember,recentMemories,recallMemories,groupIds,openThreadsFor,addThreads,resolveThreads,noteLapsed,threadsOf,social,beliefsFor:social.beliefsFor};
  // Job ledger (2026-11-13): a round whose status says "running" while no round runs in this
  // process was cut off (crash, restart). It is shown as stuck and can be marked interrupted.
  function roundState(){return {running,last:lastRound(),spent_today:spentToday(),cap:settings().daily_cap_usd};}
  function clearStuckRound(){
    const last=lastRound();
    if(running||!last||last.finished_at)throw fail('This job is not stuck.',409);
    run('UPDATE application_settings SET value=? WHERE key=?',JSON.stringify({...last,error:{code:'INTERRUPTED',message:'A kör megszakadt (újraindítás vagy leállás közben).'},finished_at:iso()}),ROUND_KEY);
    return lastRound();
  }
  return {state,settings,writeSettings,updateSettings,runWorld,maybeRun,notePlay,playing,startScheduler,stopScheduler,decide,markSeen,suggestPlaces,addPlace,removePlace,levels,proposeLevels,simulateDay,handle,internals,roundState,clearStuckRound};
}
