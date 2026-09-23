import {useEffect,useMemo,useState} from "react";
import {Check,Clapperboard,Copy,Download,Loader2,RefreshCw,Sparkles} from "lucide-react";
import {loadSongs,type AdminSong} from "./lib/admin-api";
import MixPromotionPicker,{type PromotionDraft} from "./MixPromotionPicker";
import {createReel,loadReelJobs,loadReelPublishStatus,publishReel,type ReelPublishStatus,type ReelPublishChannel,type ReelBrand,type ReelChannel,type ReelDuration,type ReelJob} from "./lib/reels-api";
import type {VisualRegion,VisualType} from "./lib/mix-api";
import "./admin-reels-studio.css";

const REEL_TITLES:Record<ReelBrand,string>={art:"Art Lounge Reel",books:"Books & Music Reel",zeneco:"Costa Blanca Homes Reel",freddybremseth:"Freddy Bremseth Reel",pinosoecolife:"Pinoso EcoLife Reel",donaanna:"Doña Anna Reel"};
const PUBLISH_CHANNELS:ReelPublishChannel[]=["youtube","instagram","facebook"];
const PUBLISH_LABELS:Record<ReelPublishChannel,string>={youtube:"YouTube",instagram:"Instagram",facebook:"Facebook"};
const PROPERTY_REEL_BRANDS=new Set<ReelBrand>(["zeneco","pinosoecolife"]);
const AREA_PRESETS=["","Benidorm","Finestrat","Villajoyosa","Altea","Albir","La Nucia","Polop","Calpe","Moraira","Denia","Javea","Pinoso","Aspe","Novelda","Torrevieja","Orihuela Costa","Murcia"];

const basePromotion:PromotionDraft={
  promotionBrand:"art",artStyles:[],artCollections:[],artIds:[],
  bookSeries:[],bookLanguages:[],bookIds:[],
};
function urlFor(job:ReelJob){
  const value=job.selection?.publicUrl;
  return typeof value==="string"&&value.startsWith("https://")?value:"";
}
export default function AdminReelsStudio(){
  const [songs,setSongs]=useState<AdminSong[]>([]);
  const [jobs,setJobs]=useState<ReelJob[]>([]);
  const [promotion,setPromotion]=useState<PromotionDraft>(basePromotion);
  const [brand,setBrand]=useState<ReelBrand>("art");
  const [title,setTitle]=useState("Art Lounge Reel");
  const [duration,setDuration]=useState<ReelDuration>(30);
  const [songId,setSongId]=useState("");
  const [channels,setChannels]=useState<ReelChannel[]>(["instagram","facebook"]);
  const [region,setRegion]=useState<VisualRegion>("north");
  const [areaQuery,setAreaQuery]=useState("");
  const [visualTypes,setVisualTypes]=useState<VisualType[]>(["mixed"]);
  const [loading,setLoading]=useState(true);
  const [rendering,setRendering]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [latestUrl,setLatestUrl]=useState("");
  const [latestCaption,setLatestCaption]=useState("");
  const [selectedJobId,setSelectedJobId]=useState("");
  const [publishStatus,setPublishStatus]=useState<ReelPublishStatus|null>(null);
  const [statusLoading,setStatusLoading]=useState(false);
  const [publishing,setPublishing]=useState(false);

  const playableSongs=useMemo(()=>songs.filter(song=>Boolean(song.audioUrl)),[songs]);
  async function refresh(){
    setLoading(true);setError("");
    try{
      const [songRows,reelRows]=await Promise.all([loadSongs(),loadReelJobs()]);
      setSongs(songRows);setJobs(reelRows);
      if(!songId){
        const first=songRows.find(song=>song.audioUrl);
        if(first)setSongId(first.id);
      }
    }catch(e){setError(e instanceof Error?e.message:"Kunne ikke hente Reels Studio.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);

  function toggleChannel(channel:ReelChannel){
    setChannels(current=>current.includes(channel)?current.filter(x=>x!==channel):[...current,channel]);
  }
  function toggleVisual(type:VisualType){
    setVisualTypes(current=>{
      const next=current.includes(type)?current.filter(x=>x!==type):[...current,type];
      return next.length?next:["mixed"];
    });
  }
  function patchPromotion(patch:Partial<PromotionDraft>){
    setPromotion(current=>({...current,...patch}));
    if(patch.promotionBrand && patch.promotionBrand!=="none"){
      const brand=patch.promotionBrand;
      setBrand(brand);
      if(brand==="art")setTitle("Art Lounge Reel");
      if(brand==="books")setTitle("Books & Music Reel");
      if(brand==="zeneco")setTitle("Costa Blanca Homes Reel");
    }
  }
  async function render(){
    if(!songId){setError("Velg en Re-Master Freddy-sang.");return;}
    if(!channels.length){setError("Velg Instagram, Facebook eller begge.");return;}
    setRendering(true);setError("");setMessage("");setLatestUrl("");setLatestCaption("");
    setSelectedJobId("");setPublishStatus(null);
    try{
      const result=await createReel({
        title,brand,durationSeconds:duration,songId,channels,
        artStyles:promotion.artStyles,artCollections:promotion.artCollections,artIds:promotion.artIds,
        bookSeries:promotion.bookSeries,bookLanguages:promotion.bookLanguages,bookIds:promotion.bookIds,
        region,areaQuery:PROPERTY_REEL_BRANDS.has(brand)?areaQuery:"",
        visualTypes:PROPERTY_REEL_BRANDS.has(brand)?visualTypes:["mixed"],
      });
      setLatestUrl(result.publicUrl);setLatestCaption(result.reel.caption||"");
      setSelectedJobId(result.reel.id);
      void refreshPublication(result.reel.id);
      setMessage(`Reel ferdig: ${duration} sekunder, 1080 × 1920. Klar for ${channels.map(x=>x==="instagram"?"Instagram":"Facebook").join(" + ")}.`);
      setJobs(await loadReelJobs());
    }catch(e){setError(e instanceof Error?e.message:"Reel-produksjonen feilet.");}
    finally{setRendering(false);}
  }
  async function refreshPublication(jobId:string){
    setStatusLoading(true);setPublishStatus(null);
    try{setPublishStatus(await loadReelPublishStatus(jobId));}
    catch(e){setError(e instanceof Error?e.message:"Kunne ikke lese publiseringsstatus fra RealtyFlow.");}
    finally{setStatusLoading(false);}
  }
  function selectRenderedReel(job:ReelJob){
    const url=urlFor(job);
    if(!url||job.state!=="ready")return;
    setSelectedJobId(job.id);setLatestUrl(url);setLatestCaption(job.caption||"");
    setError("");setMessage("");void refreshPublication(job.id);
  }
  async function sendToPlatform(channel:ReelPublishChannel){
    const jobId=selectedJobId,target=publishStatus?.channels[channel];
    if(!jobId||!target?.connected||publishing||publishStatus?.deliveries.some(d=>d.channel===channel))return;
    const label=PUBLISH_LABELS[channel],account=target.account||label;
    if(!window.confirm(`Publisere denne Reel offentlig på ${label}-kontoen «${account}»?`))return;
    setPublishing(true);setError("");setMessage("");
    try{
      const result=await publishReel(jobId,channel);
      setMessage(channel==="facebook"?`Facebook har mottatt Reelen for ${result.account}. Videoen kan fremdeles behandles før den blir synlig.`:
        `Publisert på ${label}: ${result.account}. ${result.externalUrl||""}`);
    }catch(e){setError(e instanceof Error?e.message:`Publiseringen er ikke bekreftet. Kontroller ${label} før du forsøker igjen.`);}
    finally{setPublishing(false);await refreshPublication(jobId);}
  }
  async function copyCaption(){
    if(!latestCaption)return;
    await navigator.clipboard.writeText(latestCaption);
    setMessage("Caption er kopiert.");
  }

  return <section className="admin-card admin-reels-studio">
    <div className="reels-hero">
      <div>
        <p className="admin-eyebrow">Reels Studio</p>
        <h2>Lag korte videoer og publiser direkte</h2>
        <p>Velg Re-Master Freddy-musikk og lag en 1080 × 1920 MP4 for Art, Books, Zen Eco Homes, FreddyBremseth.com, Pinoso EcoLife eller Doña Anna. Hver Reel bruker den valgte merkevarens egne bilder, profil og lenke.</p>
      </div>
      <div className="reels-badges"><span><Clapperboard size={16}/> 9:16</span><span>15–60 sek</span><span>YouTube + Instagram + Facebook</span></div>
    </div>

    {error&&<div className="admin-error">{error}</div>}
    {message&&<div className="admin-success"><Check size={16}/>{message}</div>}

    <div className="mix-grid">
      <label><span>Reel-tittel</span><input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/></label>
      <label><span>Lengde</span><select value={duration} onChange={e=>setDuration(Number(e.target.value) as ReelDuration)}>
        <option value={15}>15 sekunder</option><option value={20}>20 sekunder</option><option value={30}>30 sekunder</option>
        <option value={45}>45 sekunder</option><option value={60}>60 sekunder</option>
      </select></label>
      <label><span>Musikk</span><select value={songId} onChange={e=>setSongId(e.target.value)}>
        <option value="">Velg sang …</option>{playableSongs.map(song=><option key={song.id} value={song.id}>{song.title}</option>)}
      </select></label>
    </div>

    <fieldset className="mix-facet reels-channel-picker"><legend>Lag Reel for</legend><div className="mix-facet-options">
      {(["instagram","facebook"] as ReelChannel[]).map(channel=><label key={channel} className="mix-facet-label">
        <input type="checkbox" checked={channels.includes(channel)} onChange={()=>toggleChannel(channel)}/>
        {channel==="instagram"?"Instagram Reels":"Facebook Reels"}
      </label>)}
    </div><small>Samme vertikale master fungerer på begge. Du får MP4 + caption etter rendering.</small></fieldset>

    <div className="mix-grid"><label><span>Reels-merkevare</span><select aria-label="Reels-merkevare" value={brand} onChange={e=>{
      const next=e.target.value as ReelBrand;
      setBrand(next);setTitle(REEL_TITLES[next]);
      if(next==="pinosoecolife")setRegion("inland");
      if(next==="zeneco")setRegion("north");
      if(next==="art"||next==="books"||next==="zeneco")setPromotion(current=>({...current,promotionBrand:next}));
    }}>
      <option value="art">Freddy Bremseth Art</option><option value="books">Freddy Bremseth Books</option>
      <option value="zeneco">Zen Eco Homes</option><option value="freddybremseth">FreddyBremseth.com</option>
      <option value="pinosoecolife">Pinoso EcoLife</option><option value="donaanna">Doña Anna</option>
    </select></label></div>
    {(brand==="art"||brand==="books"||brand==="zeneco")&&<MixPromotionPicker draft={promotion} onChange={patchPromotion} allowNone={false}/>}
    {brand==="freddybremseth"&&<p>Personlig merkevare: tilfeldig utvalg fra publisert kunst og bokomslag, med freddybremseth.com som avsender.</p>}
    {brand==="donaanna"&&<p>Doña Anna: kuraterte, offentlige bilder av oliven, gården, olivenolje og produkter fra eget bildearkiv.</p>}

    {PROPERTY_REEL_BRANDS.has(brand)&&<div className="mix-section">
      <div className="mix-section-heading"><div><p className="admin-eyebrow">Boligområde</p><h3>Velg hvor boligene skal komme fra</h3>
        <p>Velg riktig region og snevre inn til et bestemt område. Pinoso EcoLife bruker kun sitt eget utvalg av innlandsboliger.</p></div></div>
      <div className="mix-grid">
        <label><span>Region</span><select aria-label="Region" value={region} onChange={e=>setRegion(e.target.value as VisualRegion)}>
          <option value="any">Hele porteføljen</option><option value="north">Costa Blanca North</option>
          <option value="south">Costa Blanca South</option><option value="inland">Inland Alicante</option><option value="costa-calida">Costa Cálida</option>
        </select></label>
        <label><span>Spesifikt område / by</span><input aria-label="Spesifikt område / by" list="reel-area-presets" value={areaQuery} onChange={e=>setAreaQuery(e.target.value)} placeholder="f.eks. Benidorm"/>
          <datalist id="reel-area-presets">{AREA_PRESETS.filter(Boolean).map(area=><option key={area} value={area}/>)}</datalist>
          <small>Tomt felt bruker hele regionen.</small></label>
      </div>
      <fieldset className="mix-facet"><legend>Boligbilder</legend><div className="mix-facet-options">
        {([["mixed","Alle"],["villas","Villaer"],["apartments","Leiligheter"],["pools","Basseng"],["sea-views","Havutsikt"],["interiors","Interiør"]] as Array<[VisualType,string]>).map(([type,label])=>
          <label key={type} className="mix-facet-label"><input type="checkbox" checked={visualTypes.includes(type)} onChange={()=>toggleVisual(type)}/>{label}</label>)}
      </div></fieldset>
    </div>}

    <div className="reels-render-actions">
      <button className="admin-primary" type="button" onClick={render} disabled={rendering||loading||!songId}>
        {rendering?<Loader2 className="admin-spinner" size={17}/>:<Sparkles size={17}/>}
        {rendering?"Lager Reel …":"Lag Reel"}
      </button>
      <button className="admin-secondary" type="button" onClick={refresh} disabled={loading||rendering}>
        <RefreshCw className={loading?"admin-spinner":""} size={16}/> Oppdater
      </button>
    </div>

    {latestUrl&&<div className="reels-result">
      <video src={latestUrl} controls playsInline preload="metadata"/>
      <div><strong>Ferdig Reel</strong><p>Vertikal MP4 med Re-Master Freddy-musikk og valgt innhold.</p>
        {selectedJobId&&<div className="mix-section"><strong>Publiser ferdig Reel</strong>
          {statusLoading?<p>Kontrollerer tilkoblede kontoer og tidligere publisering …</p>:publishStatus&&<>
            {PUBLISH_CHANNELS.map(channel=>{
              const target=publishStatus.channels[channel];
              const delivery=publishStatus.deliveries.find(d=>d.channel===channel);
              const prepared=channel==="youtube"||jobs.find(j=>j.id===selectedJobId)?.channels.includes(channel);
              return <div key={channel} className="mix-section">
                <p><strong>{PUBLISH_LABELS[channel]}</strong> · {target?.connected?`Konto: ${target.account}`:target?.reason||"Ingen konto er tilkoblet for denne merkevaren."}</p>
                {delivery&&<p>{delivery.state==="published"?<>{channel==="facebook"?"Facebook har mottatt videoen.":"Publisert."} {delivery.external_url&&<a href={delivery.external_url} target="_blank" rel="noreferrer">Åpne innlegget</a>}</>:delivery.state==="needs_review"?"Tidligere publisering må kontrolleres før et nytt forsøk.":"Publisering er startet. Kontroller kontoen før et nytt forsøk."}</p>}
                {!prepared&&<small>Denne videoen ble ikke klargjort for {PUBLISH_LABELS[channel]}. Velg kanalen når du lager en ny Reel.</small>}
                <button className="admin-primary" type="button" onClick={()=>void sendToPlatform(channel)}
                  disabled={publishing||!target?.connected||!prepared||Boolean(delivery)}>
                  {publishing?"Publisering pågår …":`Publiser på ${PUBLISH_LABELS[channel]}`}
                </button>
              </div>;
            })}
            {!!publishStatus.otherChannels?.length&&<div className="mix-section"><strong>Andre registrerte kanaler</strong>
              {publishStatus.otherChannels.map(other=><p key={other.platform+other.account}>{other.platform==="twitter"?"X":other.platform} · {other.account}: {other.reason}</p>)}
            </div>}
          </>}
        </div>}
        <div className="mix-actions"><a className="admin-primary" href={latestUrl} target="_blank" rel="noreferrer"><Download size={15}/> Åpne MP4</a>
          <button className="admin-secondary" onClick={copyCaption}><Copy size={15}/> Kopier caption</button></div>
        {latestCaption&&<pre>{latestCaption}</pre>}</div>
    </div>}

    <div className="mix-section">
      <div className="mix-section-heading"><div><p className="admin-eyebrow">Siste Reels</p><h3>Renderhistorikk</h3></div></div>
      <div className="reels-history">
        {jobs.length===0?<div className="admin-empty">Ingen Reels laget ennå.</div>:jobs.slice(0,12).map(job=>{
          const url=urlFor(job);
          return <article key={job.id}><div><strong>{job.title}</strong><span>{job.brand} · {job.duration_seconds}s · {job.channels.join(" + ")}</span>
            <small>{new Date(job.created_at).toLocaleString("nb-NO")}</small></div><span data-state={job.state}>{job.state}</span>
            {url&&<a href={url} target="_blank" rel="noreferrer">Åpne video</a>}
            {url&&job.state==="ready"&&<button type="button" className="admin-secondary" onClick={()=>selectRenderedReel(job)}>Velg for publisering</button>}
            {job.error&&<small className="admin-error">{job.error}</small>}</article>
        })}
      </div>
    </div>
  </section>;
}
