// Closing voice reminder (2026-11-23, owner): in a long conversation the model drifts back to a
// generic, agreeable assistant voice because the card sits far from the end of the prompt. The
// last block of every character prompt now repeats his voice, rules and contradiction in a few
// lines. Built only from existing card text (the voice falls back to his "speech" field); nothing
// is invented, and a character with neither gets no reminder. Deterministic, no model call.
// Idea after SillyTavern post_history_instructions (character card spec V3); written fresh.
import {clip} from './world-common.mjs';

const val=(p,id)=>{const v=p?.values?.[id]?.value;return v===undefined||v===null?'':String(v).trim();};

export function voiceFacts(p){
  const voice=val(p,'play_voice')||val(p,'speech');
  return {voice:clip(voice,170),rules:clip(val(p,'play_rules'),240),contradiction:clip(val(p,'play_contradiction'),170)};
}
const parts=(f,pl)=>[f.voice&&`${pl?'Hangja':'Hangod'}: ${f.voice}`,f.rules&&`${pl?'Szabályai':'Szabályaid'}: ${f.rules}`,f.contradiction&&`${pl?'Ellentmondása':'Ellentmondásod'}: ${f.contradiction}`].filter(Boolean);

export const REMINDER_HEAD='EMLÉKEZTETŐ, MIELŐTT VÁLASZOLSZ (akármilyen hosszú a beszélgetés, ez vagy te):';
export const GROUP_REMINDER_HEAD='EMLÉKEZTETŐ, MIELŐTT VÁLASZOLTOK (akármilyen hosszú a jelenet, mindenki a saját hangján szól; ne hasonlítsanak egymásra):';
const NOT_GENERIC='Ne válj általános, udvarias, mindenbe beleegyező segítővé: maradj ez a konkrét ember.';

export function voiceReminder(p){
  const lines=parts(voiceFacts(p),false);
  return lines.length?[REMINDER_HEAD,...lines,NOT_GENERIC].join('\n'):'';
}
// people: [{name, profile}]; people with no card or speech text are left out.
export function groupVoiceReminder(people){
  const rows=(people||[]).map(c=>{const l=parts(voiceFacts(c.profile),true);return l.length?`- ${c.name}: ${l.join('; ')}`:'';}).filter(Boolean);
  return rows.length?[GROUP_REMINDER_HEAD,...rows].join('\n'):'';
}
