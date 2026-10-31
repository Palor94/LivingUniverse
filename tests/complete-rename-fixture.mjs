import {randomUUID} from 'node:crypto';
export async function renameFixture(app,character_id,new_name){const p=await app.characterRename.prepare({request_key:randomUUID(),character_id,new_name});return app.characterRename.applyApproved({plan_id:p.plan_id,plan_hash:p.plan_hash},'fixture-human');}
