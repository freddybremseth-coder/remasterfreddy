import { requireAdmin } from "./_admin.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCENE_STATUS=new Set(["awaiting_upload","metadata_verified_only","rejected_metadata","invalid_reservation"]);
const KINDS=new Set(["image","video"]);

/** Owner-authenticated, read-only private scene status. Never return storage paths. */
export default async function handler(request:any,response:any){
  const admin=await requireAdmin(request,response);
  if(!admin)return;
  response.setHeader("Cache-Control","private, no-store");
  response.setHeader("X-Content-Type-Options","nosniff");
  if(String(request.method||"GET").toUpperCase()!=="GET"){
    response.setHeader("Allow","GET");
    return response.status(405).json({error:"Method not allowed."});
  }
  const id=typeof request.query?.jobId==="string"?request.query.jobId:"";
  if(!UUID.test(id))return response.status(400).json({error:"Oppgi en gyldig Jukebox-jobb-ID."});
  const secret=process.env.REALTYFLOW_MIGRATION_SECRET;
  if(!secret)return response.status(503).json({error:"Privat bildestatus er ikke konfigurert."});
  const origin=(process.env.REALTYFLOW_API_URL||"https://realtyflow.chatgenius.pro").replace(/\/$/,"");
  try{
    const upstream=await fetch(origin+"/api/neural-beat/jukebox/clips/status?jobId="+encodeURIComponent(id),{
      method:"GET",cache:"no-store",redirect:"manual",
      headers:{Accept:"application/json","X-ReMaster-Admin":admin.email,
        "X-ReMaster-Migration-Secret":secret},
      signal:AbortSignal.timeout(12000),
    });
    if(!upstream.ok){
      const message=upstream.status===404?"Jobben finnes ikke for denne administratoren."
        :upstream.status===409?"Jobben venter ikke på private bilder."
        :"Bildestatus er ikke tilgjengelig ennå.";
      return response.status([404,409].includes(upstream.status)?upstream.status:503)
        .json({error:message});
    }
    const raw=await upstream.json();
    if(!raw||raw.jobId!==id||typeof raw.songId!=="string"||!UUID.test(raw.songId)||!Array.isArray(raw.scenes)||raw.scenes.length>12
      ||!Number.isInteger(raw.sceneCount)||raw.sceneCount!==raw.scenes.length)
      return response.status(502).json({error:"Ugyldig svar fra privat bildestatus."});
    const scenes=[];
    for(const scene of raw.scenes){
      if(!Number.isInteger(scene?.index)||scene.index<0||scene.index>11
        ||!SCENE_STATUS.has(scene?.status)
        ||(scene.kind!==null&&!KINDS.has(scene.kind)))
        return response.status(502).json({error:"Ugyldige scenedata fra server."});
      scenes.push({index:scene.index,status:scene.status,kind:scene.kind});
    }
    return response.status(200).json({
      jobId:id,songId:raw.songId,sceneCount:scenes.length,scenes,
      contiguous:raw.contiguous===true,
      allUploadedMetadataMatches:raw.allUploadedMetadataMatches===true,
      workerDecoded:false,canStartPrivateRender:false,publish:false,
      note:"Kun lagringsmetadata er kontrollert. Bilder er ikke dekodet eller rendret."
    });
  }catch{return response.status(503).json({error:"Kunne ikke hente privat bildestatus."});}
}
