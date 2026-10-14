import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'

function Coach({ x, locomotive = false }) {
  const windows = locomotive ? [-0.25, 0.2] : [-0.45, 0, 0.45]
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.77, 0]} castShadow>
        <boxGeometry args={[locomotive ? 1.52 : 1.38, locomotive ? 0.7 : 0.62, 0.86]} />
        <meshStandardMaterial color={locomotive ? '#c5d8d9' : '#244a58'} metalness={0.38} roughness={0.42} />
      </mesh>
      {locomotive && (
        <mesh position={[0.38, 1.14, 0]} castShadow>
          <boxGeometry args={[0.56, 0.24, 0.74]} />
          <meshStandardMaterial color="#d6e3e1" metalness={0.3} roughness={0.38} />
        </mesh>
      )}
      <mesh position={[0, 0.98, 0]}>
        <boxGeometry args={[locomotive ? 1.3 : 1.25, 0.055, 0.88]} />
        <meshStandardMaterial color="#102d38" metalness={0.18} roughness={0.65} />
      </mesh>
      {windows.map((windowX) => (
        <mesh key={`near-${windowX}`} position={[windowX, 0.82, 0.436]}>
          <boxGeometry args={[0.2, 0.2, 0.025]} />
          <meshStandardMaterial color="#a7dfe6" emissive="#2f8091" emissiveIntensity={0.6} metalness={0.1} roughness={0.2} />
        </mesh>
      ))}
      {!locomotive && windows.map((windowX) => (
        <mesh key={`far-${windowX}`} position={[windowX, 0.82, -0.436]}>
          <boxGeometry args={[0.2, 0.2, 0.025]} />
          <meshStandardMaterial color="#8bc9d1" emissive="#2f8091" emissiveIntensity={0.25} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[locomotive ? 0.78 : 0, 0.54, 0]}>
        <boxGeometry args={[locomotive ? 0.08 : 1.23, 0.045, 0.89]} />
        <meshStandardMaterial color="#d6a65e" metalness={0.5} roughness={0.36} />
      </mesh>
      {[-0.45, 0.45].map((wheelX) => [-0.32, 0.32].map((wheelZ) => (
        <mesh key={`${wheelX}-${wheelZ}`} position={[wheelX, 0.27, wheelZ]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.1, 10]} />
          <meshStandardMaterial color="#1b252b" metalness={0.65} roughness={0.48} />
        </mesh>
      )))}
      {locomotive && (
        <mesh position={[0.79, 0.66, 0.18]}>
          <sphereGeometry args={[0.075, 10, 8]} />
          <meshStandardMaterial color="#f3c476" emissive="#f3b957" emissiveIntensity={1.6} />
        </mesh>
      )}
    </group>
  )
}

function Track() {
  const sleepers = Array.from({ length: 31 }, (_, index) => (index - 15) * 0.58)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <planeGeometry args={[24, 12]} />
        <meshStandardMaterial color="#17323b" roughness={1} />
      </mesh>
      {[-0.48, 0.48].map((z) => (
        <mesh key={z} position={[0, 0.12, z]}>
          <boxGeometry args={[23, 0.07, 0.065]} />
          <meshStandardMaterial color="#b2c2c3" metalness={0.72} roughness={0.28} />
        </mesh>
      ))}
      {sleepers.map((x) => (
        <mesh key={x} position={[x, 0.055, 0]}>
          <boxGeometry args={[0.13, 0.08, 1.38]} />
          <meshStandardMaterial color="#554b3d" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 1.58]}>
        <boxGeometry args={[10, 0.1, 0.5]} />
        <meshStandardMaterial color="#34454a" roughness={0.85} />
      </mesh>
      <mesh position={[-3.1, 1.5, -2.2]} scale={[2.8, 1.15, 1]}>
        <sphereGeometry args={[1.4, 18, 12]} />
        <meshStandardMaterial color="#1d4048" roughness={1} />
      </mesh>
      <mesh position={[3.6, 1.3, -2.8]} scale={[3, 1.4, 1]}>
        <sphereGeometry args={[1.4, 18, 12]} />
        <meshStandardMaterial color="#16343d" roughness={1} />
      </mesh>
      <mesh position={[-4, 3.4, -4]}>
        <sphereGeometry args={[0.72, 18, 14]} />
        <meshBasicMaterial color="#d8aa67" />
      </mesh>
    </group>
  )
}

function MovingTrain() {
  const train = useRef(null)
  const direction = useRef(1)
  useFrame((_state, delta) => {
    if (!train.current || document.visibilityState === 'hidden') return
    train.current.position.x += Math.min(delta, 0.05) * 0.22 * direction.current
    if (train.current.position.x > 0.48 || train.current.position.x < -0.48) direction.current *= -1
  })
  return (
    <group ref={train} position={[0, 0, -0.15]}>
      <Coach x={-1.65} />
      <Coach x={-0.2} />
      <Coach x={1.25} locomotive />
    </group>
  )
}

function RailwayScene({ onContextLost }) {
  return (
    <Canvas
      className="train-canvas"
      dpr={[1, 1.25]}
      camera={{ position: [4.8, 3.5, 8], fov: 34 }}
      gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault()
        onContextLost()
      }, { once: true })}
    >
      <ambientLight intensity={1.25} />
      <directionalLight position={[-3, 6, 5]} intensity={2.2} color="#d9eff2" />
      <pointLight position={[-4, 3, -2]} intensity={7} distance={12} color="#e4b96f" />
      <Track />
      <MovingTrain />
    </Canvas>
  )
}

export default function TrainExperience({ onContextLost }) {
  return <RailwayScene onContextLost={onContextLost} />
}
