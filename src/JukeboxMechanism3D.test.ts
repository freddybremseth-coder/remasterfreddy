import {describe,expect,it} from "vitest";
import {poseAt,DURATION,recordRotationAt,RECORD_RPM} from "./JukeboxMechanism3D";

describe("jukebox 3D choreography",()=>{
  it("keeps disc upright at the rack and horizontal at the platter",()=>{
    expect(poseAt(0).tilt).toBeCloseTo(Math.PI/2);
    expect(poseAt(5.6).tilt).toBeCloseTo(0);
  });
  it("aligns the record center with the platter spindle before release",()=>{
    const p=poseAt(5.9);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(.215);
    expect(p.z).toBeCloseTo(1);
    expect(p.released).toBe(true);
    expect(p.gripped).toBe(false);
  });
  it("does not cue or play until the transfer is finished",()=>{
    expect(poseAt(5.9).cue).toBe(0);
    expect(poseAt(7.0).playing).toBe(false);
    expect(poseAt(7.1).cue).toBe(1);
    expect(poseAt(7.1).playing).toBe(true);
  });
  it("rotates only after cue at exactly 45 rpm",()=>{
    expect(RECORD_RPM).toBe(45);
    expect(recordRotationAt(6)).toBe(0);
    expect(recordRotationAt(7.1)).toBe(0);
    expect(recordRotationAt(8.1)).toBeCloseTo(Math.PI*1.5);
  });
  it("clamps seek time to the animation range",()=>{
    expect(poseAt(-20)).toEqual(poseAt(0));
    expect(poseAt(999)).toEqual(poseAt(DURATION));
  });
});
