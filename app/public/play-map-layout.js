export function overlaps(a,b,gap=0){return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
export function crowdLayout(labels,{width=1500,height=880}={}){
  const placed=[],result=new Map();
  for(const label of labels){
    if(!label.count)continue;
    const w=28+24*(Math.min(4,label.count)-1),h=28;
    let chosen=null;
    for(let row=0;row<8&&!chosen;row++)for(const dx of [0,32,64,96,128,160,192,224,-32,-64,-96,-128,-160,-192,-224]){
      const box={x:Math.max(8,Math.min(width-w-8,label.x+(label.width-w)/2+dx)),y:Math.max(8,Math.min(height-h-8,label.y-h-9-row*34)),width:w,height:h};
      if(![...labels,...placed].some(other=>overlaps(box,other,6))){chosen=box;break;}
    }
    chosen??={x:Math.max(8,Math.min(width-w-8,label.x)),y:8,width:w,height:h};placed.push(chosen);result.set(label.id,chosen);
  }
  return result;
}
// A label must read as belonging to its own pin (owner, 2026-11-20, "Karakterek, cimkék és
// helyszínek viszonya"): labels pushed up to 216 units sideways sat beside the neighbouring house.
// Now a label stays touching its pin (below, above, right or left, nudged a little), the avatar
// badges count as taken space, and if nothing near is free it goes straight under its own pin.
export function townLabelLayout(pins,positions,{width=1200,height=720}={}){
  const occupied=[],result=new Map();
  // The pin disc (r 22) and the people badge at its upper right (translate 21,-19, r 13 + count).
  const markers=pins.flatMap(p=>{const [x,y]=positions.get(p.id);return [{x:x-24,y:y-24,width:48,height:48},...(p.count?[{x:x+6,y:y-36,width:36,height:32}]:[])];});
  for(const pin of pins){
    const [x,y]=positions.get(pin.id),name=pin.name.length>20?pin.name.slice(0,19)+'…':pin.name,w=Math.max(64,name.length*7.4+22),h=21;
    const below={dx:-w/2,dy:27},candidates=[below,{dx:-w/2,dy:-48},{dx:30,dy:-h/2},{dx:-30-w,dy:-h/2}];
    for(const nudge of [12,24,36])candidates.push({dx:-w/2+nudge,dy:27},{dx:-w/2-nudge,dy:27},{dx:-w/2+nudge,dy:-48},{dx:-w/2-nudge,dy:-48},{dx:30,dy:-h/2-nudge},{dx:30,dy:-h/2+nudge},{dx:-30-w,dy:-h/2-nudge},{dx:-30-w,dy:-h/2+nudge});
    const place=({dx,dy})=>({x:Math.max(8,Math.min(width-w-8,x+dx)),y:Math.max(8,Math.min(height-h-8,y+dy)),width:w,height:h,name});
    const chosen=candidates.map(place).find(box=>![...markers,...occupied].some(other=>overlaps(box,other,3)))||place(below);
    occupied.push(chosen);result.set(pin.id,chosen);
  }
  return result;
}
