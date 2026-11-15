/**
 * Real Jukebox ADMIN UI acceptance test with fully synthetic media:
 * test authorization -> import six-scene portable JSON -> auto-select song ->
 * no HTMLAudio duration metadata -> click "Produser privat video" ->
 * real download -> ffprobe + full decode + non-silent offset audio.
 *
 * No access to real login, customer files, Supabase/YouTube or deployment.
 */
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright";

const host="http://127.0.0.1:5174";
const SONG_ID="e3158f1d-ada7-4332-8218-b313d5fe8ffa";
const OTHER_ID="123e4567-e89b-42d3-a456-426614174000";
const startSeconds=197,shortSeconds=45;
const cueTimes=[4,9.8,17.36,25.2,31.04,36.8];
const vite=spawn(process.execPath,[
  "node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","5174","--strictPort",
],{
  stdio:["ignore","pipe","pipe"],
  env:{...process.env,VITE_SUPABASE_URL:host+"/test-auth",
    VITE_SUPABASE_ANON_KEY:"no-real-key-synthetic-ci-only",
    VITE_JUKEBOX_RENDER_ENABLED:"false"},
});
let logs="";
for(const output of [vite.stdout,vite.stderr]){
  output.on("data",chunk=>logs+=String(chunk).slice(0,600));
}
async function waitForServer(){
  for(let i=0;i<90;i++){
    if(vite.exitCode!==null)throw new Error("Vite failed: "+logs);
    try{const response=await fetch(host);if(response.ok)return;}catch{/* startup */}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw new Error("Vite did not start: "+logs);
}
function makeWav(){
  // 245 s master. The first 197 s are SILENT; seconds 197–245 are
  // audible. If the renderer ignores the original-song offset, output
  // volume will be near -infinity and this test fails.
  const rate=16000,duration=245,total=rate*duration;
  const buffer=Buffer.alloc(44+total*2);
  buffer.write("RIFF",0);buffer.writeUInt32LE(buffer.length-8,4);
  buffer.write("WAVEfmt ",8);buffer.writeUInt32LE(16,16);
  buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);
  buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
  buffer.write("data",36);buffer.writeUInt32LE(total*2,40);
  for(let i=startSeconds*rate;i<total;i++){
    const time=(i-startSeconds*rate)/rate;
    const fade=Math.min(1,time*6,(duration-startSeconds-time)*6);
    const sample=Math.round(10000*Math.max(0,fade)*Math.sin(2*Math.PI*440*time));
    buffer.writeInt16LE(sample,44+i*2);
  }
  return buffer;
}
const wav=makeWav();
let browser,dir;
try{
  await waitForServer();
  browser=await chromium.launch({headless:true,args:[
    "--no-sandbox","--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream","--disable-dev-shm-usage",
  ]});
  const context=await browser.newContext({
    viewport:{width:1280,height:900},acceptDownloads:true,
  });
  const page=await context.newPage();
  page.setDefaultTimeout(40000);
  await page.addInitScript(()=>{
    window.localStorage.setItem("remasterfreddy.admin.session",JSON.stringify({
      accessToken:"test-token-only",refreshToken:"test-refresh-only",
      expiresAt:Date.now()+120000,email:"freddy.bremseth@gmail.com",
    }));
    // Simulate the exact problem from production: audio element fails to
    // expose duration although the audio bytes decode successfully later.
    Object.defineProperty(HTMLMediaElement.prototype,"duration",{
      configurable:true,get(){return Number.NaN;},
    });
  });
  await page.route("**/test-auth/auth/v1/user",route=>route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({email:"freddy.bremseth@gmail.com"}),
  }));
  await page.route("**/api/neural-beat",route=>route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({songs:[
      {id:OTHER_ID,title:"Another catalog song",audioUrl:host+"/test-audio.wav"},
      {id:SONG_ID,title:"Drømmer",audioUrl:host+"/test-audio.wav"},
    ]}),
  }));
  await page.route("**/test-audio.wav",route=>route.fulfill({
    status:200,contentType:"audio/wav",body:wav,
    headers:{"Content-Type":"audio/wav","Content-Length":String(wav.length),
      "Accept-Ranges":"bytes","Cache-Control":"no-store"},
  }));
  await page.goto(host+"/admin?tab=jukebox",{waitUntil:"domcontentloaded"});
  await page.getByRole("heading",{name:"60-talls jukeboks"}).waitFor({timeout:30000});
  const picker=page.getByRole("combobox",{name:"Velg sang"});
  await picker.waitFor();
  await page.waitForFunction(id=>{
    const selection=document.querySelector('select[aria-label="Velg sang"]');
    return selection?.querySelectorAll("option").length===2&&selection.value!==id;
  },SONG_ID);
  assert.equal(await picker.inputValue(),OTHER_ID,"Precondition: another song selected");
  const pngs=await page.evaluate(async()=>{
    const result=[];
    for(let i=0;i<6;i++){
      const c=document.createElement("canvas");c.width=400;c.height=600;
      const ctx=c.getContext("2d");
      ctx.fillStyle=["#dc493a","#3375cc","#edca4e","#3e9f82","#a55bcc","#f48eaf"][i];
      ctx.fillRect(0,0,400,600);ctx.fillStyle="white";
      ctx.font="bold 120px sans-serif";ctx.fillText(String(i+1),130,320);
      const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
      result.push(await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=()=>reject(new Error("Fixture image error"));
        reader.readAsDataURL(blob);
      }));
    }
    return result;
  });
  const project={
    format:"remaster-jukebox-portable",version:1,songId:SONG_ID,
    videoFormat:"portrait",seconds:"45",audioStartSeconds:197,
    sceneCount:6,endWithLastScene:true,
    clips:cueTimes.map((cueStart,index)=>({
      name:index===5?"09-kai-kari-finale.png":`synthetic-scene-${index+1}.png`,
      kind:"image",finale:index===5,
      section:index===5?"Avslutning":"Vers 1",weight:2,cueStart,
      mime:"image/png",data:pngs[index],
    })),
  };
  const projectInput=page.locator('input[aria-label="Velg Jukebox-prosjektfil"]');
  await projectInput.setInputFiles({
    name:"Drømmer-45s-synthetic-test.json",mimeType:"application/json",
    buffer:Buffer.from(JSON.stringify(project)),
  });
  await page.waitForFunction(id=>
    document.querySelector('select[aria-label="Velg sang"]')?.value===id,
    SONG_ID,{timeout:20000});
  await page.getByText("Prosjektfilen er åpnet med riktig sang",{exact:false})
    .waitFor({timeout:30000});
  const button=page.getByRole("button",{name:"Produser privat video",exact:true});
  await button.waitFor({timeout:20000});
  assert.equal(await button.isEnabled(),true,
    "The direct production button must NOT be disabled by unavailable audio metadata");
  const select=await picker.inputValue();assert.equal(select,SONG_ID);
  assert.equal(await page.getByRole("combobox",{name:"Videolengde"}).inputValue(),"45");
  assert.equal(await page.getByRole("spinbutton",{name:"Start i originalmusikken"}).inputValue(),"197");
  const start=Date.now();
  await button.click();
  const download=page.locator(".jukebox-direct-production a[download]");
  await download.waitFor({state:"visible",timeout:150000});
  assert.match(await download.getAttribute("download"),/\.((mp4)|(webm))$/);
  dir=await mkdtemp(join(tmpdir(),"jukebox-admin-e2e-"));
  const [file]=await Promise.all([
    page.waitForEvent("download",{timeout:30000}),
    download.click(),
  ]);
  const downloaded=join(dir,file.suggestedFilename());
  await file.saveAs(downloaded);
  const content=await readFile(downloaded);
  assert.ok(content.length>100_000,"Downloaded video too small");
  const media=JSON.parse(execFileSync("ffprobe",[
    "-v","error","-show_streams","-show_format","-of","json",downloaded,
  ],{timeout:20000,encoding:"utf8",maxBuffer:1024*1024}));
  const v=media.streams.find(s=>s.codec_type==="video");
  const a=media.streams.find(s=>s.codec_type==="audio");
  assert.ok(v&&a,"Both video AND audio streams required");
  assert.equal(v.width,1080);assert.equal(v.height,1920);
  const length=Number(media.format.duration);
  assert.ok(length>=44&&length<48,"Expected actual 45-second video, got "+length);
  const decode=execFileSync("ffmpeg",[
    "-nostdin","-hide_banner","-v","info","-xerror","-i",downloaded,
    "-map","0:a:0","-af","volumedetect","-f","null","-",
  ],{timeout:80000,encoding:"utf8",maxBuffer:2048*1024,stdio:["ignore","pipe","pipe"]});
  // ffmpeg writes volume data to stderr, so separately capture stderr below.
  const {spawnSync}=await import("node:child_process");
  const loud=spawnSync("ffmpeg",[
    "-nostdin","-hide_banner","-v","info","-i",downloaded,
    "-map","0:a:0","-af","volumedetect","-f","null","-",
  ],{timeout:80000,encoding:"utf8",maxBuffer:2048*1024});
  assert.equal(loud.status,0,"Audio analysis failed");
  const match=String(loud.stderr).match(/mean_volume:\s*(-?[\d.]+) dB/);
  assert.ok(match,"No measurable output audio volume: "+String(loud.stderr).slice(-800));
  const meanVolume=Number(match[1]);
  assert.ok(meanVolume>-29&&meanVolume<-6,
    "Expected audible source segment from 197s, got "+meanVolume+" dB");
  execFileSync("ffmpeg",["-nostdin","-v","error","-xerror",
    "-i",downloaded,"-map","0:v:0","-map","0:a:0","-f","null","-"],
    {timeout:90000,maxBuffer:512*1024});
  console.log(JSON.stringify({
    result:"PASS",test:"actual admin import -> click -> downloaded video with audible offset",
    songAutoSelected:true,sourceOffsetSeconds:197,scenes:6,
    durationSeconds:length,bytes:content.length,
    videoCodec:v.codec_name,audioCodec:a.codec_name,
    meanAudioDecibels:meanVolume,
    elapsedMs:Date.now()-start,
  }));
}finally{
  await browser?.close();vite.kill("SIGTERM");
  if(dir)await rm(dir,{recursive:true,force:true});
}
