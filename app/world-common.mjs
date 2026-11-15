// Shared constants and small helpers for the living world (engine, Play mode, rewind).
export const LEVELS=Object.freeze({'-2':'ellenséges','-1':'feszült','0':'idegen','1':'ismerős','2':'barátságos','3':'barát','4':'bizalmas','5':'szerető'});
export const WEEKDAYS=Object.freeze(['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat']);
// The clock runs 1:1: a day has four parts that become due at these local hours.
// Missed whole days are caught up as one compressed "egész nap" round each.
export const SLOTS=Object.freeze([{id:'reggel',label:'reggel',hour:6},{id:'delutan',label:'délután',hour:12},{id:'este',label:'este',hour:18},{id:'ejszaka',label:'éjszaka',hour:22}]);
export const WHOLE_DAY=Object.freeze({id:'nap',label:'egész nap'});
export const slotLabel=id=>id===WHOLE_DAY.id?WHOLE_DAY.label:SLOTS.find(s=>s.id===id)?.label||null;
// Index of the current day part; before the morning hour it is still last night.
export const slotIndexAt=date=>{const h=date.getHours();return h<SLOTS[0].hour?SLOTS.length-1:SLOTS.reduce((n,s,i)=>h>=s.hour?i:n,0);};
export const localDay=d=>d.toLocaleDateString('sv-SE');
export const addDays=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d);};
// The world day a moment belongs to: before the morning hour it is still last night, so
// 01:30 on Saturday is Friday night (2026-11-12; the calendar date split the night in two).
export const worldDayAt=date=>date.getHours()<SLOTS[0].hour?addDays(localDay(date),-1):localDay(date);
// Weekday index (0 = Sunday) of a world day.
export const weekdayOf=day=>new Date(day+'T12:00:00').getDay();
export const pairKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
export const clip=(v,n)=>{const s=String(v??'').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
export const parse=(json,fallback={})=>{try{return JSON.parse(json);}catch{return fallback;}};
// Stored world rows are only "live" when not undone by a rewind.
export const LIVE='rewound_at IS NULL';
