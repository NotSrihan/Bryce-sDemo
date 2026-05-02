Three.js First Person Character Controller
Development Summary and Report
Project 6 (And start for final project)
Bryce Comer

# 1. Project Overview
    This project implements a first person character controller in Three.js by combining and adapting ideas from two reference codebases: tanami-coding's third person animated character controller (index.ts, characterControls.ts, utils.ts) and a standalone first person camera demo (SimonDev’s FPS tutorial). The goal was to inhabit the body of a Mixamo rigged soldier model in true first person, allowing the player to look around freely, see their own animated body when looking down, and move naturally with WASD. The controller includes body follow behavior with a shoulder turn threshold, smooth animation transitions, and a fully rewritten camera system based on pointer lock.

Most of the original code was rewritten. Only a few utility pieces remain unchanged.

# 2. Summary of Code Origins

## 2.1 Notes on Attribution
    This project adapts concepts from:
    tamani coding’s threejs character controls example
    https://github.com/tamani-coding/threejs-character-controls-example/blob/main/LICENSE

    SimonDev’s First Person Camera tutorial
    https://github.com/simondevyoutube/ThreeJS_Tutorial_FirstPersonCamera

    red-reddington's Complete Sky System for Three.js
    https://discourse.threejs.org/t/complete-sky-system-for-three-js-skybox-sun-moon-day-night-cycle-clouds-stars-lensflares/88311

    `=== All are MIT licensed for free use. ===`

Unchanged Code

    Key constants: W, A, S, D, DIRECTIONS (from utils.ts)

    directionOffset() logic (from characterControls.ts)

    KeyDisplay class (from utils.ts, though unused in the new controller)

Adapted Code

    Animation fade logic (based on characterControls.ts, but simplified)

    Run toggle behavior (based on index.ts, but rewritten)

    Movement logic (inspired by characterControls.ts, but heavily modified)

    Camera yaw/pitch system (inspired by SimonDev’s FPS tutorial, rewritten)

    Player-tracking shadow camera (adapted from red-reddington's sky system, day/night cycle removed)

New Code

    Pointer Lock camera system

    Independent yaw/pitch rotation

    Body follow threshold and rotation smoothing

    Eye height and forward camera offset

    Manual camera positioning instead of OrbitControls

    Idle body auto rotation to match camera yaw

    New movement model based on bodyYaw instead of OrbitControls target

    Backward walk and run animation retargeting from separate GLB files

    Directional animation state machine with forward/backward branching

    Root motion stripping for externally downloaded Mixamo clips

    Camera Bobbing using sine waves

    Static sun with player-following shadow frustum


# 3. Errors, Causes, and Fixes

3.1 Camera Inside the Model’s Skull
Cause:
The camera was placed at the model origin, which is inside the mesh.

Fix:
Added EYE_HEIGHT (1.6) and EYE_FORWARD (0.35).
Camera is repositioned every frame above and slightly ahead of the model so the player can look down and see their animated body.

3.2 Shoulder Turn Lock
Cause:
The original thirdperson controller extracted yaw from the model’s quaternion. In the new first person system, this created a feedback loop when clamping yaw against bodyYaw.

Fix:
bodyYaw is now a separate numeric variable updated only during movement.
The camera clamps against this stable value instead of the model quaternion, eliminating the lock.

3.3 Walking Backwards Rotates Body 180 Degrees
Cause:
The Mixamo soldier model has no backward walk animation. Pressing S triggered the forward walk animation with a 180 degree rotation.

Fix:
Downloaded Walking Backward and Running Backward animations from Mixamo as separate GLB files. Loaded them inside the Soldier GLTFLoader callback using a second GLTFLoader instance so they share the same mixer and animationsMap. The animation state machine was updated to branch on keys[S] && !keys[W], selecting WalkBack or RunBack when available, with a fallback to the forward animations while clips are still loading.

3.4 WASD Broken After Adding Backward Animations
Cause:
An early return guard was added to update() that bailed out of the entire function if the backward clips had not finished loading yet. Since loading is asynchronous, this silently blocked all movement and animation until both files resolved.

Fix:
Removed the early return guard entirely. Replaced it with per clip fallback logic inline in the animation state machine using animationsMap.has(). Forward movement and idle continue working immediately on load. Backward clips activate as soon as they are ready.

3.5 T-Pose When Playing Backward Animations
Cause:
The backward GLB files were exported from Mixamo with a different bone naming convention than the Soldier.glb. The Soldier uses mixamorigHips while the downloaded clips used mixamorig_Hips. Three.js matched zero bones and produced a T-pose.

Fix:
Before calling mixer.clipAction(), all track names in the clip are renamed using:
    clip.tracks.forEach(track => {
        track.name = track.name.replace('mixamorig_', 'mixamorig');
    });
This runs before the action is created so Three.js finds the correct bones on the Soldier skeleton.

3.6 Walking Backward GLB Returns 404
Cause:
The filename Walking Backward.glb contains a space. The local dev server encoded it as Walking%20Backward.glb in the fetch URL, which did not resolve to the file on disk.

Fix:
Renamed both files to remove spaces:
    Walking Backward.glb -> WalkingBackward.glb
    Running Backward.glb -> RunningBackward.glb
Updated both loader paths to match.

3.7 Backward Animations Play on the Wrong Axis (Feet Down, Body Sideways)
Cause:
The backward GLBs were exported from Mixamo at centimeter scale. The Hips position track had a Y value of approximately 92, placing the character 92 units in the air. The Soldier.glb uses meter scale. The scale mismatch caused the root bone to be positioned and oriented incorrectly relative to the Soldier skeleton.

Fix:
Stripped all root bone tracks from the backward clips before retargeting. The controller owns all root transforms (position, rotation, scale). Only limb and spine rotation tracks are needed from the clip:
    clip.tracks = clip.tracks.filter(track =>
        !track.name.startsWith('mixamorigHips')
    );
The Soldier's own skeleton drives the root each frame via model.position and model.quaternion.

3.8 Backward Movement Moves Forward Instead of Backward
Cause:
When isBackward is true, bodyYaw is set to yaw (camera direction) so the body faces forward. The movement line used  = on both axes, which moves along the forward vector. Backward movement requires the opposite direction.

Fix:
Added a branch in the movement block:
    if (isBackward) {
        this.model.position.x += Math.sin(this.bodyYaw) * velocity * delta;
        this.model.position.z += Math.cos(this.bodyYaw) * velocity * delta;
    } else {
        this.model.position.x  = Math.sin(this.bodyYaw) * velocity * delta;
        this.model.position.z  = Math.cos(this.bodyYaw) * velocity * delta;
    }

3.9 Running Backward Uses Walk Speed
Cause:
The velocity check read this.currentAction === 'Run', which never matched the string 'RunBack'. Running backward always fell through to WALK_VELOCITY.

Fix:
Updated the velocity check to include both run states:
    const velocity = (this.currentAction === 'Run' || this.currentAction === 'RunBack')
        ? RUN_VELOCITY
        : WALK_VELOCITY;

3.10 Backward Animation Legs Twisted Backwards (WIP)
Cause:
The UpLeg quaternion tracks in the downloaded Mixamo clips encode a rest pose orientation that does not match the Soldier skeleton. The RightUpLeg quaternion W value is approximately -0.04, indicating a near 180 degree rotation baked into the rest pose. This twists the legs so feet face behind the player.

Fix (in progress):
Partial workaround: filtering UpLeg position and quaternion tracks reduces the twist but removes upper leg articulation. 

I was going to redownload the animations from Mixamo using the Soldier.glb as the upload target and selecting Without Skin on export. 
This retargets the animation directly to the Soldier rig so rest pose and bone names match exactly with no manual track filtering required.

I think I am going to have to download a new model from Mixamo and also download animations for them all.
This will make sure the formatting for the model and animations is consistent.


3.11 Shadows Not Following Player / Poor Shadow Quality
Cause: The original directional light used a large fixed frustum covering the entire map. This spread the shadow map resolution across a huge area, producing soft and low quality shadows. The light position was also static so shadows disappeared as the player moved away from the origin.
Fix: Adapted the player-tracking shadow camera technique from red-reddington's Complete Sky System. The day/night cycle, clouds, stars, lensflare, and time controls were all removed. Only the directional light setup and shadow frustum logic were kept. Each frame, the light position is recalculated by projecting the static sun direction vector out from the player's current position by SHADOW_DISTANCE (100 units), and the light target is updated to point back at the player. The frustum is kept tight at ±20 units around the player so shadow map resolution stays dense and sharp regardless of where the player moves.

3.12 Feet Clipping Through Displaced Terrain (WIP — unlikely to fix)
Fix (not pursued): Not sure since I am unsure how to capture displacement heights of a texture (if even possible)


3.5 Clipping feet due to texture displacement (WIP but unlikely to fix)

# 4. Tuning Reference

EYE_HEIGHT: 1.6
Camera height above model feet

EYE_FORWARD: 0.35
Camera offset in front of face

BODY_TURN_THRESHOLD: PI / 2
How far the camera can rotate before the body begins to follow

BODY_TURN_SPEED: 8
How quickly the body rotates to catch up

PITCH_MIN:  PI / 2.2
Maximum downward look angle

PITCH_MAX: PI / 3
Maximum upward look angle


# 5. StoneArch.js Module

StoneArch.js provides a modular, parameter driven stone archway component for Three.js scenes. The module constructs an archway using two cylindrical pillars and a half‑torus top, forming a complete architectural structure that can be positioned or reused anywhere in the environment.

The module supports both texture based PBR materials and full material overrides, allowing flexible visual customization. Geometry parameters (pillar radius, pillar height, arch radius, and arch tube thickness) make the archway easily scalable without modifying the source code. The final archway is returned as a THREE.Group, ready to be added directly to the scene.

Enabled casting shadows on all parts.

# 6. OTHER

/*
 Deprecated floor for testing, keeping in because might reuse for final project testing.
*/
// added simple grid floor for visual reference
// (function generateGridFloor() {
//     const size = 80;
//     const divisions = 80;
//     const gridHelper = new THREE.GridHelper(size, divisions, 0xffffff, 0x888888);
//     gridHelper.position.y = 0.02; // slightly above y=0 to prevent z fighting
//     scene.add(gridHelper);
// })();

// // floor
// const floorGeo = new THREE.PlaneGeometry(80, 80);
// const floorMat = new THREE.MeshStandardMaterial({
//     color: 0x555555,
//     roughness: 1,
// });
// const floor = new THREE.Mesh(floorGeo, floorMat);
// floor.rotation.x =  Math.PI / 2;
// floor.receiveShadow = true;
// scene.add(floor);