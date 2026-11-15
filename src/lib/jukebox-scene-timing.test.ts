import {describe,expect,it} from "vitest";
import {resolveSceneTiming,resolveSceneTimingWithDefaults} from "./jukebox-scene-timing";

describe("private Jukebox explicit section cues",()=>{
  it("calculates durations from strict manually chosen start times",()=>{
    expect(resolveSceneTiming([{cueStart:3},{cueStart:12},{cueStart:30}],3,45,0)).toEqual({
      starts:[3,12,30],durations:[9,18,15],
    });
  });
  it("respects a separate cabinet outro when requested",()=>{
    expect(resolveSceneTiming([{cueStart:5},{cueStart:20}],5,60,8)).toEqual({
      starts:[5,20],durations:[15,32],
    });
  });
  it("rejects partial, repeated, reversed, out-of-range and nonfinite cues",()=>{
    expect(resolveSceneTiming([{cueStart:3},{}],3,45,0)).toBeNull();
    expect(resolveSceneTiming([{cueStart:3},{cueStart:3}],3,45,0)).toBeNull();
    expect(resolveSceneTiming([{cueStart:20},{cueStart:10}],3,45,0)).toBeNull();
    expect(resolveSceneTiming([{cueStart:2}],3,45,0)).toBeNull();
    expect(resolveSceneTiming([{cueStart:45}],3,45,0)).toBeNull();
    expect(resolveSceneTiming([{cueStart:Infinity}],3,45,0)).toBeNull();
  });
  it("rejects impossible boundaries and zero-length content",()=>{
    expect(resolveSceneTiming([{cueStart:3}],3,3,0)).toBeNull();
    expect(resolveSceneTiming([{cueStart:3}],3,45,-1)).toBeNull();
    expect(resolveSceneTiming([],3,45,0)).toBeNull();
  });
});

describe("Jukebox incomplete image timestamps",()=>{
  it("automatically distributes scenes when no timestamps were entered",()=>{
    expect(resolveSceneTimingWithDefaults([{}, {}, {}],3,45,0)?.starts).toEqual([3,17,31]);
  });
  it("keeps explicit markers and interpolates missing ones without gaps",()=>{
    const result=resolveSceneTimingWithDefaults(
      [{cueStart:4,weight:1},{weight:1},{cueStart:17},{weight:2},{cueStart:31}],3,45,0);
    expect(result?.starts).toEqual([4,10.5,17,24,31]);
    expect(result?.durations.reduce((sum,value)=>sum+value,0)).toBeCloseTo(41);
  });
  it("allows a missing first timestamp with a later explicit anchor",()=>{
    expect(resolveSceneTimingWithDefaults([{}, {cueStart:12},{}],3,30,0)?.starts).toEqual([3,12,21]);
  });
  it("rejects repeated, reversed, out-of-range and invalid explicit anchors",()=>{
    expect(resolveSceneTimingWithDefaults([{cueStart:5},{cueStart:5}],3,45,0)).toBeNull();
    expect(resolveSceneTimingWithDefaults([{cueStart:20},{cueStart:10}],3,45,0)).toBeNull();
    expect(resolveSceneTimingWithDefaults([{}, {cueStart:2}],3,45,0)).toBeNull();
    expect(resolveSceneTimingWithDefaults([{}, {cueStart:45}],3,45,0)).toBeNull();
    expect(resolveSceneTimingWithDefaults([{cueStart:Number.NaN}],3,45,0)).toBeNull();
  });
});
