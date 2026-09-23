import { requireAdmin } from "./_admin.js";

const allowedMethods=new Set(["GET","POST"]);
function upstreamUrl(request:any){
  const base=(process.env.REALTYFLOW_API_URL||"https://realtyflow.chatgenius.pro").replace(/\/$/,"");
  const query=request.url?.includes("?")?request.url.slice(request.url.indexOf("?")):"";
  return base+"/api/neural-beat/reels"+query;
}
export default async function handler(request:any,response:any){
  const admin=await requireAdmin(request,response);if(!admin)return;
  const method=String(request.method||"GET").toUpperCase();
  if(!allowedMethods.has(method)){response.setHeader("Allow",[...allowedMethods].join(", "));return response.status(405).json({error:"Method not allowed."});}
  const secret=process.env.REALTYFLOW_MIGRATION_SECRET;
  if(!secret)return response.status(503).json({error:"Reels Studio proxy is not configured."});
  try{
    const upstream=await fetch(upstreamUrl(request),{
      method,cache:"no-store",redirect:"manual",
      headers:{Accept:"application/json","Content-Type":"application/json",
        "X-ReMaster-Admin":admin.email,"X-ReMaster-Migration-Secret":secret},
      body:method==="GET"?undefined:JSON.stringify(request.body||{}),
    });
    const body=await upstream.text();let data:any=null;
    try{data=body?JSON.parse(body):null;}catch{}
    if(!data||typeof data!=="object"||(upstream.status>=300&&upstream.status<400))
      return response.status(502).json({error:"RealtyFlow returned an invalid Reels Studio response."});
    response.setHeader("Cache-Control","no-store");
    return response.status(upstream.status).json(data);
  }catch(err){
    return response.status(502).json({error:err instanceof Error?err.message:"Could not reach Reels Studio API."});
  }
}
