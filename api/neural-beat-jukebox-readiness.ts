import { requireAdmin } from "./_admin.js";

/** Admin-only read-only status proxy. Never starts a render job. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) return response.status(503).json({error:"Privat renderstatus er ikke konfigurert."});
  const origin=(process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
  try {
    const upstream=await fetch(origin+"/api/neural-beat/jukebox/readiness",{
      method:"GET",cache:"no-store",redirect:"manual",
      headers:{Accept:"application/json","X-ReMaster-Admin":admin.email,"X-ReMaster-Migration-Secret":secret},
      signal:AbortSignal.timeout(12000),
    });
    if(!upstream.ok)return response.status(503).json({
      error:"Privat renderstatus er ikke tilgjengelig fra RealtyFlow.",configured:false
    });
    const raw=await upstream.json();
    if(!raw||typeof raw!=="object"||!Array.isArray(raw.checks))
      return response.status(502).json({error:"Ugyldig svar fra privat renderkontroll."});
    // Expose only known booleans and fixed, generic descriptions.
    const ids=["database","private_storage","private_clips","cabinet_asset","clip_export","photo_intake","private_review"];
    const checks=ids.map(id=>({
      id,ready:raw.checks.some((check:any)=>check?.id===id&&check?.ready===true)
    }));
    return response.status(200).json({
      checks,
      privateMediaReady:raw.privateMediaReady===true,
      sectionPlacementReady:raw.sectionPlacementReady===true,
      photoIntakeConfigured:raw.photoIntakeConfigured===true,
      liveRenderingVerified:raw.liveRenderingVerified===true,
      // Never treat configuration checks alone as evidence of an active render worker.
      canStartPrivateRender:false,
      note:"Statuskontroll er kun lesebasert. Renderarbeider må aktiveres og testes separat."
    });
  }catch{
    return response.status(503).json({error:"Kunne ikke kontrollere privat renderstatus.",configured:false});
  }
}
