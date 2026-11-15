import {describe,it,expect} from "vitest";
import {jukeboxDurationState} from "./jukebox-duration";

describe("Jukebox direct video button and audio metadata",()=>{
  it("can render Drømmer 45s from 197s even if <audio> metadata is unavailable",()=>{
    expect(jukeboxDurationState("45",0,197)).toEqual({
      plannedDuration:45,sourceExcerptInvalid:false,metadataKnown:false,
    });
    expect(jukeboxDurationState("45",Number.NaN,197).sourceExcerptInvalid).toBe(false);
  });
  it("validates available original metadata, but never truncates a 45s video",()=>{
    expect(jukeboxDurationState("45",278.016,197)).toEqual({
      plannedDuration:45,sourceExcerptInvalid:false,metadataKnown:true,
    });
    expect(jukeboxDurationState("45",240,197)).toEqual({
      plannedDuration:45,sourceExcerptInvalid:true,metadataKnown:true,
    });
  });
  it("requires source duration for full songs and rejects invalid offsets",()=>{
    expect(jukeboxDurationState("full",0,0).plannedDuration).toBe(0);
    expect(jukeboxDurationState("full",278.016,0).plannedDuration).toBe(278.016);
    expect(jukeboxDurationState("full",278.016,197).sourceExcerptInvalid).toBe(true);
    expect(jukeboxDurationState("45",0,-1).sourceExcerptInvalid).toBe(true);
    expect(jukeboxDurationState("45",0,Number.NaN).sourceExcerptInvalid).toBe(true);
    expect(jukeboxDurationState("45",0,3601).sourceExcerptInvalid).toBe(true);
  });
});
