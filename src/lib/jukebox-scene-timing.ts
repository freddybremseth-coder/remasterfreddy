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
