import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

type Quality = 'high' | 'low';

/** 设备分级：低端机 / 小屏降低点云数量与 DPR，避免首屏掉帧。 */
function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const small = window.matchMedia('(max-width: 720px)').matches;
  return cores <= 4 || memory <= 4 || small ? 'low' : 'high';
}

function SphereRig({ quality, reduced }: { quality: Quality; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const mouse = useRef({ x: 0, y: 0 });

  const points = useMemo(() => {
    const count = quality === 'high' ? 1200 : 560;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.62 + (Math.random() - 0.5) * 0.18;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, [quality]);

  useEffect(() => {
    if (reduced) return;
    const onMove = (event: PointerEvent) => {
      mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reduced]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const d = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const narrow = state.size.width < 900;
    const scroll = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1);

    if (!reduced) g.rotation.y += d * 0.14;
    g.rotation.x = THREE.MathUtils.damp(
      g.rotation.x,
      reduced ? 0.12 : mouse.current.y * 0.22,
      2.2,
      d,
    );
    g.rotation.z = THREE.MathUtils.damp(
      g.rotation.z,
      reduced ? 0 : -mouse.current.x * 0.1,
      2.2,
      d,
    );

    const breathe = reduced ? 1 : 1 + Math.sin(t * 0.85) * 0.012;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, breathe * (1 - scroll * 0.12), 3, d));

    const targetX = narrow ? 0 : 1.18;
    const targetY = narrow ? -0.1 : scroll * -0.35;
    g.position.x = THREE.MathUtils.damp(g.position.x, targetX, 3, d);
    g.position.y = THREE.MathUtils.damp(g.position.y, targetY, 3, d);

    if (ring.current && !reduced) {
      ring.current.rotation.z += d * 0.06;
      ring.current.rotation.x = 1.15 + Math.sin(t * 0.25) * 0.08;
    }
  });

  return (
    <group ref={group}>
      {/* 主网格：细密线框 */}
      <mesh>
        <icosahedronGeometry args={[1.55, 3]} />
        <meshBasicMaterial
          wireframe
          color="#d6ff73"
          transparent
          opacity={0.32}
          depthWrite={false}
        />
      </mesh>

      {/* 内层网格：反向旋转、偏白，制造纵深 */}
      <mesh scale={0.985}>
        <icosahedronGeometry args={[1.55, 2]} />
        <meshBasicMaterial
          wireframe
          color="#f1f1ea"
          transparent
          opacity={0.1}
          depthWrite={false}
        />
      </mesh>

      {/* 表面点云 */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={quality === 'high' ? 0.016 : 0.022}
          sizeAttenuation
          color="#c9ff3d"
          transparent
          opacity={0.88}
          depthWrite={false}
        />
      </points>

      {/* 轨道环 + 卫星点 */}
      <group ref={ring} rotation={[1.15, 0, 0.2]}>
        <mesh>
          <torusGeometry args={[2.12, 0.0018, 4, 160]} />
          <meshBasicMaterial color="#f1f1ea" transparent opacity={0.22} />
        </mesh>
        <mesh position={[2.12, 0, 0]}>
          <sphereGeometry args={[0.026, 10, 10]} />
          <meshBasicMaterial color="#c9ff3d" />
        </mesh>
      </group>
    </group>
  );
}

function FallbackSphere() {
  return (
    <div className="sphere-fallback" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export default function SphereScene() {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [quality] = useState<Quality>(detectQuality);
  const [reduced, setReduced] = useState(false);
  const [frameloop, setFrameloop] = useState<'always' | 'never'>('always');

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      setWebgl(!!gl);
    } catch {
      setWebgl(false);
    }

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(motion.matches);
    const onMotion = (event: MediaQueryListEvent) => setReduced(event.matches);
    motion.addEventListener('change', onMotion);

    const onVisibility = () => setFrameloop(document.hidden ? 'never' : 'always');
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (webgl === null) return null;
  if (!webgl) return <FallbackSphere />;

  return (
    <Canvas
      frameloop={frameloop}
      dpr={quality === 'high' ? [1, 1.75] : [1, 1.15]}
      camera={{ position: [0, 0, 4.7], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <SphereRig quality={quality} reduced={reduced} />
    </Canvas>
  );
}
