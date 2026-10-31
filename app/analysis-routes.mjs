import {analysisCategories,analysisDefaultGoals,analysisError as error,analysisVersions} from './analysis-model.mjs';
export function createAnalysisRoutes({analysis,review}){
  return {async handle({p,body,req,url,json}){
    if(!p.startsWith('/api/media-analysis'))return false;
    try{
      if(req.method==='GET'){
        if(p==='/api/media-analysis'){json({csrf:analysis.csrf,providers:analysis.providers,unavailable:analysis.unavailable,versions:analysisVersions,categories:analysisCategories,default_goals:analysisDefaultGoals,limits:{batch:100,review:200,page:20},jobs:analysis.list(),decisions:review.history(),real_recognition:analysis.providers.some(p=>!p.mock),external_upload:analysis.providers.some(p=>!p.local)});return true;}
        const job=p.match(/^\/api\/media-analysis\/jobs\/([a-f0-9-]{36})$/u);if(job){const offset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>100)throw error('INVALID_ARGUMENT','Érvénytelen lapozás.');json(analysis.view(job[1],offset));return true;}
      }
      if(req.method!=='POST')throw error('METHOD_NOT_ALLOWED','Nem támogatott elemzési művelet.',405);
      analysis.guard(req);
      if(p==='/api/media-analysis/jobs/preview'){json(await analysis.previewJob(body));return true;}
      if(p==='/api/media-analysis/jobs'){json(await analysis.createJob(body));return true;}
      const control=p.match(/^\/api\/media-analysis\/jobs\/([a-f0-9-]{36})\/(pause|resume|cancel)$/u);
      if(control){if(!body||Object.keys(body).length)throw error('INVALID_ARGUMENT','Ehhez a művelethez nem tartoznak további mezők.');json(analysis.controlJob(control[1],control[2]));return true;}
      const rematch=p.match(/^\/api\/media-analysis\/items\/([a-f0-9-]{36})\/rematch$/u);
      if(rematch){if(!body||Object.keys(body).length)throw error('INVALID_ARGUMENT','Ismeretlen újraillesztési mező.');json(await analysis.rematch(rematch[1]));return true;}
      if(p==='/api/media-analysis/review/preview'){json(await review.preview(body));return true;}
      if(p==='/api/media-analysis/review/apply'){json(await review.apply(body));return true;}
      if(p==='/api/media-analysis/review/rollback'){json(review.rollback(body));return true;}
      throw error('NOT_FOUND','Az elemzési művelet nem található.',404);
    }catch(e){json({code:e.code||'ANALYSIS_FAILED',error:e.status?e.message:'Az elemzési művelet sikertelen. Az eredeti médiát nem módosítottuk.'},e.status||500);return true;}
  }};
}
