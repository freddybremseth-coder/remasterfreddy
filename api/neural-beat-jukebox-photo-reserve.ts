import {requireAdmin} from "./_admin.js";
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MIME=new Set(["image/jpeg","image/png","image/webp"]);
/** Owner-only; forwards a request to the double-gated RealtyFlow reservation API. */
export default async function handler(request:any,response:any){
  const admin=await requireAdmin(request,response);
  if(!admin)return;
  response.setHeader("Cache-Control","private, no-store");
  response.setHeader("X-Content-Type-Options","nosniff");
  if(request.method!=="POST"){
    response.setHeader("Allow","POST");
    return response.status(405).json({error:"Method not allowed."});
  }
  if(process.env.JUKEBOX_PRIVATE_PHOTO_UPLOAD_PROXY_ENABLED!=="true")
    return response.status(503).json({error:"Privat bildeopplasting er ikke aktivert."});
  const input=request.body;
  if(!input||typeof input!=="object"||Array.isArray(input)
    ||Object.keys(input).some(key=>!["jobId","sceneIndex","contentType","bytes"].includes(key))
    ||!UUID.test(String(input.jobId||""))
    ||!Number.isInteger(input.sceneIndex)||input.sceneIndex<0||input.sceneIndex>11
    ||!MIME.has(input.contentType)
    ||!Number.isSafeInteger(input.bytes)||input.bytes<1024||input.bytes>10*1024*1024)
    return response.status(400).json({error:"Ugyldig privat bildescene."});
  const secret=process.env.REALTYFLOW_MIGRATION_SECRET;
  if(!secret)return response.status(503).json({error:"Jukebox-tilkoblingen er ikke konfigurert."});
  const upstreamBase=(process.env.REALTYFLOW_API_URL||"https://realtyflow.chatgenius.pro").replace(/\/$/,"");
  try{
    const upstream=await fetch(upstreamBase+"/api/neural-beat/jukebox/clips",{
      method:"POST",cache:"no-store",redirect:"manual",
      headers:{"Content-Type":"application/json",Accept:"application/json",
        "X-ReMaster-Admin":admin.email,"X-ReMaster-Migration-Secret":secret},
      body:JSON.stringify({jobId:input.jobId,sceneIndex:input.sceneIndex,
        contentType:input.contentType,bytes:input.bytes}),
      signal:AbortSignal.timeout(12000),
    });
    const raw=await upstream.json().catch(()=>null);
    if(upstream.status!==201){
      const code=raw?.code;
      return response.status([400,404,409,503].includes(upstream.status)?upstream.status:503)
        .json({error:code==="JUKEBOX_SCENE_ALREADY_RESERVED"?"Denne scenen har allerede en reservasjon."
          :code==="JUKEBOX_UPLOAD_DISABLED"||code==="JUKEBOX_PHOTO_UPLOAD_DISABLED"
          ?"Privat bildeopplasting er ikke aktivert.":"Kunne ikke reservere privat bilde."});
    }
    if(!raw||typeof raw.token!=="string"||raw.token.length<10
      ||typeof raw.path!=="string"
      ||raw.bucket!=="remaster-jukebox-clips"
      ||raw.sceneIndex!==input.sceneIndex||raw.publish!==false
      ||raw.status!=="staging_only"
      ||raw.maxBytes!==10*1024*1024
      ||!raw.path.startsWith("staging/"+input.jobId+"/scene-"+input.sceneIndex+"/")
      ||!/^staging\/[a-f0-9-]{36}\/scene-(?:[0-9]|10|11)\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(raw.path))
      return response.status(502).json({error:"Ugyldig svar fra privat opplasting."});
    return response.status(201).json({path:raw.path,token:raw.token,bucket:raw.bucket,
      maxBytes:raw.maxBytes,sceneIndex:raw.sceneIndex,status:"staging_only",publish:false});
  }catch{return response.status(503).json({error:"Privat opplastingsserver er ikke tilgjengelig."});}
}
