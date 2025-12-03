import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Mood } from '../types';

interface BMO3DProps {
  mood: Mood;
  isSpeaking: boolean;
  isListening: boolean;
}

export const BMO3D: React.FC<BMO3DProps> = ({ mood, isSpeaking, isListening }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bmoRef = useRef<THREE.Group | null>(null);
  const leftArmRef = useRef<THREE.Group | null>(null);
  const rightArmRef = useRef<THREE.Group | null>(null);
  const leftLegRef = useRef<THREE.Group | null>(null);
  const rightLegRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x57c4d8);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 8;
    camera.position.y = 0.5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Create BMO group (main container)
    const bmo = new THREE.Group();
    bmoRef.current = bmo;

    // BMO Body (main console)
    const bodyGeometry = new THREE.BoxGeometry(2.5, 3, 0.5);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x5dcdce,
      shininess: 30
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    bmo.add(body);

    // Screen (darker inset)
    const screenGeometry = new THREE.BoxGeometry(2.2, 1.8, 0.1);
    const screenMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x8ee4d4,
      emissive: 0x4fb8b9,
      emissiveIntensity: 0.2
    });
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.set(0, 0.5, 0.26);
    bmo.add(screen);

    // Face elements will be added based on mood
    // (We'll update these in the animation loop)

    // Left Eye
    const eyeGeometry = new THREE.CircleGeometry(0.15, 32);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.4, 0.7, 0.31);
    bmo.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.set(0.4, 0.7, 0.31);
    bmo.add(rightEye);

    // Mouth (smile)
    const mouthShape = new THREE.Shape();
    mouthShape.moveTo(-0.4, 0);
    mouthShape.quadraticCurveTo(0, -0.2, 0.4, 0);
    const mouthGeometry = new THREE.ShapeGeometry(mouthShape);
    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x2d6d6e });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, 0.3, 0.31);
    bmo.add(mouth);

    // Buttons panel (lower body)
    const buttonPanelGeometry = new THREE.BoxGeometry(2.3, 1, 0.1);
    const buttonPanelMaterial = new THREE.MeshPhongMaterial({ color: 0x4fb8b9 });
    const buttonPanel = new THREE.Mesh(buttonPanelGeometry, buttonPanelMaterial);
    buttonPanel.position.set(0, -1, 0.26);
    bmo.add(buttonPanel);

    // LEFT ARM
    const leftArm = new THREE.Group();
    leftArmRef.current = leftArm;
    
    const armGeometry = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8);
    const armMaterial = new THREE.MeshPhongMaterial({ color: 0x2d6d6e });
    
    const leftArmMesh = new THREE.Mesh(armGeometry, armMaterial);
    leftArmMesh.rotation.z = Math.PI / 2;
    leftArm.add(leftArmMesh);
    
    // Hand
    const handGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const hand = new THREE.Mesh(handGeometry, armMaterial);
    hand.position.set(-0.6, 0, 0);
    leftArm.add(hand);
    
    leftArm.position.set(-1.5, 0.5, 0);
    bmo.add(leftArm);

    // RIGHT ARM
    const rightArm = new THREE.Group();
    rightArmRef.current = rightArm;
    
    const rightArmMesh = new THREE.Mesh(armGeometry, armMaterial);
    rightArmMesh.rotation.z = Math.PI / 2;
    rightArm.add(rightArmMesh);
    
    const rightHand = new THREE.Mesh(handGeometry, armMaterial);
    rightHand.position.set(0.6, 0, 0);
    rightArm.add(rightHand);
    
    rightArm.position.set(1.5, 0.5, 0);
    bmo.add(rightArm);

    // LEFT LEG
    const leftLeg = new THREE.Group();
    leftLegRef.current = leftLeg;
    
    const legGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const leftLegMesh = new THREE.Mesh(legGeometry, armMaterial);
    leftLeg.add(leftLegMesh);
    
    // Foot
    const footGeometry = new THREE.BoxGeometry(0.3, 0.15, 0.4);
    const foot = new THREE.Mesh(footGeometry, armMaterial);
    foot.position.set(0, -0.5, 0.1);
    leftLeg.add(foot);
    
    leftLeg.position.set(-0.6, -2.1, 0);
    bmo.add(leftLeg);

    // RIGHT LEG
    const rightLeg = new THREE.Group();
    rightLegRef.current = rightLeg;
    
    const rightLegMesh = new THREE.Mesh(legGeometry, armMaterial);
    rightLeg.add(rightLegMesh);
    
    const rightFoot = new THREE.Mesh(footGeometry, armMaterial);
    rightFoot.position.set(0, -0.5, 0.1);
    rightLeg.add(rightFoot);
    
    rightLeg.position.set(0.6, -2.1, 0);
    bmo.add(rightLeg);

    scene.add(bmo);

    // Animation variables
    let time = 0;

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      time += 0.016; // ~60fps

      if (bmo) {
        // Floating animation (gentle bobbing)
        bmo.position.y = Math.sin(time * 2) * 0.2;
        
        // Gentle rotation/sway
        bmo.rotation.y = Math.sin(time * 0.5) * 0.1;
        bmo.rotation.x = Math.sin(time * 0.7) * 0.05;

        // Arm waving animation
        if (leftArm) {
          leftArm.rotation.z = Math.sin(time * 2) * 0.3 - 0.2;
        }
        if (rightArm) {
          rightArm.rotation.z = Math.sin(time * 2 + Math.PI) * 0.3 + 0.2;
        }

        // Leg swinging (subtle)
        if (leftLeg) {
          leftLeg.rotation.x = Math.sin(time * 2) * 0.15;
        }
        if (rightLeg) {
          rightLeg.rotation.x = Math.sin(time * 2 + Math.PI) * 0.15;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      
      renderer.dispose();
    };
  }, []);

  // Update animations based on mood/state
  useEffect(() => {
    if (!bmoRef.current) return;

    // Could add mood-specific animations here
    // e.g., excited = faster waving, sad = slower movement, etc.
  }, [mood, isSpeaking, isListening]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-[400px] rounded-xl overflow-hidden"
      style={{ background: 'linear-gradient(to bottom, #57c4d8, #1a5f7a)' }}
    />
  );
};
