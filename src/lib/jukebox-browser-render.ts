/**
 * DIRECT PRIVATE Jukebox video production in the editor, without a separate
 * queue worker. All source files remain in this browser. No upload/publishing.
 *
 * Records the real WebAudio soundtrack together with Canvas video, including
 * the requested original-song offset. Chooses MP4 when supported and otherwise
 * offers a standard playable WebM rather than inventing an MP4 conversion.
 * Rendering runs in real time: keep this tab visible while recording.
 */
export type BrowserJukeboxClip={
  name:string;
  kind:"image"|"video";
  file:Blob;
  start:number;
  end:number;
};
export type BrowserJukeboxOptions={
  audioUrl?:string;
  audioFile?:File|null;
  songTitle:string;
  format:"portrait"|"landscape";
  audioStartSeconds:number;
  durationSeconds:number;
  clips:BrowserJukeboxClip[];
  introSeconds:number;
  outroSeconds:number;
  signal?:AbortSignal;
  onProgress?:(value:number)=>void;
};
export type BrowserJukeboxResult={
  blob:Blob;
  extension:"mp4"|"webm";
  mimeType:string;
  durationSeconds:number;
  width:number;
  height:number;
};

export function chooseBrowserJukeboxMime(
  supports:(mime:string)=>boolean,
):{mimeType:string;extension:"mp4"|"webm"}|null{
  for(const mimeType of [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    "video/mp4",
    'video/webm;codecs="vp9,opus"',
    'video/webm;codecs="vp8,opus"',
    "video/webm",
  ]){
    if(supports(mimeType))
      return {mimeType,extension:mimeType.startsWith("video/mp4")?"mp4":"webm"};
  }
  return null;
}

export function browserJukeboxSceneAt(
  seconds:number,clips:Pick<BrowserJukeboxClip,"start"|"end">[],
):number{
  return clips.findIndex(clip=>seconds>=clip.start&&seconds<clip.end);
}

export function validateBrowserJukebox(options:BrowserJukeboxOptions){
  const {durationSeconds,audioStartSeconds,clips,introSeconds,outroSeconds}=options;
  if(!Number.isFinite(durationSeconds)||durationSeconds<=1||durationSeconds>3600||
    !Number.isFinite(audioStartSeconds)||audioStartSeconds<0||audioStartSeconds>3600||
    !Number.isFinite(introSeconds)||!Number.isFinite(outroSeconds)||
    introSeconds<0||outroSeconds<0||introSeconds+outroSeconds>durationSeconds+0.001)
    throw new Error("Ugyldig varighet eller startpunkt for musikkvideoen.");
  if(!options.audioFile&&!options.audioUrl)
    throw new Error("Velg en sang fra musikkbiblioteket eller en lokal MP3.");
  if(clips.length>12)throw new Error("Maksimalt 12 bildescener per video.");
  if(clips.length){
    if(Math.abs(clips[0].start-introSeconds)>0.1)
      throw new Error("Første bilde må starte etter jukebox-introen.");
    for(const [index,clip] of clips.entries()){
      if(!clip.file||!["image","video"].includes(clip.kind)||
        clip.file.size<1024||clip.file.size>50*1024*1024||
        !Number.isFinite(clip.start)||!Number.isFinite(clip.end)||
        clip.start<0||clip.end>durationSeconds-outroSeconds+0.01||
        clip.end<=clip.start||
        (index>0&&Math.abs(clip.start-clips[index-1].end)>0.1))
        throw new Error("Bildetidene må være komplette, sortert og uten mellomrom.");
    }
    if(Math.abs(clips[clips.length-1].end-(durationSeconds-outroSeconds))>0.1)
      throw new Error("Bildesekvensen må dekke hele perioden før eventuell avslutning.");
  }
}

type ReadyMedia={
  kind:"image"|"video";
  image?:ImageBitmap;
  video?:HTMLVideoElement;
  url?:string;
};
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

function drawImageCover(
  ctx:CanvasRenderingContext2D,source:CanvasImageSource,
  imageWidth:number,imageHeight:number,width:number,height:number,progress:number,
  alpha=1,
){
  const scale=Math.max(width/imageWidth,height/imageHeight)*(1.04+.055*progress);
  const targetWidth=imageWidth*scale,targetHeight=imageHeight*scale;
  const panX=(progress-.5)*Math.max(0,targetWidth-width)*.28;
  const panY=(.5-progress)*Math.max(0,targetHeight-height)*.28;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.drawImage(source,(width-targetWidth)/2+panX,(height-targetHeight)/2+panY,
    targetWidth,targetHeight);
  ctx.restore();
}

function drawCabinet(
  ctx:CanvasRenderingContext2D,width:number,height:number,
  songTitle:string,time:number,
){
  const g=ctx.createLinearGradient(0,0,width,height);
  g.addColorStop(0,"#130c22");g.addColorStop(.5,"#31132a");g.addColorStop(1,"#120e22");
  ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
  const unit=Math.min(width,height);
  const centerX=width/2,centerY=height*.46;
  ctx.save();ctx.shadowColor="#e8ad5d";ctx.shadowBlur=unit*.07;
  ctx.strokeStyle="#e8ad5d";ctx.lineWidth=unit*.025;
  const w=unit*.63,h=unit*.85,top=centerY-h*.53;
  ctx.beginPath();
  ctx.moveTo(centerX-w*.5,top+h);
  ctx.lineTo(centerX-w*.5,top+w*.5);
  ctx.arc(centerX,top+w*.5,w*.5,Math.PI,0);
  ctx.lineTo(centerX+w*.5,top+h);
  ctx.closePath();ctx.stroke();
  ctx.shadowColor="#ee5b77";ctx.strokeStyle="#ee5b77";ctx.lineWidth=unit*.009;
  ctx.strokeRect(centerX-w*.38,centerY-h*.10,w*.76,h*.55);
  ctx.restore();
  const radius=unit*.235;
  ctx.save();ctx.translate(centerX,centerY+h*.08);ctx.rotate(time*.95);
  const vinyl=ctx.createRadialGradient(0,0,0,0,0,radius);
  vinyl.addColorStop(0,"#101020");vinyl.addColorStop(.25,"#171a26");
  vinyl.addColorStop(.7,"#090b14");vinyl.addColorStop(1,"#343545");
  ctx.fillStyle=vinyl;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#525064";ctx.lineWidth=1.5;
  for(let i=1;i<=7;i++){ctx.beginPath();ctx.arc(0,0,radius*(.35+i*.075),0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle="#bb3149";ctx.beginPath();ctx.arc(0,0,radius*.24,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#f7d68f";ctx.beginPath();ctx.arc(0,0,radius*.036,0,Math.PI*2);ctx.fill();
  ctx.restore();
  ctx.textAlign="center";ctx.fillStyle="#fbe9c3";
  ctx.font=`bold ${Math.round(unit*.062)}px system-ui, sans-serif`;
  ctx.fillText("RE-MASTER FREDDY",centerX,height*.13);
  ctx.font=`${Math.round(unit*.042)}px system-ui, sans-serif`;
  ctx.fillText(songTitle.slice(0,38),centerX,height*.84,width*.89);
  ctx.font=`${Math.round(unit*.028)}px system-ui, sans-serif`;
  ctx.fillStyle="#f0a6bb";ctx.fillText("JUKEBOX  •  PRIVATE VIDEO",centerX,height*.89);
}

async function loadMedia(clips:BrowserJukeboxClip[]):Promise<ReadyMedia[]>{
  const result:ReadyMedia[]=[];
  try{
    for(const clip of clips){
      if(clip.kind==="image"){
        if(!clip.file.type.startsWith("image/"))
          throw new Error("En av bildefilene har feil filtype.");
        const image=await createImageBitmap(clip.file);
        result.push({kind:"image",image});
      }else{
        if(!clip.file.type.startsWith("video/"))
          throw new Error("Et av videoklippene har feil filtype.");
        const video=document.createElement("video");
        const url=URL.createObjectURL(clip.file);
        video.src=url;video.loop=true;video.muted=true;video.playsInline=true;
        video.preload="auto";
        result.push({kind:"video",video,url});
        await new Promise<void>((resolve,reject)=>{
          video.addEventListener("loadeddata",()=>resolve(),{once:true});
          video.addEventListener("error",()=>reject(new Error("Kunne ikke lese et valgt videoklipp.")),{once:true});
          video.load();
        });
      }
    }
    return result;
  }catch(error){cleanupMedia(result);throw error;}
}

function cleanupMedia(loaded:ReadyMedia[]){
  for(const item of loaded){
    item.image?.close();item.video?.pause();
    if(item.video)item.video.removeAttribute("src");
    if(item.url)URL.revokeObjectURL(item.url);
  }
}

export async function renderBrowserJukebox(
  options:BrowserJukeboxOptions,
):Promise<BrowserJukeboxResult>{
  validateBrowserJukebox(options);
  if(typeof window==="undefined"||typeof MediaRecorder==="undefined"||
     !HTMLCanvasElement.prototype.captureStream||
     typeof AudioContext==="undefined")
    throw new Error("Denne nettleseren støtter ikke lokal videoproduksjon. Bruk oppdatert Chrome på datamaskin.");
  const codec=chooseBrowserJukeboxMime(mime=>MediaRecorder.isTypeSupported(mime));
  if(!codec)throw new Error("Nettleseren støtter verken MP4- eller WebM-opptak med lyd.");
  if(options.signal?.aborted)throw new Error("Videoproduksjonen ble avbrutt.");
  const width=options.format==="portrait"?1080:1920;
  const height=options.format==="portrait"?1920:1080;
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Klarte ikke å opprette videobildet.");
  const audioContext=new AudioContext();
  // Resume inside the original button click before asynchronous media loading.
  await audioContext.resume();
  let loaded:ReadyMedia[]=[];
  let stream:MediaStream|null=null,source:AudioBufferSourceNode|null=null;
  let recorder:MediaRecorder|null=null;
  let frame=0,activeVideo=-1;
  let abortHandler:(()=>void)|undefined;
  try{
    const buffer=options.audioFile
      ?await options.audioFile.arrayBuffer()
      :await (async()=>{
        const response=await fetch(options.audioUrl!,{mode:"cors",redirect:"error",cache:"no-store"});
        if(!response.ok)throw new Error("Lydfilen kunne ikke hentes fra biblioteket.");
        const size=Number(response.headers.get("content-length")||0);
        if(size>50*1024*1024)throw new Error("Musikkfilen er for stor (maks 50 MB).");
        return response.arrayBuffer();
      })();
    if(buffer.byteLength<1024||buffer.byteLength>50*1024*1024)
      throw new Error("Ugyldig eller for stor musikkfil.");
    let decoded:AudioBuffer;
    try{decoded=await audioContext.decodeAudioData(buffer.slice(0));}
    catch{throw new Error("Kunne ikke dekode MP3. Velg en annen lokal lydfil.");}
    if(options.audioStartSeconds+options.durationSeconds>decoded.duration+.01)
      throw new Error("Lydutdraget går forbi slutten av originalmusikken.");
    loaded=await loadMedia(options.clips);
    const visual=canvas.captureStream(25);
    const audioDestination=audioContext.createMediaStreamDestination();
    source=audioContext.createBufferSource();
    source.buffer=decoded;source.connect(audioDestination);
    stream=new MediaStream([
      ...visual.getVideoTracks(),...audioDestination.stream.getAudioTracks(),
    ]);
    recorder=new MediaRecorder(stream,{
      mimeType:codec.mimeType,
      videoBitsPerSecond:4_500_000,audioBitsPerSecond:160_000,
    });
    const chunks:Blob[]=[];
    const total=options.durationSeconds;
    const draw=(t:number)=>{
      ctx.clearRect(0,0,width,height);
      const index=browserJukeboxSceneAt(t,options.clips);
      if(index<0){
        if(activeVideo>=0){loaded[activeVideo]?.video?.pause();activeVideo=-1;}
        drawCabinet(ctx,width,height,options.songTitle,t);
        return;
      }
      const clip=options.clips[index],asset=loaded[index];
      if(activeVideo!==index){
        if(activeVideo>=0)loaded[activeVideo]?.video?.pause();
        activeVideo=index;
        if(asset.video){asset.video.currentTime=0;void asset.video.play().catch(()=>undefined);}
      }
      const progress=clamp((t-clip.start)/(clip.end-clip.start),0,1);
      const media=asset.image||asset.video;
      const sourceWidth=asset.image?.width||asset.video?.videoWidth||width;
      const sourceHeight=asset.image?.height||asset.video?.videoHeight||height;
      if(media){
        try{drawImageCover(ctx,media,sourceWidth,sourceHeight,width,height,progress);}
        catch{drawCabinet(ctx,width,height,options.songTitle,t);}
      }
      const fade=Math.min(.6,(clip.end-clip.start)*.18);
      const next=index+1;
      if(next<loaded.length&&clip.end-t<fade&&clip.end-t>=0){
        const second=loaded[next];
        const image=second.image||second.video;
        if(image){
          const alpha=clamp(1-(clip.end-t)/fade,0,1);
          drawImageCover(ctx,image,second.image?.width||second.video?.videoWidth||width,
            second.image?.height||second.video?.videoHeight||height,width,height,0,alpha);
        }
      }
      ctx.fillStyle="rgba(0,0,0,.33)";ctx.fillRect(0,0,width,height*.055);
      ctx.fillStyle="#fff";ctx.font=`${Math.round(Math.min(width,height)*.019)}px system-ui, sans-serif`;
      ctx.textAlign="left";ctx.fillText("RE-MASTER FREDDY",width*.036,height*.035);
    };
    draw(0);
    const done=new Promise<Blob>((resolve,reject)=>{
      recorder!.ondataavailable=event=>{if(event.data.size>0)chunks.push(event.data);};
      recorder!.onerror=()=>reject(new Error("Nettleserens videoopptak feilet."));
      recorder!.onstop=()=>{
        if(options.signal?.aborted){reject(new Error("Videoproduksjonen ble avbrutt."));return;}
        const blob=new Blob(chunks,{type:codec.mimeType});
        if(blob.size<20_000){reject(new Error("Opptaket ble tomt. Prøv en annen nettleser."));return;}
        resolve(blob);
      };
    });
    const startAt=audioContext.currentTime+.15;
    const tick=()=>{
      const t=clamp(audioContext.currentTime-startAt,0,total);
      draw(t);
      options.onProgress?.(Math.min(99,Math.floor(t/total*100)));
      if(t<total && recorder?.state!=="inactive")frame=requestAnimationFrame(tick);
    };
    abortHandler=()=>{
      try{source?.stop();}catch{/* already ended */}
      if(recorder?.state!=="inactive")recorder?.stop();
    };
    options.signal?.addEventListener("abort",abortHandler,{once:true});
    source.onended=()=>{
      if(recorder?.state!=="inactive")window.setTimeout(()=>recorder?.state!=="inactive"&&recorder?.stop(),170);
    };
    recorder.start(1000);
    source.start(startAt,options.audioStartSeconds,total);
    frame=requestAnimationFrame(tick);
    const blob=await done;
    options.onProgress?.(100);
    return {blob,extension:codec.extension,mimeType:codec.mimeType,
      durationSeconds:total,width,height};
  }finally{
    if(frame)cancelAnimationFrame(frame);
    if(abortHandler)options.signal?.removeEventListener("abort",abortHandler);
    try{source?.stop();}catch{/* already ended */}
    if(recorder&&recorder.state!=="inactive")try{recorder.stop();}catch{/* already stopped */}
    stream?.getTracks().forEach(track=>track.stop());
    cleanupMedia(loaded);
    await audioContext.close().catch(()=>undefined);
  }
}
