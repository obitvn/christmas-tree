import { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
  shaderMaterial,
  Float,
  Stars,
  Sparkles,
  useTexture
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MathUtils } from 'three';
import * as random from 'maath/random';
import { GestureRecognizer, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

// --- 动态生成照片列表 ---
const TOTAL_NUMBERED_PHOTOS = 31;
const bodyPhotoPaths = [
  '/photos/top.jpg',
  ...Array.from({ length: TOTAL_NUMBERED_PHOTOS }, (_, i) => `/photos/${i + 1}.jpg`)
];

// --- 视觉配置 (增强版) ---
const CONFIG = {
  colors: {
    emerald: '#00FF41',      // 更亮的祖母绿
    gold: '#FFD700',
    silver: '#ECEFF1',
    red: '#FF1744',          // 更鲜艳的红
    green: '#00E676',        // 更鲜艳的绿
    white: '#FFFFFF',
    warmLight: '#FFE082',
    lights: ['#FF0080', '#00FF80', '#8000FF', '#FF8000', '#00FFFF', '#FF00FF'], // 更多彩的灯
    borders: ['#FFFAF0', '#F0E68C', '#E6E6FA', '#FFB6C1', '#98FB98', '#87CEFA', '#FFDAB9', '#FFD700'],
    giftColors: ['#FF1744', '#FFD700', '#2979FF', '#00E676', '#AA00FF'],
    candyColors: ['#FF0000', '#FFFFFF', '#00FF00']
  },
  counts: {
    foliage: 25000,      // 增加粒子数量
    ornaments: 400,      // 更多照片
    elements: 300,       // 更多装饰
    lights: 600          // 更多彩灯
  },
  tree: { height: 22, radius: 9 },
  photos: { body: bodyPhotoPaths }
};

// --- Shader Material (增强版 Foliage) ---
const FoliageMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(CONFIG.colors.emerald), uProgress: 0 },
  `uniform float uTime; uniform float uProgress; attribute vec3 aTargetPos; attribute float aRandom;
  varying vec2 vUv; varying float vMix; varying float vRandom;
  float cubicInOut(float t) { return t < 0.5 ? 4.0 * t * t * t : 0.5 * pow(2.0 * t - 2.0, 3.0) + 1.0; }
  void main() {
    vUv = uv; vRandom = aRandom;
    // 增强的波动效果
    vec3 noise = vec3(
      sin(uTime * 2.0 + position.x * 0.5) * 0.2,
      cos(uTime * 1.5 + position.y * 0.5) * 0.2,
      sin(uTime * 1.8 + position.z * 0.5) * 0.2
    );
    // 添加闪烁效果
    float twinkle = sin(uTime * 3.0 + aRandom * 10.0) * 0.5 + 0.5;
    float t = cubicInOut(uProgress);
    vec3 finalPos = mix(position, aTargetPos + noise * (1.0 + twinkle * 0.3), t);
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_PointSize = (70.0 * (1.0 + aRandom * 0.5 + twinkle * 0.3)) / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    vMix = t;
  }`,
  `uniform vec3 uColor; varying float vMix; varying float vRandom;
  void main() {
    float r = distance(gl_PointCoord, vec2(0.5));
    if (r > 0.5) discard;
    // 增强的发光效果
    float glow = 1.0 - r * 2.0;
    glow = pow(glow, 1.5);
    vec3 finalColor = mix(uColor * 0.5, uColor * 2.0, vMix);
    finalColor += vec3(0.2, 0.5, 0.2) * glow * vRandom; // 绿色光晕
    gl_FragColor = vec4(finalColor, 0.9 + glow * 0.1);
  }`
);
extend({ FoliageMaterial });

// --- Helper: Tree Shape ---
const getTreePosition = () => {
  const h = CONFIG.tree.height; const rBase = CONFIG.tree.radius;
  const y = (Math.random() * h) - (h / 2); const normalizedY = (y + (h/2)) / h;
  const currentRadius = rBase * (1 - normalizedY); const theta = Math.random() * Math.PI * 2;
  const r = Math.random() * currentRadius;
  return [r * Math.cos(theta), y, r * Math.sin(theta)];
};

// --- Component: Foliage (增强版) ---
const Foliage = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const materialRef = useRef<any>(null);
  const { positions, targetPositions, randoms } = useMemo(() => {
    const count = CONFIG.counts.foliage;
    const positions = new Float32Array(count * 3);
    const targetPositions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const spherePoints = random.inSphere(new Float32Array(count * 3), { radius: 30 }) as Float32Array;
    for (let i = 0; i < count; i++) {
      positions[i*3] = spherePoints[i*3];
      positions[i*3+1] = spherePoints[i*3+1];
      positions[i*3+2] = spherePoints[i*3+2];
      const [tx, ty, tz] = getTreePosition();
      targetPositions[i*3] = tx;
      targetPositions[i*3+1] = ty;
      targetPositions[i*3+2] = tz;
      randoms[i] = Math.random();
    }
    return { positions, targetPositions, randoms };
  }, []);

  useFrame((rootState, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime = rootState.clock.elapsedTime;
      const targetProgress = state === 'FORMED' ? 1 : 0;
      materialRef.current.uProgress = MathUtils.damp(materialRef.current.uProgress, targetProgress, 2.0, delta);
    }
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aTargetPos" args={[targetPositions, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <foliageMaterial ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
};

// --- Component: Snowfall Effect (新增: 飘雪效果) ---
const Snowfall = () => {
  const count = 2000;
  const meshRef = useRef<THREE.Points>(null);
  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i*3] = (Math.random() - 0.5) * 100;
      positions[i*3+1] = Math.random() * 60 + 20;
      positions[i*3+2] = (Math.random() - 0.5) * 100;
      velocities[i] = 0.5 + Math.random() * 1.5;
    }
    return { positions, velocities };
  }, []);

  useFrame(() => {
    if (!meshRef.current) return;
    const positions = meshRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      positions[i*3+1] -= velocities[i] * 0.1;
      positions[i*3] += Math.sin(Date.now() * 0.001 + i) * 0.02;
      if (positions[i*3+1] < -10) {
        positions[i*3+1] = 60;
        positions[i*3] = (Math.random() - 0.5) * 100;
        positions[i*3+2] = (Math.random() - 0.5) * 100;
      }
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.3} color="#FFFFFF" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
    </points>
  );
};

// --- Component: Photo Ornaments (增强版) ---
const PhotoOrnaments = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const textures = useTexture(CONFIG.photos.body);
  const count = CONFIG.counts.ornaments;
  const groupRef = useRef<THREE.Group>(null);

  const borderGeometry = useMemo(() => new THREE.PlaneGeometry(1.2, 1.5), []);
  const photoGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*80, (Math.random()-0.5)*80, (Math.random()-0.5)*80);
      const h = CONFIG.tree.height; const y = (Math.random() * h) - (h / 2);
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) + 0.5;
      const theta = Math.random() * Math.PI * 2;
      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));

      const isBig = Math.random() < 0.2;
      const baseScale = isBig ? 2.2 : 0.8 + Math.random() * 0.6;
      const weight = 0.8 + Math.random() * 1.2;
      const borderColor = CONFIG.colors.borders[Math.floor(Math.random() * CONFIG.colors.borders.length)];

      const rotationSpeed = {
        x: (Math.random() - 0.5) * 1.5,
        y: (Math.random() - 0.5) * 1.5,
        z: (Math.random() - 0.5) * 1.5
      };
      const chaosRotation = new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);

      return {
        chaosPos, targetPos, scale: baseScale, weight,
        textureIndex: i % textures.length,
        borderColor,
        currentPos: chaosPos.clone(),
        chaosRotation,
        rotationSpeed,
        wobbleOffset: Math.random() * 10,
        wobbleSpeed: 0.5 + Math.random() * 0.5,
        glowIntensity: Math.random() // 新增: 发光强度
      };
    });
  }, [textures, count]);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;

    groupRef.current.children.forEach((group: any, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;

      objData.currentPos.lerp(target, delta * (isFormed ? 1.0 * objData.weight : 0.5));
      group.position.copy(objData.currentPos);

      if (isFormed) {
         const targetLookPos = new THREE.Vector3(group.position.x * 2, group.position.y + 0.5, group.position.z * 2);
         group.lookAt(targetLookPos);

         // 增强的摆动效果
         const wobbleX = Math.sin(time * objData.wobbleSpeed + objData.wobbleOffset) * 0.08;
         const wobbleZ = Math.cos(time * objData.wobbleSpeed * 0.8 + objData.wobbleOffset) * 0.08;
         group.rotation.x = wobbleX;
         group.rotation.z = wobbleZ;

         // 新增: 脉冲发光效果
         const pulse = (Math.sin(time * 2 + objData.wobbleOffset) + 1) * 0.5;
         if (group.children[0]?.children[0]?.material) {
           (group.children[0].children[0].material as any).emissiveIntensity = 0.5 + pulse * objData.glowIntensity;
         }
      } else {
         group.rotation.x += delta * objData.rotationSpeed.x;
         group.rotation.y += delta * objData.rotationSpeed.y;
         group.rotation.z += delta * objData.rotationSpeed.z;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => (
        <group key={i} scale={[obj.scale, obj.scale, obj.scale]} rotation={state === 'CHAOS' ? obj.chaosRotation : [0,0,0]}>
          {/* 正面 */}
          <group position={[0, 0, 0.015]}>
            <mesh geometry={photoGeometry}>
              <meshStandardMaterial
                map={textures[obj.textureIndex]}
                roughness={0.4} metalness={0.1}
                emissive={CONFIG.colors.white} emissiveMap={textures[obj.textureIndex]} emissiveIntensity={1.5}
                side={THREE.FrontSide}
              />
            </mesh>
            <mesh geometry={borderGeometry} position={[0, -0.15, -0.01]}>
              <meshStandardMaterial color={obj.borderColor} roughness={0.8} metalness={0.1} side={THREE.FrontSide} />
            </mesh>
          </group>
          {/* 背面 */}
          <group position={[0, 0, -0.015]} rotation={[0, Math.PI, 0]}>
            <mesh geometry={photoGeometry}>
              <meshStandardMaterial
                map={textures[obj.textureIndex]}
                roughness={0.4} metalness={0.1}
                emissive={CONFIG.colors.white} emissiveMap={textures[obj.textureIndex]} emissiveIntensity={1.5}
                side={THREE.FrontSide}
              />
            </mesh>
            <mesh geometry={borderGeometry} position={[0, -0.15, -0.01]}>
              <meshStandardMaterial color={obj.borderColor} roughness={0.8} metalness={0.1} side={THREE.FrontSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
};

// --- Component: Christmas Elements (增强版) ---
const ChristmasElements = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.elements;
  const groupRef = useRef<THREE.Group>(null);

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.8, 0.8), []);
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 16, 16), []);
  const caneGeometry = useMemo(() => new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const h = CONFIG.tree.height;
      const y = (Math.random() * h) - (h / 2);
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) * 0.95;
      const theta = Math.random() * Math.PI * 2;
      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));

      const type = Math.floor(Math.random() * 3);
      let color; let scale = 1;
      if (type === 0) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.8 + Math.random() * 0.4; }
      else if (type === 1) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.6 + Math.random() * 0.4; }
      else { color = Math.random() > 0.5 ? CONFIG.colors.red : CONFIG.colors.white; scale = 0.7 + Math.random() * 0.3; }

      const rotationSpeed = { x: (Math.random()-0.5)*2.5, y: (Math.random()-0.5)*2.5, z: (Math.random()-0.5)*2.5 };
      return {
        type, chaosPos, targetPos, color, scale,
        currentPos: chaosPos.clone(),
        chaosRotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI),
        rotationSpeed,
        pulseOffset: Math.random() * 10 // 新增: 脉冲偏移
      };
    });
  }, [boxGeometry, sphereGeometry, caneGeometry]);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;

    groupRef.current.children.forEach((child: any, i) => {
      const mesh = child;
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 2.0);
      mesh.position.copy(objData.currentPos);
      mesh.rotation.x += delta * objData.rotationSpeed.x;
      mesh.rotation.y += delta * objData.rotationSpeed.y;
      mesh.rotation.z += delta * objData.rotationSpeed.z;

      // 新增: 脉冲发光效果
      if (mesh.material && isFormed) {
        const pulse = (Math.sin(time * 3 + objData.pulseOffset) + 1) * 0.5;
        (mesh.material as any).emissiveIntensity = 0.3 + pulse * 0.5;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => {
        let geometry;
        if (obj.type === 0) geometry = boxGeometry;
        else if (obj.type === 1) geometry = sphereGeometry;
        else geometry = caneGeometry;
        return (
          <mesh key={i} scale={[obj.scale, obj.scale, obj.scale]} geometry={geometry} rotation={obj.chaosRotation}>
            <meshStandardMaterial
              color={obj.color}
              roughness={0.2}
              metalness={0.6}
              emissive={obj.color}
              emissiveIntensity={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
};

// --- Component: Fairy Lights (增强版) ---
const FairyLights = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.lights;
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.8, 8, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const h = CONFIG.tree.height;
      const y = (Math.random() * h) - (h / 2);
      const rBase = CONFIG.tree.radius;
      const currentRadius = (rBase * (1 - (y + (h/2)) / h)) + 0.3;
      const theta = Math.random() * Math.PI * 2;
      const targetPos = new THREE.Vector3(currentRadius * Math.cos(theta), y, currentRadius * Math.sin(theta));
      const color = CONFIG.colors.lights[Math.floor(Math.random() * CONFIG.colors.lights.length)];
      const speed = 2 + Math.random() * 4;
      return {
        chaosPos, targetPos, color, speed,
        currentPos: chaosPos.clone(),
        timeOffset: Math.random() * 100,
        baseIntensity: 3 + Math.random() * 2 // 新增: 基础强度
      };
    });
  }, []);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;

    groupRef.current.children.forEach((child: any, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 2.5);
      const mesh = child;
      mesh.position.copy(objData.currentPos);

      // 增强的闪烁效果
      const intensity = (Math.sin(time * objData.speed + objData.timeOffset) + 1) / 2;
      if (mesh.material) {
        (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = isFormed
          ? objData.baseIntensity + intensity * 5
          : intensity * 0.5;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => (
        <mesh key={i} scale={[0.18, 0.18, 0.18]} geometry={geometry}>
          <meshStandardMaterial
            color={obj.color}
            emissive={obj.color}
            emissiveIntensity={0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
};

// --- Component: Top Star (增强版) ---
const TopStar = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);

  const starShape = useMemo(() => {
    const shape = new THREE.Shape();
    const outerRadius = 1.5; const innerRadius = 0.8; const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      i === 0 ? shape.moveTo(radius*Math.cos(angle), radius*Math.sin(angle)) : shape.lineTo(radius*Math.cos(angle), radius*Math.sin(angle));
    }
    shape.closePath();
    return shape;
  }, []);

  const starGeometry = useMemo(() => {
    return new THREE.ExtrudeGeometry(starShape, {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.15,
      bevelSize: 0.15,
      bevelSegments: 3,
    });
  }, [starShape]);

  const goldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: CONFIG.colors.gold,
    emissive: CONFIG.colors.gold,
    emissiveIntensity: 2.5,
    roughness: 0.05,
    metalness: 1.0,
  }), []);

  useFrame((stateObj, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.6;
      // 增强的脉冲效果
      const pulse = (Math.sin(stateObj.clock.elapsedTime * 2) + 1) * 0.5;
      const targetScale = state === 'FORMED' ? 1 + pulse * 0.1 : 0;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 3);

      // 新增: 颜色脉冲
      if (goldMaterial.emissiveIntensity) {
        goldMaterial.emissiveIntensity = 2.0 + pulse * 1.5;
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, CONFIG.tree.height / 2 + 1.8, 0]}>
      <Float speed={2.5} rotationIntensity={0.3} floatIntensity={0.3}>
        <mesh geometry={starGeometry} material={goldMaterial} />
        {/* 新增: 光晕效果 */}
        <pointLight color={CONFIG.colors.gold} intensity={10} distance={20} />
      </Float>
    </group>
  );
};

// --- Component: Light Rays (新增: 光束效果) ---
const LightRays = () => {
  const groupRef = useRef<THREE.Group>(null);

  const rays = useMemo(() => {
    return new Array(12).fill(0).map((_, i) => ({
      rotation: (i / 12) * Math.PI * 2,
      length: 30 + Math.random() * 20,
      width: 2 + Math.random() * 2,
      speed: 0.2 + Math.random() * 0.3
    }));
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const time = state.clock.elapsedTime;

    groupRef.current.children.forEach((mesh: any, i) => {
      const ray = rays[i];
      const intensity = (Math.sin(time * ray.speed + i) + 1) * 0.5;
      mesh.material.opacity = 0.02 + intensity * 0.04;
      mesh.scale.y = 1 + intensity * 0.3;
    });
  });

  return (
    <group ref={groupRef} position={[0, 25, 0]}>
      {rays.map((ray, i) => (
        <mesh key={i} rotation={[0, ray.rotation, 0]} position={[0, -ray.length / 2, 0]}>
          <planeGeometry args={[ray.width, ray.length]} />
          <meshBasicMaterial
            color="#FFE082"
            transparent
            opacity={0.03}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};

// --- Main Scene Experience (增强版) ---
const Experience = ({ sceneState, rotationSpeed }: { sceneState: 'CHAOS' | 'FORMED', rotationSpeed: number }) => {
  const controlsRef = useRef<any>(null);
  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + rotationSpeed);
      controlsRef.current.update();
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 8, 60]} fov={45} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={true}
        minDistance={30}
        maxDistance={120}
        autoRotate={rotationSpeed === 0 && sceneState === 'FORMED'}
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 1.7}
      />

      <color attach="background" args={['#000200']} />
      <Stars radius={120} depth={60} count={6000} factor={4} saturation={0} fade speed={1.5} />
      <Environment preset="night" background={false} />

      <ambientLight intensity={0.5} color="#002200" />
      <pointLight position={[30, 30, 30]} intensity={150} color={CONFIG.colors.warmLight} />
      <pointLight position={[-30, 10, -30]} intensity={80} color={CONFIG.colors.gold} />
      <pointLight position={[0, -20, 10]} intensity={50} color="#ffffff" />
      <pointLight position={[20, 40, 20]} intensity={100} color="#FF69B4" />

      <group position={[0, -6, 0]}>
        <Foliage state={sceneState} />
        <Suspense fallback={null}>
           <PhotoOrnaments state={sceneState} />
           <ChristmasElements state={sceneState} />
           <FairyLights state={sceneState} />
           <TopStar state={sceneState} />
        </Suspense>
        {/* 增强的火花效果 */}
        <Sparkles count={1000} scale={55} size={10} speed={0.5} opacity={0.5} color={CONFIG.colors.gold} />
        <Sparkles count={800} scale={50} size={6} speed={0.3} opacity={0.4} color={CONFIG.colors.silver} />
      </group>

      {/* 新增: 飘雪效果 */}
      <Snowfall />

      {/* 新增: 光束效果 */}
      <LightRays />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.6}
          luminanceSmoothing={0.9}
          intensity={2.5}
          radius={0.7}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
        <ChromaticAberration offset={[0.0005, 0.0005]} modulationOffset={0} radialModulation={false} />
      </EffectComposer>
    </>
  );
};

// --- Gesture Controller ---
const GestureController = ({ onGesture, onMove, onStatus, debugMode }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let gestureRecognizer: GestureRecognizer;
    let requestRef: number;

    const setup = async () => {
      onStatus("DOWNLOADING AI...");
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        onStatus("REQUESTING CAMERA...");
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            onStatus("AI READY: SHOW HAND");
            predictWebcam();
          }
        } else {
            onStatus("ERROR: CAMERA PERMISSION DENIED");
        }
      } catch (err: any) {
        onStatus(`ERROR: ${err.message || 'MODEL FAILED'}`);
      }
    };

    const predictWebcam = () => {
      if (gestureRecognizer && videoRef.current && canvasRef.current) {
        if (videoRef.current.videoWidth > 0) {
            const results = gestureRecognizer.recognizeForVideo(videoRef.current, Date.now());
            const ctx = canvasRef.current.getContext("2d");
            if (ctx && debugMode) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                if (results.landmarks) {
                  for (const landmarks of results.landmarks) {
                        const drawingUtils = new DrawingUtils(ctx);
                        drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: "#FFD700", lineWidth: 2 });
                        drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1 });
                  }
                }
            } else if (ctx && !debugMode) {
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }

            if (results.gestures.length > 0) {
              const name = results.gestures[0][0].categoryName;
              const score = results.gestures[0][0].score;
              if (score > 0.4) {
                 if (name === "Open_Palm") onGesture("CHAOS");
                 if (name === "Closed_Fist") onGesture("FORMED");
                 if (debugMode) onStatus(`DETECTED: ${name}`);
              }
              if (results.landmarks.length > 0) {
                const speed = (0.5 - results.landmarks[0][0].x) * 0.15;
                onMove(Math.abs(speed) > 0.01 ? speed : 0);
              }
            } else {
              onMove(0);
              if (debugMode) onStatus("AI READY: NO HAND");
            }
        }
        requestRef = requestAnimationFrame(predictWebcam);
      }
    };
    setup();
    return () => cancelAnimationFrame(requestRef);
  }, [onGesture, onMove, onStatus, debugMode]);

  return (
    <>
      <video
        ref={videoRef}
        style={{
          opacity: debugMode ? 0.6 : 0,
          position: 'fixed',
          top: 0,
          right: 0,
          width: debugMode ? '320px' : '1px',
          zIndex: debugMode ? 100 : -1,
          pointerEvents: 'none',
          transform: 'scaleX(-1)'
        }}
        playsInline
        muted
        autoPlay
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: debugMode ? '320px' : '1px',
          height: debugMode ? 'auto' : '1px',
          zIndex: debugMode ? 101 : -1,
          pointerEvents: 'none',
          transform: 'scaleX(-1)'
        }}
      />
    </>
  );
};

// --- App Entry (增强版 UI) ---
export default function GrandTreeApp() {
  const [sceneState, setSceneState] = useState<'CHAOS' | 'FORMED'>('CHAOS');
  const [rotationSpeed, setRotationSpeed] = useState(0);
  const [aiStatus, setAiStatus] = useState("INITIALIZING...");
  const [debugMode, setDebugMode] = useState(false);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
        <Canvas dpr={[1, 2]} gl={{ toneMapping: THREE.ReinhardToneMapping }} shadows>
            <Experience sceneState={sceneState} rotationSpeed={rotationSpeed} />
        </Canvas>
      </div>
      <GestureController onGesture={setSceneState} onMove={setRotationSpeed} onStatus={setAiStatus} debugMode={debugMode} />

      {/* UI - Stats (增强版) */}
      <div style={{ position: 'absolute', bottom: '30px', left: '40px', color: '#888', zIndex: 10, fontFamily: 'sans-serif', userSelect: 'none' }}>
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Memories</p>
          <p style={{ fontSize: '24px', color: '#FFD700', fontWeight: 'bold', margin: 0, textShadow: '0 0 20px rgba(255, 215, 0, 0.5)' }}>
            {CONFIG.counts.ornaments.toLocaleString()} <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>POLAROIDS</span>
          </p>
        </div>
        <div>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Foliage</p>
          <p style={{ fontSize: '24px', color: '#00FF41', fontWeight: 'bold', margin: 0, textShadow: '0 0 20px rgba(0, 255, 65, 0.5)' }}>
            {(CONFIG.counts.foliage / 1000).toFixed(0)}K <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>EMERALD NEEDLES</span>
          </p>
        </div>
        <div style={{ marginTop: '15px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Lights</p>
          <p style={{ fontSize: '24px', color: '#FF0080', fontWeight: 'bold', margin: 0, textShadow: '0 0 20px rgba(255, 0, 128, 0.5)' }}>
            {CONFIG.counts.lights.toLocaleString()} <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>FAIRY LIGHTS</span>
          </p>
        </div>
      </div>

      {/* UI - Buttons (增强版) */}
      <div style={{ position: 'absolute', bottom: '30px', right: '40px', zIndex: 10, display: 'flex', gap: '10px' }}>
        <button
          onClick={() => setDebugMode(!debugMode)}
          style={{
            padding: '12px 15px',
            backgroundColor: debugMode ? '#FFD700' : 'rgba(0,0,0,0.6)',
            border: `2px solid ${debugMode ? '#FFD700' : '#FFD700'}`,
            color: debugMode ? '#000' : '#FFD700',
            fontFamily: 'sans-serif',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            borderRadius: '8px',
            boxShadow: debugMode ? '0 0 20px rgba(255, 215, 0, 0.5)' : 'none',
            transition: 'all 0.3s ease'
          }}
        >
           {debugMode ? 'HIDE DEBUG' : '🛠 DEBUG'}
        </button>
        <button
          onClick={() => setSceneState(s => s === 'CHAOS' ? 'FORMED' : 'CHAOS')}
          style={{
            padding: '12px 30px',
            backgroundColor: 'rgba(0,0,0,0.6)',
            border: '2px solid #FFD700',
            color: '#FFD700',
            fontFamily: 'serif',
            fontSize: '14px',
            fontWeight: 'bold',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            borderRadius: '8px',
            boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
            transition: 'all 0.3s ease'
          }}
        >
           {sceneState === 'CHAOS' ? '✨ Assemble Tree' : '✨ Disperse'}
        </button>
      </div>

      {/* UI - Title (新增) */}
      <div style={{
        position: 'absolute',
        top: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        textAlign: 'center'
      }}>
        <h1 style={{
          fontFamily: 'serif',
          fontSize: '48px',
          fontWeight: 'bold',
          color: '#FFD700',
          margin: 0,
          textShadow: '0 0 30px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 0, 128, 0.4)',
          letterSpacing: '8px'
        }}>
          🎄 CHRISTMAS 🎄
        </h1>
        <p style={{
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: 'rgba(255, 255, 255, 0.6)',
          letterSpacing: '4px',
          marginTop: '10px'
        }}>
          GRAND LUXURY INTERACTIVE 3D
        </p>
      </div>

      {/* UI - AI Status */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '40px',
        color: aiStatus.includes('ERROR') ? '#FF0000' : 'rgba(255, 215, 0, 0.6)',
        fontSize: '10px',
        letterSpacing: '2px',
        zIndex: 10,
        background: 'rgba(0,0,0,0.6)',
        padding: '6px 12px',
        borderRadius: '20px',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        backdropFilter: 'blur(8px)'
      }}>
        {aiStatus}
      </div>

      {/* UI - Gesture Guide (新增) */}
      <div style={{
        position: 'absolute',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: '11px',
        letterSpacing: '1px',
        zIndex: 10,
        textAlign: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: '8px 16px',
        borderRadius: '20px'
      }}>
        🖐 Open: Disperse | ✊ Fist: Assemble | 👋 Move: Rotate
      </div>
    </div>
  );
}
