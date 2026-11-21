// His own aim in a conversation (E4, 2026-11-21, owner: living characters who start things).
// Before every talk a character gets one thing he wants out of it, taken from his real
// situation, in this order: a promise Palor broke, what he wants from Palor now, his strongest
// current concern, his conscious goal. Early in a talk he brings it up himself; later only if
// it has not come up. Deterministic, no model call. After AI Town convex/agent/conversation.ts
// ("Your goals for the conversation", MIT) – here the goal comes from his state, not a fixed
// line – and Generative Agents' planning thought on a conversation (Apache-2.0).
import {clip} from './world-common.mjs';

export function agendaFor({lapsed=[],inner=null,profile=null,early=true,person='te'}={}){
  const you=person==='te';let aim='';
  const broken=lapsed.find(t=>t.promised_by==='palor');
  if(broken)aim=`szóvá tenni, hogy Palor nem tartotta meg: ${clip(broken.text,160)}`;
  else if(inner?.wants_from_palor)aim=clip(inner.wants_from_palor,200);
  else if(inner?.concerns?.length)aim=`beszélni arról, ami foglalkoztat${you?'':'ja'}: ${clip(inner.concerns[0],160)}`;
  else{const g=profile?.values?.goals?.value;if(typeof g==='string'&&g.trim())aim=`közelebb jutni a ${you?'célodhoz':'céljához'}: ${clip(g.trim(),160)}`;}
  if(!aim)return '';aim=aim.replace(/[.!?…\s]+$/,'');
  if(!you)return `A SAJÁT CÉLJA MOST: ${aim}.`;
  return `A SAJÁT CÉLOD EBBEN A BESZÉLGETÉSBEN: ${aim}. `+(early
    ?'Magadtól hozd szóba az első néhány válaszodban, a saját módodon (egyenesen vagy célozgatva, a természeted szerint); ne várd meg, hogy Palor kérdezzen. Ha a helyzet tényleg nem engedi, halaszd.'
    :'Ha még nem került szóba, és illik, hozd szóba; ha már szóba került, ne ismételd.');
}
