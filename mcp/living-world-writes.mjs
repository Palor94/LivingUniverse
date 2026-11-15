const uuid={type:'string',pattern:'^[a-fA-F0-9-]{36}$'};
const key={type:'string',minLength:8,maxLength:128,pattern:'^[A-Za-z0-9_-]+$'};
const tool=(name,description,properties,required,readOnly=false)=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:true,openWorldHint:false}});
export const livingWorldTools=[
  tool('propose_character_memory','Propose a subjective memory, belief, secret or mistake for an existing character. Objective story events and visual canon stay separate. If approval_required is false, apply when the user requested saving; discussion alone is not a save.',{request_key:key,character_id:uuid,kind:{enum:['memory','belief','secret','mistake']},text:{type:'string',minLength:1,maxLength:10000},related_event_id:{type:['string','null'],pattern:'^[a-fA-F0-9-]{36}$'},visibility:{enum:['private','participants','public']},belief_accuracy:{enum:['unknown','accurate','uncertain','mistaken']},reason:{type:'string',maxLength:2000}},['request_key','character_id','kind','text']),
  tool('apply_approved_memory_change','Apply a stored memory proposal under the server-authorized policy. Retries do not duplicate memories.',{change_id:uuid},['change_id']),
  tool('propose_story_event','Propose an objective story event as draft or proposed. Does not invent identity mappings or approve visual canon. If approval_required is false, apply when the user requested saving.',{request_key:key,event:{type:'object'},status:{enum:['draft','proposed']},reason:{type:'string',maxLength:2000}},['request_key','event']),
  tool('apply_approved_event_change','Apply a stored event proposal under the server-authorized policy. Story approval for public retrieval may remain a separate creator action depending on saved status.',{change_id:uuid},['change_id']),
  tool('propose_story_clock','Propose a story-clock update. Unknown chronology stays explicit. If approval_required is false, apply when the user requested saving.',{request_key:key,kind:{enum:['exact','approximate','unknown']},label:{type:'string',maxLength:200},iso_date:{type:['string','null'],pattern:'^\\d{4}-\\d{2}-\\d{2}$'},reason:{type:'string',maxLength:2000}},['request_key','kind']),
  tool('apply_approved_clock_change','Apply a stored story-clock proposal under the server-authorized policy.',{change_id:uuid},['change_id'])
];
export const livingWorldOperations={
  propose_character_memory:'memory_propose',
  apply_approved_memory_change:'memory_apply',
  propose_story_event:'event_propose',
  apply_approved_event_change:'event_apply',
  propose_story_clock:'clock_propose',
  apply_approved_clock_change:'clock_apply'
};
