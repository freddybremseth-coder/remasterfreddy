/** Reusable editorial scene layouts. These are plans, not licensed media or rendered video. */
export type JukeboxTemplateId="drommer-cinematic"|"journey"|"storytelling"|"shorts";
export type JukeboxTemplate={id:JukeboxTemplateId;name:string;description:string;portrait:boolean;seconds:"full"|"15"|"30"|"60";endWithLastScene:boolean;scenes:ReadonlyArray<{section:string;weight:1|2|3}>};
export const JUKEBOX_TEMPLATES:readonly JukeboxTemplate[]=[
  {id:"drommer-cinematic",name:"Drømmer – filmatisk",description:"Rock-Ola-intro, reisebilder og personlige minner. Bildet til slutt avslutter sangen.",portrait:false,seconds:"full",endWithLastScene:true,scenes:[
    {section:"Åpning",weight:2},{section:"Vers 1",weight:2},{section:"Vers 1",weight:2},
    {section:"Refreng",weight:3},{section:"Vers 2",weight:2},{section:"Refreng",weight:2},
    {section:"Bro / mellomspill",weight:3},{section:"Vers 3",weight:2},{section:"Avslutning",weight:3}
  ]},
  {id:"journey",name:"Reiser og opplevelser",description:"En rolig reisevideo med plass til steder, utsikt og mennesker.",portrait:false,seconds:"full",endWithLastScene:true,scenes:[
    {section:"Åpning",weight:2},{section:"Vers 1",weight:2},{section:"Refreng",weight:3},
    {section:"Vers 2",weight:2},{section:"Bro / mellomspill",weight:2},{section:"Avslutning",weight:3}
  ]},
  {id:"storytelling",name:"Historie og kjærlighet",description:"En fortellende musikkvideo med ekstra tid til viktige personlige bilder.",portrait:false,seconds:"full",endWithLastScene:true,scenes:[
    {section:"Åpning",weight:2},{section:"Vers 1",weight:2},{section:"Refreng",weight:3},
    {section:"Vers 2",weight:2},{section:"Bro / mellomspill",weight:3},{section:"Avslutning",weight:3}
  ]},
  {id:"shorts",name:"Shorts – kort fortelling",description:"Vertikalt format med raske bildeskift og en tydelig slutt.",portrait:true,seconds:"30",endWithLastScene:true,scenes:[
    {section:"Åpning",weight:1},{section:"Refreng",weight:2},
    {section:"Bro / mellomspill",weight:1},{section:"Avslutning",weight:2}
  ]}
];
export function getJukeboxTemplate(id:string):JukeboxTemplate|undefined{return JUKEBOX_TEMPLATES.find(template=>template.id===id);}
export function sceneDefaults(template:JukeboxTemplate,index:number,total:number){
  if(total<1||index<0||index>=total)throw new Error("Invalid scene position");
  const scene=template.scenes[Math.min(index,template.scenes.length-1)];
  if(index===total-1&&template.endWithLastScene)return {section:"Avslutning",weight:3 as const};
  return {section:scene.section,weight:scene.weight};
}
