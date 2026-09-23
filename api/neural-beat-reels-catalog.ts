import {requireAdmin} from "./_admin.js";
const ALLOWED=new Set(["GET"]);
export default async function handler(request:any,response:any){
  const admin=await requireAdmin(request,response);
  if(!admin)return;
  const method=String(request.method||"GET").toUpperCase();
  if(!ALLOWED.has(method)){response.setHeader("Allow",Array.from(ALLOWED).join(", "));return response.status(405).json({error:"Method not allowed."});}
  const secret=process.env.REALTYFLOW_MIGRATION_SECRET;
  if(!secret)return response.status(503).json({error:"Reels Studio proxy is not configured."});
  const base=(process.env.REALTYFLOW_API_URL||"https://realtyflow.chatgenius.pro").replace(/\/$/,"");
  const query=method==="GET"?request.url?.includes("?")?request.url.slice(request.url.indexOf("?")):"":"";
  try{
    const upstream=await fetch(base+"/api/neural-beat/reels/catalog"+query,{
      method,headers:{"Content-Type":"application/json","Accept":"application/json",
        "X-ReMaster-Admin":admin.email,"X-ReMaster-Migration-Secret":secret},
      body:method==="GET"?undefined:JSON.stringify(request.body||{}),redirect:"manual",cache:"no-store",
      signal:AbortSignal.timeout(method==="POST"?290_000:30_000),
    });
    if(upstream.status>=300&&upstream.status<400)return response.status(502).json({error:"RealtyFlow redirected Reels Studio to authentication."});
    const text=await upstream.text();
    let data:any;try{data=JSON.parse(text);}catch{return response.status(502).json({error:"RealtyFlow returned an invalid Reels Studio response."});}
    response.setHeader("Cache-Control","private, no-store");
    return response.status(upstream.status).json(data);
  }catch(err){
    return response.status(502).json({error:method==="POST"?
      "Reels-renderen kan ha blitt startet selv om svaret uteble. Oppdater jobbstatus før du forsøker en ny produksjon.":
      "Kunne ikke kontakte RealtyFlow Reels Studio."});
  }
}
