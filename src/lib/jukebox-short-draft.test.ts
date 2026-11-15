import {describe,expect,it} from "vitest";
import {makeJukeboxShortDraft,shouldPreserveExistingJukeboxDraft} from "./jukebox-short-draft";
import type {JukeboxDraft} from "./jukebox-drafts";

const original:JukeboxDraft={
  version:1,songId:"e3158f1d-ada7-4332-8218-b313d5fe8ffa",
  format:"landscape",seconds:"full",audioStartSeconds:0,
  sceneCount:2,endWithLastScene:true,savedAt:1,
  clips:[
    {name:"first.png",kind:"image",file:new Blob(["photo"]),finale:false,weight:2,cueStart:30},
    {name:"last.png",kind:"image",file:new Blob(["photo"]),finale:true,weight:3,cueStart:170},
  ],
};
describe("Jukebox separate Short project",()=>{
  it("preserves existing full video when importing a separate Short",()=>{
    const short=makeJukeboxShortDraft(original);
    expect(shouldPreserveExistingJukeboxDraft(original,short)).toBe(true);
    expect(shouldPreserveExistingJukeboxDraft(short,short)).toBe(false);
    expect(shouldPreserveExistingJukeboxDraft(null,short)).toBe(false);
  });
  it("reuses the pictures while recalculating timestamps for a 45-second portrait video",()=>{
    const short=makeJukeboxShortDraft(original,90);
    expect(short.format).toBe("portrait");
    expect(short.seconds).toBe("45");
    expect(short.audioStartSeconds).toBe(90);
    expect(short.clips.map(c=>c.cueStart)).toEqual([undefined,undefined]);
    expect(short.clips[1].finale).toBe(true);
    expect(short.clips[0].file).toBe(original.clips[0].file);
  });
  it("never mutates the original full-song project or its cues",()=>{
    makeJukeboxShortDraft(original);
    expect(original.format).toBe("landscape");
    expect(original.seconds).toBe("full");
    expect(original.clips.map(c=>c.cueStart)).toEqual([30,170]);
  });
  it("rejects invalid audio offsets",()=>{
    expect(()=>makeJukeboxShortDraft(original,-1)).toThrow();
    expect(()=>makeJukeboxShortDraft(original,Infinity)).toThrow();
  });
});
