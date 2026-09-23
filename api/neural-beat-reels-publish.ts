import { requireAdmin } from "./_admin.js";

const methods = new Set(["GET","POST"]);
function upstreamUrl(request:any){
  const base=(process.env.REALTYFLOW_API_URL||"https://realtyflow.chatgenius.pro").replace(/\/$/,"");
  const query=request.url?.includes("?")?request.url.slice(request.url.indexOf("?")):"";
  return base+"/api/neural-beat/reels/publish"+query;
}
/** Owner-only proxy. OAuth tokens stay in RealtyFlow; never expose them in the browser. */
export default async function handler(request:any,response:any){
  const admin=await requireAdmin(request,response);if(!admin)return;
  const method=String(request.method||"GET").toUpperCase();
  if(!methods.has(method)){response.setHeader("Allow","GET, POST");return response.status(405).json({error:"Method not allowed."});}
  const secret=process.env.REALTYFLOW_MIGRATION_SECRET;
  if(!secret)return response.status(503).json({error:"Reels publish proxy is not configured."});
  try{
    const upstream=await fetch(upstreamUrl(request),{
      method,cache:"no-store",redirect:"manual",
      headers:{Accept:"application/json","Content-Type":"application/json",
        "X-ReMaster-Admin":admin.email,"X-ReMaster-Migration-Secret":secret},
      body:method==="GET"?undefined:JSON.stringify(request.body||{}),
    });
    const raw=await upstream.text();
    let data:any=null;try{data=raw?JSON.parse(raw):null;}catch{}
    response.setHeader("Cache-Control","private, no-store");
    if(!data||typeof data!=="object"||upstream.status>=300&&upstream.status<400)
      return response.status(502).json({error:"RealtyFlow returned an invalid Reels publish response."});
    return response.status(upstream.status).json(data);
  }catch(error){
    return response.status(502).json({error:error instanceof Error?error.message:"Could not reach RealtyFlow Reels publish API."});
  }
}
