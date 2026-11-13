import {describe,expect,it} from "vitest";
import {resolveSceneTiming} from "./jukebox-scene-timing";

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
