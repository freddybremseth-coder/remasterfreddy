import {describe,it,expect} from "vitest";
import {MAX_PRIVATE_MP4_BYTES,validatePrivateMp4File,validatePrivateMp4Duration} from "./jukebox-private-review";

describe("Private Jukebox MP4 review",()=>{
  it("allows ordinary MP4s while rejecting invalid or oversized files",()=>{
    expect(validatePrivateMp4File({name:"Drommer.mp4",size:5_000_000,type:"video/mp4"})).toBeNull();
    expect(validatePrivateMp4File({name:"Drommer.jpg",size:5_000_000,type:"image/jpeg"})).toBeTruthy();
    expect(validatePrivateMp4File({name:"large.mp4",size:MAX_PRIVATE_MP4_BYTES+1,type:"video/mp4"})).toBeTruthy();
    expect(validatePrivateMp4File({name:"bad.mp4",size:100,type:"video/mp4"})).toBeTruthy();
  });
  it("requires metadata and a duration near the selected song",()=>{
    expect(validatePrivateMp4Duration(278.5,278)).toBeNull();
    expect(validatePrivateMp4Duration(275,278)).toBeTruthy();
    expect(validatePrivateMp4Duration(NaN,278)).toBeTruthy();
    expect(validatePrivateMp4Duration(278,0)).toBeTruthy();
  });
});
