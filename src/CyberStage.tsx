import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Float, Sparkles } from "@react-three/drei";
import * as THREE from "three";

type CyberStageProps = {
  playing: boolean;
  energy: number;
};

function LiquidGlassObject({
  position,
  scale,
  color,
  speed,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  speed: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed;
    ref.current.rotation.x = Math.sin(t * 0.7) * 0.22;
    ref.current.rotation.y += 0.004 + speed * 0.001;
    ref.current.rotation.z = Math.cos(t * 0.4) * 0.18;
  });

  return (
    <Float speed={1.6 + speed} rotationIntensity={0.9} floatIntensity={1.3}>
      <mesh ref={ref} position={position} scale={scale}>
        <icosahedronGeometry args={[1, 3]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.08}
          metalness={0.06}
          transmission={0.68}
          thickness={1.5}
          transparent
          opacity={0.46}
          clearcoat={1}
          clearcoatRoughness={0.05}
          emissive={color}
          emissiveIntensity={0.12}
        />
      </mesh>
    </Float>
  );
}

function VinylCore({ playing, energy }: CyberStageProps) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y += playing ? 0.015 + energy * 0.006 : 0.004;
    group.current.rotation.x = Math.sin(t * 0.4) * 0.08;
  });

  return (
    <group ref={group} position={[1.8, 0.2, -1.2]} rotation={[0.25, -0.55, 0.12]}>
      <mesh>
        <torusGeometry args={[1.42, 0.055, 24, 132]} />
        <meshStandardMaterial color="#72f3ff" emissive="#16d7ff" emissiveIntensity={1.2} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.35, 1.35, 0.12, 120]} />
        <meshPhysicalMaterial
          color="#0b141d"
          roughness={0.19}
          metalness={0.5}
          clearcoat={1}
          clearcoatRoughness={0.06}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.075, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.14, 72]} />
        <meshStandardMaterial color="#ff416f" emissive="#ff245a" emissiveIntensity={1.6} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.16, 0]}>
        <torusGeometry args={[0.82, 0.018, 12, 96]} />
        <meshStandardMaterial color="#b57b55" emissive="#7d3d26" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function BeatBars({ playing, energy }: CyberStageProps) {
  const ref = useRef<THREE.Group>(null);
  const bars = useMemo(
    () =>
      Array.from({ length: 60 }, (_, index) => ({
        x: (index - 29.5) * 0.105,
        z: Math.sin(index * 0.37) * 0.12,
        seed: 0.5 + Math.sin(index * 1.73) * 0.5,
      })),
    [],
  );

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh;
      const speed = playing ? 5.8 : 1.65;
      const beat = Math.abs(Math.sin(t * speed + index * 0.48));
      const accent = Math.abs(Math.cos(t * (speed * 0.56) + index * 0.19));
      const height = 0.28 + beat * (0.35 + energy * 0.9) + accent * 0.2;
      mesh.scale.y = height;
      mesh.position.y = -1.65 + height * 0.24;
    });
  });

  return (
    <group ref={ref} position={[-0.25, 0.25, 0.2]} rotation={[-0.16, 0.06, -0.02]}>
      {bars.map((bar, index) => (
        <mesh key={index} position={[bar.x, -1.5, bar.z]}>
          <boxGeometry args={[0.05, 1, 0.08]} />
          <meshStandardMaterial
            color={index % 4 === 0 ? "#ff416f" : "#69f7ff"}
            emissive={index % 4 === 0 ? "#ff245a" : "#14dfff"}
            emissiveIntensity={playing ? 1.8 + energy : 0.7}
            metalness={0.2}
            roughness={0.24}
          />
        </mesh>
      ))}
    </group>
  );
}

function WireDeck({ playing, energy }: CyberStageProps) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.2) * 0.04;
    group.current.position.y = -1.85 + Math.sin(t * (playing ? 1.2 : 0.45)) * 0.03;
    group.current.scale.setScalar(1 + (playing ? energy * 0.025 : 0));
  });

  return (
    <group ref={group} position={[0, -1.85, -0.3]} rotation={[Math.PI / 2.8, 0, 0]}>
      <mesh>
        <boxGeometry args={[5.6, 2.4, 0.12, 18, 10, 1]} />
        <meshStandardMaterial color="#08141b" wireframe emissive="#28ebff" emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, 0, -0.08]}>
        <boxGeometry args={[5.8, 2.58, 0.05]} />
        <meshPhysicalMaterial
          color="#0a161f"
          roughness={0.15}
          metalness={0.36}
          transparent
          opacity={0.65}
          clearcoat={1}
        />
      </mesh>
    </group>
  );
}

function CyberScene(props: CyberStageProps) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[-4, 5, 4]} intensity={2.1} color="#bdf9ff" />
      <pointLight position={[2.8, 1.3, 2.2]} intensity={9} color="#ff416f" distance={8} />
      <pointLight position={[-3.4, -0.2, 2.5]} intensity={7} color="#39e7ff" distance={7} />
      <Sparkles
        count={95}
        speed={props.playing ? 1.9 : 0.55}
        scale={[6, 3, 4]}
        size={props.playing ? 2.5 : 1.3}
        color="#76f8ff"
      />
      <LiquidGlassObject position={[-2.7, 0.55, -0.9]} scale={[0.78, 1.15, 0.78]} color="#70f4ff" speed={0.62} />
      <LiquidGlassObject position={[0.35, 1.45, -1.9]} scale={[0.52, 0.52, 1.05]} color="#c08b67" speed={0.42} />
      <LiquidGlassObject position={[2.95, 1.05, -2.1]} scale={[0.62, 0.92, 0.62]} color="#ff4772" speed={0.54} />
      <VinylCore {...props} />
      <BeatBars {...props} />
      <WireDeck {...props} />
      <ContactShadows opacity={0.34} scale={7} blur={2.4} far={4} resolution={512} color="#001018" />
    </>
  );
}

export function CyberStage(props: CyberStageProps) {
  return (
    <Canvas
      className="cyber-stage"
      camera={{ position: [0, 0.35, 6.6], fov: 45 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
    >
      <fog attach="fog" args={["#061018", 6.5, 13]} />
      <CyberScene {...props} />
    </Canvas>
  );
}

