import {randomUUID} from 'node:crypto';
export function installPlayTurnRevisions({db,one,all,run,transaction,fail,inFlight,conversationView,reply}){
  db.exec(`CREATE TABLE IF NOT EXISTS play_turn_states(reply_id TEXT PRIMARY KEY REFERENCES play_lines(id),conversation_id TEXT NOT NULL,before_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS play_turn_revisions(id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,conversation_id TEXT NOT NULL,reply_id TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS play_line_retractions(line_id TEXT PRIMARY KEY REFERENCES play_lines(id),revision_id TEXT NOT NULL REFERENCES play_turn_revisions(id));
    CREATE VIEW IF NOT EXISTS active_play_lines AS SELECT l.rowid rowid,l.* FROM play_lines l WHERE NOT EXISTS(SELECT 1 FROM play_line_retractions r WHERE r.line_id=l.id);`);
  // A process interruption is never an instruction to ask the provider again.
  run("UPDATE play_turn_revisions SET status='uncertain' WHERE status='running'");
  function latest(cid){const row=one('SELECT t.* FROM play_turn_states t JOIN active_play_lines l ON l.id=t.reply_id WHERE t.conversation_id=? ORDER BY l.rowid DESC LIMIT 1',cid);if(!row)return null;const state=JSON.parse(row.before_json),tail=all('SELECT id FROM active_play_lines WHERE conversation_id=? ORDER BY rowid DESC LIMIT ?',cid,state.line_ids.length).reverse().map(row=>row.id);if(JSON.stringify(tail)!==JSON.stringify(state.line_ids))return null;return {row,state};}
  const available=cid=>{const last=latest(cid);return last?{reply_id:last.row.reply_id,can_regenerate:!!last.state.palor_text}:null;};
  function record(replyId,cid,state){run('INSERT INTO play_turn_states VALUES(?,?,?,?)',replyId,cid,JSON.stringify(state),new Date().toISOString());}
  async function revise(cid,args){
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['request_key','expected_reply_id','action','acknowledge_cost'].includes(key))||typeof args.request_key!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(args.request_key)||!['undo','regenerate'].includes(args.action))throw fail('Válassz érvényes körmódosítást és egyedi kérésazonosítót.');
    const previous=one('SELECT * FROM play_turn_revisions WHERE request_key=?',args.request_key);if(previous){if(previous.conversation_id!==cid||previous.reply_id!==args.expected_reply_id||previous.action!==args.action)throw fail('Ez a kérésazonosító másik művelethez tartozik.',409);return {...conversationView(cid),turn_revision:{id:previous.id,status:previous.status},draft:JSON.parse(previous.payload_json).palor_text||''};}
    const conv=one('SELECT * FROM play_conversations WHERE id=?',cid);if(!conv)throw fail('A beszélgetés nem található.',404);if(conv.status!=='open'||conv.rewound_at||conv.mode==='group')throw fail('Csak nyitott, kétszemélyes beszélgetés utolsó köre módosítható.',409);
    const keys=[cid,conv.character_id];if(keys.some(key=>inFlight.has(key)))throw fail('Még folyamatban van egy válasz. Várd meg a végét.',409);const last=latest(cid);if(!last||last.row.reply_id!==args.expected_reply_id)throw fail('Közben megváltozott az utolsó kör. Frissítsd a beszélgetést.',409);
    if(args.action==='regenerate'&&(!last.state.palor_text||args.acknowledge_cost!==true))throw fail('Az új válaszhoz külön AI-hívást kell jóváhagynod.',403);
    for(const key of keys)inFlight.add(key);const rid=randomUUID();
    try{
      transaction(()=>{run('INSERT INTO play_turn_revisions VALUES(?,?,?,?,?,?,?,?)',rid,args.request_key,cid,args.expected_reply_id,args.action,args.action==='regenerate'?'running':'done',JSON.stringify(last.state),new Date().toISOString());for(const id of last.state.line_ids)run('INSERT INTO play_line_retractions VALUES(?,?)',id,rid);run('UPDATE play_conversations SET memo_json=?,mode=? WHERE id=?',last.state.memo_json,last.state.mode,cid);if(!last.state.had_intimate_flag)run('DELETE FROM play_conversation_flags WHERE conversation_id=?',cid);});
      if(args.action==='undo')return {...conversationView(cid),draft:last.state.palor_text||'',turn_revision:{id:rid,status:'done'}};
      try{const result=await reply({conversation_id:cid,text:last.state.palor_text});run("UPDATE play_turn_revisions SET status='done' WHERE id=?",rid);return {...result,turn_revision:{id:rid,status:'done'}};}
      catch(error){run("UPDATE play_turn_revisions SET status='uncertain' WHERE id=?",rid);throw error;}
    }finally{for(const key of keys)inFlight.delete(key);}
  }
  function history(cid){return all('SELECT * FROM play_turn_revisions WHERE conversation_id=? ORDER BY rowid DESC LIMIT 20',cid).map(row=>{const state=JSON.parse(row.payload_json);return {id:row.id,action:row.action,status:row.status,created_at:row.created_at,lines:all('SELECT speaker,text FROM play_lines WHERE conversation_id=? AND id IN(SELECT value FROM json_each(?)) ORDER BY rowid',cid,JSON.stringify(state.line_ids))};});}
  return {record,available,revise,history};
}
