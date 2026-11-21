import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandTargets,readFavouritePlaces,quickPlaces} from '../app/public/command-palette.js';
import {studioLocationRequestAllowed,hubTownOf} from '../app/public/location-hub.js';
test('B5 searches actual place/person/screen targets and never invents an unknown person location',()=>{
 const places=[{id:'park',name:'Árnyas park',location_id:'loc-a',path:'Város › Park'}],people=[{id:'man',name:'Ádám',location_id:'loc-a'},{id:'unknown',name:'Béla'}],screens=[{id:'characters',label:'Karakterek'}];
 assert.equal(commandTargets({places,people,screens,query:'adam'})[0].target,'park');assert.equal(commandTargets({places,people,screens,query:'Béla'})[0].target,null);assert.equal(commandTargets({places,people,screens,query:'karakter'})[0].kind,'screen');
 const favourites=readFavouritePlaces({getItem:()=>JSON.stringify(['park','park','../escape',5])});assert.deepEqual(favourites,['park']);assert.deepEqual(quickPlaces(places,{favourites:['missing','park'],recent:['park'],current:null}).map(p=>p.id),['park']);assert.deepEqual(quickPlaces(places,{favourites,current:'park'}),[]);assert.deepEqual(readFavouritePlaces({getItem(){throw Error('blocked');}}),[]);
});
test('B4 studio guard permits read-only navigation and presentation saves, rejecting every travel/time/AI/file action',()=>{
 for(const route of ['/api/play/travel','/api/play/wait','/api/play/talk','/api/play/guests','/api/play/scenes/upload','/api/backgrounds/upload'])assert.equal(studioLocationRequestAllowed(route,'POST'),false);
 for(const route of ['/api/play/town-layout/town','/api/play/room-exits/room'])assert.equal(studioLocationRequestAllowed(route,'POST'),true);
 assert.equal(studioLocationRequestAllowed('/api/play/place/room'),true);assert.equal(hubTownOf([{id:'world',kind:'world',parent_id:null},{id:'town',kind:'place',parent_id:'world'},{id:'room',parent_id:'town'}],'room').id,'town');
});
