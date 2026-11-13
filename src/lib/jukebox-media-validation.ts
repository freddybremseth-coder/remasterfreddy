/** Match private Jukebox renderer media limits before storing local drafts. */
export const MAX_JUKEBOX_IMAGE_BYTES=10*1024*1024;
export const MAX_JUKEBOX_VIDEO_BYTES=50*1024*1024;
export const MAX_JUKEBOX_SCENES=12;
const allowedImage=new Set(["image/jpeg","image/png","image/webp"]);
const allowedVideo=new Set(["video/mp4","video/webm","video/quicktime"]);
export type JukeboxSelectedMedia={name:string;type:string;size:number};
export function validateJukeboxSelectedMedia(file:JukeboxSelectedMedia):string|null{
  const name=file.name.trim();
  if(!name||name.length>240)return "Filnavnet er ugyldig eller for langt.";
  if(!Number.isSafeInteger(file.size)||file.size<1024)return `«${name}» er tom eller for liten.`;
  if(allowedImage.has(file.type)){
    if(file.size>MAX_JUKEBOX_IMAGE_BYTES)return `«${name}» er større enn 10 MB. Komprimer bildet før det legges til.`;
    return null;
  }
  if(allowedVideo.has(file.type)){
    if(file.size>MAX_JUKEBOX_VIDEO_BYTES)return `«${name}» er større enn 50 MB. Bruk et kortere klipp.`;
    return null;
  }
  return `«${name}» har et format som ikke støttes. Bruk JPG, PNG, WebP, MP4, WebM eller MOV.`;
}
