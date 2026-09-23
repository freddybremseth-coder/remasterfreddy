import { getAdminSession } from "./supabase";
import type { VisualRegion, VisualType } from "./mix-api";

export type ReelBrand = "art" | "books" | "zeneco" | "freddybremseth" | "pinosoecolife" | "donaanna";
export type ReelChannel = "instagram"|"facebook";
export type ReelDuration = 15|20|30|45|60;

export interface ReelCreateInput {
  title:string;
  brand:ReelBrand;
  durationSeconds:ReelDuration;
  songId:string;
  channels:ReelChannel[];
  artStyles:string[];artCollections:string[];artIds:string[];
  bookSeries:string[];bookLanguages:string[];bookIds:string[];
  region:VisualRegion;
  areaQuery:string;
  visualTypes:VisualType[];
}
export interface ReelJob {
  id:string;brand:ReelBrand;title:string;duration_seconds:number;song_id:string|null;song_title:string|null;
  channels:ReelChannel[];selection:Record<string,any>;state:"rendering"|"ready"|"publishing"|"published"|"failed"|"needs_review";
  video_path:string|null;caption:string|null;publications:Record<string,unknown>;error:string|null;created_at:string;updated_at:string;
}
async function fetchAdmin(path:string,init:RequestInit={}){
  const session=await getAdminSession();if(!session)throw new Error("Adminøkten er utløpt. Logg inn på nytt.");
  const response=await fetch(path,{...init,headers:{Authorization:`Bearer ${session.accessToken}`,"Content-Type":"application/json",...(init.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Reels Studio-kallet feilet.");
  return data;
}
export async function loadReelJobs():Promise<ReelJob[]>{
  const data=await fetchAdmin("/api/neural-beat-reels",{method:"GET"});
  return Array.isArray(data.reels)?data.reels:[];
}
export async function createReel(input:ReelCreateInput):Promise<{reel:ReelJob;publicUrl:string}>{
  const data=await fetchAdmin("/api/neural-beat-reels",{method:"POST",body:JSON.stringify(input)});
  if(!data.reel||!data.publicUrl)throw new Error("Reel ble rendret, men mangler lagret videolenke.");
  return {reel:data.reel,publicUrl:data.publicUrl};
}

export type ReelPublishChannel = "instagram" | "youtube";
export interface ReelDelivery {
  channel:ReelPublishChannel;
  state:"publishing"|"published"|"needs_review";
  external_id:string|null;external_url:string|null;error:string|null;updated_at:string;
}
export interface ReelDestination {
  connected:boolean;brandId:string|null;channelId:string|null;
  account:string|null;reason:string;
}
export interface ReelPublishStatus {
  channels:Record<ReelPublishChannel,ReelDestination>;
  deliveries:ReelDelivery[];
}
/** Shows exact RealtyFlow connected accounts and any prior external publish attempt. */
export async function loadReelPublishStatus(jobId:string):Promise<ReelPublishStatus>{
  return await fetchAdmin("/api/neural-beat-reels-publish?jobId="+encodeURIComponent(jobId),{method:"GET"}) as ReelPublishStatus;
}
/** Explicit owner action; if an earlier upload is unresolved, the API blocks re-submission. */
export async function publishReel(jobId:string,channel:ReelPublishChannel):Promise<{
  success:true;channel:ReelPublishChannel;externalId:string;externalUrl:string;account:string;
}>{
  return await fetchAdmin("/api/neural-beat-reels-publish",{method:"POST",
    body:JSON.stringify({jobId,channel})});
}
