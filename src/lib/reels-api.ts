import {getAdminSession} from "./supabase";
export type ReelBrand="art"|"books"|"zeneco"|"pinoso";
export type ReelChannel="instagram"|"facebook";
export type ReelItem={id:string;title:string;imageUrl:string;detailUrl:string;style?:string;collection?:string;series?:string;language?:string;area?:string};
export type ReelJob={
  id:string;request_key:string;brand:ReelBrand;title:string;area:string|null;
  duration_seconds:number;channels:ReelChannel[];song_title:string;visual_items:Array<{id:string;title:string;detailUrl:string}>;
  caption:string;state:"rendering"|"ready"|"failed";videoUrl:string|null;
  error:string|null;created_at:string;updated_at:string;
};
export type ReelRequest={
  requestKey:string;brand:ReelBrand;title:string;durationSeconds:15|20|30|45|60;
  songId:string;selectedIds:string[];area:string;channels:ReelChannel[];
};
async function adminFetch(path:string,init:RequestInit={}){
  const session=await getAdminSession();
  if(!session)throw new Error("Adminøkten er utløpt. Logg inn på nytt.");
  const response=await fetch(path,{...init,headers:{
    Authorization:"Bearer "+session.accessToken,
    "Content-Type":"application/json",...(init.headers||{}),
  },cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Reels Studio svarte med feil.");
  return data;
}
export async function loadReelCatalog(brand:ReelBrand,area=""):Promise<{items:ReelItem[];areas:string[]}>{
  const query=new URLSearchParams({brand,...(area?{area}:{})});
  const result=await adminFetch("/api/neural-beat-reels-catalog?"+query.toString());
  if(!Array.isArray(result.items)||!Array.isArray(result.areas))throw new Error("Reels-katalogen returnerte et ufullstendig svar.");
  return result;
}
export async function loadReelJobs():Promise<ReelJob[]>{
  const result=await adminFetch("/api/neural-beat-reels");
  return Array.isArray(result.jobs)?result.jobs:[];
}
export async function produceReel(request:ReelRequest):Promise<ReelJob>{
  const result=await adminFetch("/api/neural-beat-reels",{method:"POST",body:JSON.stringify(request)});
  if(!result.job)throw new Error("Reel-forespørselen ble mottatt uten jobbstatus.");
  return result.job;
}

export async function markStalledReel(jobId:string):Promise<ReelJob>{
  const result=await adminFetch("/api/neural-beat-reels",{
    method:"PATCH",body:JSON.stringify({jobId,action:"mark-stalled"}),
  });
  if(!result.job)throw new Error("Reel-jobben ble ikke oppdatert.");
  return result.job;
}
