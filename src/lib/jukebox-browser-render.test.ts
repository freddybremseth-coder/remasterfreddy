import {describe,expect,it} from "vitest";
import {browserJukeboxSceneAt,chooseBrowserJukeboxMime,validateBrowserJukebox} from "./jukebox-browser-render";

const image=new Blob([new Uint8Array(2000)],{type:"image/png"});
const base={
  audioUrl:"https://example.invalid/owned-master.mp3",
  songTitle:"Private demo",
  format:"portrait" as const,audioStartSeconds:197,durationSeconds:45,
  introSeconds:4,outroSeconds:0,
  clips:[
    {name:"a.png",kind:"image" as const,file:image,start:4,end:20},
    {name:"b.png",kind:"image" as const,file:image,start:20,end:45},
  ],
};
describe("direct private browser video production",()=>{
  it("prefers native MP4 encoding but falls back to real WebM extension",()=>{
    expect(chooseBrowserJukeboxMime(mime=>mime==='video/mp4;codecs="avc1.42E01E,mp4a.40.2"')).toEqual({
      mimeType:'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',extension:"mp4",
    });
    // Chromium may report generic MP4 and actually encode VP9/Opus.
    // Require explicit AVC/AAC instead of mislabeling the output.
    expect(chooseBrowserJukeboxMime(mime=>mime==="video/mp4")).toBe(null);
    expect(chooseBrowserJukeboxMime(mime=>mime==="video/webm")).toEqual({
      mimeType:"video/webm",extension:"webm",
    });
    expect(chooseBrowserJukeboxMime(()=>false)).toBe(null);
  });
  it("uses 0-based output scene times regardless of 197-second source offset",()=>{
    validateBrowserJukebox(base);
    expect(browserJukeboxSceneAt(0,base.clips)).toBe(-1);
    expect(browserJukeboxSceneAt(4,base.clips)).toBe(0);
    expect(browserJukeboxSceneAt(19.99,base.clips)).toBe(0);
    expect(browserJukeboxSceneAt(20,base.clips)).toBe(1);
    expect(browserJukeboxSceneAt(44.99,base.clips)).toBe(1);
    expect(browserJukeboxSceneAt(45,base.clips)).toBe(-1);
  });
  it("rejects invalid source intervals, missing media and scene gaps",()=>{
    expect(()=>validateBrowserJukebox({...base,audioStartSeconds:-1})).toThrow();
    expect(()=>validateBrowserJukebox({...base,durationSeconds:0})).toThrow();
    expect(()=>validateBrowserJukebox({...base,audioUrl:undefined})).toThrow();
    expect(()=>validateBrowserJukebox({...base,
      clips:[base.clips[0],{...base.clips[1],start:22}],
    })).toThrow();
    expect(()=>validateBrowserJukebox({...base,
      clips:[base.clips[0],{...base.clips[1],end:43}],
    })).toThrow();
  });
  it("supports jukebox-only full-song output without external photo scenes",()=>{
    validateBrowserJukebox({...base,audioStartSeconds:0,durationSeconds:278,
      introSeconds:278,outroSeconds:0,clips:[]});
  });
});
