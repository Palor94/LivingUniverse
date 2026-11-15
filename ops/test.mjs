#!/usr/bin/env node
// Test runner (2026-11-12): run all tests, or only the ones you need while working.
//
//   npm test                         every test file
//   npm test -- play sprites         files whose name contains "play" or "sprites"
//   npm test -- --changed            files related to what changed since the last commit
//                                    (test files themselves, and tests named after a changed module)
//   npm test -- --changed --since 30   without git: files modified in the last 30 minutes
//   npm test -- --coverage           line/branch coverage of app/ and mcp/ (slower)
//   npm test -- --list               show which files would run, run nothing
//   npm test -- --risk               what the current changes touch: affected screens and the
//                                    tests to run (from the changed files), runs nothing
import {spawn,execFileSync} from 'node:child_process';
import {readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const all=readdirSync(path.join(project,'tests')).filter(f=>f.endsWith('.test.mjs')).sort();

// Module "app/play-assets.mjs" → words ["play","assets"]; a test matches when its name holds the
// module's base name, or the module lives in a folder (app/play/) named in the test.
export function relatedTests(changed,tests=all){
  const picked=new Set();
  for(const file of changed){
    const f=file.replace(/\\/g,'/');
    if(f.startsWith('tests/')&&f.endsWith('.test.mjs')){picked.add(path.posix.basename(f));continue;}
    // The developer tools in ops/ are covered by one file (their names match no test).
    if(f.startsWith('ops/')){for(const t of tests)if(t==='ops-tools.test.mjs')picked.add(t);continue;}
    if(!/\.(mjs|js)$/.test(f))continue;
    const base=path.posix.basename(f).replace(/\.(mjs|js)$/,'');
    const folder=path.posix.basename(path.posix.dirname(f));
    for(const t of tests){
      const name=t.replace(/\.test\.mjs$/,'');
      if(name===base||name.startsWith(base+'-')||name.includes(base)||(folder!=='app'&&folder!=='public'&&folder!=='mcp'&&name.startsWith(folder)))picked.add(t);
    }
    // Shared modules reach everything: the server, translations and the database schema.
    if(/^app\/(server|i18n|enhancements)\.mjs$|^app\/public\/i18n\.js$/.test(f))for(const t of tests)picked.add(t);
  }
  return [...picked].sort();
}

// Screens a file can affect (debugging package, 2026-11-13), for the change risk list. A file
// can name several; shared files (server, translations, styles) reach every screen.
export const SCREEN_RULES=[
  [/play|place-network|sprite|figure|scene|media-director|game-clock|backdrop/,'Játék'],
  [/world-(engine|prompts|ai|social|rewind)|living-world|world-common/,'Élő világ'],
  [/world-review|quick-tag|analysis/,'Képelemzés és címkézés'],
  [/character|ghost-profile|canon|reference|identity|rename/,'Szereplők és profilok'],
  [/location|place|canvas|tree/,'Helyszínek'],
  [/media|thumb|duplicate|reconcil|folder|tidy|sorting|import|upload|new-images|permanent/,'Médiatár és rendezés'],
  [/image-(generation|workshop|providers)|generation|sogni/,'Képgyártás'],
  [/^mcp\/|connector|schema-lint|call-log/,'ChatGPT és Grok csatlakozó'],
  [/mobile/,'Telefon'],
  [/dev-tools|doctor|system-status|error-log|job-ledger|data-audit|bug-report|weekly|debug|layout-check/,'Rendszerállapot és hibakeresés'],
];
export function changeRisk(changed,tests=all){
  const screens=new Set();
  for(const file of changed){
    const f=file.replace(/\\/g,'/');
    if(/^app\/(server\.mjs|public\/(i18n\.js|style\.css|theme\.css|client\.js))$/.test(f)){screens.add('minden képernyő');continue;}
    for(const [re,name] of SCREEN_RULES)if(re.test(f))screens.add(name);
  }
  return {files:changed.length,screens:[...screens].sort(),tests:relatedTests(changed,tests)};
}

// Git when it is installed; otherwise (git is not on this machine's PATH) the source files
// modified in the last --since minutes (default 120).
function changedFiles(sinceMinutes){
  try{
    const out=execFileSync('git',['status','--porcelain','--untracked-files=all','--','app','tests','mcp','ops'],{cwd:project,encoding:'utf8',stdio:['ignore','pipe','ignore']});
    return out.split('\n').filter(Boolean).map(l=>l.slice(3).trim().replace(/^"|"$/g,'').split(' -> ').pop());
  }catch{
    const since=Date.now()-sinceMinutes*60e3,out=[];
    for(const dir of ['app','app/play','app/public','mcp','ops','tests']){
      let entries=[];try{entries=readdirSync(path.join(project,dir),{withFileTypes:true});}catch{continue;}
      for(const f of entries)
        if(f.isFile()&&statSync(path.join(project,dir,f.name)).mtimeMs>since)out.push(dir+'/'+f.name);
    }
    return out;
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
const args=process.argv.slice(2);
const words=args.filter((a,i)=>!a.startsWith('--')&&args[i-1]!=='--since');
let files=all;
const since=args.includes('--since')?Number(args[args.indexOf('--since')+1]):120;
if(!(since>0)){console.error('--since needs a number of minutes.');process.exit(1);}
if(args.includes('--risk')){
  const changed=changedFiles(since),r=changeRisk(changed);
  console.log(`Changed files: ${r.files}\nAffected screens: ${r.screens.join(', ')||'(none)'}\nTests to run (${r.tests.length}): ${r.tests.map(f=>f.replace('.test.mjs','')).join(', ')||'(none)'}\n\nRun them: npm test -- --changed`);
  process.exit(0);
}
if(args.includes('--changed'))files=relatedTests(changedFiles(since));
if(words.length)files=files.filter(f=>words.some(w=>f.toLowerCase().includes(w.toLowerCase())));
if(args.includes('--list')){console.log(files.join('\n')||'(none)');process.exit(0);}
if(!files.length){console.log('No test file matches.');process.exit(words.length||args.includes('--changed')?0:1);}
console.log(`Running ${files.length} of ${all.length} test files${files.length<all.length?': '+files.map(f=>f.replace('.test.mjs','')).join(', '):''}`);
const coverage=args.includes('--coverage')?['--experimental-test-coverage','--test-coverage-include=app/**','--test-coverage-include=mcp/**']:[];
const child=spawn(process.execPath,['--test',...coverage,...files.map(f=>path.join('tests',f))],{cwd:project,stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));
}
