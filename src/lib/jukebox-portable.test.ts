import {describe,expect,it} from "vitest";
import {importPortableDraft} from "./jukebox-portable";

const drommer="e3158f1d-ada7-4332-8218-b313d5fe8ffa";
const differentSong="123e4567-e89b-42d3-a456-426614174000";
const sourceImage="data:image/png;base64,"+btoa("test-image-content".repeat(120));
function project(changes:Record<string,unknown>={}){
  return {format:"remaster-jukebox-portable",version:1,
    songId:drommer,videoFormat:"portrait",seconds:"45",
    sceneCount:6,endWithLastScene:true,audioStartSeconds:197,
    clips:[4,9.8,17.36,25.2,31.04,36.8].map((cueStart,index)=>({
      name:index===5?"09-kai-kari-finale.png":`photo-${index}.png`,
      kind:"image",finale:index===5,
      section:index===5?"Avslutning":"Vers 1",weight:2,cueStart,
      mime:"image/png",data:sourceImage,
    })),...changes};
}
function asFile(value:unknown):File{
  const json=JSON.stringify(value);
  const file=new File([json],"Drømmer-45s-project.json",{type:"application/json"});
  Object.defineProperty(file,"text",{value:async()=>json});
  return file;
}
describe("portable Jukebox project import",()=>{
  it("opens the real Drømmer six-scene project shape without requiring the user to first select its song",async()=>{
    const draft=await importPortableDraft(asFile(project()));
    expect(draft.songId).toBe(drommer);
    expect(draft.format).toBe("portrait");
    expect(draft.seconds).toBe("45");
    expect(draft.audioStartSeconds).toBe(197);
    expect(draft.clips.map(clip=>clip.cueStart)).toEqual([4,9.8,17.36,25.2,31.04,36.8]);
    expect(draft.clips[5].finale).toBe(true);
    expect(draft.clips[5].name).toBe("09-kai-kari-finale.png");
    expect(draft.clips.every(clip=>clip.file.type==="image/png")).toBe(true);
  });
  it("retains strict validation when an expected song is explicitly supplied",async()=>{
    await expect(importPortableDraft(asFile(project()),differentSong)).rejects.toThrow(/annen sang/);
    await expect(importPortableDraft(asFile(project()),drommer)).resolves.toMatchObject({songId:drommer});
  });
  it("rejects invalid imported song identifiers and full-song offsets",async()=>{
    await expect(importPortableDraft(asFile(project({songId:"../../song"})))).rejects.toThrow(/sang-ID/);
    await expect(importPortableDraft(asFile(project({seconds:"full"})))).rejects.toThrow(/starttid/);
    await expect(importPortableDraft(asFile(project({audioStartSeconds:3601})))).rejects.toThrow(/starttid/);
  });
});
