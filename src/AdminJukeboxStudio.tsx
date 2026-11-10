import {useEffect,useMemo,useRef,useState} from "react";
import {Clapperboard,Pause,Play,RefreshCw} from "lucide-react";
import {loadSongs,loadJukeboxJobs,queueJukeboxVideo,type AdminSong,type JukeboxJob} from "./lib/admin-api";
import "./admin-jukebox.css";

/** Admin Jukebox preview with a feature-gated render queue; never publishes automatically. */
export default function AdminJukeboxStudio(){
  const [songs,setSongs]=useState<AdminSong[]>([]);
  const [songId,setSongId]=useState("");
  const [format,setFormat]=useState<"landscape"|"portrait">("landscape");
  const [style,setStyle]=useState<"jukebox"|"hybrid">("jukebox");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [playing,setPlaying]=useState(false);
  const [seconds,setSeconds]=useState<"full"|"15"|"30"|"60">("full");
  const [jobs,setJobs]=useState<JukeboxJob[]>([]);
  const [jobBusy,setJobBusy]=useState(false);
  const [jobNotice,setJobNotice]=useState("");
  const renderEnabled=import.meta.env.VITE_JUKEBOX_RENDER_ENABLED==="true";
  const [sceneKey,setSceneKey]=useState(0);
  const audio=useRef<HTMLAudioElement|null>(null);
  const song=useMemo(()=>songs.find(item=>item.id===songId),[songs,songId]);
  const hybridIntro=format==="portrait"?"inntil 3 sekunder":"inntil 30 sekunder";
  const hybridOutro=format==="portrait"?"inntil 3 sekunder":"inntil 15 sekunder";

  async function refresh(){
    setLoading(true);setError("");
    try{
      const items=(await loadSongs()).filter(item=>Boolean(item.audioUrl));
      setSongs(items);setSongId(previous=>items.some(item=>item.id===previous)?previous:(items[0]?.id||""));
    }catch(err){setError(err instanceof Error?err.message:"Kunne ikke hente musikkbiblioteket.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  async function refreshJobs(){
    try{setJobs(await loadJukeboxJobs());}catch(err){setJobNotice(err instanceof Error?err.message:"Jukebox-køen er ennå ikke tilgjengelig.");}
  }
  useEffect(()=>{if(renderEnabled)void refreshJobs();},[renderEnabled]);
  async function queueVideo(){
    if(!songId||!renderEnabled||jobBusy||style==="hybrid")return;
    setJobBusy(true);setError("");setJobNotice("");
    try{
      const request={songId,format,...(seconds==="full"?{}:{seconds:Number(seconds) as 15|30|60})};
      const result=await queueJukeboxVideo(request);
      setJobNotice(result.reused?"Eksisterende Jukebox-jobb funnet.":"Jukebox-video lagt i produksjonskøen.");
      await refreshJobs();
    }catch(err){setError(err instanceof Error?err.message:"Jukebox-produksjonen kunne ikke startes.");}
    finally{setJobBusy(false);}
  }
  useEffect(()=>{
    setPlaying(false);setSceneKey(value=>value+1);
    if(audio.current){audio.current.pause();audio.current.currentTime=0;}
  },[songId]);
  useEffect(()=>()=>{audio.current?.pause();},[]);

  async function togglePlayback(){
    if(!audio.current||!song?.audioUrl)return;
    if(playing){audio.current.pause();setPlaying(false);return;}
    try{await audio.current.play();setPlaying(true);}
    catch{setError("Lydfilen kunne ikke avspilles. Velg en annen sang eller kontroller tilgangen.");}
  }

  return <section className="admin-card admin-jukebox-studio">
    <p className="admin-eyebrow">Re-master Freddy · musikkvideo</p>
    <h2>60-talls jukeboks</h2>
    <p>Velg en sang fra musikkbiblioteket og en videostil. Jukeboxen har roterende vinyl og originalmusikk, uten den kompliserte plateveksleren. Videoer lagres privat for kontroll før eventuell publisering.</p>
    {error&&<div role="alert" className="admin-error">{error}</div>}
    <div className="jukebox-controls">
      <label><span>Sang</span><select aria-label="Velg sang" value={songId} onChange={event=>setSongId(event.target.value)} disabled={loading}>
        {!songs.length&&<option value="">Ingen tilgjengelige lydfiler</option>}
        {songs.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <label><span>Videoformat</span><select aria-label="Videoformat" value={format} onChange={event=>setFormat(event.target.value as "landscape"|"portrait")}>
        <option value="landscape">YouTube 16:9</option><option value="portrait">Shorts 9:16</option>
      </select></label>
      <label><span>Videostil</span><select aria-label="Videostil" value={style} onChange={event=>setStyle(event.target.value as "jukebox"|"hybrid")}>
        <option value="jukebox">Jukebox hele veien</option>
        <option value="hybrid">Jukebox + musikkvideo</option>
      </select></label>
      <label><span>Lengde</span><select aria-label="Videolengde" value={seconds} onChange={event=>setSeconds(event.target.value as "full"|"15"|"30"|"60")}>
        <option value="full">Hele låten</option><option value="15">15 sekunder</option><option value="30">30 sekunder</option><option value="60">60 sekunder</option>
      </select></label>
    </div>
    {style==="hybrid"&&<div className="admin-warning" role="status">
      <Clapperboard size={16}/> Hybrid: jukebox i starten ({hybridIntro}), egen musikkvideo i midten, og jukebox tilbake til avslutning ({hybridOutro}). Musikken spiller sammenhengende. Midtscenene må lages eller velges og godkjennes før produksjon. Avspillingen under viser foreløpig jukebox-delen.
    </div>}
    <div className={`jukebox-stage jukebox-${format} ${playing?"jukebox-active":""}`} key={`${songId}-${format}-${sceneKey}`} role="img" aria-label={`Jukeboksforhåndsvisning: ${song?.title||"ingen sang valgt"}`}>
      <div className="jukebox-frame">
        <div className="jukebox-header">RE-MASTER FREDDY</div>
        <div className="jukebox-deck">
          <div className={`jukebox-record ${playing?"is-playing":""}`}>
            <div className="jukebox-label"><strong>RE-MASTER<br/>FREDDY</strong><span>{song?.title||"Velg sang"}</span><small>45 RPM · STEREO</small></div>
          </div>
          <div className="jukebox-tonearm"><span/></div>
        </div>
        <div className="jukebox-caption" title={song?.title}>{song?.title||"Velg en sang"}</div>
      </div>
    </div>
    <audio ref={audio} src={song?.audioUrl} onEnded={()=>setPlaying(false)} preload="none"/>
    <div className="jukebox-actions">
      <button className="admin-primary" type="button" disabled={!song?.audioUrl||loading} onClick={()=>void togglePlayback()}>
        {playing?<Pause size={17}/>:<Play size={17}/>} {playing?"Pause forhåndsvisning":"Spill forhåndsvisning"}
      </button>
      <button className="admin-secondary" type="button" onClick={()=>{setSceneKey(value=>value+1);void refresh();}} disabled={loading}><RefreshCw size={16}/> Oppdater sanger</button>
    </div>
    <div className="jukebox-actions">
      <button className="admin-primary" type="button" disabled={!renderEnabled||!songId||jobBusy||style==="hybrid"} onClick={()=>void queueVideo()}>
        <Clapperboard size={17}/> {jobBusy?"Oppretter jobb…":style==="hybrid"?"Hybrid venter på musikkvideo":"Lag Jukebox-video"}
      </button>
      {renderEnabled&&<button className="admin-secondary" type="button" onClick={()=>void refreshJobs()}><RefreshCw size={16}/> Oppdater produksjonsstatus</button>}
    </div>
    {style==="hybrid"&&<p className="jukebox-hybrid-note">Hybridkomposisjon er testet som MP4, men kan ikke settes i produksjonskø før en godkjent musikkvideo og en renderarbeider er tilgjengelig. Ingen publisering skjer automatisk.</p>}
    {jobNotice&&<p role="status">{jobNotice}</p>}
    {renderEnabled&&jobs.length>0&&<div aria-label="Jukebox-jobber">
      <h3>Produksjonsstatus</h3>
      {jobs.slice(0,10).map(job=><div key={job.id} className="admin-warning">
        <Clapperboard size={16}/> {job.song_title} · {job.format==="portrait"?"Short":"Video"} · {job.state}
        {job.previewUrl&&<a href={job.previewUrl} target="_blank" rel="noopener noreferrer">Se ferdig MP4</a>}
      </div>)}
    </div>}
    <div className="admin-warning"><Clapperboard size={16}/> {renderEnabled?"Videoer går til privat produksjonskø og må godkjennes før YouTube-publisering.":"Jukebox-produksjon aktiveres etter at rendereren og lagringen er verifisert. Forhåndsvisning fungerer nå; ingen video sendes til YouTube."}</div>
  </section>;
}
