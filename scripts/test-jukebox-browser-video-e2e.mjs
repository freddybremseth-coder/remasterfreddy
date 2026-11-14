/**
 * Real headless Chromium end-to-end: capture actual synthesized audio +
 * animated visual frame -> downloadable local video -> ffprobe/ffmpeg decode.
 * No Supabase session, user music, assets, publishing or service secrets.
 */
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {writeFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright";

const base="http://127.0.0.1:5174";
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","5174","--strictPort"],{
  stdio:["ignore","pipe","pipe"],env:{...process.env},
});
let logs="";
vite.stdout.on("data",chunk=>logs+=String(chunk).slice(0,1000));
vite.stderr.on("data",chunk=>logs+=String(chunk).slice(0,1000));

async function waitForServer(){
  for(let i=0;i<80;i++){
    if(vite.exitCode!==null)throw new Error("Vite ended: "+logs);
    try{const resp=await fetch(base);if(resp.ok)return;}catch{/* startup */}
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  throw new Error("Timed out waiting for Vite: "+logs);
}
let browser,dir;
try{
  await waitForServer();
  browser=await chromium.launch({headless:true,args:[
    "--no-sandbox","--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream","--disable-dev-shm-usage",
  ]});
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  page.setDefaultTimeout(30000);
  await page.goto(base,{waitUntil:"domcontentloaded"});
  const actual=await page.evaluate(async()=>{
    const module=await import("/src/lib/jukebox-browser-render.ts");
    function wav(sampleRate=24000,duration=5){
      const samples=Math.floor(sampleRate*duration);
      const bytes=new ArrayBuffer(44+samples*2);
      const view=new DataView(bytes);
      function word(at,val){view.setUint32(at,val,true);}
      function half(at,val){view.setUint16(at,val,true);}
      for(const [at,wordValue] of [[4,36+samples*2],[16,16],[24,sampleRate],
        [28,sampleRate*2],[40,samples*2]])word(at,wordValue);
      half(20,1);half(22,1);half(32,2);half(34,16);
      for(const [at,str] of [[0,"RIFF"],[8,"WAVE"],[12,"fmt "],[36,"data"]])
        for(let i=0;i<str.length;i++)view.setUint8(at+i,str.charCodeAt(i));
      for(let i=0;i<samples;i++){
        const time=i/sampleRate;
        view.setInt16(44+i*2,Math.round(Math.sin(time*2*Math.PI*440)*8500),true);
      }
      return new File([bytes],"private-smoke.wav",{type:"audio/wav"});
    }
    const art=document.createElement("canvas");art.width=512;art.height=512;
    const ctx=art.getContext("2d");
    const gradient=ctx.createLinearGradient(0,0,512,512);
    gradient.addColorStop(0,"#244ad6");gradient.addColorStop(1,"#f4b75e");
    ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
    ctx.fillStyle="#fff";ctx.font="bold 95px sans-serif";
    ctx.fillText("TEST",70,285);
    const png=await new Promise(resolve=>art.toBlob(resolve,"image/png"));
    if(!png)throw new Error("Unable to create test PNG");
    const progress=[];
    const output=await module.renderBrowserJukebox({
      songTitle:"Private smoke verification",
      audioFile:wav(),format:"portrait",
      audioStartSeconds:1,durationSeconds:2.3,
      introSeconds:.4,outroSeconds:0,
      clips:[{name:"smoke.png",kind:"image",file:png,start:.4,end:2.3}],
      onProgress:value=>progress.push(value),
    });
    if(!output.blob.size||!progress.includes(100))
      throw new Error("Video missing or render not completed");
    return {extension:output.extension,mimeType:output.mimeType,
      bytes:output.blob.size,progress:progress.at(-1),
      payload:Array.from(new Uint8Array(await output.blob.arrayBuffer()))};
  });
  assert.ok(actual.bytes>20_000,"Video must be non-empty");
  assert.ok(["webm","mp4"].includes(actual.extension));
  assert.equal(actual.progress,100);
  dir=await mkdtemp(join(tmpdir(),"jukebox-browser-smoke-"));
  const videoPath=join(dir,"browser-output."+actual.extension);
  await writeFile(videoPath,Buffer.from(actual.payload));
  const probe=JSON.parse(execFileSync("ffprobe",[
    "-v","error","-show_format","-show_streams","-of","json",videoPath,
  ],{encoding:"utf8",timeout:30000,maxBuffer:1024*1024}));
  const streams=probe.streams||[];
  const audio=streams.find(s=>s.codec_type==="audio");
  const video=streams.find(s=>s.codec_type==="video");
  assert.ok(video,"Missing recorded video stream");
  assert.ok(audio,"Missing original-song audio stream");
  assert.equal(video.width,1080);assert.equal(video.height,1920);
  const duration=Number(probe.format?.duration);
  assert.ok(duration>=1.5&&duration<=4.5,"Unexpected actual output length "+duration);
  if(actual.extension==="mp4"){
    assert.equal(video.codec_name,"h264","MP4 video must be H.264");
    assert.equal(audio.codec_name,"aac","MP4 audio must be AAC");
  }else assert.ok(actual.mimeType.startsWith("video/webm"));
  execFileSync("ffmpeg",["-nostdin","-v","error","-xerror","-i",videoPath,
    "-map","0:v:0","-map","0:a:0","-f","null","-"],
    {timeout:45000,maxBuffer:512*1024});
  console.log(JSON.stringify({result:"PASS",extension:actual.extension,
    bytes:actual.bytes,duration,videoCodec:video.codec_name,
    audioCodec:audio.codec_name,dimensions:[video.width,video.height],
    sourceAudioOffsetSeconds:1,photoStartSeconds:.4}));
}finally{
  await browser?.close();
  vite.kill("SIGTERM");
  if(dir)await rm(dir,{recursive:true,force:true});
}
