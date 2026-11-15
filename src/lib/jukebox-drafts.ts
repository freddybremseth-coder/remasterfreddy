/** Private browser-only project storage; media never uploads or publishes. */
export type JukeboxDraftClip={name:string;kind:"image"|"video";file:Blob;finale:boolean;section?:string;weight?:number;cueStart?:number};
export type JukeboxDraft={
  version:1;songId:string;format:"landscape"|"portrait";
  seconds:"full"|"15"|"30"|"45"|"60";audioStartSeconds?:number;endWithLastScene:boolean;
  sceneCount:number;clips:JukeboxDraftClip[];savedAt:number;
};
export type JukeboxDraftVariant=Pick<JukeboxDraft,"format"|"seconds"|"savedAt">;
const DB_NAME="remaster-jukebox-private-drafts";
const LEGACY_STORE="drafts";
const VARIANTS_STORE="draftVariants";
type StoredDraft=JukeboxDraft&{key:string};
export function draftVariantKey(draft:Pick<JukeboxDraft,"songId"|"format"|"seconds">):string{
  return JSON.stringify([draft.songId,draft.format,draft.seconds]);
}
function openDraftDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("Denne nettleseren støtter ikke lokal prosjektlagring."));return;}
    const request=indexedDB.open(DB_NAME,2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(LEGACY_STORE))db.createObjectStore(LEGACY_STORE,{keyPath:"songId"});
      if(!db.objectStoreNames.contains(VARIANTS_STORE))db.createObjectStore(VARIANTS_STORE,{keyPath:"key"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Kunne ikke åpne lokal lagring."));
  });
}
async function accessDraft<T>(storeName:string,mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDraftDb();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(storeName,mode);
    const request=action(transaction.objectStore(storeName));
    let value:T;
    request.onsuccess=()=>{value=request.result;};
    request.onerror=()=>reject(request.error||new Error("Lokal lagring mislyktes."));
    transaction.onerror=()=>reject(transaction.error||new Error("Lokal lagring mislyktes."));
    transaction.oncomplete=()=>{db.close();resolve(value);};
    transaction.onabort=()=>{db.close();reject(transaction.error||new Error("Lokal lagring ble avbrutt."));};
  });
}
/** New saves never overwrite the legacy per-song copy. */
export async function saveJukeboxDraft(draft:JukeboxDraft):Promise<void>{
  const key=draftVariantKey(draft);
  await accessDraft(VARIANTS_STORE,"readwrite",store=>store.put({...draft,key}));
}
export async function loadJukeboxDraftVariant(songId:string,format:JukeboxDraft["format"],seconds:JukeboxDraft["seconds"]):Promise<JukeboxDraft|null>{
  const key=draftVariantKey({songId,format,seconds});
  const saved=await accessDraft<StoredDraft|undefined>(VARIANTS_STORE,"readonly",store=>store.get(key));
  if(saved){const {key:_,...draft}=saved;return draft;}
  const old=await accessDraft<JukeboxDraft|undefined>(LEGACY_STORE,"readonly",store=>store.get(songId));
  return old?.format===format&&old.seconds===seconds?old:null;
}
export async function listJukeboxDraftVariants(songId:string):Promise<JukeboxDraftVariant[]>{
  const all=await accessDraft<StoredDraft[]>(VARIANTS_STORE,"readonly",store=>store.getAll());
  const own=all.filter(d=>d.songId===songId);
  const old=await accessDraft<JukeboxDraft|undefined>(LEGACY_STORE,"readonly",store=>store.get(songId));
  if(old&&!own.some(d=>d.format===old.format&&d.seconds===old.seconds))own.push({...old,key:draftVariantKey(old)});
  return own.map(d=>({format:d.format,seconds:d.seconds,savedAt:d.savedAt})).sort((a,b)=>b.savedAt-a.savedAt);
}
/** Default on selecting a song: prefer its full-length edit, otherwise latest. */
export async function loadJukeboxDraft(songId:string):Promise<JukeboxDraft|null>{
  const variants=await listJukeboxDraftVariants(songId);
  const choice=variants.find(x=>x.seconds==="full")||variants[0];
  return choice?loadJukeboxDraftVariant(songId,choice.format,choice.seconds):null;
}
export async function deleteJukeboxDraftVariant(songId:string,format:JukeboxDraft["format"],seconds:JukeboxDraft["seconds"]):Promise<void>{
  const key=draftVariantKey({songId,format,seconds});
  await accessDraft(VARIANTS_STORE,"readwrite",store=>store.delete(key));
  // Also delete the matching legacy copy, otherwise it could reappear.
  const old=await accessDraft<JukeboxDraft|undefined>(LEGACY_STORE,"readonly",store=>store.get(songId));
  if(old?.format===format&&old.seconds===seconds)
    await accessDraft(LEGACY_STORE,"readwrite",store=>store.delete(songId));
}
/** Compatibility function: removes the default loaded variant, not other formats. */
export async function deleteJukeboxDraft(songId:string):Promise<void>{
  const draft=await loadJukeboxDraft(songId);
  if(draft)await deleteJukeboxDraftVariant(songId,draft.format,draft.seconds);
}
