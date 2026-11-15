// Finds element lookups used without a check, for elements that are only sometimes drawn
// (2026-11-13: the talk's "Mégse" button exists only before the second line; its handler was set
// unconditionally and the throw left the send form dead).
//
// How: a small tokenizer walks each browser script, keeping track of strings, comments, regular
// expressions and template literals with their ${…} parts. An id="x" written inside a ${…} part
// of a template (a ternary, a && b, a .map()) is "conditional": it may be missing. A lookup
// $('#x').prop / getElementById('x').prop / querySelector('#x').prop of such an id is reported
// unless it is guarded: optional chaining ($('#x')?.…), an if($('#x')) on the same line, or a
// preceding `if(!$('#x'))return`.
export function scan(src){
  const ids=new Map();// id -> {conditional:boolean}
  const stack=[];// template nesting: each entry = depth of ${ } braces inside current interpolation
  let i=0,templateDepth=0;const n=src.length;
  const interp=[];// for each open template: number of open ${ at this template level
  let lastSignificant='';
  const mark=(id,conditional)=>{const old=ids.get(id);ids.set(id,{conditional:(old?.conditional??false)||conditional,count:(old?.count||0)+1,always:(old?.always||false)||!conditional});};
  // Tracks: mode stack of 'code' | 'template'; for code inside ${ }, a brace counter.
  const modes=[{kind:'code',braces:0}];
  while(i<n){
    const top=modes[modes.length-1],c=src[i],d=src[i+1];
    if(top.kind==='template'){
      if(c==='\\'){i+=2;continue;}
      if(c==='`'){modes.pop();i++;lastSignificant='`';continue;}
      if(c==='$'&&d==='{'){modes.push({kind:'code',braces:0,inTemplate:true});i+=2;lastSignificant='{';continue;}
      // id="…" inside template text; conditional when this template sits inside a ${…} of another template.
      if(c==='i'&&src.startsWith('id="',i)){const end=src.indexOf('"',i+4);const id=src.slice(i+4,end);
        if(/^[A-Za-z][\w-]*$/.test(id)){const templates=modes.filter(m=>m.kind==='template').length;mark(id,templates>1||!!top.optional);}i=end+1;continue;}
      i++;continue;
    }
    // code
    if(c==='/'&&d==='/'){i=src.indexOf('\n',i);if(i<0)break;continue;}
    if(c==='/'&&d==='*'){i=src.indexOf('*/',i+2)+2;continue;}
    if(c==='\''||c==='"'){const q=c;i++;while(i<n&&src[i]!==q){if(src[i]==='\\')i++;i++;}i++;lastSignificant='s';continue;}
    // A template that is a branch of ?: or an operand of && / || is drawn only sometimes.
    if(c==='`'){const opt=/^[?:&|]$/.test(lastSignificant);const outer=modes.findLast?.(m=>m.kind==='template');modes.push({kind:'template',optional:opt||!!outer?.optional});i++;continue;}
    if(c==='/'&&/[(,=:[!&|?{};+\-*%<>~^]|^$|return$/.test(lastSignificant)){// regex literal
      i++;let cls=false;while(i<n){const ch=src[i];if(ch==='\\'){i+=2;continue;}if(ch==='[')cls=true;else if(ch===']')cls=false;else if(ch==='/'&&!cls)break;else if(ch==='\n')break;i++;}
      i++;while(/[a-z]/i.test(src[i]||''))i++;lastSignificant='r';continue;}
    if(c==='{'){top.braces++;}
    if(c==='}'){if(top.inTemplate&&top.braces===0){modes.pop();i++;continue;}top.braces--;}
    if(!/\s/.test(c)){lastSignificant=/[\w$]/.test(c)?(src.slice(Math.max(0,i-5),i+1).endsWith('return')?'return':'w'):c;}
    i++;
  }
  return ids;
}

// Unguarded lookups: [{line, id, text}]
export function unguarded(src,ids){
  const out=[],lines=src.split('\n');
  const re=/(?:\$\(\s*'#([A-Za-z][\w-]*)'\s*\)|getElementById\(\s*'([A-Za-z][\w-]*)'\s*\)|querySelector\(\s*'#([A-Za-z][\w-]*)'\s*\))(\.|\[)/g;
  lines.forEach((line,k)=>{
    for(const m of line.matchAll(re)){
      const id=m[1]||m[2]||m[3],info=ids.get(id);
      // Any conditional drawing counts, even if another screen draws the same id always: the
      // lookup cannot know which screen is showing (the original bug was exactly that).
      if(!info||!info.conditional)continue;
      const guard=new RegExp(`if\\s*\\(\\s*(?:\\$\\(\\s*'#${id}'\\s*\\)|[\\w$]+)\\s*\\)|\\$\\('#${id}'\\)\\s*&&`);
      const before=line.slice(0,m.index);
      if(guard.test(before))continue;
      // An earlier "if(!$('#id'))return" in the same function (looked up to 15 lines back).
      const back=lines.slice(Math.max(0,k-15),k).join('\n');
      if(new RegExp(`if\\s*\\(\\s*!\\s*\\$\\('#${id}'\\)\\s*\\)\\s*return`).test(back+'\n'+before))continue;
      // Inside an `if($('#id')){` block opened on one of the 3 lines before.
      if(new RegExp(`if\\s*\\(\\s*\\$\\('#${id}'\\)\\s*\\)\\s*\\{`).test(lines.slice(Math.max(0,k-3),k).join('\n')))continue;
      out.push({line:k+1,id,text:line.trim().slice(0,140)});
    }
  });
  return out;
}
