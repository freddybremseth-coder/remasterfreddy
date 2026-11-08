import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useState } from "react";
import * as THREE from "three";

/** Independent, inspectable 3D prototype. Does not render MP4 or control audio. */
export const DURATION = 8;
export function poseAt(seconds: number) {
  const t = Math.max(0, Math.min(DURATION, seconds));
  const ease = (a: number, b: number) => {
    const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  // Magazine center at (0,1.55,-1.5), platter at (0,.3,1).
  const extract = ease(1.3, 2.5);
  const rotate = ease(3.1, 4.5);
  const lower = ease(4.5, 5.6);
  const travel = ease(2.5, 4.5);
  return {
    x: 0,
    y: 1.55 - 1.335 * lower,
    z: -1.5 + 0.55 * extract + 1.95 * travel,
    tilt: Math.PI / 2 * (1 - rotate),
    gripped: t >= 1.0 && t < 5.9,
    released: t >= 5.9,
    cue: ease(6.35, 7.1),
    playing: t >= 7.1,
    carriageZ: -1.5 + 0.55 * extract + 1.95 * travel,
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
  const grip: [number,number,number] = [0,p.released ? 1.05 : p.y+.13,p.released ? p.z-.65 : p.z];
  const discPosition: [number,number,number] = [p.x,p.y,p.z];
  return <group>
    <mesh position={[0,.08,1]}><cylinderGeometry args={[.98,.98,.16,64]}/><meshStandardMaterial color="#77838c" metalness={.9} roughness={.22}/></mesh>
    <mesh position={[0,.175,1]}><cylinderGeometry args={[.81,.81,.04,64]}/><meshStandardMaterial color="#121820" metalness={.4} roughness={.65}/></mesh>
    <mesh position={[0,.24,1]}><cylinderGeometry args={[.045,.045,.15,20]}/><meshStandardMaterial color="#e1d4aa" metalness={.8}/></mesh>
    {Array.from({length:12},(_,i)=><mesh key={i} position={[(i-5.5)*.16,1.55,-1.82]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.78,.012,6,48]}/><meshStandardMaterial color={i===5?"#9b5b32":"#42525d"} metalness={.6}/></mesh>)}
    <Bar a={[-1.12,2.28,-2.1]} b={[-1.12,2.28,1.15]} radius={.06}/>
    <Bar a={[1.12,2.28,-2.1]} b={[1.12,2.28,1.15]} radius={.06}/>
    <mesh position={[0,2.27,p.carriageZ]}><boxGeometry args={[2.35,.23,.42]}/><meshStandardMaterial color="#6e8d9d" metalness={.9} roughness={.24}/></mesh>
    <Bar a={pivot} b={grip} radius={.055}/>
    <Bar a={[-.24,2.13,p.carriageZ]} b={[-.15,p.y+.13,p.z]} radius={.027}/>
    <Bar a={[.24,2.13,p.carriageZ]} b={[.15,p.y+.13,p.z]} radius={.027}/>
    <group position={grip} rotation={[p.released ? 0 : p.tilt,0,0]}>
      <mesh><boxGeometry args={[.46,.12,.22]}/><meshStandardMaterial color="#b6c8d0" metalness={.85} roughness={.22}/></mesh>
      {p.gripped&&[-1,1].map(s=><mesh key={s} position={[s*.29,-.08,0]}><boxGeometry args={[.055,.23,.13]}/><meshStandardMaterial color="#d6b775" metalness={.7}/></mesh>)}
    </group>
    <group position={discPosition} rotation={[p.tilt,0,0]}>
      <mesh rotation={[0,0,0]}><cylinderGeometry args={[.78,.78,.025,72]}/><meshStandardMaterial color="#11151a" metalness={.3} roughness={.36}/></mesh>
      <mesh position={[0,.015,0]}><cylinderGeometry args={[.23,.23,.004,48]}/><meshStandardMaterial color="#267f9e" roughness={.65}/></mesh>
      <mesh position={[0,.025,0]}><cylinderGeometry args={[.045,.045,.005,24]}/><meshStandardMaterial color="#dfd2a8" metalness={.7}/></mesh>
    </group>
    <group position={[1.12,.35,1.25]} rotation={[0,-p.cue*.55,0]}>
      <mesh><cylinderGeometry args={[.13,.13,.13,24]}/><meshStandardMaterial color="#a5b7c1" metalness={.8}/></mesh>
      <Bar a={[0,.12,0]} b={[-.53,.2-p.cue*.15,-.38]} radius={.042}/>
    </group>
  </group>;
}
export default function JukeboxMechanism3D() {
  const [time,setTime]=useState(0);
  const [running,setRunning]=useState(false);
  const [front,setFront]=useState(true);
  useEffect(()=>{
    if(!running)return;
    let frame=0; let previous=performance.now();
    const tick=(now:number)=>{ const dt=Math.min(.1,(now-previous)/1000);previous=now;setTime(t=>{const next=Math.min(DURATION,t+dt);if(next>=DURATION)setRunning(false);return next;});frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[running]);
  return <div className="jukebox-3d">
    <div className="jukebox-3d-canvas" aria-label="Interaktiv 3D-prototype av plateveksler">
      <Canvas key={front?"front":"inspection"} camera={{position:front?[0,2.5,7]:[4,3.5,5],fov:38}} shadows>
        <color attach="background" args={["#101a25"]}/>
        <ambientLight intensity={.8}/><directionalLight position={[3,6,5]} intensity={2.3} castShadow/>
        <pointLight position={[-2,2,2]} intensity={15} color="#f2bd74"/>
        <Mechanism time={time}/>
        <OrbitControls makeDefault target={[0,1,0]} enablePan={false} minDistance={3} maxDistance={12}/>
      </Canvas>
    </div>
    <div className="jukebox-3d-controls">
      <button type="button" onClick={()=>{setTime(0);setRunning(true);}}>Test plateveksleren i 3D uten musikk</button>
      <button type="button" onClick={()=>setRunning(v=>!v)}>{running?"Pause mekanikk":"Fortsett mekanikk"}</button>
      <button type="button" onClick={()=>setFront(v=>!v)}>{front?"Skrått kontrollperspektiv":"Forfra som i jukeboksen"}</button>
      <label>Kontroller bevegelsen: {time.toFixed(2)} s <input type="range" min="0" max={DURATION} step=".05" value={time} onChange={e=>{setRunning(false);setTime(Number(e.target.value));}}/></label>
    </div>
    <p>Separat 3D-prototype. Kabinettkomposisjon, realistisk kollisjonskontroll og MP4-eksport er ikke ferdig.</p>
  </div>;
}
