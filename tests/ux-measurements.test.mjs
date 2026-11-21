import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {saveMeasurement,readMeasurements,measurementSummary} from '../app/ux-measurements.mjs';

test('B7 persists only validated metadata; weekly groups exclude old/future runs and deduplicate retries across rotation',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lu-ux-'));
  try{
    const record={id:'11111111-2222-4333-8444-555555555551',task:'background',surface:'phone',clicks:3,ms:1200};
    const save=(n,at,patch={})=>saveMeasurement(dir,{...record,id:record.id.slice(0,-1)+n,...patch},{now:()=>Date.parse(at),maxBytes:1});
    save(1,'2026-11-15T10:00:00Z');save(2,'2026-11-16T10:00:00Z',{clicks:5,ms:1800});
    assert.equal(save(1,'2026-11-16T10:00:00Z').duplicate,true);
    const rows=readMeasurements(dir);assert.equal(rows.length,2);
    const bounds={since:'2026-11-15T00:00:00.000Z',to:'2026-11-17T00:00:00.000Z'};
    assert.deepEqual(measurementSummary([...rows,{...rows[0],at:'2026-11-01T00:00:00Z'},{...rows[0],at:'2027-01-01T00:00:00Z'}],bounds),[{task:'background',surface:'phone',runs:2,clicks:8,ms:3000,avg_clicks:4,avg_ms:1500}]);
    for(const patch of [{ms:-1},{ms:Infinity},{clicks:1.5},{surface:'unknown'},{task:'anything'},{notes:'private'}])
      assert.throws(()=>saveMeasurement(dir,{...record,...patch}),{status:400});
    assert.ok(!(await fs.readFile(path.join(dir,'logs','ux-measurements.log'),'utf8')).includes('private'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
