import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useState } from "react";
import * as THREE from "three";

/** Independent, inspectable 3D prototype. Does not render MP4 or control audio. */
export const DURATION = 8;
export const RECORD_RPM = 45;
export const MAGAZINE_Z = -1.5;
export const MAGAZINE_Y = 1.55;
export function recordRotationAt(seconds: number) {
  return Math.max(0, seconds - 7.1) * (RECORD_RPM / 60) * Math.PI * 2;
}
export function phaseAt(seconds: number) {
  if (seconds < 1) return "Velg plate";
  if (seconds < 1.3) return "Grip platen";
  if (seconds < 2.5) return "Trekk ut fra magasinet";
  if (seconds < 4.5) return "Flytt og roter platen";
  if (seconds < 5.6) return "Senk mot tallerkenen";
  if (seconds < 5.9) return "Plasser platen";
  if (seconds < 6.35) return "Trekk tilbake gripearmen";
  if (seconds < 7.1) return "Senk pickupen";
  return "45 RPM – avspilling";
}
export function gripperPositionAt(seconds: number) {
  const p = poseAt(seconds);
  const u = Math.max(0,Math.min(1,(seconds-5.9)/.45));
  const retract = u*u*(3-2*u);
  return {x:0,y:p.y+.13+(1.05-(p.y+.13))*retract,z:p.z-.65*retract};
}
export function poseAt(seconds: number) {
  const t = Math.max(0, Math.min(DURATION, seconds));
  const ease = (a: number, b: number) => {
    const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  // Selected record starts centered on the magazine rail, then moves to the platter.
  const extract = ease(1.3, 2.5);
  const rotate = ease(3.1, 4.5);
  const lower = ease(4.5, 5.6);
  const travel = ease(2.5, 4.5);
  return {
    x: 0,
    y: MAGAZINE_Y - 1.335 * lower,
    z: MAGAZINE_Z + 0.55 * extract + 1.95 * travel,
    tilt: Math.PI / 2 * (1 - rotate),
    gripped: t >= 1.0 && t < 5.9,
    approaching: t < 1.0,
    released: t >= 5.9,
    cue: ease(6.35, 7.1),
    playing: t >= 7.1,
    carriageZ: MAGAZINE_Z + 0.55 * extract + 1.95 * travel,
  };
}

function Bar({ a, b, radius = .035, color = "#b9c9cf" }: { a: [number,number,number]; b: [number,number,number]; radius?: number; color?: string }) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const delta = vb.clone().sub(va);
  const center = va.clone().add(vb).multiplyScalar(.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), delta.clone().normalize());
  return <mesh position={center.toArray()} quaternion={quaternion}><cylinderGeometry args={[radius,radius,delta.length(),12]}/><meshStandardMaterial color={color} metalness={.88} roughness={.2}/></mesh>;
}
function Mechanism({ time }: { time: number }) {
  const p = poseAt(time);
  const pivot: [number,number,number] = [0,2.15,p.carriageZ];
  const gripper=gripperPositionAt(time);
  const grip: [number,number,number] = [gripper.x,gripper.y,gripper.z];
  const approach=Math.max(0,Math.min(1,time/.95));
  const reach=approach*approach*(3-2*approach);
  const gripVisibleZ=grip[2]-(1-reach)*.7;
  const gripVisible: [number,number,number]=[grip[0],grip[1],gripVisibleZ];
  // Rim contact moves with the record's changing orientation.
  const rim: [number,number,number]=[discPosition[0],discPosition[1]+.72*Math.sin(p.tilt),discPosition[2]+.72*Math.cos(p.tilt)];
  const discPosition: [number,number,number] = [p.x,p.y,p.z];
  return <group>
    {/* Open mechanical chassis, not a substitute for the final photographic cabinet. */}
    <mesh position={[0,-.19,-.15]} receiveShadow><boxGeometry args={[3.25,.24,4.8]}/><meshStandardMaterial color="#24313a" metalness={.78} roughness={.36}/></mesh>
    {[-1.55,1.55].map(x=><group key={x}>
      <mesh position={[x,1.03,-.15]}><boxGeometry args={[.11,2.42,4.65]}/><meshStandardMaterial color="#5b6972" metalness={.85} roughness={.27}/></mesh>
      <mesh position={[x,2.26,-.15]}><boxGeometry args={[.12,.12,4.65]}/><meshStandardMaterial color="#b8a276" metalness={.78} roughness={.22}/></mesh>
    </group>)}
    <mesh position={[0,.64,-2.28]}><boxGeometry args={[3.2,1.8,.13]}/><meshStandardMaterial color="#16242c" metalness={.65} roughness={.36}/></mesh>
    <mesh position={[0,.08,1]}><cylinderGeometry args={[.98,.98,.16,64]}/><meshStandardMaterial color="#77838c" metalness={.9} roughness={.22}/></mesh>
    <mesh position={[0,.175,1]}><cylinderGeometry args={[.81,.81,.04,64]}/><meshStandardMaterial color="#121820" metalness={.4} roughness={.65}/></mesh>
    <mesh position={[0,.24,1]}><cylinderGeometry args={[.045,.045,.15,20]}/><meshStandardMaterial color="#e1d4aa" metalness={.8}/></mesh>
    {Array.from({length:11},(_,i)=>{
      // Records sit vertically in parallel slots. Slot 5 is empty: its record is on the transfer arm.
      const slot=i<5?i:i+1;
      return <group key={slot} position={[(slot-5.5)*.16,MAGAZINE_Y,MAGAZINE_Z]}>
        <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.76,.76,.025,48]}/><meshStandardMaterial color="#151a20" metalness={.22} roughness={.44}/></mesh>
        <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.19,.19,.029,36]}/><meshStandardMaterial color={slot%2===0?"#a84d3b":"#477b8c"} roughness={.68}/></mesh>
      </group>;
    })}
    <Bar a={[-1.12,2.28,-2.1]} b={[-1.12,2.28,1.15]} radius={.06}/>
    <Bar a={[1.12,2.28,-2.1]} b={[1.12,2.28,1.15]} radius={.06}/>
    <mesh position={[0,2.27,p.carriageZ]}><boxGeometry args={[2.35,.23,.42]}/><meshStandardMaterial color="#6e8d9d" metalness={.9} roughness={.24}/></mesh>
    <Bar a={pivot} b={gripVisible} radius={.055}/>
    <Bar a={[-.24,2.13,p.carriageZ]} b={[-.15,gripVisible[1],gripVisible[2]]} radius={.027}/>
    <Bar a={[.24,2.13,p.carriageZ]} b={[.15,gripVisible[1],gripVisible[2]]} radius={.027}/>
    {p.gripped&&<Bar a={gripVisible} b={rim} radius={.025} color="#d6b775"/>}
    <group position={gripVisible} rotation={[0,0,p.released ? 0 : p.tilt]}>
      <mesh><boxGeometry args={[.46,.12,.22]}/><meshStandardMaterial color="#b6c8d0" metalness={.85} roughness={.22}/></mesh>
      {p.gripped&&[-1,1].map(s=><mesh key={s} position={[s*.29,-.08,0]}><boxGeometry args={[.055,.23,.13]}/><meshStandardMaterial color="#d6b775" metalness={.7}/></mesh>)}
    </group>
    <group position={discPosition} rotation={[0,0,p.tilt]}><group rotation={[0,recordRotationAt(time),0]}>
      <mesh rotation={[0,0,0]}><cylinderGeometry args={[.78,.78,.025,72]}/><meshStandardMaterial color="#11151a" metalness={.3} roughness={.36}/></mesh>
      <mesh position={[0,.015,0]}><cylinderGeometry args={[.23,.23,.004,48]}/><meshStandardMaterial color="#267f9e" roughness={.65}/></mesh>
      <mesh position={[0,.025,0]}><cylinderGeometry args={[.045,.045,.005,24]}/><meshStandardMaterial color="#dfd2a8" metalness={.7}/></mesh>
      <mesh position={[0,.028,-.48]}><boxGeometry args={[.12,.008,.025]}/><meshStandardMaterial color="#d5c38a" metalness={.55}/></mesh>
    </group></group>
    <group position={[1.12,.35,1.25]} rotation={[0,-p.cue*.55,0]}>
      <mesh><cylinderGeometry args={[.13,.13,.13,24]}/><meshStandardMaterial color="#a5b7c1" metalness={.8}/></mesh>
      <Bar a={[0,.12,0]} b={[-.53,.2-p.cue*.15,-.38]} radius={.042}/>
    </group>
  </group>;
}
export default function JukeboxMechanism3D() {
  const [time,setTime]=useState(0);
  const [running,setRunning]=useState(false);
  const [view,setView]=useState<"front"|"side"|"top">("front");
  useEffect(()=>{
    if(!running)return;
    let frame=0; let previous=performance.now();
    const tick=(now:number)=>{ const dt=Math.min(.1,(now-previous)/1000);previous=now;setTime(t=>{const next=Math.min(DURATION,t+dt);if(next>=DURATION)setRunning(false);return next;});frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[running]);
  return <div className="jukebox-3d">
    <div className="jukebox-3d-canvas" aria-label="Interaktiv 3D-prototype av plateveksler">
      <Canvas key={view} camera={{position:view==="front"?[0,2.5,7]:view==="side"?[5,2.8,1.4]:[0,7.5,1],fov:38}} shadows>
        <color attach="background" args={["#101a25"]}/>
        <ambientLight intensity={.8}/><directionalLight position={[3,6,5]} intensity={2.3} castShadow/>
        <pointLight position={[-2,2,2]} intensity={15} color="#f2bd74"/>
        <Mechanism time={time}/>
        <OrbitControls makeDefault target={[0,1,0]} enablePan={false} minDistance={3} maxDistance={12}/>
      </Canvas>
    </div>
    <p role="status" aria-live="off">Fase: {phaseAt(time)} · {time.toFixed(2)} / {DURATION.toFixed(2)} sekunder</p>
    <div className="jukebox-3d-controls">
      <button type="button" onClick={()=>{setTime(0);setRunning(true);}}>Test plateveksleren i 3D uten musikk</button>
      <button type="button" onClick={()=>setRunning(v=>!v)}>{running?"Pause mekanikk":"Fortsett mekanikk"}</button>
      <button type="button" onClick={()=>setView(v=>v==="front"?"side":v==="side"?"top":"front")}>Kamera: {view==="front"?"Front":view==="side"?"Side":"Ovenfra"} – bytt vinkel</button>
      <label>Kontroller bevegelsen: {time.toFixed(2)} s <input type="range" min="0" max={DURATION} step=".05" value={time} onChange={e=>{setRunning(false);setTime(Number(e.target.value));}}/></label>
    </div>
    <p>Separat 3D-prototype. Kabinettkomposisjon, realistisk kollisjonskontroll og MP4-eksport er ikke ferdig.</p>
  </div>;
}
