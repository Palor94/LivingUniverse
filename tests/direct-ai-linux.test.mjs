import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {pilotCredentialEnvironment} from '../app/analysis-credentials.mjs';
import {analysisVersions} from '../app/analysis-model.mjs';
import {createApp} from '../app/server.mjs';
import {startExisting} from '../app/start-existing.mjs';
import {planPathMigration,applyPathMigration} from '../app/path-migration.mjs';
import {sourceFiles} from '../ops/backup/backup.mjs';

async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-direct-linux-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('analysis pilot uses a dedicated explicit Linux credential file and never substitutes an inherited provider key',async t=>{
  const dir=await temporary(t),file=path.join(dir,'analysis.key');await fs.writeFile(file,'synthetic-analysis-only-key',{mode:0o600});
  const env={LU_ANALYSIS_CREDENTIAL_FILE:file,OPENAI_API_KEY:'unrelated-inherited-key'};
  const loaded=await pilotCredentialEnvironment({env,platform:'linux',run:async()=>{throw Error('PowerShell must not run');}});assert.equal(loaded.OPENAI_API_KEY,'synthetic-analysis-only-key');assert.equal(env.OPENAI_API_KEY,'unrelated-inherited-key');
  await assert.rejects(pilotCredentialEnvironment({env:{OPENAI_API_KEY:'unrelated-inherited-key'},platform:'linux'}),{code:'CREDENTIAL_REQUIRED'});
});
test('portable analysis preprocessing has a new cache identity and explicit migration blocks outstanding analysis jobs',async t=>{
  assert.equal(analysisVersions.preprocess,'reference-2048-jpeg-portable-2');
  const dir=await temporary(t),root=path.join(dir,'media'),dataDir=path.join(dir,'analysis-data');await fs.mkdir(root);
  const app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:{enabled:false},imageGeneration:{},mediaAnalysis:{providers:{}}});
  try{
    const mid=randomUUID(),bytes=await sharp({create:{width:24,height:12,channels:3,background:'blue'}}).png().toBuffer();await fs.writeFile(path.join(root,'sample.png'),bytes);const stamp=new Date().toISOString();app.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(mid,'sample.png','','image',bytes.length,stamp,stamp);
    const preview=await app.mediaAnalysis.previewJob({media_ids:[mid],provider_id:'mock',goals:['background']});assert.ok(preview.items[0].derivative.sha256);const job=await app.mediaAnalysis.createJob({media_ids:[mid],provider_id:'mock',goals:['background'],preview_hash:preview.preview_hash,request_key:randomUUID()});await app.mediaAnalysis.settle();assert.equal(app.mediaAnalysis.getJob(job.id).status,'completed');
    app.db.prepare("UPDATE media_analysis_jobs SET status='paused' WHERE id=?").run(job.id);const plan=planPathMigration(app.db,{platform:'linux'});assert.ok(plan.blockers.some(b=>b.table==='media_analysis_jobs'));assert.throws(()=>applyPathMigration(app.db,plan),/blocked/);assert.equal(app.db.prepare('SELECT COUNT(*) n FROM canon').get().n,0);
  }finally{await app.close();}
});
test('direct-ai schema stays independent and source packaging retains the Linux runtime files',async t=>{
  const dir=await temporary(t),root=path.join(dir,'media'),dataDir=path.join(dir,'data');await fs.mkdir(root);const app=await createApp({root,dataDir,mobile:{enabled:false},mcpWrites:{enabled:false},imageGeneration:{},mediaAnalysis:{providers:{}}});
  try{assert.ok(app.db.prepare("SELECT 1 FROM sqlite_master WHERE name='media_analysis_jobs'").get());assert.equal(app.db.prepare("SELECT 1 FROM sqlite_master WHERE name='character_crop_approvals'").get(),undefined);assert.equal(app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{await app.close();}
  const files=await sourceFiles(path.resolve('.'));for(const file of ['pnpm-lock.yaml','ops/linux/Dockerfile','ops/testing/run-tests.mjs'])assert.ok(files.includes(file),file);
});
