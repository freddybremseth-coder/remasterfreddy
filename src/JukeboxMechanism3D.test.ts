import {describe,expect,it} from "vitest";
import {poseAt,DURATION,recordRotationAt,RECORD_RPM,gripperPositionAt,phaseAt,MAGAZINE_Z,MAGAZINE_Y} from "./JukeboxMechanism3D";

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
  it("starts the selected record at the magazine's shared centerline",()=>{
    expect(poseAt(0).x).toBe(0);
    expect(poseAt(0).y).toBe(MAGAZINE_Y);
    expect(poseAt(0).z).toBe(MAGAZINE_Z);
  });
  it("keeps record in rack before extraction and grips before moving",()=>{
    expect(poseAt(0).z).toBeCloseTo(-1.5);
    expect(poseAt(.95).z).toBeCloseTo(-1.5);
    expect(poseAt(.95).gripped).toBe(false);
    expect(poseAt(1.05).gripped).toBe(true);
    expect(poseAt(1.05).z).toBeCloseTo(-1.5);
    expect(poseAt(2.5).z).toBeGreaterThan(-1.5);
  });
  it("keeps gripper anchored before release and retracts smoothly",()=>{
    const before=gripperPositionAt(6.05);
    const mid=gripperPositionAt(6.2);
    const after=gripperPositionAt(6.35);
    expect(before.y).toBeCloseTo(poseAt(5.9).y+.13);
    expect(before.z).toBeCloseTo(poseAt(5.9).z);
    expect(mid.z).toBeLessThan(before.z);
    expect(mid.z).toBeGreaterThan(after.z);
    expect(after.y).toBeCloseTo(1.05);
    expect(after.z).toBeCloseTo(poseAt(6.35).z-.65);
  });
  it("reports the release and cue phases separately",()=>{
    expect(phaseAt(5.95)).toContain("Åpne gripehodet");
    expect(phaseAt(6.1)).toContain("Trekk tilbake");
    expect(phaseAt(6.7)).toContain("pickupen");
  });
  it("clamps seek time to the animation range",()=>{
    expect(poseAt(-20)).toEqual(poseAt(0));
    expect(poseAt(999)).toEqual(poseAt(DURATION));
  });
});
