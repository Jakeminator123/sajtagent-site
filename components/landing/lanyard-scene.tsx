'use client'

import { Suspense, useRef, useState } from 'react'
import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber'
import { Environment, RoundedBox } from '@react-three/drei'
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'

function RopeSegment({
  bodyRef,
  previousRef,
  position,
}: {
  bodyRef: React.RefObject<RapierRigidBody | null>
  previousRef: React.RefObject<RapierRigidBody | null>
  position: [number, number, number]
}) {
  useRopeJoint(previousRef, bodyRef, [[0, 0, 0], [0, 0, 0], 0.64])

  return (
    <RigidBody ref={bodyRef} position={position} colliders={false} linearDamping={4} angularDamping={4}>
      <BallCollider args={[0.12]} />
      <mesh castShadow>
        <sphereGeometry args={[0.115, 14, 14]} />
        <meshStandardMaterial color="#19b8b0" roughness={0.45} />
      </mesh>
    </RigidBody>
  )
}

function Badge({ previousRef }: { previousRef: React.RefObject<RapierRigidBody | null> }) {
  const badge = useRef<RapierRigidBody>(null)
  const [dragging, setDragging] = useState(false)
  const target = useRef(new THREE.Vector3())
  useRopeJoint(previousRef, badge, [[0, 0, 0], [0, 1.08, 0], 1.16])

  useFrame(() => {
    if (!dragging || !badge.current) return
    const p = badge.current.translation()
    badge.current.setLinvel(
      { x: (target.current.x - p.x) * 8, y: (target.current.y - p.y) * 8, z: (target.current.z - p.z) * 8 },
      true
    )
  })

  const updateTarget = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    target.current.copy(event.point)
  }

  return (
    <RigidBody
      ref={badge}
      position={[0, -0.52, 0]}
      colliders={false}
      linearDamping={2.4}
      angularDamping={2.8}
      enabledRotations={[true, true, true]}
    >
      <CuboidCollider args={[1.68, 1.16, 0.13]} />
      <group
        onPointerDown={(event) => {
          updateTarget(event)
          setDragging(true)
          event.target.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => dragging && updateTarget(event)}
        onPointerUp={(event) => {
          setDragging(false)
          event.target.releasePointerCapture(event.pointerId)
        }}
      >
        <RoundedBox args={[3.35, 2.3, 0.26]} radius={0.16} smoothness={6} castShadow>
          <meshStandardMaterial color="#edf0e9" roughness={0.32} metalness={0.05} />
        </RoundedBox>
        <mesh position={[0, 0, 0.145]}>
          <planeGeometry args={[3.02, 1.96]} />
          <meshStandardMaterial color="#101113" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.83, 0.18]}>
          <planeGeometry args={[2.64, 0.05]} />
          <meshBasicMaterial color="#19b8b0" />
        </mesh>
        <group position={[0, 0.05, 0.19]}>
          <mesh>
            <planeGeometry args={[2.5, 0.64]} />
            <meshBasicMaterial color="#101113" transparent opacity={0} />
          </mesh>
        </group>
      </group>
    </RigidBody>
  )
}

function LanyardPhysics() {
  const anchor = useRef<RapierRigidBody>(null)
  const s1 = useRef<RapierRigidBody>(null)
  const s2 = useRef<RapierRigidBody>(null)
  const s3 = useRef<RapierRigidBody>(null)
  const s4 = useRef<RapierRigidBody>(null)

  return (
    <>
      <RigidBody ref={anchor} type="fixed" position={[0, 3.2, 0]} colliders={false}>
        <BallCollider args={[0.08]} />
      </RigidBody>
      <RopeSegment bodyRef={s1} previousRef={anchor} position={[0, 2.56, 0]} />
      <RopeSegment bodyRef={s2} previousRef={s1} position={[0, 1.92, 0]} />
      <RopeSegment bodyRef={s3} previousRef={s2} position={[0, 1.28, 0]} />
      <RopeSegment bodyRef={s4} previousRef={s3} position={[0, 0.64, 0]} />
      <Badge previousRef={s4} />
    </>
  )
}

export default function LanyardScene() {
  return (
    <div className="relative h-full min-h-[430px] w-full cursor-grab active:cursor-grabbing" aria-label="Interaktiv Sajtmaskin-bricka">
      <Canvas camera={{ position: [0, 0.2, 8.2], fov: 42 }} dpr={[1, 1.5]} shadows>
        <color attach="background" args={['#0d0f10']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[4, 7, 5]} intensity={2.8} castShadow />
        <Suspense fallback={null}>
          <Physics gravity={[0, -8.5, 0]} timeStep="vary">
            <LanyardPhysics />
          </Physics>
          <Environment preset="studio" />
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-28">
        <div className="text-center font-mono text-foreground">
          <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">AI-webbplatsstudio</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">SAJTMASKIN</p>
          <p className="mt-2 text-xs text-muted-foreground">Dra i kortet</p>
        </div>
      </div>
    </div>
  )
}
