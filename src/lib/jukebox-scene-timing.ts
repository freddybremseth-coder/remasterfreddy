/** Explicit timeline controls for a private Jukebox storyboard.
 * Manual boundaries are accepted only as a complete, non-overlapping plan.
 * No publishing, song analysis or renderer side effects. */
export type TimedScene = {cueStart?:number};
export function resolveSceneTiming(
  scenes:readonly TimedScene[], introEnd:number, videoEnd:number, outroDuration:number,
):{starts:number[];durations:number[]}|null{
  if(!scenes.length||!Number.isFinite(introEnd)||!Number.isFinite(videoEnd)||
     !Number.isFinite(outroDuration)||introEnd<0||outroDuration<0)return null;
  const contentEnd=videoEnd-outroDuration;
  if(contentEnd<=introEnd)return null;
  const starts=scenes.map(scene=>scene.cueStart);
  if(starts.some(value=>typeof value!=="number"||!Number.isFinite(value)))return null;
  const times=starts as number[];
  if(times[0]<introEnd||times.some((time,index)=>time<0||time>=contentEnd||
      (index>0&&time<=times[index-1])))return null;
  const durations=times.map((time,index)=>(times[index+1]??contentEnd)-time);
  if(durations.some(value=>value<=0))return null;
  return {starts:times,durations};
}

/** Complete a partially specified storyboard without discarding the user's anchors.
 * Missing cues are interpolated using positive scene weights. A missing first cue
 * starts at the suggested intro boundary; an explicit first cue controls the intro.
 * Invalid, reversed or colliding explicit anchors are never silently replaced. */
export function resolveSceneTimingWithDefaults(
  scenes:readonly (TimedScene & {weight?:number})[],
  suggestedIntro:number, videoEnd:number, outroDuration:number,
):{starts:number[];durations:number[]}|null{
  if(!scenes.length||!Number.isFinite(suggestedIntro)||suggestedIntro<0||
    !Number.isFinite(videoEnd)||!Number.isFinite(outroDuration)||outroDuration<0)return null;
  const contentEnd=videoEnd-outroDuration;
  if(contentEnd<=suggestedIntro)return null;
  const first=scenes[0].cueStart??suggestedIntro;
  if(!Number.isFinite(first)||first<0||first>=contentEnd)return null;
  const anchors=[{index:0,time:first}];
  for(let i=1;i<scenes.length;i++){
    const time=scenes[i].cueStart;
    if(time!==undefined){
      if(!Number.isFinite(time)||time<=anchors[anchors.length-1].time||time>=contentEnd)return null;
      anchors.push({index:i,time});
    }
  }
  anchors.push({index:scenes.length,time:contentEnd});
  const starts=Array<number>(scenes.length);
  for(let a=0;a<anchors.length-1;a++){
    const from=anchors[a],to=anchors[a+1];
    if(to.time<=from.time)return null;
    const weights=scenes.slice(from.index,to.index).map(scene=>
      typeof scene.weight==="number"&&Number.isFinite(scene.weight)&&scene.weight>0?scene.weight:2);
    const total=weights.reduce((sum,value)=>sum+value,0);
    let elapsed=0;
    for(let i=from.index;i<to.index;i++){
      starts[i]=from.time+(to.time-from.time)*elapsed/total;
      elapsed+=weights[i-from.index];
    }
  }
  return resolveSceneTiming(starts.map(cueStart=>({cueStart})),0,videoEnd,outroDuration);
}
