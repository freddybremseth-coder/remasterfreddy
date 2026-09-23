import {requireAdmin} from "./_admin.js";

const allowed=new Set(["GET","POST"]);
function upstreamUrl(request:any){
  const base=process.env.REALTYFLOW_API_URL||"https://realtyflow.chatgenius.pro";
  const query=request.url?.includes("?")?request.url.slice(request.url.indexOf("?")):"";
  return base.replace(/\/$/,"")+"/api/neural-beat/reels"+query;
}
export default async function handler(request:any,response:any){
  const admin=await requireAdmin(request,response);if(!admin)return;
  const method=String(request.method||"GET").toUpperCase();
  if(!allowed.has(method)){response.setHeader("Allow","GET, POST");response.status(405).json({error:"Method not allowed."});return;}
  const secret=process.env.REALTYFLOW_MIGRATION_SECRET;
  if(!secret){response.status(503).json({error:"Reels Studio proxy is not configured."});return;}
  try{
    const upstream=await fetch(upstreamUrl(request),{
      method,headers:{
        Accept:"application/json","Content-Type":"application/json",
        "X-ReMaster-Admin":admin.email,"X-ReMaster-Migration-Secret":secret,
      },
      body:method==="GET"?undefined:JSON.stringify(request.body||{}),
      cache:"no-store",redirect:"manual",
    });
    if(upstream.status>=300&&upstream.status<400){response.status(502).json({error:"RealtyFlow redirected the Reels Studio API."});return;}
    const text=await upstream.text();let data:any=null;
    try{data=text?JSON.parse(text):null;}catch{}
    if(!data||typeof data!=="object"){response.status(502).json({error:"RealtyFlow Reels Studio returned invalid data."});return;}
    response.status(upstream.status);response.setHeader("Cache-Control","no-store");response.json(data);
  }catch{
    response.status(502).json({error:"Could not reach RealtyFlow Reels Studio."});
  }
}
