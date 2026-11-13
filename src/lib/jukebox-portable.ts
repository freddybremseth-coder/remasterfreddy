import type {JukeboxDraft,JukeboxDraftClip} from "./jukebox-drafts";
const MAX_CLIPS=12;
const MAX_TOTAL_BYTES=40*1024*1024;
type PortableClip={name:string;kind:"image"|"video";finale:boolean;section?:string;weight?:number;cueStart?:number;mime:string;data:string};
type PortableDraft={
  format:"remaster-jukebox-portable";version:1;
  songId:string;videoFormat:"landscape"|"portrait";
  seconds:"full"|"15"|"30"|"60";sceneCount:number;
  endWithLastScene:boolean;clips:PortableClip[];
};
function readAsDataUrl(blob:Blob):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("Kunne ikke lese bildefilen."));
    reader.readAsDataURL(blob);
  });
}
export async function exportPortableDraft(draft:JukeboxDraft):Promise<Blob>{
  const size=draft.clips.reduce((sum,clip)=>sum+clip.file.size,0);
  if(size>MAX_TOTAL_BYTES)throw new Error("Prosjektet er over 40 MB. Bruk lokal lagring for større videoer.");
  const clips:PortableClip[]=[];
  for(const clip of draft.clips){
    clips.push({name:clip.name,kind:clip.kind,finale:clip.finale,section:clip.section||"Fri scene",weight:clip.weight||2,cueStart:clip.cueStart,
      mime:clip.file.type||"application/octet-stream",data:await readAsDataUrl(clip.file)});
  }
  const portable:PortableDraft={format:"remaster-jukebox-portable",version:1,
    songId:draft.songId,videoFormat:draft.format,seconds:draft.seconds,
    sceneCount:draft.sceneCount,endWithLastScene:draft.endWithLastScene,clips};
  return new Blob([JSON.stringify(portable)],{type:"application/json"});
}
function decodeDataUrl(data:string,mime:string):Blob{
  const match=/^data:([a-z\d.+/-]+);base64,([a-zA-Z\d+/=]+)$/.exec(data);
  if(!match||match[1]!==mime)throw new Error("Ugyldig bilde- eller videodata i sikkerhetskopien.");
  const raw=atob(match[2]);const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
export async function importPortableDraft(file:File,expectedSongId:string):Promise<JukeboxDraft>{
  if(file.size>MAX_TOTAL_BYTES*1.4)throw new Error("Sikkerhetskopien er for stor (maks. ca. 55 MB).");
  let data:unknown;
  try{data=JSON.parse(await file.text());}catch{throw new Error("Filen er ikke en gyldig Jukebox-sikkerhetskopi.");}
  if(!data||typeof data!=="object")throw new Error("Ugyldig sikkerhetskopi.");
  const item=data as Partial<PortableDraft>;
  if(item.format!=="remaster-jukebox-portable"||item.version!==1||item.songId!==expectedSongId)
    throw new Error("Sikkerhetskopien er ikke for den valgte sangen.");
  if(!["landscape","portrait"].includes(String(item.videoFormat))||!["full","15","30","60"].includes(String(item.seconds))
    ||!Number.isInteger(item.sceneCount)||Number(item.sceneCount)<1||Number(item.sceneCount)>MAX_CLIPS
    ||typeof item.endWithLastScene!=="boolean"||!Array.isArray(item.clips)||item.clips.length>MAX_CLIPS)
    throw new Error("Prosjektinnstillingene i sikkerhetskopien er ugyldige.");
  let total=0;
  const clips:JukeboxDraftClip[]=item.clips.map(value=>{
    if(!value||typeof value!=="object"||typeof value.name!=="string"||value.name.length>240||
      !["image","video"].includes(value.kind)||typeof value.finale!=="boolean"||
      typeof value.mime!=="string"||typeof value.data!=="string"||
      !(value.mime.startsWith("image/")||value.mime.startsWith("video/")))
      throw new Error("Sikkerhetskopien inneholder ugyldig medieinformasjon.");
    const file=decodeDataUrl(value.data,value.mime);
    total+=file.size;
    if(total>MAX_TOTAL_BYTES)throw new Error("Sikkerhetskopien inneholder mer enn 40 MB med medier.");
    const section=typeof value.section==="string"&&value.section.length<=80?value.section:"Fri scene";
    const weight=[1,2,3].includes(Number(value.weight))?Number(value.weight):2;
    const cueStart=value.cueStart;
    if(cueStart!==undefined&&(!Number.isFinite(cueStart)||cueStart<0||cueStart>36000))
      throw new Error("Ugyldig tidsmarkør i prosjektfilen.");
    return {name:value.name,kind:value.kind,file,finale:value.finale,section,weight,
      ...(cueStart===undefined?{}:{cueStart})};
  });
  if(clips.filter(c=>c.finale).length>1)throw new Error("Flere avslutningsbilder er valgt.");
  const chosen=clips.findIndex(c=>c.finale);
  if(chosen>=0&&chosen!==clips.length-1)throw new Error("Avslutningsbildet må ligge sist.");
  return {version:1,songId:expectedSongId,format:item.videoFormat!,seconds:item.seconds!,
    sceneCount:item.sceneCount!,endWithLastScene:item.endWithLastScene!,clips,savedAt:Date.now()};
}
