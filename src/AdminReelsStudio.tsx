import {useCallback,useEffect,useMemo,useState} from "react";
import {Check,Download,ExternalLink,Film,Loader2,RefreshCw,Save,Search} from "lucide-react";
import {loadSongs,type AdminSong} from "./lib/admin-api";
import {loadReelCatalog,loadReelJobs,produceReel,
  type ReelBrand,type ReelChannel,type ReelItem,type ReelJob,type ReelRequest} from "./lib/reels-api";
import "./admin-mix-studio.css";
import "./admin-reels-studio.css";

const BRANDS:{id:ReelBrand;name:string;site:string}[]=[
  {id:"art",name:"Freddy Bremseth Art",site:"art.freddybremseth.com"},
  {id:"books",name:"Freddy Bremseth Books",site:"books.freddybremseth.com"},
  {id:"zeneco",name:"Zen Eco Homes",site:"zenecohomes.com"},
  {id:"pinoso",name:"Pinoso EcoLife",site:"pinosoecolife.com"},
];
const DURATIONS=[15,20,30,45,60] as const;
const REQUEST_KEY="remaster-reels-studio-active-request-v1";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isProperty=(brand:ReelBrand)=>brand==="zeneco"||brand==="pinoso";

export default function AdminReelsStudio(){
  const [brand,setBrand]=useState<ReelBrand>("art");
  const [area,setArea]=useState("");
  const [title,setTitle]=useState("Art Lounge — Selected Works");
  const [duration,setDuration]=useState<ReelRequest["durationSeconds"]>(20);
  const [songId,setSongId]=useState("");
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [channels,setChannels]=useState<ReelChannel[]>(["instagram","facebook"]);
  const [songs,setSongs]=useState<AdminSong[]>([]);
  const [catalog,setCatalog]=useState<ReelItem[]>([]);
  const [areas,setAreas]=useState<string[]>([]);
  const [jobs,setJobs]=useState<ReelJob[]>([]);
  const [active,setActive]=useState<ReelJob|null>(null);
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [catalogLoading,setCatalogLoading]=useState(true);
  const [rendering,setRendering]=useState(false);
  const [error,setError]=useState("");
  const [note,setNote]=useState("");
  const [copied,setCopied]=useState(false);

  const refresh=useCallback(async()=>{
    const latest=await loadReelJobs();
    setJobs(latest);
    const pending=window.localStorage.getItem(REQUEST_KEY);
    const match=pending&&latest.find(job=>job.request_key===pending);
    if(match){
      setActive(match);
      if(match.state!=="rendering")window.localStorage.removeItem(REQUEST_KEY);
    }
    return latest;
  },[]);

  useEffect(()=>{
    let mounted=true;
    Promise.all([loadSongs(),loadReelJobs()]).then(([allSongs,history])=>{
      if(!mounted)return;
      setSongs(allSongs.filter(song=>!!song.audioUrl&&uuid.test(song.id)));
      setJobs(history);
      const pending=window.localStorage.getItem(REQUEST_KEY);
      const current=pending&&history.find(job=>job.request_key===pending);
      if(current){
        setActive(current);
        if(current.state!=="rendering")window.localStorage.removeItem(REQUEST_KEY);
      }
    }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:"Kunne ikke hente musikk eller jobbstatus.");})
      .finally(()=>{if(mounted)setLoading(false);});
    return ()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    let mounted=true;
    setCatalogLoading(true);
    setError("");
    loadReelCatalog(brand,area).then(result=>{
      if(!mounted)return;
      setCatalog(result.items);
      setAreas(result.areas);
    }).catch(e=>{if(mounted){setCatalog([]);setError(e instanceof Error?e.message:"Kunne ikke laste videobilder.");}})
      .finally(()=>{if(mounted)setCatalogLoading(false);});
    return ()=>{mounted=false;};
  },[brand,area]);

  const selectedItems=useMemo(()=>selectedIds.flatMap(id=>{
    const item=catalog.find(x=>x.id===id);
    return item?[item]:[];
  }),[catalog,selectedIds]);
  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return catalog.filter(item=>!q||[item.title,item.style,item.collection,item.series,item.area]
      .filter(Boolean).join(" ").toLowerCase().includes(q)).slice(0,100);
  },[catalog,search]);
  const song=songs.find(s=>s.id===songId);
  const pendingKey=typeof window!=="undefined"?window.localStorage.getItem(REQUEST_KEY):null;
  const activeRendering=rendering||!!jobs.find(job=>job.state==="rendering"&&
    Date.now()-Date.parse(job.updated_at)<5*60_000);
  const canRender=!loading&&!catalogLoading&&!activeRendering&&!!songId&&title.trim().length>=3&&channels.length>0&&
    (isProperty(brand)?!!area&&!!catalog.length&&(selectedIds.length===0||selectedItems.length===selectedIds.length)
      :selectedIds.length>=1&&selectedItems.length===selectedIds.length);
  function changeBrand(next:ReelBrand){
    setBrand(next);setArea("");setSelectedIds([]);setSearch("");
    setTitle(next==="art"?"Art Lounge — Selected Works":next==="books"?"Books & Music — Freddy Bremseth":
      next==="zeneco"?"Costa Blanca Homes — Zen Eco Homes":"Inland Living — Pinoso EcoLife");
  }
  function toggleItem(id:string){
    setSelectedIds(previous=>previous.includes(id)?previous.filter(v=>v!==id)
      :previous.length>=5?previous:[...previous,id]);
  }
  async function render(){
    if(!canRender)return;
    setRendering(true);setError("");setNote("");setActive(null);
    const requestKey=crypto.randomUUID();
    window.localStorage.setItem(REQUEST_KEY,requestKey);
    try{
      const request:ReelRequest={requestKey,brand,title:title.trim(),durationSeconds:duration,
        songId,selectedIds,area,channels};
      const job=await produceReel(request);
      setActive(job);setJobs(previous=>[job,...previous.filter(x=>x.id!==job.id)]);
      if(job.state==="ready"||job.state==="failed")window.localStorage.removeItem(REQUEST_KEY);
      setNote(job.state==="ready"?"Reelen er ferdig, lagret og klar til forhåndsvisning og nedlasting. Ingen konto er publisert til.":"Produksjonsjobben er opprettet. Oppdater status for resultatet.");
    }catch(e){
      setError(e instanceof Error?e.message:"Reel-produksjonen feilet.");
      // On a lost connection the render may still be running. Retain the exact
      // requestKey so owner can reconcile GET without unknowingly duplicating.
      try{await refresh();}catch{/* keep the original request key */ }
    }finally{setRendering(false);}
  }
  async function refreshStatus(){
    setError("");try{
      const latest=await refresh();
      if(!latest.length)setNote("Ingen Reels er generert ennå.");
      else setNote("Jobbstatus oppdatert.");
    }catch(e){setError(e instanceof Error?e.message:"Kunne ikke oppdatere Reels-jobber.");}
  }
  async function copyCaption(value:string){
    try{await navigator.clipboard.writeText(value);setCopied(true);}
    catch{setError("Kunne ikke kopiere bildeteksten. Marker og kopier teksten manuelt.");}
  }
  function toggleChannel(channel:ReelChannel){
    setChannels(previous=>previous.includes(channel)?previous.length===1?previous:previous.filter(x=>x!==channel):[...previous,channel]);
  }

  return <section className="admin-card admin-reels-studio">
    <div className="mix-hero">
      <div>
        <p className="admin-eyebrow"><Film size={16}/> Egen videomodul</p>
        <h2>Reels Studio</h2>
        <p>Lag korte vertikale musikkvideoer av publisert kunst, bokomslag eller boliger i et bestemt område.
          Ferdig MP4 er tilpasset Instagram og Facebook. Se gjennom, last ned og publiser den på riktig konto.
          Ingenting blir automatisk lagt ut på sosiale medier.</p>
      </div>
      <div className="mix-hero-badges"><span>9:16 · 1080 × 1920</span><span>15–60 sekunder</span></div>
    </div>

    {error&&<div className="admin-error" role="alert">{error}</div>}
    {note&&<div className="admin-success"><Check size={16}/>{note}</div>}

    <div className="mix-section">
      <h3>1. Velg merke og video</h3>
      <div className="mix-promotion-brands">
        {BRANDS.map(item=><button key={item.id} type="button" className={`mix-brand-card ${brand===item.id?"active":""}`}
          aria-pressed={brand===item.id} onClick={()=>changeBrand(item.id)}>
          <strong>{item.name}</strong><small>{item.site}</small>
        </button>)}
      </div>
      <div className="mix-grid">
        <label><span>Tittel på Reelen</span>
          <input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label><span>Varighet</span>
          <select value={duration} onChange={e=>setDuration(Number(e.target.value) as ReelRequest["durationSeconds"])}>
            {DURATIONS.map(value=><option key={value} value={value}>{value} sekunder</option>)}
          </select>
        </label>
        <label><span>Musikk fra Re-Master Freddy</span>
          <select value={songId} disabled={loading} onChange={e=>setSongId(e.target.value)}>
            <option value="">Velg en sang</option>
            {songs.map(track=><option key={track.id} value={track.id}>{track.title}</option>)}
          </select>
          <small>Velg én sang med tilgjengelig lyd. Et kort utdrag brukes i videoen.</small>
        </label>
        {isProperty(brand)&&<label><span>Boligområde (må velges)</span>
          <select value={area} disabled={catalogLoading&&areas.length===0}
            onChange={e=>{setArea(e.target.value);setSelectedIds([]);setSearch("");}}>
            <option value="">Velg konkret by eller område</option>
            {areas.map(value=><option key={value} value={value}>{value}</option>)}
          </select>
          <small>Kun publiserte, nettsidesynlige boliger i valgt by brukes. Ingen bilder fra andre områder.</small>
        </label>}
      </div>
      {song&&<p className="mix-live-note">Valgt lyd: {song.title} · Re-Master Freddy</p>}
    </div>

    <div className="mix-section">
      <div className="mix-section-heading"><div>
        <h3>2. Velg bildene som skal vises</h3>
        <p>{isProperty(brand)?"Du kan velge opptil fem konkrete boliger eller la systemet ta tre fra valgt område.":
          "Velg 1–5 publiserte "+(brand==="art"?"kunstverk":"bokomslag")+". Du ser bilder og titler før produksjonen."}
        </p></div><button type="button" className="admin-secondary" onClick={refreshStatus} disabled={rendering}>
          <RefreshCw size={16}/> Oppdater jobbstatus</button></div>
      {isProperty(brand)&&!area&&<div className="admin-warning">Velg et boligområde ovenfor for å vise aktuelle boliger.</div>}
      {catalogLoading&&<div className="admin-empty"><Loader2 size={17} className="admin-spinner"/> Henter publiserte bilder …</div>}
      {!catalogLoading&&(area||!isProperty(brand))&&<>
        <label className="mix-promotion-search"><span><Search size={16}/> Søk i publisert utvalg</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tittel, stil eller område …"/></label>
        <div className="mix-track-summary">
          <strong>{selectedIds.length} av 5 valgt</strong><span>{catalog.length} godkjente bilder/boliger</span>
          {isProperty(brand)&&<span>{area} · {selectedIds.length?"Kun valgte boliger":"Tre boliger velges fra dette området"}</span>}
        </div>
        <div className="reels-visual-grid">
          {visible.map(item=><button type="button" key={item.id}
            className={`reels-visual-item ${selectedIds.includes(item.id)?"active":""}`}
            aria-pressed={selectedIds.includes(item.id)}
            onClick={()=>toggleItem(item.id)}>
            <img loading="lazy" src={item.imageUrl} alt={item.title}/>
            <strong>{item.title}</strong>
            <small>{[item.style,item.collection,item.series,item.language,item.area].filter(Boolean).join(" · ")}</small>
            {selectedIds.includes(item.id)&&<span className="reels-visual-check"><Check size={15}/> Valgt</span>}
          </button>)}
        </div>
        {selectedIds.length>0&&<div className="mix-actions">
          <button type="button" className="admin-secondary" onClick={()=>setSelectedIds([])}>
            {isProperty(brand)?"Bruk et tilfeldig utvalg fra området":"Nullstill bildeutvalget"}
          </button>
        </div>}
        {!visible.length&&<div className="admin-warning">Ingen tilgjengelige bilder i dette utvalget. Velg en annen kategori eller by.</div>}
      </>}
    </div>

    <div className="mix-section">
      <h3>3. Lagre som Reel for Instagram og/eller Facebook</h3>
      <div className="reels-channels">
        {(["instagram","facebook"] as const).map(channel=><label key={channel}>
          <input type="checkbox" checked={channels.includes(channel)} onChange={()=>toggleChannel(channel)}/>
          {channel==="instagram"?"Instagram Reel":"Facebook Reel"}
        </label>)}
      </div>
      <p className="mix-live-note">Du får en MP4 med stående bildeformat og en ferdig bildetekst med riktig nettsted, verk-/boklenker og musikkredit. Publisering skjer først etter at du selv velger riktig konto og deler filen.</p>
      <button type="button" className="admin-primary" disabled={!canRender} onClick={()=>void render()}>
        {rendering?<Loader2 className="admin-spinner" size={17}/>:<Save size={17}/>}
        {rendering?"Rendrer Reel – ikke trykk igjen …":"Lag Reel og lagre MP4"}
      </button>
      {pendingKey&&!rendering&&<p className="admin-warning">En tidligere Reel-forespørsel kan fremdeles være under behandling. Bruk «Oppdater jobbstatus» før du lager en ny.</p>}
    </div>

    {active&&<div className="mix-section reels-output">
      <h3>Din Reel: {active.title}</h3>
      <p>Status: <strong>{active.state==="ready"?"Ferdig":active.state==="rendering"?"Rendrer på serveren":"Feilet"}</strong>
        {" · "}{active.duration_seconds} sekunder · {active.brand}</p>
      {active.state==="ready"&&active.videoUrl&&<>
        <video controls playsInline preload="metadata" src={active.videoUrl} aria-label={"Forhåndsvisning av "+active.title}/>
        <div className="mix-actions">
          <a className="admin-primary" href={active.videoUrl} download={active.title.replace(/[^a-z0-9-]/gi,"-")+".mp4"}
            target="_blank" rel="noreferrer"><Download size={17}/> Last ned Reel som MP4</a>
          <a className="admin-secondary" href={active.videoUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={17}/> Åpne videofilen</a>
        </div>
      </>}
      {active.error&&<div className="admin-error">{active.error}</div>}
      {active.caption&&<>
        <label>Ferdig bildetekst for Instagram/Facebook
          <textarea rows={9} readOnly value={active.caption}/></label>
        <button type="button" className="admin-secondary" onClick={()=>void copyCaption(active.caption)}>
          {copied?"Bildeteksten er kopiert":"Kopier bildetekst"}
        </button>
      </>}
    </div>}
    <div className="mix-section">
      <div className="mix-section-heading"><h3>Tidligere Reels</h3>
        <button type="button" className="admin-secondary" onClick={()=>void refreshStatus()}><RefreshCw size={16}/> Oppdater</button></div>
      <div className="reels-history">{jobs.slice(0,15).map(job=><button type="button" key={job.id}
        className={`reels-history-item ${active?.id===job.id?"active":""}`}
        onClick={()=>setActive(job)}>
        <strong>{job.title}</strong><span>{job.brand} · {job.duration_seconds}s · {job.state==="ready"?"Klar":job.state==="rendering"?"Rendrer":"Feilet"}</span>
      </button>)}</div>
    </div>
  </section>;
}
