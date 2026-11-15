import {describe,expect,it} from "vitest";
import {draftVariantKey} from "./jukebox-drafts";

describe("Jukebox per-song versioned local draft keys",()=>{
  const songId="e3158f1d-ada7-4332-8218-b313d5fe8ffa";
  it("keeps full-size film and 45s Short distinct for one song",()=>{
    const full=draftVariantKey({songId,format:"landscape",seconds:"full"});
    const short=draftVariantKey({songId,format:"portrait",seconds:"45"});
    expect(full).not.toBe(short);
    expect(JSON.parse(full)).toEqual([songId,"landscape","full"]);
    expect(JSON.parse(short)).toEqual([songId,"portrait","45"]);
  });
  it("keeps different durations and songs separate",()=>{
    expect(draftVariantKey({songId,format:"portrait",seconds:"30"}))
      .not.toBe(draftVariantKey({songId,format:"portrait",seconds:"45"}));
    expect(draftVariantKey({songId:"different",format:"portrait",seconds:"45"}))
      .not.toBe(draftVariantKey({songId,format:"portrait",seconds:"45"}));
  });
  it("avoids delimiter collisions in imported song identifiers",()=>{
    const a=draftVariantKey({songId:"a,b",format:"landscape",seconds:"full"});
    const b=draftVariantKey({songId:"a",format:"landscape",seconds:"full"});
    expect(a).not.toBe(b);
  });
});
