/**
 * Preview duration is metadata-dependent for full songs, but a 15/30/45/60s
 * Short already has an explicit output duration in its project file.
 *
 * A cross-origin audio element may fail to provide duration while the
 * original audio is still downloadable/decodable by the render worker.
 * Never disable Shorts solely because that optional metadata is absent.
 */
export function jukeboxDurationState(
  seconds:"full"|"15"|"30"|"45"|"60",
  audioDuration:number,
  audioStartSeconds:number,
):{plannedDuration:number;sourceExcerptInvalid:boolean;metadataKnown:boolean}{
  const metadataKnown=Number.isFinite(audioDuration)&&audioDuration>0;
  const invalidStart=!Number.isFinite(audioStartSeconds)||
    audioStartSeconds<0||audioStartSeconds>3600;
  if(seconds==="full"){
    return {
      plannedDuration:metadataKnown&&!invalidStart?Math.max(0,audioDuration-audioStartSeconds):0,
      sourceExcerptInvalid:invalidStart||audioStartSeconds!==0,
      metadataKnown,
    };
  }
  const plannedDuration=Number(seconds);
  return {
    plannedDuration,
    sourceExcerptInvalid:invalidStart||
      (metadataKnown&&audioStartSeconds+plannedDuration>audioDuration+.01),
    metadataKnown,
  };
}
