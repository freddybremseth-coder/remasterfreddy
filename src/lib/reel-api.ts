import {getAdminSession} from "./supabase";
import type {PromotionBrand,VisualRegion,VisualType} from "./mix-api";

export type ReelBrand=Exclude<PromotionBrand,"none">;
export type ReelChannel="instagram"|"facebook";
export interface ReelDraftInput{
  title:string;
  brand:ReelBrand;
  durationSeconds:15|20|30|45|60;
  songId:string;
  channels:ReelChannel[];
  artStyles:string[];artCollections:string[];artIds:string[];
  bookSeries:string[];bookLanguages:string[];bookIds:string[];
  region:VisualRegion;town:string;visualType:VisualType;
}
export interface ReelJob{
  id:string;brand:ReelBrand;title:string;duration_seconds:number;song_id:string;song_title?:string|null;
  region:VisualRegion;town?:string|null;visual_type:VisualType;
  selection:Record<string,unknown>;assets:Array<Record<string,unknown>>;
  caption?:string|null;channels:ReelChannel[];video_path?:string|null;video_url?:string|null;
  state:"rendering"|"ready"|"publishing"|"published"|"failed"|"needs_review";
  publish_results?:Record<string,unknown>;error?:string|null;created_at:string;updated_at:string;
}
async function api(path:string,init:RequestInit={}){
  const session=await getAdminSession();if(!session)throw new Error("Adminøkten er utløpt. Logg inn på nytt.");
  const response=await fetch(path,{...init,headers:{
    Authorization:`Bearer ${session.accessToken}`,"Content-Type":"application/json",...(init.headers||{}),
  }});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Reels Studio-kallet feilet.");
  return data;
}
export async function loadReels():Promise<ReelJob[]>{
  const data=await api("/api/neural-beat-reels",{method:"GET"});
  return Array.isArray(data.reels)?data.reels:[];
}
export async function renderReel(input:ReelDraftInput):Promise<ReelJob>{
  const data=await api("/api/neural-beat-reels",{method:"POST",body:JSON.stringify(input)});
  if(!data.reel)throw new Error("Reel ble rendret, men ingen jobb ble returnert.");
  return data.reel as ReelJob;
}
