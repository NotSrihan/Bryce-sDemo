import * as THREE from 'three';

export function createStoneArch({
    pillarRadius = 0.6,
    pillarHeight = 6,
    archRadius = 3,
    archTube = 0.6,
    brickTextures = {},
    tiling = 2,
    material = null
} = {}) {


    const group = new THREE.Group();

    // Extract textures
    const { color, normal, roughness, ao, displacement } = brickTextures;

    // Apply tiling to all maps
    const maps = [color, normal, roughness, ao, displacement];
    maps.forEach(tex => {
        if (tex) {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(tiling, tiling);
        }
    });

    // Material
    const mat = material || new THREE.MeshStandardMaterial({
        map: color,
        normalMap: normal,
        roughnessMap: roughness,
        aoMap: ao,
        displacementMap: displacement,
        displacementScale: 0.05
    });


    // Pillars
    const pillarGeo = new THREE.CylinderGeometry(
        pillarRadius,
        pillarRadius,
        pillarHeight,
        32,
        32,
        true
    );

    const leftPillar = new THREE.Mesh(pillarGeo, mat);
    const rightPillar = new THREE.Mesh(pillarGeo, mat);

    leftPillar.position.set(-archRadius, pillarHeight / 2, 0);
    rightPillar.position.set(archRadius, pillarHeight / 2, 0);

    // Half‑torus arch top
    const torusGeo = new THREE.TorusGeometry(
        archRadius,
        archTube,
        32,
        100,
        Math.PI
    );

    const archTop = new THREE.Mesh(torusGeo, mat);
    archTop.rotation.y = Math.PI; // stand it upright
    archTop.position.y = pillarHeight;

    // Enable shadows on all parts
    [leftPillar, rightPillar, archTop].forEach(mesh => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    });

    // Add to group
    group.add(leftPillar, rightPillar, archTop);

    return group;
}
