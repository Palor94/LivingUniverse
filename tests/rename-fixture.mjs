import {randomUUID} from 'node:crypto';
// Synthetic fixtures only: models a human choosing the primary-name diff.
export function approveFixtureName(app,character_id,new_name){
  const plan=app.characterRename.prepare({request_key:randomUUID(),character_id,new_name});
  return app.characterRename.decide(plan.plan_id,{plan_hash:plan.plan_hash,decision:'approve',selected_ids:['primary-name']},'fixture-human');
}
