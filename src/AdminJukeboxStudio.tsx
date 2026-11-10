import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowDown,ArrowUp,Clapperboard,Download,Pause,Play,RefreshCw} from "lucide-react";
import {loadSongs,loadJukeboxJobs,queueJukeboxVideo,type AdminSong,type JukeboxJob} from "./lib/admin-api";
import "./admin-jukebox.css";

/** Admin Jukebox preview with a feature-gated render queue; never publishes automatically. */
export default function AdminJukeboxStudio(){
  const [songs,setSongs]=useState<AdminSong[]>([]);
  const [songId,setSongId]=useState("");
  const [format,setFormat]=useState<"landscape"|"portrait">("landscape");
  const [style,setStyle]=useState<"jukebox"|"hybrid">("jukebox");
  const [sceneCount,setSceneCount]=useState(3);
  const [audioDuration,setAudioDuration]=useState(0);
  const [playhead,setPlayhead]=useState(0);
  const [localClips,setLocalClips]=useState<{name:string;url:string}[]>([]);
  const localClipUrls=useRef<string[]>([]);
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
  const sceneVideo=useRef<HTMLVideoElement|null>(null);
  const song=useMemo(()=>songs.find(item=>item.id===songId),[songs,songId]);
  const hybridIntro=format==="portrait"?"inntil 3 sekunder":"inntil 30 sekunder";
  const hybridOutro=format==="portrait"?"inntil 3 sekunder":"inntil 15 sekunder";
  const plannedDuration=audioDuration>0?Math.min(audioDuration,seconds==="full"?audioDuration:Number(seconds)):0;
  const introTime=format==="portrait"?Math.min(3,plannedDuration*.12):Math.min(30,plannedDuration*.20);
  const outroTime=format==="portrait"?Math.min(3,plannedDuration*.12):Math.min(15,plannedDuration*.10);
  const middleTime=Math.max(0,plannedDuration-introTime-outroTime);
  const clipTime=middleTime/sceneCount;
  const inMiddle=style==="hybrid"&&localClips.length>0&&plannedDuration>0&&playhead>=introTime&&playhead<plannedDuration-outroTime;
  const activeClipIndex=inMiddle?Math.min(localClips.length-1,Math.floor((playhead-introTime)/Math.max(.001,middleTime/sceneCount))):-1;
  const activeClip=activeClipIndex>=0?localClips[activeClipIndex]:null;
  const stamp=(time:number)=>`${Math.floor(time/60).toString().padStart(2,"0")}:${Math.floor(time%60).toString().padStart(2,"0")}`;

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
    setPlaying(false);setPlayhead(0);setAudioDuration(0);setSceneKey(value=>value+1);
    if(audio.current){audio.current.pause();audio.current.currentTime=0;}
  },[songId]);
  useEffect(()=>()=>{audio.current?.pause();},[]);
  useEffect(()=>{
    if(!sceneVideo.current)return;
    if(playing){void sceneVideo.current.play().catch(()=>{});}
    else sceneVideo.current.pause();
  },[playing,activeClipIndex]);
  useEffect(()=>()=>{for(const url of localClipUrls.current)URL.revokeObjectURL(url);},[]);
  function downloadStoryboard(){
    if(!song||plannedDuration<=0||style!=="hybrid")return;
    const entries=[
      {type:"jukebox_intro",start:0,duration:introTime},
      ...Array.from({length:sceneCount},(_,index)=>({
        type:"music_video_scene",sequence:index+1,
        filename:localClips[index]?.name||null,
        start:introTime+index*clipTime,duration:clipTime,
      })),
      {type:"jukebox_outro",start:plannedDuration-outroTime,duration:outroTime},
    ];
    const manifest={
      version:1,renderStatus:"planning_only",songId:song.id,songTitle:song.title,
      format,seconds:plannedDuration,style,localMediaIncluded:false,
      entries:entries.map(entry=>({...entry,start:Number(entry.start.toFixed(3)),duration:Number(entry.duration.toFixed(3))})),
    };
    const file=new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(file);
    const link=document.createElement("a");
    link.href=url;link.download="remaster-jukebox-storyboard.json";
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function moveLocalClip(index:number,direction:-1|1){
    setLocalClips(previous=>{
      const nextIndex=index+direction;
      if(index<0||nextIndex<0||index>=previous.length||nextIndex>=previous.length)return previous;
      const reordered=[...previous];
      [reordered[index],reordered[nextIndex]]=[reordered[nextIndex],reordered[index]];
      return reordered;
    });
  }
  function chooseLocalClips(files:FileList|null){
    if(!files)return;
    const chosen=Array.from(files).slice(0,12).filter(file=>file.type.startsWith("video/"));
    const replacements=chosen.map(file=>({name:file.name,url:URL.createObjectURL(file)}));
    for(const url of localClipUrls.current)URL.revokeObjectURL(url);
    localClipUrls.current=replacements.map(clip=>clip.url);
    setLocalClips(replacements);
    if(chosen.length)setSceneCount(chosen.length);
  }

  async function togglePlayback(){
    if(!audio.current||!song?.audioUrl)return;
    if(playing){audio.current.pause();sceneVideo.current?.pause();setPlaying(false);return;}
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
      {style==="hybrid"&&<label><span>Antall musikkvideoscener</span><select aria-label="Antall musikkvideoscener" value={sceneCount} disabled={localClips.length>0} onChange={event=>setSceneCount(Number(event.target.value))}>
        {Array.from({length:12},(_,index)=>index+1).map(value=><option key={value} value={value}>{value} {value===1?"scene":"scener"}</option>)}
      </select></label>}
    </div>
    {style==="hybrid"&&<div className="admin-warning" role="status">
      <Clapperboard size={16}/> Hybrid: jukebox i starten ({hybridIntro}), egen musikkvideo i midten, og jukebox tilbake til avslutning ({hybridOutro}). Musikken spiller sammenhengende. Midtscenene må lages eller velges og godkjennes før produksjon. Med valgte lokale klipp vises også scenene i tidslinjen under avspilling.
    </div>}
    {style==="hybrid"&&<div className="jukebox-timeline" aria-label="Klippplan for hybridvideo">
      <h3>Klippplan {plannedDuration>0?`· ${stamp(plannedDuration)}`:"· avventer lydlengde"}</h3>
      {plannedDuration>0?<div className="jukebox-timeline-track">
        <div className="jukebox-timeline-endcap" style={{flexGrow:introTime}} title={`Jukebox 00:00–${stamp(introTime)}`}>Jukebox</div>
        {Array.from({length:sceneCount},(_,index)=><div key={index} className="jukebox-timeline-scene" style={{flexGrow:clipTime}} title={`Scene ${index+1}${localClips[index]?` · ${localClips[index].name}`:""}: ${stamp(introTime+index*clipTime)}–${stamp(introTime+(index+1)*clipTime)}`}>S{index+1}</div>)}
        <div className="jukebox-timeline-endcap" style={{flexGrow:outroTime}} title={`Jukebox ${stamp(plannedDuration-outroTime)}–${stamp(plannedDuration)}`}>Jukebox</div>
      </div>:<p>Spill av sangen for å hente varigheten. Klippplanen tilpasses automatisk.</p>}
      {plannedDuration>0&&<button type="button" className="jukebox-storyboard-download" onClick={downloadStoryboard}><Download size={16}/> Last ned klippplan (JSON)</button>}
      {plannedDuration>0&&<p>Intro: {stamp(introTime)} · Hver scene: ca. {stamp(clipTime)} · Avslutning: {stamp(outroTime)}. {localClips.length?"De valgte filene vises nå under avspilling, men lagres ikke.":"Scenene er foreløpig plassholdere, ikke genererte videoer."}</p>}
    </div>}
    {style==="hybrid"&&<section className="jukebox-local-clips" aria-label="Lokale musikkvideoscener">
      <h3>Se gjennom egne videoscener</h3>
      <p>Velg opptil 12 videoer fra enheten for lokal forhåndsvisning. Bruk «Før» og «Etter» for å endre rekkefølge. Filene lastes ikke opp, lagres ikke i kontoen og brukes ikke i produksjonskøen. Klippene spilles av uten lyd her.</p>
      <label className="jukebox-file-picker">Velg videoklipp
        <input type="file" accept="video/*" multiple onChange={event=>chooseLocalClips(event.currentTarget.files)}/>
      </label>
      {localClips.length>0&&<div className="jukebox-local-grid">
        {localClips.map((clip,index)=><figure key={clip.url}>
          <video src={clip.url} controls muted playsInline preload="metadata" aria-label={`Scene ${index+1}: ${clip.name}`}/>
          <figcaption>Scene {index+1} · {clip.name}</figcaption>
          <div className="jukebox-clip-order">
            <button type="button" disabled={index===0} onClick={()=>moveLocalClip(index,-1)} aria-label={`Flytt scene ${index+1} opp`}><ArrowUp size={15}/> Før</button>
            <button type="button" disabled={index===localClips.length-1} onClick={()=>moveLocalClip(index,1)} aria-label={`Flytt scene ${index+1} ned`}><ArrowDown size={15}/> Etter</button>
          </div>
        </figure>)}
      </div>}
    </section>}
    <div className={`jukebox-stage jukebox-${format} ${playing?"jukebox-active":""}`} key={`${songId}-${format}-${sceneKey}`} aria-label={`Forhåndsvisning: ${song?.title||"ingen sang valgt"}`}>
      {activeClip&&<div className="jukebox-scene-player">
        <video key={activeClip.url} ref={sceneVideo} src={activeClip.url} muted playsInline loop autoPlay={playing} preload="auto" aria-label={`Musikkvideoscene ${activeClipIndex+1}`}/>
        <div className="jukebox-scene-label">Musikkvideo · scene {activeClipIndex+1} av {localClips.length}</div>
      </div>}
      {!activeClip&&
      <div className="jukebox-frame">
        <div className="jukebox-header">RE-MASTER FREDDY</div>
        <div className="jukebox-deck">
          <div className={`jukebox-record ${playing?"is-playing":""}`}>
            <div className="jukebox-label"><strong>RE-MASTER<br/>FREDDY</strong><span>{song?.title||"Velg sang"}</span><small>45 RPM · STEREO</small></div>
          </div>
          <div className="jukebox-tonearm"><span/></div>
        </div>
        <div className="jukebox-caption" title={song?.title}>{song?.title||"Velg en sang"}</div>
      </div>}
    </div>
    <audio ref={audio} src={song?.audioUrl} onLoadedMetadata={event=>setAudioDuration(event.currentTarget.duration)} onTimeUpdate={event=>{const position=event.currentTarget.currentTime;if(plannedDuration>0&&position>=plannedDuration){event.currentTarget.pause();sceneVideo.current?.pause();setPlaying(false);setPlayhead(0);event.currentTarget.currentTime=0;}else setPlayhead(position);}} onEnded={()=>{setPlaying(false);setPlayhead(0);}} preload="metadata"/>
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
