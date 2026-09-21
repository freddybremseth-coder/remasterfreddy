import { requireAdmin } from "./_admin.js";

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (String(request.method || "").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) {
    response.status(503).json({ error: "Mix promotion catalog proxy is not configured." });
    return;
  }
  try {
    const base = (process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
    const upstream = await fetch(`${base}/api/neural-beat/mixes/catalog`,{
      method:"GET", cache:"no-store", redirect:"manual",
      headers:{
        Accept:"application/json",
        "X-ReMaster-Admin":admin.email,
        "X-ReMaster-Migration-Secret":secret,
      },
    });
    const body=await upstream.text();
    let data:any=null;
    try { data=JSON.parse(body); } catch { /* never return authentication HTML */ }
    if (!data || typeof data!=="object" || (upstream.status>=300 && upstream.status<400)) {
      response.status(502).json({error:"RealtyFlow returned an invalid mix promotion catalog response."});
      return;
    }
    response.setHeader("Cache-Control","no-store");
    response.status(upstream.status).json(data);
  } catch(err) {
    response.status(502).json({error:err instanceof Error?err.message:"Could not load mix promotion catalog"});
  }
}
