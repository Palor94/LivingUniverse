import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitCanvasCamera,groupCanvasSources,WORLD_ROOT} from '../app/public/location-canvas-model.js';
test('V10 fit includes every full node rectangle at laptop and narrow widths, even across a very wide tree',()=>{
 const positions=new Map([['root',{x:-300,y:0,width:208,height:116}],['left',{x:-15000,y:400,width:208,height:116}],['right',{x:30000,y:600,width:208,height:116}]]);
 for(const [width,height] of [[720,450],[1366,800],[375,812]]){const camera=fitCanvasCamera(positions,width,height);for(const p of positions.values()){assert.ok(p.x*camera.z+camera.x>=0);assert.ok(p.y*camera.z+camera.y>=0);assert.ok((p.x+p.width)*camera.z+camera.x<=width);assert.ok((p.y+p.height)*camera.z+camera.y<=height);}}
});
test('V10 source groups follow actual ancestors, keep unplaced labels separate and preserve source IDs',()=>{
 const state={nodes:[{id:WORLD_ROOT,name:'Világ',parent_id:null,placed:true},{id:'town',name:'Tesztváros',parent_id:WORLD_ROOT,placed:true},{id:'room',name:'Teszt szoba',parent_id:'town',placed:true},{id:'unknown',name:'Ismeretlen szülő',placed:false}]};
 const choices=state.nodes.slice(1).map(node=>({id:node.id,name:node.name})),groups=groupCanvasSources(choices,state);
 assert.deepEqual(groups.find(group=>group.key==='town').items.map(item=>item.id),['town','room']);assert.deepEqual(groups.find(group=>group.key==='unplaced').items.map(item=>item.id),['unknown']);assert.equal(groups.flatMap(group=>group.items).length,choices.length);
});
