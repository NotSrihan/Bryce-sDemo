/**
 * FINAL PROJECT: First Person Character Controller
 * 
 * This project implements a first-person character controller using Three.js.
 * The camera is attached to the character model, and mouse movement controls
 * the camera's yaw and pitch. The character's body rotates to follow the
 * camera when looking around, with a threshold to prevent excessive twisting.
 * WASD keys control movement, with separate animations for idle, walking, and running.
 * 
 * Check the README.md for more details.
 * 
 * UPDATE 04/22/2026:
 * - Fixed shadows for player across whole map and arches
 * - Enabled Shadows for StoneArch.js
 * - Added headbob for camera walking
 * - Added randomized arches loading in per session (just for scene variety)
 * 
 * 
 * Controls:
 * - Click on the canvas to lock the pointer and enable mouse look.
 * - Move the mouse to look around
 * - WASD to move (W forward, A left, S back, D right)
 * - Press Shift to toggle between walking and running
 * 
 * 
 * This code adapts elements from: 
 * https://github.com/tamani-coding/threejs-character-controls-example/blob/main/LICENSE 
 * https://github.com/simondevyoutube/ThreeJS_Tutorial_FirstPersonCamera 
 * https://discourse.threejs.org/t/complete-sky-system-for-three-js-skybox-sun-moon-day-night-cycle-clouds-stars-lensflares/88311
 * 
 * All are MIT licensed and free to use with attribution. This code is a significant
 * rewrite and combination of the two, with additional features and adjustments for an 
 * improved firstperson experience. Code comments indicate the source of each section 
 * and the modifications made. When comments say "from", it means the idea or structure
 * was adapted from the reference source. When comments say "modified" or "added", 
 * it means that the code was changed or new code was added ontop of the reference 
 * to implement new features like body rotation, camera positioning, and movement logic.
 * 
 * If anything was taken verbatim, It will be addressed in the comments. So far the only things
 * I took verbatim were the directionOffset() function, which I copied directly from characterControls.ts.
 * As well as the constants for utils.ts and the animation state machine from characterCtontrols.ts.
 * 
 * 
 * Future implementations:
 * - Jumping? Probably not since animations are all wonky
 * 
 */

// Imports 
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStoneArch } from './StoneArch.js';
import { Sky } from 'three/addons/objects/Sky.js';





// ================================================================================
//  Constants (This is for tweaking inputs for player movement and camera control.)
// ================================================================================

/* ADDED: head bob adapted from fps.js headBobTimer_ / Math.sin(headBobTimer_ * 10) concept.
   Frequency and amplitude vary by walk vs run. */
const BOB_FREQ_WALK = 12; // oscillations per second while walking (default 8)
const BOB_FREQ_RUN = 20; // oscillations per second while running (default 14)
const BOB_AMP = 0.04; // max vertical displacement in world units (fps.js used 1.5, too extreme for our scale) (default 0.04)

// Velocities from characterControls.ts
const RUN_VELOCITY  = 5;
const WALK_VELOCITY = 2;
const FADE_DURATION = 0.2;

// MODIFIED: replaces OrbitControls target offset 
// camera sits at eye level on the model
// Note: not attached to head bone, its manually positioned each frame
const EYE_HEIGHT = 1.6;

// MODIFIED: mouse sensitivity and pitch clamp (from fps.js phiSpeed_ / thetaSpeed_ concept,
// rewritten for pointer lock instead of raw page coords)
const LOOK_X = 0.002;
const LOOK_Y = 0.002;
const PITCH_MIN = -Math.PI / 2.2; // how far down you can look (reveals body below)
const PITCH_MAX =  Math.PI / 3;

/* ADDED: how far forward the camera sits from the head center DEFAULT: 0.35 (FOV). */
const EYE_FORWARD = 0.35;

/* ADDED: how far left/right (in radians) you can look before the body starts turning to follow.
   Think of it as the "shoulder limit" past this angle the body rotates to catch up.
   Math.PI / 2 = 90 degrees each side. */
const BODY_TURN_THRESHOLD = Math.PI / 2;

/* ADDED: how fast the body rotates to catch up to the camera when past the threshold.
   Higher = snappier turn. Lower = sluggish. */
const BODY_TURN_SPEED = 8;

// Key constants loosely based on utils.ts
const W = 'w', A = 'a', S = 's', D = 'd';
const DIRECTIONS = [W, A, S, D];





// ================================================================================
// Scene + Skybox
// ================================================================================

// From index.ts scene / camera / renderer setup
const scene = new THREE.Scene();
//scene.background = new THREE.Color(0xa8def0);

// Skybox from https://freestylized.com/skybox/sky_17/
const loader = new THREE.CubeTextureLoader();
scene.skybox = loader.load([
    'sky_17_2k/sky_17_cubemap_2k/px.png', // +X (front)
    'sky_17_2k/sky_17_cubemap_2k/nx.png', // -X (back)
    'sky_17_2k/sky_17_cubemap_2k/py.png', // +Y (up)
    'sky_17_2k/sky_17_cubemap_2k/ny.png', // -Y (down)
    'sky_17_2k/sky_17_cubemap_2k/pz.png', // +Z (right)
    'sky_17_2k/sky_17_cubemap_2k/nz.png'  // -Z (left)
]);
scene.background = scene.skybox;
scene.environment = scene.skybox; // for PBR materials to reflect the skybox


const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);





// ================================================================================
// Ambient Light / Sun / Directional Light (adapted from red-reddington sky system)
// ================================================================================

/*
 * ADAPTED: shadow-following directional light from the complete sky system by red-reddington.
 * Stripped out the day/night cycle, clouds, stars, and time controls.
 * Kept only the directional light setup and the player-tracking shadow camera logic.
 * The sun position is fixed at a static angle instead of being driven by game time.
 */

// Fixed sun direction — adjust these to change the angle of light/shadows
const SUN_ELEVATION = THREE.MathUtils.degToRad(42); // height above horizon
const SUN_AZIMUTH = THREE.MathUtils.degToRad(216); // compass direction

// Compute a static sun direction vector (from red-reddington updateSunPosition())
const sunDirection = new THREE.Vector3(
    Math.cos(SUN_ELEVATION) * Math.sin(SUN_AZIMUTH),
    Math.sin(SUN_ELEVATION),
    Math.cos(SUN_ELEVATION) * Math.cos(SUN_AZIMUTH)
).normalize();

const sunLight = new THREE.DirectionalLight(0xbfa0ff, 1.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width  = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias       = -0.0005;
sunLight.shadow.normalBias =  0.02;

// Tight frustum around the player from red-reddington sun.shadow.camera setup
const SHADOW_FRUSTUM = 20;
sunLight.shadow.camera.left = -SHADOW_FRUSTUM;
sunLight.shadow.camera.right = SHADOW_FRUSTUM;
sunLight.shadow.camera.top = SHADOW_FRUSTUM;
sunLight.shadow.camera.bottom = -SHADOW_FRUSTUM;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far  = 500;
sunLight.shadow.camera.updateProjectionMatrix();

scene.add(sunLight);
scene.add(sunLight.target);

scene.add(new THREE.AmbientLight(0x6a3bb8, 0.3));





// ================================================================================
// Floor / Textured Terrain / Fog
// ================================================================================

/*
 * ADDED: replaced the simple grid floor with a textured terrain using PBR materials and normal/displacement maps.
 */
// https://ambientcg.com/view?id=Rock029 
const loader2 = new THREE.TextureLoader();

const rockColor = loader2.load('Rock029_2K-PNG/Rock029_2K-PNG_Color.png');
const rockNormal = loader2.load('Rock029_2K-PNG/Rock029_2K-PNG_NormalGL.png');
const rockDisp = loader2.load('Rock029_2K-PNG/Rock029_2K-PNG_Displacement.png');
const rockRough = loader2.load('Rock029_2K-PNG/Rock029_2K-PNG_Roughness.png');
const rockAO = loader2.load('Rock029_2K-PNG/Rock029_2K-PNG_AmbientOcclusion.png');

const tiling = 18; // adjust to taste

for (const tex of [rockColor, rockNormal, rockDisp, rockRough, rockAO]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(tiling, tiling);
}

const terrainGeo = new THREE.PlaneGeometry(200, 200, 256, 256);

const terrainMat = new THREE.MeshStandardMaterial({
    map: rockColor,
    normalMap: rockNormal,
    displacementMap: rockDisp,
    displacementScale: 0.75, // adjust to prevent clipping of feet (but who cares it looks nice)
    roughnessMap: rockRough,
    roughness: 1.0,
    aoMap: rockAO,
});

const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.rotation.x = -Math.PI / 2;
terrain.receiveShadow = true;

scene.add(terrain);

// not an efficient fix for player feet clipping through.
//terrain.position.y = -.50;

/*
 * Fog for depth perception
 * FogExp2: https://threejs.org/docs/#FogExp2
 * "...faster than exponentially densening fog farther from the camera."
 * Fog is added to the horizon to give a better sense of depth and distance,
 * and to help blend the terrain into the skybox.
*/

// screenshotted the horizon color from the skybox to better blend the terrain into the background at a distance.
scene.fog = new THREE.FogExp2(0x745696, 0.018);
renderer.setClearColor(0x745696);





// ================================================================================
// Archway Module test (from StoneArch.js)
// ================================================================================

// Bricks: https://ambientcg.com/view?id=Bricks066
const brickColor = loader2.load('Bricks066_2K-PNG/Bricks066_2K-PNG_Color.png');
const brickNormal = loader2.load('Bricks066_2K-PNG/Bricks066_2K-PNG_NormalGL.png');
const brickRough = loader2.load('Bricks066_2K-PNG/Bricks066_2K-PNG_Roughness.png');
const brickAO = loader2.load('Bricks066_2K-PNG/Bricks066_2K-PNG_AmbientOcclusion.png');
const brickDisp = loader2.load('Bricks066_2K-PNG/Bricks066_2K-PNG_Displacement.png');

const brickTiling = 2;

for (const tex of [brickColor, brickNormal, brickRough, brickAO, brickDisp]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(brickTiling, brickTiling);
}

const brickMat = new THREE.MeshStandardMaterial({
    map: brickColor,
    normalMap: brickNormal,
    roughnessMap: brickRough,
    aoMap: brickAO,
    displacementMap: brickDisp,
    displacementScale: 0.25,
});


const arch = createStoneArch({
    pillarRadius: 0.7,
    pillarHeight: 7,
    archRadius: 3.5,
    archTube: 0.6,
    tiling: 8,
    material: brickMat
});


arch.position.set(0, 0, -20);
scene.add(arch);





// ================================================================================
// Random Arches
// ================================================================================

/* ADDED: scatter a large number of dramatic arches across the map with
   heavily randomized scale, displacement, rotation, and material. */

const archMaterials = [brickMat, terrainMat];

const NUM_ARCHES = 150;
const MAP_SPREAD = 360; // how far from center they can spawn

for (let i = 0; i < NUM_ARCHES; i++) {

    const x = (Math.random() - 0.5) * MAP_SPREAD;
    const z = (Math.random() - 0.5) * MAP_SPREAD;

    // Keep a clear circle around the spawn point so the player isn't immediately boxed in
    if (Math.sqrt(x * x + z * z) < 12) continue;

    // Min max values for PBR mats
    const scale = 0.5 + Math.random() * 1.5;
    const rotY = Math.random() * Math.PI * 2;
    const dispScale = 0.1 + Math.random() * 0.8;
    const tiling = 1 + Math.random() * 8;

    const mat = archMaterials[Math.floor(Math.random() * archMaterials.length)].clone();
    mat.displacementScale = dispScale;

    const a = createStoneArch({
        pillarRadius: 0.4 + Math.random() * 0.4, // vary pillar thickness
        pillarHeight: 4 + Math.random() * 4, // vary pillar height dramatically
        archRadius: 2.5 + Math.random() * 2, // vary arch span
        archTube: 0.4 + Math.random() * 0.3, // vary arch thickness
        tiling,
        material: mat
    });

    a.position.set(x, 0, z);
    a.rotation.y = rotY;
    a.scale.setScalar(scale);
    scene.add(a);
}





// ================================================================================
// Input 
// ================================================================================

// From index.ts keydown/keyup listeners simplified (KeyDisplay HUD from utils.ts removed)
const keys = {};
document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'shift' && ctrl) ctrl.toggleRun = !ctrl.toggleRun;
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });





// ================================================================================
// Pointer Lock + Mouse Look 
// ================================================================================

// MODIFIED: replaces OrbitControls entirely.
// Concept from fps.js InputController / FirstPersonCamera updateRotation_(),
// rewritten to use the Pointer Lock API instead of raw mousemove page coords. 
let yaw = 0, pitch = 0;

renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());

document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw   -= e.movementX * LOOK_X;
    pitch -= e.movementY * LOOK_Y;
    pitch  = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch)); /* clamp from fps.js clamp() */
});





// ================================================================================
// Character Controller 
// ================================================================================

// MODIFIED: merged from characterControls.ts (animation logic) + fps.js FirstPersonCamera
// OrbitControls dependency removed.
class CharacterController {
    constructor(model, mixer, animationsMap) {
        this.model         = model;
        this.mixer         = mixer;
        this.animationsMap = animationsMap;
        this.currentAction = 'Idle';
        this.toggleRun     = true; /* from characterControls.ts */
        // ADDED: head bob timer from fps.js headBobTimer_ concept
        this.headBobTimer = 0;

        /* from characterControls.ts used for body rotation */
        this.rotateAngle = new THREE.Vector3(0, 1, 0);
        this.rotateQuat  = new THREE.Quaternion();

        /* ADDED: bodyYaw is the body's current facing direction, tracked
           separately from the camera yaw so they can diverge up to the
           shoulder threshold before the body is dragged to follow. */
        this.bodyYaw = 0;

        animationsMap.get('Idle')?.play();
    }

    update(delta) {
        const moving = DIRECTIONS.some(k => keys[k]);

        /* UNCHANGED Animation state machine from characterControls.ts update() */
        //const play = moving ? (this.toggleRun ? 'Run' : 'Walk') : 'Idle';
        
        // 04/15/2026: ADDED - new logic to determine animation state based on movement direction and whether running or walking.
        let play;
        if (!moving) {
            play = 'Idle';
        } else if (keys[S] && !keys[W]) {
            // Only use back-anims if they've loaded, otherwise fall back to forward
            play = this.toggleRun
                ? (this.animationsMap.has('RunBack')  ? 'RunBack'  : 'Run')
                : (this.animationsMap.has('WalkBack') ? 'WalkBack' : 'Walk');
        } else {
            play = this.toggleRun ? 'Run' : 'Walk';
        }
        
        
        if (this.currentAction !== play) {
            this.animationsMap.get(this.currentAction)?.fadeOut(FADE_DURATION);
            this.animationsMap.get(play)?.reset().fadeIn(FADE_DURATION).play();
            this.currentAction = play;
        }
        this.mixer.update(delta);

        if (moving) {
            /* Direction offset from characterControls.ts directionOffset() */
            const offset = this._directionOffset();

            // ADDED: when moving backward, body faces camera direction (yaw).
            // When moving forward/strafe, body faces movement direction (yaw + offset).
            const isBackward = keys[S] && !keys[W];
            this.bodyYaw = isBackward ? yaw : yaw + offset;


            this.rotateQuat.setFromAxisAngle(this.rotateAngle, this.bodyYaw);
            this.model.quaternion.rotateTowards(this.rotateQuat, 0.2);

            /* MODIFIED: movement is along bodyYaw so WASD is always relative
               to where the body faces, not where the camera is looking */
            
            // ADDED: use different velocities for walking vs running animations, instead of a single speed multiplier.
            const velocity = (this.currentAction === 'Run' || this.currentAction === 'RunBack')
                ? RUN_VELOCITY
                : WALK_VELOCITY;
            
            // ADDED: moving backward moves the model in the opposite direction of bodyYaw, forward moves in the direction of bodyYaw.
            if (isBackward) {
                this.model.position.x += Math.sin(this.bodyYaw) * velocity * delta;
                this.model.position.z += Math.cos(this.bodyYaw) * velocity * delta;
            } else {
                this.model.position.x -= Math.sin(this.bodyYaw) * velocity * delta;
                this.model.position.z -= Math.cos(this.bodyYaw) * velocity * delta;
            }

        } else {
            /* ADDED: when idle, check if the camera has turned far enough past
               the shoulder threshold. If so, smoothly rotate the body to follow
               the camera so the front of the body faces forward again. */
            let diff = yaw - this.bodyYaw;

            /* Wrap diff into [-PI, PI] so we always take the shortest arc */
            diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;

            if (Math.abs(diff) > BODY_TURN_THRESHOLD) {
                /* Nudge bodyYaw toward yaw at BODY_TURN_SPEED, frame-rate independent */
                this.bodyYaw += Math.sign(diff) * Math.min(Math.abs(diff) - BODY_TURN_THRESHOLD, BODY_TURN_SPEED * delta);
                this.rotateQuat.setFromAxisAngle(this.rotateAngle, this.bodyYaw);
                this.model.quaternion.rotateTowards(this.rotateQuat, 1); // instant snap to bodyYaw target
            }
        }

        /* MODIFIED: camera follows model at eye height each frame
           ADDED: EYE_FORWARD offsets the camera in front of the face along the look direction */
        const forward = new THREE.Vector3(
            -Math.sin(yaw) * EYE_FORWARD,
            0,
            -Math.cos(yaw) * EYE_FORWARD
         );

        // Old camera position for moving 
        // camera.position.set(
        //     this.model.position.x + forward.x,
        //     this.model.position.y + EYE_HEIGHT,
        //     this.model.position.z + forward.z
        //);

        /* ADDED: head bob adapted from fps.js updateHeadBob_() and updateCamera_().
        Timer advances only while moving, resets smoothly to 0 when idle so the
        camera doesn't snap. Frequency switches based on walk vs run. */
        const action = this.currentAction;
        const isRunning = action === 'Run' || action === 'RunBack';
        const bobFreq   = isRunning ? BOB_FREQ_RUN : BOB_FREQ_WALK;

        if (moving) {
            this.headBobTimer += delta * bobFreq;
        } else {
            /* Smoothly decay the timer back toward the nearest zero crossing
            so the bob eases out instead of snapping (not in fps.js, added for polish) */
            this.headBobTimer += delta * bobFreq;
            const nearest = Math.round(this.headBobTimer / Math.PI) * Math.PI;
            this.headBobTimer += (nearest - this.headBobTimer) * Math.min(1, delta * 10);
        }

        const bobOffset = moving ? Math.sin(this.headBobTimer) * BOB_AMP : 0;

        camera.position.set(
            this.model.position.x + forward.x,
            this.model.position.y + EYE_HEIGHT + bobOffset,
            this.model.position.z + forward.z
        );

        /* MODIFIED: yaw + pitch applied as a combined quaternion.
           Yaw rotates camera horizontally, pitch tilts it vertically only.
           Body stays upright; looking down reveals the animated legs below. */
        const qYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yaw);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), pitch);
        camera.quaternion.copy(qYaw).multiply(qPitch);

        /* ADAPTED: shadow camera follows player position each frame.
        From red-reddington sky system Skybox.update() shadow positioning block.
        Instead of computing sunDir from game time, we use the static sunDirection vector. */
        const SHADOW_DISTANCE = 100;
        sunLight.position.set(
            this.model.position.x + sunDirection.x * SHADOW_DISTANCE,
            this.model.position.y + sunDirection.y * SHADOW_DISTANCE,
            this.model.position.z + sunDirection.z * SHADOW_DISTANCE
        );
        sunLight.target.position.copy(this.model.position);
        sunLight.target.updateMatrixWorld();
    }

    /* UNCHANGED From characterControls.ts directionOffset() */
    _directionOffset() {
        if (keys[W]) {
            if (keys[A]) return  Math.PI / 4;
            if (keys[D]) return -Math.PI / 4;
            return 0;
        }
        if (keys[S]) {
            if (keys[A]) return  Math.PI * 3 / 4;
            if (keys[D]) return -Math.PI * 3 / 4;
            return Math.PI;
        }
        if (keys[A]) return  Math.PI / 2;
        if (keys[D]) return -Math.PI / 2;
        return 0;
    }
}





// ================================================================================
// Load Model 
// ================================================================================

// From index.ts GLTFLoader block condensed
let ctrl = null;

new GLTFLoader().load('Soldier.glb', gltf => {
    const model = gltf.scene;
    model.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(model);


    // DEBUG: log all the bone names to verify the model structure 
    //model.traverse(o => { if (o.isBone) console.log('Soldier bone:', o.name); });

    camera.position.set(0, EYE_HEIGHT, 0);

    const mixer = new THREE.AnimationMixer(model);
    const animationsMap = new Map();

    // Names of all available animations in the model
    //console.log("Available animations:");
    //gltf.animations.forEach(a => console.log(" -", a.name));


    gltf.animations
        .filter(a => a.name !== 'TPose') /* from index.ts — skip T-pose clip */
        .forEach(a => animationsMap.set(a.name, mixer.clipAction(a)));

    ctrl = new CharacterController(model, mixer, animationsMap);


    /*
     * 04/15/2026: ADDED load extra animations from separate .glb files and add them to the same mixer and animationsMap. 
     */
    const extraLoader = new GLTFLoader();


    /**
     * ADDED: extraLoader for WalkingBackward and RunningBackward animations. 
     * These were created by copying the original model, applying the existing Walk and Run animations, 
     * then baking those animations into new .glb files with the character facing backward. 
     * This was done to have separate backward walking/running animations instead of just playing the forward ones in reverse, 
     * which looks unnatural. However, this looks even more unnatural.
     *
     *    console.log('WalkBack tracks:', clip.tracks.slice(0,3).map(t => t.name));
     *    console.log('RunBack tracks:', clip.tracks.slice(0,3).map(t => t.name));        
     *
     */
    extraLoader.load('WalkingBackward.glb', gltf => {
        const clip = gltf.animations[0];
        clip.name = 'WalkBack';


        // DEBUG: log all track names to verify bone name mismatch and identify which tracks to strip
        // clip.tracks.forEach(t => {
        // if (t.name.includes('Spine') || t.name.includes('UpLeg'))
        //     console.log(t.name, t.values.slice(0, 4));
        // });

        clip.tracks = clip.tracks.filter(track =>
        !track.name.startsWith('mixamorigHips') &&
        !track.name.includes('UpLeg.position') &&
        !track.name.includes('UpLeg.quaternion')
        );

        clip.tracks.forEach(track => {
            track.name = track.name.replace('mixamorig_', 'mixamorig');
        });

        clip.tracks = clip.tracks.filter(track =>
            !track.name.startsWith('mixamorigHips')
        );

        animationsMap.set('WalkBack', mixer.clipAction(clip));
    });

    extraLoader.load('RunningBackward.glb', gltf => {
        const clip = gltf.animations[0];
        clip.name = 'RunBack';

        // Fix bone name mismatch
        clip.tracks.forEach(track => {
            track.name = track.name.replace('mixamorig_', 'mixamorig');
        });

        clip.tracks = clip.tracks.filter(track =>
            !track.name.startsWith('mixamorigHips') &&
            !track.name.includes('UpLeg.position') &&
            !track.name.includes('UpLeg.quaternion')
        );

        animationsMap.set('RunBack', mixer.clipAction(clip));
    });
});





// ================================================================================
// Resize Window 
// ================================================================================

// From index.ts onWindowResize()
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});





// ================================================================================
// Animate Loop 
// ================================================================================

// From index.ts animate()
const clock = new THREE.Clock();
(function animate() {
    requestAnimationFrame(animate);
    if (ctrl) ctrl.update(clock.getDelta());
    renderer.render(scene, camera);
})();