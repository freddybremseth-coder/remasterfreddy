import {useEffect,useMemo,useState} from "react";
import {BookOpen,Check,Copy,Download,Film,House,Image as ImageIcon,Loader2,RefreshCw,Smartphone} from "lucide-react";
import {loadSongs,type AdminSong} from "./lib/admin-api";
import {loadMixPromotionCatalog,type PromotionCatalog,type PromotionItem,type VisualRegion,type VisualType} from "./lib/mix-api";
import {loadReels,renderReel,type ReelBrand,type ReelChannel,type ReelDraftInput,type ReelJob} from "./lib/reel-api";
import "./admin-reels-studio.css";

const emptyCatalog:PromotionCatalog={art:[],books:[]};
const regionLabels:Record<VisualRegion,string>={any:"Hele porteføljen",north:"Costa Blanca North",south:"Costa Blanca South",inland:"Alicante Inland","costa-calida":"Costa Cálida"};
const typeLabels:Record<VisualType,string>={mixed:"Alle boligbilder",villas:"Villaer",apartments:"Leiligheter",pools:"Basseng","sea-views":"Havutsikt",interiors:"Interiør"};
function toggle(list:string[],value:string){return list.includes(value)?list.filter(x=>x!==value):[...list,value];}
function unique(items:PromotionItem[],field:keyof PromotionItem){return [...new Set(items.map(item=>String(item[field]||"")).filter(Boolean))].sort();}
const defaults:ReelDraftInput={
  title:"Art Lounge Reel",brand:"art",durationSeconds:30,songId:"",channels:["instagram","facebook"],
  artStyles:[],artCollections:[],artIds:[],bookSeries:[],bookLanguages:[],bookIds:[],
  region:"north",town:"",visualType:"mixed",
};

export default function AdminReelsStudio(){
  const [draft,setDraft]=useState<ReelDraftInput>(defaults);
  const [songs,setSongs]=useState<AdminSong[]>([]);
  const [catalog,setCatalog]=useState<PromotionCatalog>(emptyCatalog);
  const [jobs,setJobs]=useState<ReelJob[]>([]);
  const [loading,setLoading]=useState(true);
  const [rendering,setRendering]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [search,setSearch]=useState("");
  const [copied,setCopied]=useState("");

  async function refresh(){
    setLoading(true);setError("");
    try{
      const [songRows,promo,reels]=await Promise.all([loadSongs(),loadMixPromotionCatalog(),loadReels()]);
      const usable=songRows.filter(song=>Boolean(song.audioUrl));
      setSongs(usable);setCatalog(promo);setJobs(reels);
      setDraft(current=>({...current,songId:usable.some(x=>x.id===current.songId)?current.songId:(usable[0]?.id||"")}));
    }catch(e){setError(e instanceof Error?e.message:"Kunne ikke hente Reels Studio.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);

  const brandItems=draft.brand==="art"?catalog.art:draft.brand==="books"?catalog.books:[];
  const filtered=useMemo(()=>brandItems.filter(item=>{
    if(draft.brand==="art"){
      if(draft.artStyles.length&&!draft.artStyles.includes(item.style||""))return false;
      if(draft.artCollections.length&&!draft.artCollections.includes(item.collection||""))return false;
    }
    if(draft.brand==="books"){
      if(draft.bookSeries.length&&!draft.bookSeries.includes(item.series||""))return false;
      if(draft.bookLanguages.length&&!draft.bookLanguages.includes(item.language||""))return false;
    }
    return item.title.toLowerCase().includes(search.toLowerCase());
  }).slice(0,120),[brandItems,draft,search]);
  const chosenIds=draft.brand==="art"?draft.artIds:draft.brand==="books"?draft.bookIds:[];

  function patch(value:Partial<ReelDraftInput>){setMessage("");setDraft(current=>({...current,...value}));}
  function changeBrand(brand:ReelBrand){patch({brand,title:brand==="art"?"Art Lounge Reel":brand==="books"?"Books & Music Reel":"Costa Blanca Homes Reel"});}
  function changeChannel(channel:ReelChannel){const channels=draft.channels.includes(channel)?draft.channels.filter(x=>x!==channel):[...draft.channels,channel];if(channels.length)patch({channels});}
  function chooseItem(id:string){if(draft.brand==="art")patch({artIds:toggle(draft.artIds,id)});if(draft.brand==="books")patch({bookIds:toggle(draft.bookIds,id)});}
  async function create(){
    if(!draft.songId){setError("Velg en sang med tilgjengelig lyd.");return;}
    setRendering(true);setError("");setMessage("");
    try{
      const job=await renderReel(draft);
      setJobs(current=>[job,...current.filter(x=>x.id!==job.id)]);
      setMessage("Reel er ferdig rendret i 1080 × 1920 og klar for Instagram/Facebook.");
    }catch(e){setError(e instanceof Error?e.message:"Reel-renderingen feilet.");}
    finally{setRendering(false);}
  }
  async function copyCaption(job:ReelJob){if(!job.caption)return;await navigator.clipboard.writeText(job.caption);setCopied(job.id);setTimeout(()=>setCopied(""),1600);}

  return <section className="admin-card admin-reels-studio">
    <div className="reels-hero">
      <div><p className="admin-eyebrow">Reels Studio</p><h2>Lag vertikale videoer for Instagram og Facebook</h2>
        <p>Velg kunst, bøker eller Zen Eco Homes-boliger i et konkret område. Reelen rendres som 1080 × 1920 MP4 med Re-Master Freddy-musikk, riktig branding og ferdig caption.</p></div>
      <Smartphone size={44}/>
    </div>

    <div className="reels-brand-grid">
      <button className={draft.brand==="art"?"active":""} onClick={()=>changeBrand("art")}><ImageIcon size={20}/><strong>Art</strong><span>Publiserte verk</span></button>
      <button className={draft.brand==="books"?"active":""} onClick={()=>changeBrand("books")}><BookOpen size={20}/><strong>Books</strong><span>Bokomslag og serier</span></button>
      <button className={draft.brand==="zeneco"?"active":""} onClick={()=>changeBrand("zeneco")}><House size={20}/><strong>Zen Eco Homes</strong><span>Boliger etter område</span></button>
    </div>

    {error&&<div className="admin-error">{error}</div>}
    {message&&<div className="admin-success"><Check size={16}/>{message}</div>}

    <div className="reels-grid">
      <label><span>Reel-tittel</span><input value={draft.title} maxLength={120} onChange={e=>patch({title:e.target.value})}/></label>
      <label><span>Lengde</span><select value={draft.durationSeconds} onChange={e=>patch({durationSeconds:Number(e.target.value) as ReelDraftInput["durationSeconds"]})}>
        <option value={15}>15 sekunder</option><option value={20}>20 sekunder</option><option value={30}>30 sekunder</option><option value={45}>45 sekunder</option><option value={60}>60 sekunder</option>
      </select></label>
      <label className="reels-song"><span>Musikk</span><select value={draft.songId} onChange={e=>patch({songId:e.target.value})}>
        {songs.map(song=><option key={song.id} value={song.id}>{song.title+(song.genre?" · "+song.genre:"")}</option>)}
      </select></label>
      <fieldset><legend>Format / bruk</legend>
        <label><input type="checkbox" checked={draft.channels.includes("instagram")} onChange={()=>changeChannel("instagram")}/> Instagram Reel</label>
        <label><input type="checkbox" checked={draft.channels.includes("facebook")} onChange={()=>changeChannel("facebook")}/> Facebook Reel</label>
      </fieldset>
    </div>

    {(draft.brand==="art"||draft.brand==="books")&&<div className="reels-selection">
      <div className="mix-section-heading"><div><h3>{draft.brand==="art"?"Velg kunst":"Velg bøker"}</h3><p>Tomt manuelt utvalg betyr tilfeldig fra filtrene. Valgte verk/bøker kontrolleres før rendering.</p></div></div>
      <div className="reels-facets">
        {draft.brand==="art"&&<>
          <fieldset><legend>Kunststil</legend>{unique(catalog.art,"style").map(value=><label key={value}><input type="checkbox" checked={draft.artStyles.includes(value)} onChange={()=>patch({artStyles:toggle(draft.artStyles,value),artIds:[]})}/>{value.replace(/-/g," ")}</label>)}</fieldset>
          <fieldset><legend>Kolleksjon</legend>{unique(catalog.art,"collection").map(value=><label key={value}><input type="checkbox" checked={draft.artCollections.includes(value)} onChange={()=>patch({artCollections:toggle(draft.artCollections,value),artIds:[]})}/>{value.replace(/-/g," ")}</label>)}</fieldset>
        </>}
        {draft.brand==="books"&&<>
          <fieldset><legend>Bokserie</legend>{unique(catalog.books,"series").map(value=><label key={value}><input type="checkbox" checked={draft.bookSeries.includes(value)} onChange={()=>patch({bookSeries:toggle(draft.bookSeries,value),bookIds:[]})}/>{value.replace(/-/g," ")}</label>)}</fieldset>
          <fieldset><legend>Språk</legend>{unique(catalog.books,"language").map(value=><label key={value}><input type="checkbox" checked={draft.bookLanguages.includes(value)} onChange={()=>patch({bookLanguages:toggle(draft.bookLanguages,value),bookIds:[]})}/>{value}</label>)}</fieldset>
        </>}
      </div>
      <div className="reels-search"><input placeholder="Søk etter tittel …" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="admin-secondary" onClick={()=>draft.brand==="art"?patch({artIds:[]}):patch({bookIds:[]})}>Tilfeldig fra filtrene</button></div>
      <div className="reels-items">{filtered.map(item=><button type="button" key={item.id} className={chosenIds.includes(item.id)?"active":""} onClick={()=>chooseItem(item.id)}>
        <img src={item.imageUrl} alt="" loading="lazy"/><span><strong>{item.title}</strong><small>{draft.brand==="art"?[item.style,item.collection].filter(Boolean).join(" · "):[item.series,item.language].filter(Boolean).join(" · ")}</small></span>
        <i>{chosenIds.includes(item.id)&&<Check size={14}/>}</i>
      </button>)}</div>
    </div>}

    {draft.brand==="zeneco"&&<div className="reels-selection">
      <h3>Velg boligområde og type</h3><p>Et konkret område overstyrer ikke til en annen by hvis det mangler bilder. Du får en tydelig feilmelding i stedet.</p>
      <div className="reels-grid">
        <label><span>Region</span><select value={draft.region} onChange={e=>patch({region:e.target.value as VisualRegion})}>{Object.entries(regionLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Spesielt område/by</span><input value={draft.town} onChange={e=>patch({town:e.target.value})} placeholder="f.eks. Benidorm, Finestrat, Villajoyosa"/></label>
        <label><span>Boligbilder</span><select value={draft.visualType} onChange={e=>patch({visualType:e.target.value as VisualType})}>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </div>}

    <div className="reels-render">
      <div><strong>Klar til rendering</strong><span>{draft.durationSeconds+"s · 1080×1920 · "+(draft.brand==="zeneco"?(draft.town||regionLabels[draft.region]):draft.brand==="art"?"Freddy Bremseth Art":"Freddy Bremseth Books")}</span></div>
      <button className="admin-primary" onClick={create} disabled={loading||rendering||!draft.songId}>{rendering?<Loader2 className="admin-spinner" size={17}/>:<Film size={17}/>} {rendering?"Renderer Reel …":"Lag Reel"}</button>
      <button className="admin-secondary" onClick={()=>void refresh()} disabled={loading||rendering}><RefreshCw size={16}/> Oppdater</button>
    </div>

    <div className="reels-history">
      <h3>Siste Reels</h3>
      {loading&&jobs.length===0?<div className="admin-empty"><Loader2 className="admin-spinner" size={22}/> Henter Reels …</div>:
      jobs.length===0?<div className="admin-empty">Ingen Reels er laget ennå.</div>:
      jobs.map(job=><article key={job.id}>
        {job.video_url&&<video controls preload="metadata" playsInline src={job.video_url}/>}
        <div><strong>{job.title}</strong><span>{job.brand+" · "+job.duration_seconds+"s · "+job.state}</span>{job.town&&<small>{job.town}</small>}
          {job.error&&<p className="admin-error">{job.error}</p>}
          {job.caption&&<details><summary>Caption og informasjon</summary><pre>{job.caption}</pre></details>}
          <div className="mix-actions">
            {job.video_url&&<a className="admin-secondary" href={job.video_url} target="_blank" rel="noreferrer"><Download size={15}/> Åpne MP4</a>}
            {job.caption&&<button className="admin-secondary" onClick={()=>void copyCaption(job)}>{copied===job.id?<Check size={15}/>:<Copy size={15}/>} {copied===job.id?"Kopiert":"Kopier caption"}</button>}
          </div>
        </div>
      </article>)}
    </div>
  </section>;
}
