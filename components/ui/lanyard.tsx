/* eslint-disable react/no-unknown-property */
'use client';
import {useEffect, useRef, useState} from 'react';
import {Canvas, extend, useFrame} from '@react-three/fiber';
import {useGLTF, useTexture, Environment, Lightformer} from '@react-three/drei';
import {
    BallCollider,
    CuboidCollider,
    Physics,
    RigidBody,
    useRopeJoint,
    useSphericalJoint,
    RigidBodyProps
} from '@react-three/rapier';
import {MeshLineGeometry, MeshLineMaterial} from 'meshline';
import * as THREE from 'three';
import clsx from 'clsx';

const cardGLB = '/card.glb';

extend({MeshLineGeometry, MeshLineMaterial});

interface LanyardProps {
    position?: [number, number, number];
    gravity?: [number, number, number];
    fov?: number;
    transparent?: boolean;
    containerClassName?: string;
    frontTextureUrl?: string;
    backTextureUrl?: string;
    canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export default function Lanyard({
                                    position = [0, 0, 30],
                                    gravity = [0, -40, 0],
                                    fov = 20,
                                    transparent = true,
                                    containerClassName,
                                    frontTextureUrl = '/images/sajtmaskin-card-front.png',
                                    backTextureUrl = '/images/sajtmaskin-card-back.png',
                                    canvasRef
                                }: LanyardProps) {
    const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);

    useEffect(() => {
        const handleResize = (): void => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div
            className={clsx(containerClassName || "relative z-0 w-full h-screen flex justify-center items-center transform scale-100 origin-center")}>
            <Canvas
                ref={canvasRef}
                camera={{position, fov}}
                dpr={[1, isMobile ? 1.5 : 2]}
                gl={{alpha: transparent, preserveDrawingBuffer: true}}
                onCreated={({gl}) => gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1)}
            >
                <ambientLight intensity={Math.PI}/>
                <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
                    <Band
                        isMobile={isMobile}
                        frontTextureUrl={frontTextureUrl}
                        backTextureUrl={backTextureUrl}
                    />
                </Physics>
                <Environment blur={0.75}>
                    <Lightformer
                        intensity={2}
                        color="white"
                        position={[0, -1, 5]}
                        rotation={[0, 0, Math.PI / 3]}
                        scale={[100, 0.1, 1]}
                    />
                    <Lightformer
                        intensity={3}
                        color="white"
                        position={[-1, -1, 1]}
                        rotation={[0, 0, Math.PI / 3]}
                        scale={[100, 0.1, 1]}
                    />
                    <Lightformer
                        intensity={3}
                        color="white"
                        position={[1, 1, 1]}
                        rotation={[0, 0, Math.PI / 3]}
                        scale={[100, 0.1, 1]}
                    />
                    <Lightformer
                        intensity={10}
                        color="white"
                        position={[-10, 0, 14]}
                        rotation={[0, Math.PI / 2, Math.PI / 3]}
                        scale={[100, 10, 1]}
                    />
                </Environment>
            </Canvas>
        </div>
    );
}

interface BandProps {
    maxSpeed?: number;
    minSpeed?: number;
    isMobile?: boolean;
    frontTextureUrl: string;
    backTextureUrl: string;
}

function Band({
    maxSpeed = 50,
    minSpeed = 0,
    isMobile = false,
    frontTextureUrl,
    backTextureUrl
}: BandProps) {
    // Using "any" for refs since the exact types depend on Rapier's internals
    const band = useRef<any>(null);
    const fixed = useRef<any>(null);
    const j1 = useRef<any>(null);
    const j2 = useRef<any>(null);
    const j3 = useRef<any>(null);
    const card = useRef<any>(null);

    const vec = new THREE.Vector3();
    const ang = new THREE.Vector3();
    const rot = new THREE.Vector3();
    const dir = new THREE.Vector3();

    const segmentProps: any = {
        type: 'dynamic' as RigidBodyProps['type'],
        canSleep: true,
        colliders: false,
        angularDamping: 4,
        linearDamping: 4
    };

    const {nodes, materials} = useGLTF(cardGLB) as any;
    const texture = useTexture('/lanyard-sm.svg') as THREE.Texture;
    const [frontTexture, backTexture] = useTexture([
        frontTextureUrl,
        backTextureUrl
    ]) as THREE.Texture[];

    [frontTexture, backTexture].forEach((cardTexture) => {
        cardTexture.colorSpace = THREE.SRGBColorSpace;
        cardTexture.anisotropy = 16;
        cardTexture.minFilter = THREE.LinearMipmapLinearFilter;
        cardTexture.magFilter = THREE.LinearFilter;
    });
    const [curve] = useState(
        () =>
            new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])
    );
    const [dragged, drag] = useState<false | THREE.Vector3>(false);
    const [hovered, hover] = useState(false);
    const [ropeReady, setRopeReady] = useState(false);

    useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
    useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
    useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
    useSphericalJoint(j3, card, [
        [0, 0, 0],
        [0, 1.45, 0]
    ]);

    useEffect(() => {
        if (hovered) {
            document.body.style.cursor = dragged ? 'grabbing' : 'grab';
            return () => {
                document.body.style.cursor = 'auto';
            };
        }
    }, [hovered, dragged]);

    useFrame((state, delta) => {
        if (dragged && typeof dragged !== 'boolean') {
            vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
            dir.copy(vec).sub(state.camera.position).normalize();
            vec.add(dir.multiplyScalar(state.camera.position.length()));
            [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
            card.current?.setNextKinematicTranslation({
                x: vec.x - dragged.x,
                y: vec.y - dragged.y,
                z: vec.z - dragged.z
            });
        }
        // Rapier-refs monteras över flera frames; vänta tills hela kedjan finns
        // så MeshLine aldrig får ofullständiga/NaN-koordinater.
        if (fixed.current && j1.current && j2.current && j3.current && card.current) {
            const translations = [fixed, j1, j2, j3].map((ref) => ref.current.translation());
            const chainIsReady = translations.every(({x, y, z}) =>
                Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
            );
            if (!chainIsReady) return;
            if (!band.current) {
                if (!ropeReady) setRopeReady(true);
                return;
            }

            [j1, j2].forEach(ref => {
                if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
                const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
                ref.current.lerped.lerp(
                    ref.current.translation(),
                    delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
                );
            });
            curve.points[0].copy(j3.current.translation());
            curve.points[1].copy(j2.current.lerped);
            curve.points[2].copy(j1.current.lerped);
            curve.points[3].copy(fixed.current.translation());
            band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
            ang.copy(card.current.angvel());
            rot.copy(card.current.rotation());
            card.current.setAngvel({x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z});
        }
    });

    curve.curveType = 'chordal';
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

    return (
        <>
            <group position={[0, 4, 0]}>
                <RigidBody ref={fixed} {...segmentProps} type={'fixed' as RigidBodyProps['type']}/>
                <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps} type={'dynamic' as RigidBodyProps['type']}>
                    <BallCollider args={[0.1]}/>
                </RigidBody>
                <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps} type={'dynamic' as RigidBodyProps['type']}>
                    <BallCollider args={[0.1]}/>
                </RigidBody>
                <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps} type={'dynamic' as RigidBodyProps['type']}>
                    <BallCollider args={[0.1]}/>
                </RigidBody>
                <RigidBody
                    position={[2, 0, 0]}
                    ref={card}
                    {...segmentProps}
                    type={dragged ? ('kinematicPosition' as RigidBodyProps['type']) : ('dynamic' as RigidBodyProps['type'])}
                >
                    <CuboidCollider args={[0.8, 1.125, 0.01]}/>
                    <group
                        scale={2.25}
                        position={[0, -1.2, -0.05]}
                        onPointerOver={() => hover(true)}
                        onPointerOut={() => hover(false)}
                        onPointerUp={(e: any) => {
                            e.target.releasePointerCapture(e.pointerId);
                            drag(false);
                        }}
                        onPointerDown={(e: any) => {
                            e.target.setPointerCapture(e.pointerId);
                            drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())));
                        }}
                    >
                        {/* GLB-kroppen ger kortet en riktig mörk kant och fysisk tjocklek. */}
                        <mesh geometry={nodes.card.geometry}>
                            <meshPhysicalMaterial
                                color="#050706"
                                clearcoat={isMobile ? 0 : 0.65}
                                clearcoatRoughness={0.22}
                                roughness={0.72}
                                metalness={0.35}
                            />
                        </mesh>

                        {/* Tunna separata ytor undviker spegelvänd text och bevarar kortets fysik. */}
                        <mesh position={[0, 0, 0.012]}>
                            <planeGeometry args={[0.69, 1.025]} />
                            <meshBasicMaterial map={frontTexture} toneMapped={false} />
                        </mesh>
                        <mesh position={[0, 0, -0.012]} rotation={[0, Math.PI, 0]}>
                            <planeGeometry args={[0.665, 1.025]} />
                            <meshBasicMaterial map={backTexture} toneMapped={false} />
                        </mesh>
                        <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={0.3}/>
                        <mesh geometry={nodes.clamp.geometry} material={materials.metal}/>
                    </group>
                </RigidBody>
            </group>
            {ropeReady && (
                <mesh ref={band} frustumCulled={false}>
                    <meshLineGeometry/>
                    <meshLineMaterial
                        color="white"
                        depthTest={false}
                        resolution={isMobile ? [1000, 2000] : [1000, 1000]}
                        useMap
                        map={texture}
                        repeat={[-4, 1]}
                        lineWidth={1}
                    />
                </mesh>
            )}
        </>
    );
}
