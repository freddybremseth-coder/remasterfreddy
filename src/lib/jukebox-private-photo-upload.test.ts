import {describe,it,expect} from "vitest";
import {assertPrivatePhotoReservation,signedPhotoUploadUrl,PRIVATE_PHOTO_UPLOAD_ENABLED} from "./jukebox-private-photo-upload";

const job="123e4567-e89b-42d3-a456-426614174000";
const object="423e4567-e89b-42d3-a456-426614174002";
const reservation={
 path:`staging/${job}/scene-2/${object}.png`,
 token:"valid-signed-token-123456",bucket:"remaster-jukebox-clips",
 maxBytes:10485760,sceneIndex:2,status:"staging_only",publish:false
};
describe("private Jukebox photo transfer",()=>{
 it("is disabled in the default build",()=>expect(PRIVATE_PHOTO_UPLOAD_ENABLED).toBe(false));
 it("only accepts same job, scene, private bucket, size and nonpublishing status",()=>{
   const file=new Blob([new Uint8Array(2048)],{type:"image/png"});
   expect(assertPrivatePhotoReservation(reservation,job,2,file).path).toBe(reservation.path);
   expect(()=>assertPrivatePhotoReservation(reservation,job,3,file)).toThrow();
   expect(()=>assertPrivatePhotoReservation({...reservation,publish:true},job,2,file)).toThrow();
   expect(()=>assertPrivatePhotoReservation({...reservation,bucket:"public"},job,2,file)).toThrow();
   expect(()=>assertPrivatePhotoReservation({...reservation,maxBytes:1024},job,2,file)).toThrow();
 });
 it("only builds HTTPS Supabase Storage signed URLs with the reserved path",()=>{
   const url=signedPhotoUploadUrl("https://ereapsfcsqtdmzosgnnn.supabase.co",reservation);
   expect(url).toContain("/storage/v1/object/upload/sign/remaster-jukebox-clips/staging/");
   expect(new URL(url).searchParams.get("token")).toBe(reservation.token);
   expect(()=>signedPhotoUploadUrl("https://evil.example",reservation)).toThrow();
   expect(()=>signedPhotoUploadUrl("http://ereapsfcsqtdmzosgnnn.supabase.co",reservation)).toThrow();
 });
});
