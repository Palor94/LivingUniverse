import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAppRoute,appRouteHash,startupRoute,readStartupPreference} from '../app/public/app-routes.js';
test('A1 deep links roundtrip every profile tab and reject malformed routes without side effects',()=>{
 const cid='11111111-1111-4111-8111-111111111111';
 for(const tab of ['profile','canon','media','events','generation'])assert.deepEqual(parseAppRoute(appRouteHash({view:'profile',cid,tab})),{view:'profile',cid,tab});
 assert.equal(parseAppRoute('#locations').view,'location-catalogue');
 for(const hash of ['#/profile/%ZZ/canon','#/profile/../canon','#/play/extra','#/profile/'+cid+'/unknown','#/whatever'])assert.equal(parseAppRoute(hash),null);
});
test('A24 explicit links win over the browser-local startup preference, and unavailable storage is safe',()=>{
 assert.equal(startupRoute('','play').view,'play');assert.equal(startupRoute('#/home','play').view,'home');assert.equal(startupRoute('#/characters','play').view,'characters');assert.equal(startupRoute('#invalid','play').view,'home');
 assert.equal(readStartupPreference({getItem(){throw Error('denied');}}),'home');assert.equal(readStartupPreference({getItem:()=> 'anything'}),'home');
});
