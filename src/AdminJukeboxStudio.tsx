import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowDown,ArrowUp,Clapperboard,Download,Pause,Play,RefreshCw} from "lucide-react";
import {loadSongs,loadJukeboxJobs,queueJukeboxVideo,loadPrivateJukeboxReadiness,loadJukeboxPrivateSceneStatus,type JukeboxPrivateSceneStatus,type PrivateJukeboxReadiness,type AdminSong,type JukeboxJob} from "./lib/admin-api";
import {loadJukeboxDraft,saveJukeboxDraft,deleteJukeboxDraft,type JukeboxDraft} from "./lib/jukebox-drafts";
import {exportPortableDraft,importPortableDraft} from "./lib/jukebox-portable";
import {resolveSceneTiming} from "./lib/jukebox-scene-timing";
import {JUKEBOX_TEMPLATES,getJukeboxTemplate,sceneDefaults} from "./lib/jukebox-templates";
import {validatePrivateMp4File,validatePrivateMp4Duration,hashPrivateMp4} from "./lib/jukebox-private-review";
import {validateJukeboxSelectedMedia} from "./lib/jukebox-media-validation";
import {PRIVATE_PHOTO_UPLOAD_ENABLED,uploadPrivateJukeboxPhoto} from "./lib/jukebox-private-photo-upload";
import "./admin-jukebox.css";

/** Admin Jukebox preview with a feature-gated render queue; never publishes automatically. */
export default function AdminJukeboxStudio(){
  const [songs,setSongs]=useState<AdminSong[]>([]);
  const [songId,setSongId]=useState("");
  const [format,setFormat]=useState<"landscape"|"portrait">("landscape");
  const [style,setStyle]=useState<"jukebox"|"hybrid">("jukebox");
  const [sceneCount,setSceneCount]=useState(3);
  const [endWithLastScene,setEndWithLastScene]=useState(false);
  const [audioDuration,setAudioDuration]=useState(0);
  const [playhead,setPlayhead]=useState(0);
  const [localClips,setLocalClips]=useState<{name:string;url:string;kind:"image"|"video";file?:Blob;finale?:boolean;section?:string;weight?:number;cueStart?:number}[]>([]);
  const [draftBusy,setDraftBusy]=useState(false);
  const [draftLoading,setDraftLoading]=useState(false);
  const [draftNotice,setDraftNotice]=useState("");
  const [templateId,setTemplateId]=useState("");
  const draftLoadId=useRef(0);
  const portableInput=useRef<HTMLInputElement|null>(null);
  const localClipUrls=useRef<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [playing,setPlaying]=useState(false);
  const [seconds,setSeconds]=useState<"full"|"15"|"30"|"60">("full");
  const [jobs,setJobs]=useState<JukeboxJob[]>([]);
  const [jobBusy,setJobBusy]=useState(false);
  const [jobNotice,setJobNotice]=useState("");
  const [privateReadiness,setPrivateReadiness]=useState<PrivateJukeboxReadiness|null>(null);
  const [readinessBusy,setReadinessBusy]=useState(false);
  const [readinessError,setReadinessError]=useState("");
  const [sceneJobId,setSceneJobId]=useState("");
  const [sceneStatus,setSceneStatus]=useState<JukeboxPrivateSceneStatus|null>(null);
  const [sceneStatusBusy,setSceneStatusBusy]=useState(false);
  const [sceneStatusError,setSceneStatusError]=useState("");
  const [photoUploadBusy,setPhotoUploadBusy]=useState(false);
  const [photoUploadNotice,setPhotoUploadNotice]=useState("");
  const photoUploadEpoch=useRef(0);
  const [reviewFile,setReviewFile]=useState<File|null>(null);
  const [reviewUrl,setReviewUrl]=useState("");
  const reviewUrlRef=useRef("");
  const [reviewDuration,setReviewDuration]=useState(0);
  const [reviewError,setReviewError]=useState("");
  const [reviewHash,setReviewHash]=useState("");
  const [reviewBusy,setReviewBusy]=useState(false);
  const reviewEpoch=useRef(0);
  const renderEnabled=import.meta.env.VITE_JUKEBOX_RENDER_ENABLED==="true";
  const [sceneKey,setSceneKey]=useState(0);
  const audio=useRef<HTMLAudioElement|null>(null);
  const sceneVideo=useRef<HTMLVideoElement|null>(null);
  const song=useMemo(()=>songs.find(item=>item.id===songId),[songs,songId]);
  const hybridIntro=format==="portrait"?"inntil 3 sekunder":"inntil 30 sekunder";
  const hybridOutro=format==="portrait"?"inntil 3 sekunder":"inntil 15 sekunder";
  const plannedDuration=audioDuration>0?Math.min(audioDuration,seconds==="full"?audioDuration:Number(seconds)):0;
  const introTime=format==="portrait"?Math.min(3,plannedDuration*.12):Math.min(30,plannedDuration*.20);
  const outroTime=endWithLastScene&&style==="hybrid"?0:(format==="portrait"?Math.min(3,plannedDuration*.12):Math.min(15,plannedDuration*.10));
  const middleTime=Math.max(0,plannedDuration-introTime-outroTime);
  const effectiveSceneCount=localClips.length||sceneCount;
  const sceneWeights=Array.from({length:effectiveSceneCount},(_,index)=>Math.max(1,Math.min(3,localClips[index]?.weight||2)));
  const weightTotal=sceneWeights.reduce((sum,value)=>sum+value,0);
  const sceneDurations=sceneWeights.map(weight=>middleTime*weight/weightTotal);
  const weightedStarts=sceneDurations.map((_,index)=>introTime+sceneDurations.slice(0,index).reduce((sum,value)=>sum+value,0));
  const hasManualCues=localClips.some(clip=>clip.cueStart!==undefined);
  const manualTiming=resolveSceneTiming(localClips,introTime,plannedDuration,outroTime);
  const actualSceneStarts=manualTiming?.starts??weightedStarts;
  const actualSceneDurations=manualTiming?.durations??sceneDurations;
  const inMiddle=style==="hybrid"&&localClips.length>0&&plannedDuration>0&&playhead>=introTime&&playhead<plannedDuration-outroTime;
  const activeClipIndex=inMiddle?actualSceneStarts.findIndex((start,index)=>playhead>=start&&playhead<start+actualSceneDurations[index]):-1;
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
  function choosePrivateMp4(file:File|null){
    reviewEpoch.current+=1;
    if(reviewUrlRef.current)URL.revokeObjectURL(reviewUrlRef.current);
    reviewUrlRef.current="";setReviewUrl("");setReviewFile(null);setReviewDuration(0);
    setReviewHash("");setReviewError("");
    if(!file)return;
    const invalid=validatePrivateMp4File(file);
    if(invalid){setReviewError(invalid);return;}
    const url=URL.createObjectURL(file);reviewUrlRef.current=url;
    setReviewUrl(url);setReviewFile(file);
  }
  async function approveLocalPreview(){
    if(!reviewFile||reviewBusy||!song||!plannedDuration)return;
    const error=validatePrivateMp4Duration(reviewDuration,plannedDuration);
    if(error){setReviewError(error);return;}
    setReviewBusy(true);setReviewError("");
    const epoch=reviewEpoch.current;
    try{
      const digest=await hashPrivateMp4(reviewFile);
      if(epoch===reviewEpoch.current)setReviewHash(digest);
    }catch{if(epoch===reviewEpoch.current)setReviewError("Kunne ikke kontrollere filens SHA-256 i denne nettleseren.");}
    finally{setReviewBusy(false);}
  }
  function downloadReviewReceipt(){
    if(!reviewFile||!reviewHash||!song)return;
    const receipt={version:1,type:"private-local-jukebox-mp4-review",
      songId:song.id,songTitle:song.title,fileName:reviewFile.name,
      bytes:reviewFile.size,sha256:reviewHash,durationSeconds:reviewDuration,
      format,reviewedAt:new Date().toISOString(),youtubePublished:false,
      note:"Privat kontroll på denne enheten. Ikke en servergodkjenning eller publisering."};
    const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],{type:"application/json"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download=`jukebox-private-review-${song.id}.json`;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function uploadSelectedPhotos(){
    if(!PRIVATE_PHOTO_UPLOAD_ENABLED||photoUploadBusy||draftBusy||draftLoading||!songId)return;
    if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sceneJobId.trim())){
      setPhotoUploadNotice("Oppgi en gyldig privat jobb-ID først.");return;
    }
    if(!localClips.length||localClips.some(clip=>clip.kind!=="image"||!(clip.file instanceof Blob))){
      setPhotoUploadNotice("Velg bare fotografier med tilgjengelige originalfiler. Videoklipp støttes ikke i denne opplastingen.");return;
    }
    if(!window.confirm(`Laste opp ${localClips.length} private bilder til jobb ${sceneJobId.trim()}? Bildene kan ikke publiseres fra denne funksjonen.`))return;
    setPhotoUploadBusy(true);setPhotoUploadNotice("");setSceneStatus(null);
    const epoch=++photoUploadEpoch.current;
    const jobId=sceneJobId.trim();
    try{
      for(const [index,clip] of localClips.entries()){
        if(epoch!==photoUploadEpoch.current)throw new Error("Jobben eller sangen ble endret under opplastingen. Kontroller bildestatusen.");
        if(!clip.file)throw new Error(`Originalfilen til scene ${index+1} mangler.`);
        const file=clip.file instanceof File?clip.file:new File([clip.file],clip.name,{type:clip.file.type});
        setPhotoUploadNotice(`Laster opp bilde ${index+1} av ${localClips.length}…`);
        await uploadPrivateJukeboxPhoto(jobId,songId,index,file);
      }
      if(epoch===photoUploadEpoch.current){
        setPhotoUploadNotice("Alle valgte bilder er sendt og lagringsmetadata kontrollert. Dekoding og rendering gjenstår.");
        const refreshed=await loadJukeboxPrivateSceneStatus(jobId);
        if(refreshed.songId!==songId)throw new Error("Jobben ble koblet til feil sang.");
        setSceneStatus(refreshed);
      }
    }catch(error){if(epoch===photoUploadEpoch.current)
      setPhotoUploadNotice(error instanceof Error?error.message:"Privat bildeopplasting ble stoppet.");}
    finally{setPhotoUploadBusy(false);}
  }
  async function checkSceneJobStatus(){
    if(sceneStatusBusy)return;
    setSceneStatusBusy(true);setSceneStatus(null);setSceneStatusError("");
    try{
      const result=await loadJukeboxPrivateSceneStatus(sceneJobId.trim());
      if(result.songId!==songId)throw new Error("Denne private jobben tilhører en annen sang. Velg riktig sang eller jobb-ID.");
      setSceneStatus(result);
    }
    catch(error){setSceneStatusError(error instanceof Error?error.message:"Bildestatus er ikke tilgjengelig.");}
    finally{setSceneStatusBusy(false);}
  }
  async function checkPrivateReadiness(){
    if(readinessBusy)return;
    setReadinessBusy(true);setReadinessError("");setPrivateReadiness(null);
    try{setPrivateReadiness(await loadPrivateJukeboxReadiness());}
    catch(error){setReadinessError(error instanceof Error?error.message:"Renderstatus kunne ikke hentes.");}
    finally{setReadinessBusy(false);}
  }
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
  useEffect(()=>()=>{if(reviewUrlRef.current)URL.revokeObjectURL(reviewUrlRef.current);},[]);
  useEffect(()=>{
    photoUploadEpoch.current+=1;
    setPhotoUploadNotice("");setSceneStatus(null);
    reviewEpoch.current+=1;
    if(reviewUrlRef.current)URL.revokeObjectURL(reviewUrlRef.current);
    reviewUrlRef.current="";setReviewUrl("");setReviewFile(null);
    setReviewDuration(0);setReviewHash("");setReviewError("");
  },[songId]);
  useEffect(()=>{
    if(!songId)return;
    let cancelled=false;
    const requestId=++draftLoadId.current;
    setDraftLoading(true);
    for(const url of localClipUrls.current)URL.revokeObjectURL(url);
    localClipUrls.current=[];
    setLocalClips([]);
    setTemplateId("");
    setDraftNotice("");
    void loadJukeboxDraft(songId).then(draft=>{
      if(cancelled||requestId!==draftLoadId.current||!draft)return;
      for(const url of localClipUrls.current)URL.revokeObjectURL(url);
      const restored=draft.clips.map(clip=>({...clip,url:URL.createObjectURL(clip.file)}));
      localClipUrls.current=restored.map(clip=>clip.url);
      setLocalClips(restored);
      setFormat(draft.format);setSeconds(draft.seconds);setSceneCount(draft.sceneCount);
      setEndWithLastScene(draft.endWithLastScene);setStyle("hybrid");
      setDraftNotice(`Lokalt utkast hentet (${new Date(draft.savedAt).toLocaleString("nb-NO")}).`);
    }).catch(()=>{if(!cancelled)setDraftNotice("Lokalt utkast kunne ikke leses. Du kan fortsatt bruke forhåndsvisningen.");})
      .finally(()=>{if(!cancelled&&requestId===draftLoadId.current)setDraftLoading(false);});
    return()=>{cancelled=true;};
  },[songId]);
  async function saveDraft(){
    if(!songId||draftBusy||draftLoading)return;
    if(localClips.some(clip=>!clip.file)){setDraftNotice("Kunne ikke lagre: ett eller flere klipp mangler originalfil.");return;}
    setDraftBusy(true);
    try{
      const draft:JukeboxDraft={version:1,songId,format,seconds,endWithLastScene,sceneCount:effectiveSceneCount,savedAt:Date.now(),clips:localClips.map(clip=>({name:clip.name,kind:clip.kind,file:clip.file!,finale:Boolean(clip.finale),section:clip.section||"Fri scene",weight:clip.weight||2,cueStart:clip.cueStart}))};
      await saveJukeboxDraft(draft);
      setDraftNotice("Utkastet er lagret i denne nettleseren. Det er ikke lastet opp til kontoen og kan forsvinne om nettleserdata slettes.");
    }catch{setDraftNotice("Lagringen mislyktes. Kontroller nettleserens lagringsplass og innstillinger.");}
    finally{setDraftBusy(false);}
  }
  async function downloadBackup(){
    if(!songId||draftBusy||draftLoading)return;
    if(localClips.some(clip=>!clip.file)){setDraftNotice("Originalfilene mangler. Velg bildene på nytt.");return;}
    setDraftBusy(true);
    try{
      const draft:JukeboxDraft={version:1,songId,format,seconds,endWithLastScene,sceneCount:effectiveSceneCount,savedAt:Date.now(),clips:localClips.map(clip=>({name:clip.name,kind:clip.kind,file:clip.file!,finale:Boolean(clip.finale),section:clip.section||"Fri scene",weight:clip.weight||2}))};
      const blob=await exportPortableDraft(draft);
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");link.href=url;link.download=`jukebox-${songId}-backup.json`;
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1500);
      setDraftNotice("Sikkerhetskopien er lastet ned, inkludert bildene. Oppbevar filen privat.");
    }catch(error){setDraftNotice(error instanceof Error?error.message:"Kunne ikke lage sikkerhetskopi.");}
    finally{setDraftBusy(false);}
  }
  async function importBackup(file:File|null){
    if(!file||!songId||draftBusy||draftLoading)return;
    setDraftBusy(true);
    try{
      const draft=await importPortableDraft(file,songId);
      await saveJukeboxDraft(draft);
      for(const url of localClipUrls.current)URL.revokeObjectURL(url);
      const clips=draft.clips.map(clip=>({...clip,url:URL.createObjectURL(clip.file)}));
      localClipUrls.current=clips.map(clip=>clip.url);
      setLocalClips(clips);setSceneCount(draft.sceneCount);setFormat(draft.format);
      setSeconds(draft.seconds);setEndWithLastScene(draft.endWithLastScene);setStyle("hybrid");
      setDraftNotice("Sikkerhetskopien ble hentet inn og lagret lokalt på denne enheten.");
    }catch(error){setDraftNotice(error instanceof Error?error.message:"Import av prosjekt feilet.");}
    finally{setDraftBusy(false);}
  }
  async function clearDraft(){
    if(!songId||draftBusy||draftLoading)return;
    setDraftBusy(true);
    try{await deleteJukeboxDraft(songId);setDraftNotice("Det lagrede utkastet for denne sangen er slettet fra nettleseren.");}
    catch{setDraftNotice("Kunne ikke slette det lokale utkastet.");}
    finally{setDraftBusy(false);}
  }
  function downloadStoryboard(){
    if(!song||plannedDuration<=0||style!=="hybrid")return;
    if(hasManualCues&&!manualTiming){
      setDraftNotice("Klippplanen kan ikke eksporteres med ufullstendige eller overlappende tidsmarkører.");
      return;
    }
    const entries=[
      {type:"jukebox_intro",start:0,duration:introTime},
      ...Array.from({length:effectiveSceneCount},(_,index)=>({
        type:"music_video_scene",sequence:index+1,
        filename:localClips[index]?.name||null,
        mediaKind:localClips[index]?.kind||null,
        finale:Boolean(localClips[index]?.finale),
        section:localClips[index]?.section||"Fri scene",
        weight:sceneWeights[index],
        start:actualSceneStarts[index],duration:actualSceneDurations[index],
      })),
      ...(outroTime>0?[{type:"jukebox_outro",start:plannedDuration-outroTime,duration:outroTime}]:[]),
    ];
    const manifest={
      version:2,renderStatus:"planning_only",songId:song.id,songTitle:song.title,
      format,seconds:plannedDuration,style,localMediaIncluded:false,
      endWithLastScene,manualCuesComplete:Boolean(manualTiming),
      timingReviewRequired:hasManualCues&&!manualTiming,
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
      if(previous[index].finale||previous[nextIndex].finale)return previous;
      const reordered=[...previous];
      [reordered[index],reordered[nextIndex]]=[reordered[nextIndex],reordered[index]];
      return reordered;
    });
  }
  function applyTemplate(id:string){
    const template=getJukeboxTemplate(id);
    if(!template||draftBusy||draftLoading||!songId)return;
    if(localClips.length>0&&!window.confirm("Bruk denne malen på bildene du allerede har valgt? Sangdeler og visningstid endres, men bildene beholdes."))return;
    setTemplateId(id);
    setStyle("hybrid");setFormat(template.portrait?"portrait":"landscape");
    setSeconds(template.seconds);setEndWithLastScene(template.endWithLastScene);
    setSceneCount(template.scenes.length);
    setLocalClips(previous=>previous.map((clip,index)=>({
      ...clip,...sceneDefaults(template,index,previous.length),
      ...(clip.finale?{section:"Avslutning",weight:3}:{}),
    })));
    setDraftNotice(`Malen «${template.name}» er valgt. Legg inn egne bilder og trykk «Lagre utkast» når du er fornøyd.`);
  }
  function chooseLocalClips(files:FileList|null){
    if(!files||draftLoading)return;
    // Append without replacing earlier selections. Keep within the 12-scene
    // limit enforced by the existing private rendering contract.
    const available=Math.max(0,12-localClips.length);
    const selected=Array.from(files);
    const rejected=selected.map(file=>validateJukeboxSelectedMedia(file)).filter((message):message is string=>Boolean(message));
    const chosen=selected.filter(file=>!validateJukeboxSelectedMedia(file)).slice(0,available);
    if(rejected.length)setDraftNotice(rejected.join(" "));
    else if(chosen.length)setDraftNotice(`${chosen.length} bildefiler eller videoer lagt til. Husk å lagre utkastet.`);
    const selectedTemplate=getJukeboxTemplate(templateId);
    const additions=chosen.map((file,index)=>({
      name:file.name,url:URL.createObjectURL(file),file,
      ...(selectedTemplate?sceneDefaults(selectedTemplate,localClips.filter(clip=>!clip.finale).length+index,Math.min(12,Math.max(sceneCount,localClips.length+chosen.length))):{section:"Fri scene",weight:2}),
      kind:(file.type.startsWith("image/")?"image":"video") as "image"|"video"
    }));
    localClipUrls.current.push(...additions.map(clip=>clip.url));
    setLocalClips(previous=>{
      const finaleIndex=previous.findIndex(item=>item.finale);
      if(finaleIndex<0)return [...previous,...additions];
      return [...previous.slice(0,finaleIndex),...additions,...previous.slice(finaleIndex)];
    });
    if(files.length>available)setJobNotice("Maksimalt 12 scener per video i denne versjonen. Tidligere valgte bilder beholdes.");
  }
  function changeScene(index:number,field:"section"|"weight"|"cueStart",value:string|number|undefined){
    setLocalClips(previous=>previous.map((clip,position)=>position===index?{...clip,[field]:value}:clip));
  }
  function setFinale(index:number){
    setLocalClips(previous=>{
      const chosen=previous[index];
      if(!chosen)return previous;
      const others=previous.filter((_,position)=>position!==index).map(clip=>({...clip,finale:false}));
      return [...others,{...chosen,finale:true,section:"Avslutning"}];
    });
    setEndWithLastScene(true);
  }
  function removeLocalClip(index:number){
    const removed=localClips[index];
    if(!removed)return;
    localClipUrls.current=localClipUrls.current.filter(url=>url!==removed.url);
    URL.revokeObjectURL(removed.url);
    setLocalClips(previous=>previous.filter((_,position)=>position!==index));
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
    <div className="jukebox-template-intro">
      <h3>Lag en ny musikkvideo med mal</h3>
      <p>Bruk samme oppbygning som «Drømmer» med roterende vinyl, valgte fotosekvenser og myke overganger som utgangspunkt. Velg en mal for en annen sang, og erstatt bildene med dine egne. Malene styrer bare bildeplanen, ikke den ferdige MP4-renderingen.</p>
      <div className="jukebox-template-picker">
        <label htmlFor="jukebox-template-select">Velg videomal</label>
        <select id="jukebox-template-select" value={templateId} disabled={!songId||draftBusy||draftLoading} onChange={event=>applyTemplate(event.target.value)}>
          <option value="">Velg mal…</option>
          {JUKEBOX_TEMPLATES.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
        {getJukeboxTemplate(templateId)&&<p>{getJukeboxTemplate(templateId)?.description} Last opp bilder i ønsket rekkefølge og finjuster under hvert bilde.</p>}
      </div>
    </div>
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
      {style==="hybrid"&&<label><span>Avslutning</span><select aria-label="Velg avslutning" value={endWithLastScene?"last_scene":"jukebox"} onChange={event=>setEndWithLastScene(event.target.value==="last_scene")}>
        <option value="jukebox">Avslutt med Jukebox</option><option value="last_scene">Avslutt med siste bilde eller klipp</option>
      </select></label>}
      {style==="hybrid"&&<label><span>Antall musikkvideoscener</span><select aria-label="Antall musikkvideoscener" value={sceneCount} disabled={localClips.length>0} onChange={event=>setSceneCount(Number(event.target.value))}>
        {Array.from({length:12},(_,index)=>index+1).map(value=><option key={value} value={value}>{value} {value===1?"scene":"scener"}</option>)}
      </select></label>}
    </div>
    {style==="hybrid"&&<div className="admin-warning" role="status">
      <Clapperboard size={16}/> Hybrid: jukebox i starten ({hybridIntro}), egne bilder og videoer deretter. {endWithLastScene?"Siste bilde/klipp avslutter hele filmen.":`Jukebox kommer tilbake mot slutten (${hybridOutro}).`} Musikken spiller sammenhengende. Midtscenene må lages eller velges og godkjennes før produksjon. Med valgte lokale bilder og videoer vises scenene i tidslinjen under avspilling.
    </div>}
    {style==="hybrid"&&<div className="jukebox-timeline" aria-label="Klippplan for hybridvideo">
      <h3>Klippplan {plannedDuration>0?`· ${stamp(plannedDuration)}`:"· avventer lydlengde"}</h3>
      {plannedDuration>0?<div className="jukebox-timeline-track">
        <div className="jukebox-timeline-endcap" style={{flexGrow:introTime}} title={`Jukebox 00:00–${stamp(introTime)}`}>Jukebox</div>
        {Array.from({length:effectiveSceneCount},(_,index)=><div key={index} className="jukebox-timeline-scene" style={{flexGrow:actualSceneDurations[index]}} title={`Scene ${index+1}${localClips[index]?` · ${localClips[index].name}`:""}: ${stamp(actualSceneStarts[index])}–${stamp(actualSceneStarts[index]+actualSceneDurations[index])}`}>S{index+1}</div>)}
        {outroTime>0&&<div className="jukebox-timeline-endcap" style={{flexGrow:outroTime}} title={`Jukebox ${stamp(plannedDuration-outroTime)}–${stamp(plannedDuration)}`}>Jukebox</div>}
      </div>:<p>Spill av sangen for å hente varigheten. Klippplanen tilpasses automatisk.</p>}
      {plannedDuration>0&&<button type="button" className="jukebox-storyboard-download" onClick={downloadStoryboard}><Download size={16}/> Last ned klippplan (JSON)</button>}
      {hasManualCues&&!manualTiming&&<p role="alert">Tidsmarkører er ufullstendige eller overlapper. Forhåndsvisningen bruker foreløpig automatisk fordeling. Angi en gyldig starttid for hver scene, etter introen og før avslutningen.</p>}
      {manualTiming&&<p role="status">Eksakte tidsmarkører brukes i forhåndsvisningen og i eksportert klippplan.</p>}
      {plannedDuration>0&&<p>Intro: {stamp(introTime)} · Scenelengder følger valgene under bildene · {endWithLastScene?"Siste scene avslutter filmen":`Jukebox-avslutning: ${stamp(outroTime)}`}. {localClips.length?"De valgte bildene og videoene vises under avspilling og kan lagres som et lokalt utkast.":"Scenene er foreløpig plassholdere, ikke genererte videoer."}</p>}
    </div>}
    {style==="hybrid"&&<section className="jukebox-local-clips" aria-label="Lokale musikkvideoscener">
      <h3>Velg egne bilder og videoscener</h3>
      <p>Velg bilder og videoer (opptil 12 scener). Legg til flere senere uten å miste tidligere valg. Bruk «Før», «Etter» og «Fjern» for å justere. Velg «Siste bilde» for å holde avslutningen på plass når du legger til flere bilder. Dette er en lokal forhåndsvisning. Bildene kan lagres i denne nettleseren, men ikke i kontoen eller produksjonskøen.</p>
      <label className="jukebox-file-picker">Legg til bilder eller videoklipp (JPG, PNG, WebP, MP4, WebM eller MOV)
        <input type="file" disabled={draftLoading} accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov" multiple onChange={event=>{chooseLocalClips(event.currentTarget.files);event.currentTarget.value="";}}/>
      </label>
      {draftLoading&&<p role="status">Henter lagrede bilder for denne sangen…</p>}
      <div className="jukebox-actions">
        <button type="button" className="admin-secondary" disabled={!songId||draftBusy||draftLoading} onClick={()=>void saveDraft()}>Lagre utkast på denne enheten</button>
        <button type="button" className="admin-secondary" disabled={!songId||draftBusy||draftLoading} onClick={()=>void downloadBackup()}>Klargjør privat MP4 – last ned prosjekt</button>
        <button type="button" className="admin-secondary" disabled={!songId||draftBusy||draftLoading} onClick={()=>portableInput.current?.click()}>Åpne prosjektfil</button>
        <input ref={portableInput} type="file" accept=".json,application/json" style={{display:"none"}} aria-label="Velg Jukebox-prosjektfil" onChange={event=>{void importBackup(event.currentTarget.files?.[0]||null);event.currentTarget.value="";}}/>
        <button type="button" className="admin-secondary" disabled={!songId||draftBusy||draftLoading} onClick={()=>void clearDraft()}>Slett lagret utkast</button>
      </div>
      <p>Lagrede utkast hentes automatisk når du velger sangen igjen på denne enheten. Bildene sendes ikke til en server. Ved privat nettlesing, sletting av nettleserdata eller bruk av en annen enhet blir utkastet ikke tilgjengelig. Bruk prosjektfilen og «Åpne prosjektfil» for å flytte en privat sikkerhetskopi mellom enheter (maks. 40 MB medier).</p>
      <div className="jukebox-private-render-gate" aria-label="Status for privat MP4-rendering">
        <h3>Lag privat MP4</h3>
        <p>Kontroller at Jukebox-serveren og den private renderarbeideren er klare. Statuskontrollen laster ikke opp bildene og starter ingen produksjon.</p>
        <button type="button" className="admin-secondary" disabled={readinessBusy||draftBusy||draftLoading} onClick={()=>void checkPrivateReadiness()}>{readinessBusy?"Kontrollerer…":"Kontroller privat MP4-status"}</button>
        {readinessError&&<p role="alert">{readinessError} Bruk «Klargjør privat MP4 – last ned prosjekt» inntil renderløpet er aktivert.</p>}
        {privateReadiness&&<div role="status">
          <p>{privateReadiness.liveRenderingVerified?"Renderarbeideren er rapportert verifisert.":"Renderarbeider er ennå ikke verifisert i produksjon."} {privateReadiness.privateMediaReady?"Privat medielagring er klar.":"Privat medielagring eller godkjent kabinettmotiv mangler."} {privateReadiness.photoIntakeConfigured?"Fotoopplasting er konfigurert, men krever fortsatt en verifisert renderarbeider.":"Fotoopplasting er ikke aktivert."}</p>
          <ul>{privateReadiness.checks.map(check=><li key={check.id}>{check.ready?"Klar":"Mangler"}: {({database:"Databaseskjema",private_storage:"Privat MP4-lagring",private_clips:"Privat klipplagring",cabinet_asset:"Godkjent Rock-Ola-motiv",clip_export:"Eksport av private klipp",photo_intake:"Privat fotoopplasting",private_review:"Privat godkjenning"} as Record<string,string>)[check.id]||check.id}</li>)}</ul>
        </div>}
        <div className="jukebox-scene-progress">
          <h4>Bildestatus for en privat jobb</h4>
          <p>Bruk ID-en fra en eksisterende privat Jukebox-jobb. Kontrollen sjekker bare lagringsmetadata, og kan ikke starte videoarbeideren.</p>
          <label htmlFor="jukebox-scene-job-id">Jobb-ID</label>
          <div className="jukebox-scene-progress-actions">
            <input id="jukebox-scene-job-id" type="text" value={sceneJobId}
              placeholder="Jobb-ID (UUID)" autoComplete="off"
              onChange={event=>{photoUploadEpoch.current+=1;setSceneJobId(event.target.value);setSceneStatus(null);setSceneStatusError("");setPhotoUploadNotice("");}}/>
            <button className="admin-secondary" type="button" disabled={sceneStatusBusy}
              onClick={()=>void checkSceneJobStatus()}>{sceneStatusBusy?"Kontrollerer…":"Kontroller bilder"}</button>
          </div>
          {PRIVATE_PHOTO_UPLOAD_ENABLED
            ?<div className="jukebox-photo-upload-actions">
              <p>Sender bare bildene fra den valgte sangen til eksisterende jobb-ID, i vist scenerekkefølge. Opplastingen må startes manuelt.</p>
              <button type="button" className="admin-secondary" disabled={photoUploadBusy||draftLoading||!localClips.length}
                onClick={()=>void uploadSelectedPhotos()}>
                {photoUploadBusy?"Laster opp private bilder…":`Last opp ${localClips.length} bilder privat`}
              </button>
            </div>
            :<p>Privat bildeopplasting er foreløpig deaktivert. Du kan fortsatt lagre og eksportere prosjektet lokalt.</p>}
          {photoUploadNotice&&<p role="status">{photoUploadNotice}</p>}
          {sceneStatusError&&<p role="alert">{sceneStatusError}</p>}
          {sceneStatus&&<div role="status" className="jukebox-scene-progress-result">
            <strong>{sceneStatus.sceneCount===0?"Ingen reserverte bilder":sceneStatus.allUploadedMetadataMatches?
              "Alle reserverte bilder funnet – dekoding gjenstår":"Bildefilene er ikke klare"}</strong>
            <ul>{sceneStatus.scenes.map(scene=><li key={scene.index}>
              Scene {scene.index+1}: {scene.status==="metadata_verified_only"?"Fil funnet (metadata samsvarer)"
              :scene.status==="awaiting_upload"?"Venter på opplasting"
              :scene.status==="rejected_metadata"?"Feil filstørrelse eller filtype"
              :"Ugyldig scenereservasjon"}
            </li>)}</ul>
            <p>Dette er ikke godkjenning for rendering. Faktisk dekoding og kontroll av hele sceneplanen gjenstår.</p>
          </div>}
        </div>
        <button type="button" className="admin-primary" disabled title="Privat renderkø aktiveres først etter verifisert renderarbeider og sikker medieopplasting"><Clapperboard size={16}/> Lag privat MP4 – ikke aktivert ennå</button>
        <p>Bruk prosjektfilen til privat rendering inntil sikker opplasting og renderarbeider er koblet til. Ingen YouTube-publisering.</p>
      </div>
      <div className="admin-warning jukebox-render-handoff" role="status">
        <Clapperboard size={18}/>
        <div>
          <strong>Privat MP4 – klargjøring</strong>
          <p>Bildene, sangdelene, visningstidene og siste bilde kan eksporteres som én privat prosjektfil. Den kan brukes av den separate rendereren sammen med originalmusikken og et visuelt godkjent Rock-Ola-klipp.</p>
          <p>Selve hybridrenderingen kan ennå ikke startes fra nettleseren. Privat prøvefilm for «Drømmer» er laget og gjennomgått manuelt, men den automatiske renderkøen og godkjent generell produksjonsmaster mangler. Ingen opplasting til YouTube skjer her.</p>
        </div>
      </div>
      {draftNotice&&<p role="status">{draftNotice}</p>}
      {localClips.length>0&&<div className="jukebox-local-grid">
        {localClips.map((clip,index)=><figure key={clip.url}>
          {clip.kind==="image"?<img src={clip.url} alt={`Scene ${index+1}: ${clip.name}`}/>:<video src={clip.url} controls muted playsInline preload="metadata" aria-label={`Scene ${index+1}: ${clip.name}`}/>}
          <figcaption>Scene {index+1} · {clip.name}{clip.finale?" · Låst som avslutning":""}</figcaption>
          <div className="jukebox-scene-settings">
            <label>Del av sangen<select aria-label={`Sangdel scene ${index+1}`} value={clip.section||"Fri scene"} onChange={event=>changeScene(index,"section",event.target.value)}>
              {["Fri scene","Åpning","Vers 1","Refreng","Vers 2","Bro / mellomspill","Vers 3","Avslutning"].map(value=><option key={value} value={value}>{value}</option>)}
            </select></label>
            <label>Visningstid<select aria-label={`Visningstid scene ${index+1}`} value={clip.weight||2} onChange={event=>changeScene(index,"weight",Number(event.target.value))}>
              <option value={1}>Kort</option><option value={2}>Normal</option><option value={3}>Lang</option>
            </select></label>
            <label>Starttid i sekunder<input type="number" min={0} max={Math.max(0,plannedDuration)} step="0.1"
              aria-label={`Eksakt starttid scene ${index+1}`}
              placeholder={`Forslag ${weightedStarts[index]?.toFixed(1)??"0"}`}
              value={clip.cueStart??""}
              onChange={event=>changeScene(index,"cueStart",event.target.value===""?undefined:Number(event.target.value))}/></label>
            {plannedDuration>0&&<span>{manualTiming?"Eksakt":"Ca."} {stamp(actualSceneDurations[index])} · {stamp(actualSceneStarts[index])}–{stamp(actualSceneStarts[index]+actualSceneDurations[index])}</span>}
          </div>
          <div className="jukebox-clip-order">
            <button type="button" disabled={index===0||Boolean(clip.finale)||Boolean(localClips[index-1]?.finale)} onClick={()=>moveLocalClip(index,-1)} aria-label={`Flytt scene ${index+1} opp`}><ArrowUp size={15}/> Før</button>
            <button type="button" disabled={index===localClips.length-1||Boolean(clip.finale)||Boolean(localClips[index+1]?.finale)} onClick={()=>moveLocalClip(index,1)} aria-label={`Flytt scene ${index+1} ned`}><ArrowDown size={15}/> Etter</button>
            {clip.finale?<span className="jukebox-finale-tag">Siste bilde</span>:<button type="button" onClick={()=>setFinale(index)} aria-label={`Bruk scene ${index+1} som siste bilde`}>Siste bilde</button>}
            <button type="button" onClick={()=>removeLocalClip(index)} aria-label={`Fjern scene ${index+1}`}>Fjern</button>
          </div>
        </figure>)}
      </div>}
    </section>}
    <div className={`jukebox-stage jukebox-${format} ${playing?"jukebox-active":""}`} key={`${songId}-${format}-${sceneKey}`} aria-label={`Forhåndsvisning: ${song?.title||"ingen sang valgt"}`}>
      {activeClip&&<div key={activeClip.url} className="jukebox-scene-player jukebox-scene-fade">
        {activeClip.kind==="image"?<img key={activeClip.url} src={activeClip.url} alt={`Bildescene ${activeClipIndex+1}`}/>:<video key={activeClip.url} ref={sceneVideo} src={activeClip.url} muted playsInline loop autoPlay={playing} preload="auto" aria-label={`Musikkvideoscene ${activeClipIndex+1}`}/>}
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
    <section className="jukebox-private-review-import" aria-label="Kontroller en ferdig privat MP4">
      <h3>Se og kontroller en ferdig privat MP4</h3>
      <p>Åpne en MP4 som allerede er rendret for denne sangen. Den spilles av lokalt, uten opplasting til serveren eller YouTube. Kontroll av varighet og SHA-256 kan lagres som en privat kvittering.</p>
      <label>Velg privat MP4-fil
        <input type="file" accept=".mp4,video/mp4" onChange={event=>{choosePrivateMp4(event.currentTarget.files?.[0]||null);event.currentTarget.value="";}}/>
      </label>
      {reviewError&&<p role="alert">{reviewError}</p>}
      {reviewUrl&&reviewFile&&<div className="jukebox-imported-video">
        <video controls playsInline preload="metadata" src={reviewUrl}
          onLoadedMetadata={event=>{const duration=event.currentTarget.duration;setReviewDuration(duration);setReviewError(validatePrivateMp4Duration(duration,plannedDuration)||"");setReviewHash("");}}
          onError={()=>setReviewError("Kunne ikke spille av MP4-filen i denne nettleseren.")}/>
        <p>{reviewFile.name} · {Math.round(reviewFile.size/1024/1024*10)/10} MB
          {reviewDuration>0?` · ${stamp(reviewDuration)}`:""}</p>
        <div className="jukebox-actions">
          <button type="button" className="admin-secondary" disabled={reviewBusy||!reviewDuration||Boolean(validatePrivateMp4Duration(reviewDuration,plannedDuration))||Boolean(reviewError)}
            onClick={()=>void approveLocalPreview()}>{reviewBusy?"Kontrollerer SHA-256…":"Bekreft privat MP4-kontroll"}</button>
          {reviewHash&&<button type="button" className="admin-secondary" onClick={downloadReviewReceipt}>Last ned kontrollkvittering</button>}
        </div>
        {reviewHash&&<p role="status">Privat fil kontrollert lokalt. SHA-256: <code>{reviewHash}</code>. Dette godkjenner ikke YouTube-publisering.</p>}
      </div>}
    </section>
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
    {style==="hybrid"&&<p className="jukebox-hybrid-note">Eksportér fotoprosjektet under «Velg egne bilder og videoscener» for privat rendering. Produksjonskøen for hybridvideo åpnes først når godkjent Rock-Ola-fil, renderarbeider og en ekte test er verifisert. Ingen publisering skjer automatisk.</p>}
    {jobNotice&&<p role="status">{jobNotice}</p>}
    {renderEnabled&&jobs.length>0&&<div aria-label="Jukebox-jobber">
      <h3>Produksjonsstatus</h3>
      {jobs.slice(0,10).map(job=><article key={job.id} className="admin-warning jukebox-job">
        <div><Clapperboard size={16}/> <strong>{job.song_title}</strong> · {job.format==="portrait"?"Shorts 9:16":"YouTube 16:9"}</div>
        <p role="status">{job.state==="ready"?"Ferdig video – avventer din gjennomgang":job.state==="failed"?"Rendering feilet":job.state==="rendering"?"Videoen produseres":job.state==="queued"?"Venter i kø":job.state==="cancelled"?"Avbrutt":job.state}</p>
        {job.previewUrl?<div className="jukebox-private-review">
          <video controls playsInline preload="metadata" src={job.previewUrl} aria-label={`Privat MP4-forhåndsvisning: ${job.song_title}`}/>
          <p>Kun privat forhåndsvisning. Ingen godkjenning eller YouTube-publisering skjer ved avspilling. Lenken utløper etter kort tid; bruk «Oppdater produksjonsstatus» om den ikke virker.</p>
        </div>:job.state==="ready"?<p>Privat video er ikke tilgjengelig ennå. Oppdater status eller kontroller lagringen.</p>:null}
      </article>)}
    </div>}
    <div className="admin-warning"><Clapperboard size={16}/> {renderEnabled?"Videoer går til privat produksjonskø og må godkjennes før YouTube-publisering.":"Jukebox-produksjon aktiveres etter at rendereren og lagringen er verifisert. Forhåndsvisning fungerer nå; ingen video sendes til YouTube."}</div>
  </section>;
}
