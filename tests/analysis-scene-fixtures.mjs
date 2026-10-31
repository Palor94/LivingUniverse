export function sceneFixture(){
  return {
    environment:{observed_function:{hu:'Nyilvános mosdó',en:'public washroom'},evidence:'Synthetic fixtures show a sink and cubicle partition.',uncertain:true},
    compatible_settings:['cafe washroom','petrol-station washroom'].map(en=>({label:{hu:en,en},basis:'plausible_use',evidence:'No distinguishing business signage in this synthetic example.',uncertain:true,location_id:null})),
    participants:[1,2].map(n=>({id:'p'+n,screen_position:{hu:n===1?'Bal oldali alak':'Jobb oldali alak',en:n===1?'left figure':'right figure'},region:{x:n===1?0:.5,y:0,width:.5,height:1},character_id:null})),
    activities:[{id:'a1',activity:{hu:'Tárgy átadása',en:'handing over an object'},position:{hu:'Álló testhelyzet',en:'standing'},visibility:'visible',evidence:'Synthetic activity fixture, no image interpretation.',uncertain:true,roles:[{participant_id:'p1',role:'other_visible',evidence:'Fixture performer',uncertain:true},{participant_id:'p2',role:'other_visible',evidence:'Fixture receiver',uncertain:true}]}],
    simulation_use:{suggested_scope:'scene_illustration',narration_only:false,evidence:'Synthetic scene fixture, review required.',uncertain:true,approved:false}
  };
}
export const sceneWire=()=>({schema:1,description:{hu:'Szintetikus jelenet',en:'Synthetic scene'},background:{kind:'scene',hu:'Mosdó',en:'washroom'},observations:[],tags:[],locations:[],scene_details:sceneFixture()});
