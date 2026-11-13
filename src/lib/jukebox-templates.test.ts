import {describe,it,expect} from "vitest";
import {JUKEBOX_TEMPLATES,getJukeboxTemplate,sceneDefaults} from "./jukebox-templates";

describe("Reusable Jukebox video templates",()=>{
  it("provides unique reusable layouts with a safe scene count",()=>{
    expect(new Set(JUKEBOX_TEMPLATES.map(t=>t.id)).size).toBe(JUKEBOX_TEMPLATES.length);
    for(const template of JUKEBOX_TEMPLATES){
      expect(template.scenes.length).toBeGreaterThanOrEqual(1);
      expect(template.scenes.length).toBeLessThanOrEqual(12);
      expect(template.scenes.every(s=>s.weight>=1&&s.weight<=3)).toBe(true);
    }
  });
  it("keeps the last scene as a prolonged finale for the cinematic template",()=>{
    const template=getJukeboxTemplate("drommer-cinematic")!;
    expect(template.scenes.length).toBe(9);
    expect(sceneDefaults(template,8,9)).toEqual({section:"Avslutning",weight:3});
    expect(sceneDefaults(template,3,9).section).toBe("Refreng");
  });
  it("supports separate vertical Shorts layouts",()=>{
    const template=getJukeboxTemplate("shorts")!;
    expect(template.portrait).toBe(true);
    expect(template.seconds).toBe("30");
    expect(sceneDefaults(template,3,4).section).toBe("Avslutning");
  });
  it("rejects out-of-range scene indexes",()=>{
    const template=JUKEBOX_TEMPLATES[0];
    expect(()=>sceneDefaults(template,-1,9)).toThrow();
    expect(()=>sceneDefaults(template,9,9)).toThrow();
  });
});
