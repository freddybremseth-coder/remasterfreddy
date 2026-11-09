import {useEffect,useMemo,useRef,useState} from "react";
import {Clapperboard,Pause,Play,RefreshCw} from "lucide-react";
import {loadSongs,type AdminSong} from "./lib/admin-api";
import "./admin-jukebox.css";

/** A safe, browser-only storyboard preview. It does not queue or publish videos. */
export default function AdminJukeboxStudio(){
  const [songs,setSongs]=useState<AdminSong[]>([]);
  const [songId,setSongId]=useState("");
  const [format,setFormat]=useState<"landscape"|"portrait">("landscape");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [playing,setPlaying]=useState(false);
  const [sceneKey,setSceneKey]=useState(0);
  const audio=useRef<HTMLAudioElement|null>(null);
  const song=useMemo(()=>songs.find(item=>item.id===songId),[songs,songId]);

  async function refresh(){
    setLoading(true);setError("");
    try{
      const items=(await loadSongs()).filter(item=>Boolean(item.audioUrl));
      setSongs(items);setSongId(previous=>items.some(item=>item.id===previous)?previous:(items[0]?.id||""));
    }catch(err){setError(err instanceof Error?err.message:"Kunne ikke hente musikkbiblioteket.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
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
    <p>Velg en sang fra ditt eksisterende musikkbibliotek. Her kan du se en enkel jukeboks med roterende vinylplate og spille originalmusikken. Den kompliserte 3D-plateveksleren er tatt ut av forhåndsvisningen. Produksjon av MP4 i serverkøen er ennå ikke koblet til.</p>
    {error&&<div role="alert" className="admin-error">{error}</div>}
    <div className="jukebox-controls">
      <label><span>Sang</span><select aria-label="Velg sang" value={songId} onChange={event=>setSongId(event.target.value)} disabled={loading}>
        {!songs.length&&<option value="">Ingen tilgjengelige lydfiler</option>}
        {songs.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <label><span>Videoformat</span><select aria-label="Videoformat" value={format} onChange={event=>setFormat(event.target.value as "landscape"|"portrait")}>
        <option value="landscape">YouTube 16:9</option><option value="portrait">Shorts 9:16</option>
      </select></label>
    </div>
    <div className={`jukebox-stage jukebox-${format}`} key={`${songId}-${format}-${sceneKey}`} role="img" aria-label={`Jukeboksforhåndsvisning: ${song?.title||"ingen sang valgt"}`}>
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
    <div className="admin-warning"><Clapperboard size={16}/> Dette er en lokal forhåndsvisning. Ingen video er sendt til produksjon eller YouTube.</div>
  </section>;
}
