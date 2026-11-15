import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backgroundTools} from '../mcp/backgrounds.mjs';

// ChatGPT passes pictures from the chat only to tools that declare them as file parameters
// (Apps SDK: _meta "openai/fileParams", top-level field, {download_url,file_id,mime_type?,file_name?}).
test('save tools declare the image file parameter the way ChatGPT expects',()=>{
  for(const name of ['finish_generation_job','place_play_asset']){
    const t=backgroundTools.find(x=>x.name===name);
    assert.deepEqual(t._meta['openai/fileParams'],['image']);
    const image=t.inputSchema.properties.image;
    assert.deepEqual(Object.keys(image.properties).sort(),['download_url','file_id','file_name','mime_type']);
    assert.deepEqual(image.required,['download_url','file_id']);assert.equal(image.additionalProperties,false);
    assert.ok(!t.inputSchema.required.includes('image'),'other sources (url, media_id) still work');
  }
});
