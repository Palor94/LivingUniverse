// What may be a place's backdrop (owner rule 2026-11-13): a picture of the place, not of people.
// No character linked to it, not a shared scene or another Play asset, and if the analysis saw
// people on it, only as small figures in a wide shot. SQL condition on a media row aliased "m".
// Used by the Play scene, the town cards and the picture-generation needs, so all three agree.
export const BACKDROP_OK_SQL=`NOT EXISTS(SELECT 1 FROM depictions d WHERE d.media_id=m.id)
    AND NOT EXISTS(SELECT 1 FROM play_asset_sources pa WHERE pa.media_id=m.id AND pa.target<>'background')
    AND m.relative_path NOT LIKE '%Közös jelenetek%'
    AND NOT EXISTS(SELECT 1 FROM world_review_sources s JOIN world_review_documents wd ON wd.source_id=s.id WHERE s.media_id=m.id
      AND coalesce(json_array_length(wd.document_json,'$.participants'),0)>0
      AND coalesce(json_extract(s.raw_json,'$.world_details.camera.framing'),'')<>'wide_scene')`;
