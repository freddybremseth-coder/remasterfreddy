/** Browser-only private Jukebox photo transport. Feature-gated; never queues or publishes. */
import {getAdminSession} from "./supabase";
import {validateJukeboxSelectedMedia} from "./jukebox-media-validation";

export const PRIVATE_PHOTO_UPLOAD_ENABLED=import.meta.env.VITE_JUKEBOX_PRIVATE_PHOTO_UPLOAD_ENABLED==="true";
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const ALLOWED=new Set(["image/jpeg","image/png","image/webp"]);
const STORAGE_BUCKET="remaster-jukebox-clips";
const PATH=/^staging\/[a-f0-9-]{36}\/scene-(?:[0-9]|10|11)\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i;
interface PhotoReservation {
  path:string;token:string;bucket:string;maxBytes:number;
  sceneIndex:number;status:string;publish:false;
}
export function assertPrivatePhotoReservation(raw:unknown,jobId:string,sceneIndex:number,file:Blob):PhotoReservation{
  if(!raw||typeof raw!=="object")throw new Error("Ugyldig opplastingsreservasjon.");
  const value=raw as Record<string,unknown>;
  if(!UUID.test(jobId)||!PATH.test(String(value.path||""))
    ||!String(value.path).startsWith("staging/"+jobId+"/scene-"+sceneIndex+"/")
    ||value.bucket!==STORAGE_BUCKET||value.sceneIndex!==sceneIndex
    ||value.publish!==false||value.status!=="staging_only"
    ||typeof value.token!=="string"||value.token.length<10
    ||typeof value.maxBytes!=="number"||file.size>value.maxBytes)
    throw new Error("Privat opplastingsreservasjon samsvarer ikke med valgt jobb og scene.");
  return value as unknown as PhotoReservation;
}
export function signedPhotoUploadUrl(origin:string,reservation:PhotoReservation):string{
  const base=new URL(origin);
  if(base.protocol!=="https:"||!/^([a-z0-9-]+)\.supabase\.co$/.test(base.hostname)
    ||base.username||base.password||base.search||base.hash||base.pathname!=="/")
    throw new Error("Ugyldig privat Supabase-opplastingsadresse.");
  const url=new URL("/storage/v1/object/upload/sign/"+reservation.bucket+"/"+reservation.path,base);
  url.searchParams.set("token",reservation.token);
  return url.toString();
}
export async function uploadPrivateJukeboxPhoto(
  jobId:string,expectedSongId:string,sceneIndex:number,file:File,
):Promise<"metadata_verified_only">{
  if(!PRIVATE_PHOTO_UPLOAD_ENABLED)throw new Error("Privat bildeopplasting er ikke aktivert.");
  if(!UUID.test(jobId)||!UUID.test(expectedSongId)||!Number.isInteger(sceneIndex)||sceneIndex<0||sceneIndex>11)
    throw new Error("Ugyldig jobb eller bildeplass.");
  if(!ALLOWED.has(file.type))throw new Error("Bare JPG, PNG og WebP kan lastes opp som private bilder.");
  const invalid=validateJukeboxSelectedMedia(file);
  if(invalid)throw new Error(invalid);
  const session=await getAdminSession();
  if(!session)throw new Error("Adminøkten er utløpt. Logg inn på nytt.");
  // Check the owner-scoped job's actual song before minting any write token.
  const check=await fetch("/api/neural-beat-jukebox-scene-status?jobId="+encodeURIComponent(jobId),{
    method:"GET",cache:"no-store",
    headers:{"Authorization":"Bearer "+session.accessToken},
  });
  const context=await check.json().catch(()=>({}));
  if(!check.ok||context.jobId!==jobId||context.songId!==expectedSongId)
    throw new Error("Privat jobb-ID tilhører ikke valgt sang, eller kunne ikke kontrolleres. Ingen bilder ble sendt.");
  const response=await fetch("/api/neural-beat-jukebox-photo-reserve",{
    method:"POST",cache:"no-store",
    headers:{"Authorization":"Bearer "+session.accessToken,"Content-Type":"application/json"},
    body:JSON.stringify({jobId,sceneIndex,contentType:file.type,bytes:file.size}),
  });
  const raw=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(raw.error||"Kan ikke reservere privat bildeopplasting."));
  const reservation=assertPrivatePhotoReservation(raw,jobId,sceneIndex,file);
  const storageOrigin=String(import.meta.env.VITE_SUPABASE_URL||"");
  const url=signedPhotoUploadUrl(storageOrigin,reservation);
  // Explicit browser action only. Token URL is never logged or stored in the draft.
  const uploaded=await fetch(url,{
    method:"PUT",body:file,headers:{"Content-Type":file.type},
    cache:"no-store",redirect:"error",
  });
  if(!uploaded.ok)throw new Error("Privat bildeopplasting feilet. Opplastingsreservasjonen kan kreve administrativ opprydding før nytt forsøk.");
  const verified=await fetch("/api/neural-beat-jukebox-scene-status?jobId="+encodeURIComponent(jobId),{
    method:"GET",cache:"no-store",
    headers:{"Authorization":"Bearer "+session.accessToken},
  });
  const result=await verified.json().catch(()=>({}));
  if(!verified.ok||result.jobId!==jobId||result.songId!==expectedSongId||!Array.isArray(result.scenes)
    ||result.scenes.find((scene:{index:number})=>scene.index===sceneIndex)?.status!=="metadata_verified_only")
    throw new Error("Bildet ble sendt, men metadata er ikke bekreftet. Kontroller jobben i bildestatusen.");
  return "metadata_verified_only";
}
