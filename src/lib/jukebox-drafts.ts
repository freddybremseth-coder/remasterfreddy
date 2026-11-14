/** Private browser-only draft storage; never uploads media or publishes videos. */
export type JukeboxDraftClip={name:string;kind:"image"|"video";file:Blob;finale:boolean;section?:string;weight?:number;cueStart?:number};
export type JukeboxDraft={
  version:1;songId:string;format:"landscape"|"portrait";
  seconds:"full"|"15"|"30"|"45"|"60";audioStartSeconds?:number;endWithLastScene:boolean;
  sceneCount:number;clips:JukeboxDraftClip[];savedAt:number;
};
const DB_NAME="remaster-jukebox-private-drafts";
const STORE="drafts";
function openDraftDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("Denne nettleseren støtter ikke lokal prosjektlagring."));return;}
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"songId"});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Kunne ikke åpne lokal lagring."));
  });
}
async function accessDraft<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDraftDb();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,mode);
    const request=action(transaction.objectStore(STORE));
    let value:T;
    request.onsuccess=()=>{value=request.result;};
    request.onerror=()=>reject(request.error||new Error("Lokal lagring mislyktes."));
    transaction.onerror=()=>reject(transaction.error||new Error("Lokal lagring mislyktes."));
    transaction.oncomplete=()=>{db.close();resolve(value);};
    transaction.onabort=()=>{db.close();reject(transaction.error||new Error("Lokal lagring ble avbrutt."));};
  });
}
export async function saveJukeboxDraft(draft:JukeboxDraft):Promise<void>{
  await accessDraft("readwrite",store=>store.put(draft));
}
export async function loadJukeboxDraft(songId:string):Promise<JukeboxDraft|null>{
  return (await accessDraft("readonly",store=>store.get(songId)))||null;
}
export async function deleteJukeboxDraft(songId:string):Promise<void>{
  await accessDraft("readwrite",store=>store.delete(songId));
}
