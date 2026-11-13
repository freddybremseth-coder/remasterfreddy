import {describe,it,expect} from "vitest";
import {MAX_JUKEBOX_IMAGE_BYTES,MAX_JUKEBOX_VIDEO_BYTES,validateJukeboxSelectedMedia} from "./jukebox-media-validation";
const media=(type:string,size:number,name="photo.jpg")=>({type,size,name});
describe("Local Jukebox media intake",()=>{
  it("accepts supported images up to 10 MiB",()=>{
    for(const type of ["image/jpeg","image/png","image/webp"])
      expect(validateJukeboxSelectedMedia(media(type,MAX_JUKEBOX_IMAGE_BYTES))).toBeNull();
    expect(validateJukeboxSelectedMedia(media("image/png",MAX_JUKEBOX_IMAGE_BYTES+1))).toMatch(/10 MB/);
  });
  it("allows supported videos up to 50 MiB",()=>{
    for(const type of ["video/mp4","video/webm","video/quicktime"])
      expect(validateJukeboxSelectedMedia(media(type,MAX_JUKEBOX_VIDEO_BYTES))).toBeNull();
    expect(validateJukeboxSelectedMedia(media("video/mp4",MAX_JUKEBOX_VIDEO_BYTES+1))).toMatch(/50 MB/);
  });
  it("rejects SVG, GIF, empty files and bad names",()=>{
    expect(validateJukeboxSelectedMedia(media("image/svg+xml",4000))).toBeTruthy();
    expect(validateJukeboxSelectedMedia(media("image/gif",4000))).toBeTruthy();
    expect(validateJukeboxSelectedMedia(media("image/jpeg",10))).toBeTruthy();
    expect(validateJukeboxSelectedMedia(media("image/jpeg",2048," "))).toBeTruthy();
  });
});
