/** Browser-only MP4 review. No upload, job state change or YouTube action. */
export const MAX_PRIVATE_MP4_BYTES=200*1024*1024;
export function validatePrivateMp4File(file:Pick<File,"name"|"size"|"type">):string|null{
  if(!file.name.toLowerCase().endsWith(".mp4"))return "Velg en MP4-fil.";
  if(file.type&&file.type!=="video/mp4"&&file.type!=="application/octet-stream")
    return "Filen er ikke merket som en MP4-video.";
  if(!Number.isSafeInteger(file.size)||file.size<20_000||file.size>MAX_PRIVATE_MP4_BYTES)
    return "Privat MP4 må være mellom 20 KB og 200 MB.";
  return null;
}
export function validatePrivateMp4Duration(actual:number,expected:number):string|null{
  if(!Number.isFinite(actual)||actual<=0)return "Kunne ikke lese MP4-varigheten.";
  if(!Number.isFinite(expected)||expected<=0)return "Sanglengden må hentes før privat kontroll.";
  if(Math.abs(actual-expected)>2)
    return "MP4-varigheten stemmer ikke med valgt sang og lengde. Kontroller sangen før godkjenning.";
  return null;
}
export async function hashPrivateMp4(file:Blob):Promise<string>{
  const bytes=await file.arrayBuffer();
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),part=>part.toString(16).padStart(2,"0")).join("");
}
