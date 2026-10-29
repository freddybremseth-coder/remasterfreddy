import { useEffect, useState } from "react";
import { getAdminSession } from "./lib/supabase";
type Asset = { id:string; title:string|null; kind:string; url:string|null; durationSeconds:number|null; lane:string|null; approved:boolean };
export default function AdminHybridLibraryReview() {
  const [assets,setAssets] = useState<Asset[]>([]);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState<string|null>(null);
  async function call(method:"GET"|"PATCH", body?:object) {
    const session=await getAdminSession();
    if(!session) throw new Error("Logg inn på nytt");
    const response=await fetch("/api/hybrid-media?action=library",{
      method,headers:{ Authorization:"Bearer "+session.accessToken, ...(body?{"Content-Type":"application/json"}:{}) },
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || "Kunne ikke hente mediebiblioteket");
    return data;
  }
  async function refresh() {
    try { const data=await call("GET"); setAssets(data.assets || []); setMessage(""); }
    catch(error) { setMessage(error instanceof Error?error.message:"Kunne ikke hente biblioteket"); }
  }
  useEffect(()=>{ void refresh(); },[]);
  async function review(asset:Asset,approved:boolean) {
    setBusy(asset.id);setMessage("");
    try { await call("PATCH",{assetId:asset.id,approved}); await refresh(); }
    catch(error) { setMessage(error instanceof Error?error.message:"Godkjenning feilet"); }
    finally { setBusy(null); }
  }
  return <section className="admin-card">
    <h3>Gjennomgå mediebiblioteket</h3>
    <p>Kontroller bildene og videoene før du godkjenner dem for automatiske videoplaner.</p>
    <button type="button" onClick={refresh}>Oppdater biblioteket</button>
    {message && <p role="status">{message}</p>}
    {assets.length === 0 && <p>Ingen registrerte hybride medier ennå.</p>}
    {assets.map(asset=><article key={asset.id} style={{padding:"1rem 0",borderBottom:"1px solid #7775"}}>
      <h4>{asset.title || "Uten navn"} — {asset.lane || "Ukjent sjanger"}</h4>
      {asset.kind==="video" && asset.url ? <video controls preload="metadata" src={asset.url} style={{width:"min(100%, 480px)"}}/> :
       asset.kind==="image" && asset.url ? <img src={asset.url} alt={asset.title || "Mediebilde"} loading="lazy" style={{width:"min(100%, 480px)"}}/> : <p>Ingen forhåndsvisning.</p>}
      <p>{asset.approved?"Godkjent":"Ikke godkjent"}{asset.durationSeconds? " · "+asset.durationSeconds+" sek.":""}</p>
      <button type="button" disabled={busy===asset.id || asset.approved} onClick={()=>review(asset,true)}>Godkjenn</button>
      <button type="button" disabled={busy===asset.id || !asset.approved} onClick={()=>review(asset,false)}>Trekk godkjenning tilbake</button>
    </article>)}
  </section>;
}
