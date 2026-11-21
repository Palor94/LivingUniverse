// Keep the visible scene while its replacement image loads. No game actions here.
const versions=new WeakMap();
export function memoizedRead(load,{now=Date.now,ttl=60000,max=24}={}){
  const entries=new Map();
  const read=key=>{
    const old=entries.get(key);if(old&&now()-old.at<ttl)return old.promise;
    const entry={at:now(),promise:null};entry.promise=Promise.resolve().then(()=>load(key)).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});
    entries.delete(key);entries.set(key,entry);if(entries.size>max)entries.delete(entries.keys().next().value);return entry.promise;
  };
  read.invalidate=key=>entries.delete(key);return read;
}
export async function decodedImage(image,timeout=15000){
  let timer;
  try{return await Promise.race([image.decode().then(()=>true,()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeout);})]);}
  finally{clearTimeout(timer);}
}

export async function updateScene(host,html,{placeId,imageUrl,busy=false}){
  const template=host.ownerDocument.createElement('div');template.innerHTML=html;
  const fresh=template.firstElementChild;
  let scene=host.querySelector(':scope > .vn');
  const entered=!scene||scene.dataset.placeId!==placeId;
  if(!scene){scene=fresh;host.replaceChildren(scene);}
  const version=(versions.get(scene)||0)+1;versions.set(scene,version);
  let front=scene.querySelector(':scope > img.vn-bg-current'),buffer=scene.querySelector(':scope > img.vn-bg-buffer');
  if(!front){
    front=host.ownerDocument.createElement('img');buffer=host.ownerDocument.createElement('img');
    front.className='vn-bg play-bg vn-bg-current';buffer.className='vn-bg play-bg vn-bg-buffer';front.alt=buffer.alt='';
    front.hidden=buffer.hidden=true;const placeholder=scene.querySelector(':scope > .vn-bg-empty');if(placeholder)placeholder.after(front,buffer);else scene.prepend(front,buffer);
  }
  if(scene.dataset.background!==imageUrl){
    if(imageUrl){buffer.src=imageUrl;buffer.hidden=false;buffer.classList.toggle('vn-bg-busy',busy);const ready=await decodedImage(buffer);
      if(versions.get(scene)!==version||!scene.isConnected)return false;
      if(ready){
        void buffer.offsetWidth;
        front.classList.replace('vn-bg-current','vn-bg-buffer');buffer.classList.replace('vn-bg-buffer','vn-bg-current');
        [front,buffer]=[buffer,front];scene.dataset.background=imageUrl;
      }else{front.hidden=buffer.hidden=true;scene.dataset.background='';}
    }else{front.hidden=buffer.hidden=true;scene.dataset.background='';}
  }
  if(versions.get(scene)!==version||!scene.isConnected)return false;
  front.classList.toggle('vn-bg-busy',busy);
  const placeholder=scene.querySelector(':scope > .vn-bg-empty'),nextPlaceholder=fresh.querySelector(':scope > .vn-bg-empty');
  if(placeholder&&nextPlaceholder){placeholder.className=nextPlaceholder.className;placeholder.innerHTML=nextPlaceholder.innerHTML;}
  scene.dataset.placeId=placeId;
  scene.className=scene.className.replace(/\bvn-sky-\d+\b/g,'').trim()+' '+fresh.className.split(' ').find(c=>c.startsWith('vn-sky-'));
  scene.classList.toggle('vn-enter',entered);
  if(entered)setTimeout(()=>{if(versions.get(scene)===version)scene.classList.remove('vn-enter');},1000);
  const info=scene.querySelector(':scope > .vn-info'),nextInfo=fresh.querySelector(':scope > .vn-info');
  if(info&&nextInfo&&info.dataset.rendered!==nextInfo.innerHTML){info.innerHTML=nextInfo.innerHTML;info.dataset.rendered=nextInfo.innerHTML;}
  const stage=scene.querySelector(':scope > .vn-stage'),nextStage=fresh.querySelector(':scope > .vn-stage');
  if(stage&&nextStage){
    const figures=new Map([...stage.children].map(el=>[el.dataset.playTalk,el]));
    for(const [i,next] of [...nextStage.children].entries()){
      let figure=figures.get(next.dataset.playTalk);figures.delete(next.dataset.playTalk);
      if(!figure||figure.dataset.rendered!==next.outerHTML){const signature=next.outerHTML;if(figure)figure.replaceWith(next);figure=next;figure.dataset.rendered=signature;}
      if(stage.children[i]!==figure)stage.insertBefore(figure,stage.children[i]||null);
    }
    for(const figure of figures.values())figure.remove();
    stage.classList.toggle('vn-settled',!entered);
  }
  if(entered){scene.querySelector('#vn-doors')?.replaceChildren();scene.querySelector('#vn-doors')?.removeAttribute('data-sig');}
  return true;
}
