// Scan JavaScript strings/calls without treating comments or template text as calls.
// Template interpolations are code and are scanned recursively.
export function literalTextKeys(source){
  const keys=new Set();let i=0;
  function string(quote){
    let value='';i++;
    while(i<source.length){const c=source[i++];if(c===quote)return value;if(c==='\\'){value+=source[i++]||'';}else value+=c;}
    return value;
  }
  function template(){
    i++;
    while(i<source.length){
      if(source[i]==='\\'){i+=2;continue;}
      if(source[i]==='`'){i++;return;}
      if(source[i]==='$'&&source[i+1]==='{'){i+=2;code(true);continue;}
      i++;
    }
  }
  function code(nested=false){
    let depth=0;
    while(i<source.length){
      const c=source[i];
      if(c==='/'&&source[i+1]==='/'){const end=source.indexOf('\n',i);i=end<0?source.length:end+1;continue;}
      if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+2;continue;}
      if(c==='/'){
        const before=source.slice(0,i).trimEnd();
        if(!/[\w$\])}'"`]$/.test(before)||/\b(return|throw|case|yield|await|typeof|void|delete|in|of)$/.test(before)){
          i++;let inClass=false;
          while(i<source.length){const r=source[i++];if(r==='\\'){i++;continue;}if(r==='[')inClass=true;if(r===']')inClass=false;if(r==='/'&&!inClass)break;}
          while(/[a-z]/i.test(source[i]||'')&&i<source.length)i++;
          continue;
        }
      }
      if(c==='"'||c==="'"){string(c);continue;}
      if(c==='`'){template();continue;}
      if(c==='t'&&!/[\w$]/.test(source[i-1]||'')){
        const call=source.slice(i).match(/^(?:t|topHelp)\s*\(\s*(?=['"])/);
        if(call){i+=call[0].length;keys.add(string(source[i]));continue;}
      }
      if(nested&&c==='}'&&depth===0){i++;return;}
      if(c==='{')depth++;
      if(c==='}')depth--;
      i++;
    }
  }
  code();return keys;
}

export function checkTextKeys(sources,defined){
  const missing=[],used=new Set(),prefixes=new Set();
  for(const [file,source] of Object.entries(sources)){
    const refs=literalTextKeys(source);
    for(const match of source.matchAll(/data-i18n(?:-attr)?=["']([^"']+)["']/g)){
      const value=match[1].includes(':')?match[1].split(':').at(-1):match[1];
      if(!value.includes('${'))refs.add(value);
    }
    for(const key of refs){
      if(key.endsWith('.')){prefixes.add(key);continue;}
      used.add(key);if(!defined.has(key))missing.push(file+': '+key);
    }
  }
  const unused=[...defined].filter(key=>!used.has(key)&&![...prefixes].some(prefix=>key.startsWith(prefix))).sort();
  return {missing,unused,used};
}
