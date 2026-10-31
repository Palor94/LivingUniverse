import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {promises as fs} from 'node:fs';

const fields={aliases:1000,biography:30000,personality:30000,sexuality:30000,speech_style:30000,appearance:30000,notes:30000};
export function createMobileServer({config,all,one,run,transaction,characterRename=null,mcpChanges=null,ghostProfiles=null,mediaImports=null,imageGeneration=null,grokConnections=null,referencePreview=null,locationEditor=null,sorting=null,scan=null,scanRunning=()=>false,reconciliation=null,createCharacter=null,isBusy=()=>false}){
  if(config?.enabled!==true)return null;
  const origin=new URL(config.origin);
  if(origin.protocol!=='https:'||!origin.hostname.endsWith('.ts.net')||origin.port||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Mobile access requires one exact HTTPS .ts.net origin.');
  if(typeof config.login!=='string'||!config.login.trim())throw Error('Mobile access requires an explicitly allowed Tailscale login.');
  const login=config.login.trim().toLowerCase(),csrf=randomBytes(32).toString('hex');
  const fail=(message,status=400)=>Object.assign(Error(message),{status});
  function character(id){const c=one('SELECT c.id,c.name,c.aliases,c.biography,c.personality,c.sexuality,c.speech_style,c.appearance,c.notes FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE c.id=? AND u.merged_into IS NULL',id);if(!c)throw fail('Character not found.',404);return c;}
  function details(id){return {...character(id),relationships:all('SELECT r.target_id,r.description,c.name target_name FROM relationships r JOIN characters c ON c.id=r.target_id WHERE r.source_id=?',id)};}
  const server=http.createServer(async(req,res)=>{
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
    const json=(value,status=200)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try{
      if(!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress))throw fail('Access must pass through the local Tailscale Serve proxy.',403);
      const localHost='127.0.0.1:'+server.address().port;
      if(![origin.host,localHost].includes(req.headers.host))throw fail('Untrusted Host.',403);
      if(String(req.headers['tailscale-user-login']||'').toLowerCase()!==login)throw fail('Your Tailscale identity is not authorized.',403);
      const url=new URL(req.url,origin),p=url.pathname;
      if(req.headers.origin&&req.headers.origin!==origin.origin)throw fail('Untrusted Origin.',403);
      const reviewPage=/^\/mcp-change\/[0-9a-f-]{36}$/i.test(p),referenceReview=/^\/mcp-reference\/[0-9a-f-]{36}$/i.test(p);
      const importPage=/^\/media-import\/[0-9a-f-]{36}$/i.test(p),connectPage=/^\/grok-connect\/[0-9a-f]{32}$/i.test(p);
      const renamePage=p==='/character-rename.html';
      const ghostPage=/^\/ghost-profile\/[0-9a-f-]{36}$/i.test(p);
      const ghostApi=/^\/api\/characters\/[0-9a-f-]{36}\/ghost(?:\/proposals(?:\/[0-9a-f-]{36}\/decision)?)?$/i.test(p);
      const generationPage=/^\/image-generation\/[0-9a-f-]{36}$/i.test(p);
      const previewRoute=p.match(/^\/approved-preview\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i);
      const originalRoute=/^\/media-original\/([a-fA-F0-9-]{36})$/.exec(p);
      const entryNavigation=req.method==='GET'&&(p==='/'||p==='/media-imports'||reviewPage||referenceReview||importPage||connectPage||generationPage||ghostPage||renamePage||previewRoute||originalRoute)&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document';
      if(req.headers['sec-fetch-site']==='cross-site'&&!entryNavigation)throw fail('Cross-site request blocked.',403);
      if(!['GET','PATCH','PUT'].includes(req.method)&&!(req.method==='POST'&&ghostApi&&ghostProfiles))throw fail('This operation is not available in the mobile editor.',405);
      if(req.method!=='GET'&&imageGeneration?.isBusy()&&!p.startsWith('/api/image-generation/'))throw fail('An approved image generation is running. Retry shortly.',409);
      const upload=p.match(/^\/api\/media-imports\/([a-f0-9-]{36})\/items\/([A-Za-z0-9_-]{8,128})$/i);
      if(upload&&req.method==='PUT'&&mediaImports){
        if(req.headers.origin!==origin.origin||req.headers['x-lu-csrf']!==csrf)throw fail('Reload the upload page before saving.',403);
        if(isBusy())throw fail('A catalogue file operation is running. Retry shortly.',409);
        try{return json(await mediaImports.receive(upload[1],upload[2],req,{name:decodeURIComponent(req.headers['x-lu-filename']||'selected media'),contentType:req.headers['content-type'],expectedSha256:req.headers['x-lu-sha256']}));}
        catch(e){return json({code:e.code||'IMPORT_UNAVAILABLE',error:e.status?e.message:'The upload could not finish. Retry this same file.'},e.status||500);}
      }
      let body={};
      if(req.method!=='GET'){
        if(req.headers.origin!==origin.origin||req.headers['x-lu-csrf']!==csrf)throw fail('Reload the editor before saving.',403);
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('Expected JSON.',415);
        const chunks=[];let size=0;const maxBody=/^\/api\/media-imports\/[a-f0-9-]{36}\/uploads$/i.test(p)?400000:200000;for await(const chunk of req){size+=chunk.length;if(size>maxBody)throw fail('Edit is too large.',413);chunks.push(chunk);}
        try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('Invalid JSON.');}
        if(!body||Array.isArray(body)||typeof body!=='object')throw fail('Invalid edit.');
        if(isBusy())throw fail('The desktop is organizing folders. Your draft is retained; retry shortly.',409);
      }
      if(characterRename){
        const rename=p.match(/^\/api\/character-renames\/([a-f0-9-]{36})(?:\/(decision|undo))?$/i);
        if(p==='/api/character-renames'&&req.method==='GET')return json({csrf,history:[]});
        if(rename&&req.method==='GET'&&!rename[2])return json(characterRename.get({plan_id:rename[1],offset:Number(url.searchParams.get('offset')||0),limit:100},true));
        if(rename&&req.method==='PUT'&&rename[2]==='decision')return json(characterRename.decide(rename[1],body,login));
        if(rename&&req.method==='PUT'&&rename[2]==='undo')return json(characterRename.prepareUndo({...body,plan_id:rename[1]}));
        if(req.method==='GET'&&(renamePage||p==='/character-rename.js'||p==='/character-rename.css')){const file=renamePage?'character-rename.html':p.slice(1);const content=await fs.readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{...headers,'Content-Type':renamePage?'text/html; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});return res.end(content);}
      }
      if(ghostProfiles){
        const ghost=p.match(/^\/api\/characters\/([0-9a-f-]{36})\/ghost(?:\/proposals(?:\/([0-9a-f-]{36})\/decision)?)?$/i);
        if(ghost){character(ghost[1]);if(req.method==='GET'&&p.endsWith('/ghost'))return json(ghostProfiles.get(ghost[1]));if(req.method==='POST'&&p.endsWith('/proposals'))return json(ghostProfiles.propose(ghost[1],body));if(req.method==='POST'&&ghost[2])return json(ghostProfiles.decide(ghost[1],ghost[2],body,login));throw fail('Nem támogatott szellemprofil-művelet.',405);}
        if(p==='/api/ghost-template'){if(req.method==='GET')return json(ghostProfiles.template());if(req.method==='PUT')return json(ghostProfiles.saveTemplate(body,login));}
        if(req.method==='GET'&&(ghostPage||['/ghost-review.js','/ghost-profile.js','/profile-appearance-guide.js','/ghost-import.js','/ghost-review.css'].includes(p))){
          const file=ghostPage?'ghost-review.html':p.slice(1);if(ghostPage)character(p.split('/').at(-1));const content=await fs.readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{...headers,'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});return res.end(content);
        }
      }
      if(p==='/api/session'&&req.method==='GET')return json({csrf,login});
      const chunkUpload=p.match(/^\/api\/media-imports\/([a-f0-9-]{36})\/uploads$/i);
      if(chunkUpload&&req.method==='PUT'&&mediaImports){
        try{
          if(Object.keys(body).some(k=>!['operation','arguments'].includes(k)))throw fail('Unexpected upload fields.');
          const args=body.arguments||{};
          if(body.operation==='begin'){if(Object.hasOwn(args,'import_id'))throw fail('The upload page selects the import.');return json(await mediaImports.uploads.begin({...args,import_id:chunkUpload[1]}));}
          if(mediaImports.uploads.inspect(args.upload_id).import_id!==chunkUpload[1])throw fail('This upload belongs to a different import.',403);
          if(body.operation==='chunk')return json(await mediaImports.uploads.chunk(args));
          if(body.operation==='finalize')return json(await mediaImports.uploads.finalize(args));
          throw fail('Unsupported upload operation.');
        }catch(e){return json({code:e.code||'IMPORT_UNAVAILABLE',error:e.status?e.message:'The upload could not finish. Retry this same file.'},e.status||500);}
      }
      if(imageGeneration){
        const generation=p.match(/^\/api\/image-generation\/([a-f0-9-]{36})(?:\/(decision|execute|withdraw))?$/i);
        if(generation){try{
          if(req.method==='GET'&&!generation[2])return json(imageGeneration.view(generation[1]));
          if(req.method==='PUT'&&generation[2]==='decision')return json(await imageGeneration.decide(generation[1],body,login));
          if(req.method==='PUT'&&generation[2]==='execute'){if(Object.keys(body).length)throw fail('No execution arguments are accepted.');return json(await imageGeneration.execute(generation[1]));}
          if(req.method==='PUT'&&generation[2]==='withdraw')return json(imageGeneration.withdraw(generation[1],body,login));
          throw fail('Unsupported generation operation.',405);
        }catch(e){return json({code:e.code||'GENERATION_UNAVAILABLE',error:e.status?e.message:'Generation could not be processed.'},e.status||500);}}
        if(req.method==='GET'&&(generationPage||p==='/image-generation.js'||p==='/image-generation.css')){
          const name=generationPage?'image-generation.html':p.slice(1),content=await fs.readFile(new URL('./public/'+name,import.meta.url));
          res.writeHead(200,{...headers,'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'text/javascript'});return res.end(content);
        }
      }
      if(locationEditor){
        if(p==='/api/location-editor/undo'&&req.method==='PUT')return json(locationEditor.undo(body));
        if(p==='/api/location-editor'&&req.method==='GET')return json(locationEditor.list());
        if(p==='/api/location-editor'&&req.method==='PUT')return json(locationEditor.create(body));
        const place=p.match(/^\/api\/location-editor\/([^/]+)$/);if(place&&['GET','PUT'].includes(req.method)){let id;try{id=decodeURIComponent(place[1]);}catch{throw fail('Invalid location identifier.');}return json(req.method==='GET'?locationEditor.get(id):locationEditor.save(id,body));}
      }
      if((previewRoute||originalRoute)&&referencePreview&&req.method==='GET'){try{const content=await referencePreview(previewRoute?.[1]||null,previewRoute?.[2]||originalRoute[1]);const extension={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/bmp':'bmp'}[content.mimeType];if(!extension)throw Error('Unsupported original');res.writeHead(200,{...headers,'Content-Type':content.mimeType,'Content-Disposition':'inline; filename="original-reference.'+extension+'"','Content-Length':content.bytes.length,'X-Content-SHA256':content.sha256});return res.end(content.bytes);}catch{return json({error:'This original image could not be verified. No image or reference was changed.'},409);}}
      const connection=p.match(/^\/api\/grok-connections\/([a-f0-9]{32})$/i);
      if(connection&&grokConnections){if(req.method==='GET')return json(await grokConnections.view(connection[1]));if(req.method==='PUT')return json(await grokConnections.decide(connection[1],body,login));throw fail('Use the private connection page.',405);}
      if(grokConnections&&req.method==='GET'&&(connectPage||p==='/grok-connect.js')){const content=await fs.readFile(new URL('./public/'+(connectPage?'grok-connect.html':'grok-connect.js'),import.meta.url));res.writeHead(200,{...headers,'Content-Type':connectPage?'text/html; charset=utf-8':'text/javascript'});return res.end(content);}
      if(mediaImports&&p==='/api/media-imports'&&req.method==='GET'){
        try{const args=Object.fromEntries(url.searchParams);for(const k of ['limit','offset'])if(args[k]!==undefined)args[k]=Number(args[k]);return json(mediaImports.list(args));}catch(e){return json({code:e.code||'INVALID_ARGUMENT',error:e.status?e.message:'Could not list imports.'},e.status||500);}
      }
      const cancelImport=p.match(/^\/api\/media-imports\/([a-f0-9-]{36})\/cancel$/i);
      if(mediaImports&&cancelImport&&req.method==='PUT'){
        try{if(Object.keys(body).length)throw fail('No cancellation fields are accepted.');return json(await mediaImports.cancel({import_id:cancelImport[1]}));}catch(e){return json({code:e.code||'IMPORT_UNAVAILABLE',error:e.status?e.message:'Could not cancel the import.'},e.status||500);}
      }
      if(mediaImports&&req.method==='GET'&&['/media-imports','/media-imports.js'].includes(p)){const html=p==='/media-imports',content=await fs.readFile(new URL('./public/'+(html?'media-imports.html':'media-imports.js'),import.meta.url));res.writeHead(200,{...headers,'Content-Type':html?'text/html; charset=utf-8':'text/javascript'});return res.end(content);}
      const importStatus=p.match(/^\/api\/media-imports\/([a-f0-9-]{36})$/i);
      if(importStatus&&req.method==='GET'&&mediaImports)return json(mediaImports.view(importStatus[1]));
      if(mediaImports&&req.method==='GET'&&(importPage||p==='/media-import.js')){const content=await fs.readFile(new URL('./public/'+(importPage?'media-import.html':'media-import.js'),import.meta.url));res.writeHead(200,{...headers,'Content-Type':importPage?'text/html; charset=utf-8':'text/javascript'});return res.end(content);}
      if(sorting){
        if(p==='/api/sorting/relink-preview'&&reconciliation&&req.method==='GET')return json(await reconciliation.previewBatch());
        if(p==='/api/sorting/relink-confirm'&&reconciliation&&req.method==='PUT'){
          if(Object.keys(body).length!==1||typeof body.token!=='string'||!/^[a-f0-9-]{36}$/i.test(body.token))throw fail('Use the current matching-files preview to confirm.');
          return json(await reconciliation.confirmBatch(body.token));
        }
        if(p==='/api/sorting/scan'&&scan){
          const status=()=>{const saved=one("SELECT value FROM application_settings WHERE key='last_scan_report'");const report=saved?JSON.parse(saved.value):null;return {running:scanRunning(),report:report?Object.fromEntries(['found','new','unchanged','modified','missing','unavailable','potentially_moved','checked_at'].map(k=>[k,report[k]])):null,pending:one('SELECT COUNT(*) n FROM scan_candidates').n};};
          if(req.method==='GET')return json(status());
          if(req.method==='PUT'){if(Object.keys(body).length)throw fail('File checking accepts no paths or file operations.');await scan();return json(status());}
          throw fail('This file-check operation is unavailable.',405);
        }
        if(p==='/api/sorting/vocabulary'&&req.method==='GET')return json(sorting.vocabulary());
        if(p==='/api/sorting/locations'&&req.method==='PUT'){
          if(Object.keys(body).length!==1||!Object.hasOwn(body,'name'))throw fail('Only a location tag name can be supplied.');
          return json(sorting.createLocation(body.name));
        }
        if(p==='/api/sorting/images'&&req.method==='GET')return json(sorting.list(url));
        const image=p.match(/^\/api\/sorting\/images\/([^/]+)(\/preview)?$/);
        if(image){
          if(image[2]&&req.method==='GET'){const bytes=await sorting.preview(image[1]);res.writeHead(200,{...headers,'Content-Type':'image/jpeg','Content-Length':bytes.length});return res.end(bytes);}
          if(!image[2]&&req.method==='GET')return json(sorting.details(image[1]));
          if(!image[2]&&req.method==='PUT')return json(sorting.save(image[1],body));
          throw fail('This image operation is unavailable.',405);
        }
      }
      const change=p.match(/^\/api\/mcp-changes\/([0-9a-f-]{36})$/i);
      if(change&&mcpChanges){
        if(req.method==='GET')return json(mcpChanges.view(change[1]));
        if(req.method==='PUT')return json(mcpChanges.decide(change[1],body,login));
        throw fail('Use the approval page to review this change.',405);
      }
      const referenceChange=p.match(/^\/api\/mcp-reference-changes\/([0-9a-f-]{36})$/i);
      if(referenceChange&&mcpChanges){
        if(req.method==='GET')return json(mcpChanges.referenceView(referenceChange[1]));
        if(req.method==='PUT')return json(await mcpChanges.reviewReferences(referenceChange[1],body,login));
        throw fail('Use the private approval page to review this reference selection.',405);
      }
      const referenceImage=p.match(/^\/api\/mcp-reference-preview\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i);
      if(referenceImage&&mcpChanges&&req.method==='GET'){
        const preview=await mcpChanges.previewReference(referenceImage[1],referenceImage[2]);if(!preview?.bytes)throw fail('No verified preview is available.',404);
        res.writeHead(200,{...headers,'Content-Type':['image/jpeg','image/png'].includes(preview.mimeType)?preview.mimeType:'image/jpeg','Content-Disposition':'inline; filename="reference-proposal"','Content-Length':preview.bytes.length});return res.end(preview.bytes);
      }
      if(mcpChanges&&req.method==='GET'&&(reviewPage||p==='/mcp-change.js')){const content=await fs.readFile(new URL('./public/'+(reviewPage?'mcp-change.html':'mcp-change.js'),import.meta.url));res.writeHead(200,{...headers,'Content-Type':reviewPage?'text/html; charset=utf-8':'text/javascript'});return res.end(content);}
      if(mcpChanges&&req.method==='GET'&&(referenceReview||p==='/mcp-reference.js')){const file=referenceReview?'mcp-reference.html':'mcp-reference.js',content=await fs.readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{...headers,'Content-Type':referenceReview?'text/html; charset=utf-8':'text/javascript'});return res.end(content);}
      if(p==='/api/characters'&&req.method==='GET')return json({characters:all('SELECT c.id,c.name,c.aliases FROM characters c LEFT JOIN character_ui u ON u.character_id=c.id WHERE u.merged_into IS NULL')});
      const create=p.match(/^\/api\/characters\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/create$/i);
      if(create&&req.method==='PUT'){
        if(Object.keys(body).length!==1||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>200||/[\x00-\x1f\x7f]/.test(body.name))throw fail('Enter a character name of 1–200 characters. Only the name can be supplied.');
        if(!createCharacter)throw fail('Character folder creation is unavailable.',503);
        const name=body.name.trim().normalize('NFC'),folder=await createCharacter(create[1],name);
        return json({...details(create[1]),...folder});
      }
      const profile=p.match(/^\/api\/characters\/([^/]+)$/);
      if(profile&&req.method==='GET')return json(details(profile[1]));
      const edit=p.match(/^\/api\/characters\/([^/]+)\/fields$/);
      if(edit&&req.method==='PATCH'){
        const entries=Object.entries(body.fields||{});if(!entries.length)throw fail('No fields to save.');
        for(const [key,value] of entries)if(!Object.hasOwn(fields,key)||typeof value!=='string'||value.length>fields[key]||typeof body.expected?.[key]!=='string')throw fail('Invalid profile field. Names and file operations are unavailable here.');
        transaction(()=>{const current=character(edit[1]);for(const [key,value] of entries){if(current[key]!==body.expected[key]&&current[key]!==value)throw fail('This field changed on another device. Compare the latest text with your draft.',409);}
          for(const [key,value] of entries)run(`UPDATE characters SET ${key}=? WHERE id=?`,value,edit[1]);});
        return json(details(edit[1]));
      }
      const relationship=p.match(/^\/api\/relationships\/([^/]+)\/([^/]+)$/);
      if(relationship&&req.method==='PUT'){
        const [,source,target]=relationship;if(source===target)throw fail('Choose another character.');
        if(typeof body.description!=='string'||body.description.length>10000||!(body.expected===null||typeof body.expected==='string'))throw fail('Invalid relationship.');
        transaction(()=>{character(source);character(target);const current=one('SELECT description FROM relationships WHERE source_id=? AND target_id=?',source,target)?.description??null;
          if(current!==body.expected&&current!==(body.description||null))throw fail('This relationship changed on another device. Compare it with your draft.',409);
          if(!body.description)run('DELETE FROM relationships WHERE source_id=? AND target_id=?',source,target);
          else run('INSERT INTO relationships(id,source_id,target_id,description) VALUES(?,?,?,?) ON CONFLICT(source_id,target_id) DO UPDATE SET description=excluded.description',randomBytes(16).toString('hex'),source,target,body.description);});
        return json(details(source));
      }
      const assets={'/':['mobile.html','text/html; charset=utf-8'],'/mobile.js':['mobile.js','text/javascript'],'/mobile.css':['mobile.css','text/css'],'/mobile-sorting.js':['mobile-sorting.js','text/javascript'],'/mobile-create.js':['mobile-create.js','text/javascript'],'/location-editor.js':['location-editor.js','text/javascript'],'/location-tree-model.js':['location-tree-model.js','text/javascript']};
      if(req.method==='GET'&&Object.hasOwn(assets,p)){const [file,type]=assets[p],content=await fs.readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{...headers,'Content-Type':type});return res.end(content);}
      throw fail('This operation is not available in the mobile editor.',404);
    }catch(err){json({error:err.status?err.message:'The edit could not be saved. Your local draft is retained.'},err.status||500);}
  });
  return server;
}
