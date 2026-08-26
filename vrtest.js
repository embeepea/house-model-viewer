console.log('BOO!');

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

////////////////////////////////////////////////////////////////////////////////

const AXIS_CONE_RADIUS = 0.15;
const AXIS_CONE_HEIGHT = 0.4;

function createAxisLines(length) {
    const half = length / 2;
    // prettier-ignore
    const positions = new Float32Array([
	-half, 0, 0,   half, 0, 0,  // X
	0, -half, 0,   0, half, 0,  // Y
	0, 0, -half,   0, 0, half,  // Z
    ]);
    // prettier-ignore
    const colors = new Float32Array([
	1, 0, 0,   1, 0, 0,  // X: red
	0, 1, 0,   0, 1, 0,  // Y: green
	0, 0, 1,   0, 0, 1,  // Z: blue
    ]);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    return new THREE.LineSegments(geometry, material);
}

function createAxisCones(axisLength) {
    const half = axisLength / 2;
    const coneGeometry = new THREE.ConeGeometry(AXIS_CONE_RADIUS, AXIS_CONE_HEIGHT, 16);
    
    const axisSpecs = [
	{ color: 0xff0000, tip: new THREE.Vector3(half, 0, 0), rotation: new THREE.Euler(0, 0, -Math.PI / 2) },
	{ color: 0x00ff00, tip: new THREE.Vector3(0, half, 0), rotation: new THREE.Euler(0, 0, 0) },
	{ color: 0x0000ff, tip: new THREE.Vector3(0, 0, half), rotation: new THREE.Euler(Math.PI / 2, 0, 0) },
    ];
    
    const group = new THREE.Group();
    for (const { color, tip, rotation } of axisSpecs) {
	const cone = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({ color }));
	cone.rotation.copy(rotation);
	// Cone geometry is centered on its own axis, apex at +height/2 locally, so
	// shift it outward by half its height to sit base-first at the line's tip.
	const outward = tip.clone().normalize();
	cone.position.copy(tip).addScaledVector(outward, AXIS_CONE_HEIGHT / 2);
	group.add(cone);
    }
    return group;
}

function createAxes(length) {
    const group = new THREE.Group();
    group.name = 'axes';
    group.add(createAxisLines(length));
    group.add(createAxisCones(length));
    return group;
}

// 

function createVector3(x, y, z) {
    // prettier-ignore
    const positions = new Float32Array([
	0, 0, 0,   x, y, z,
    ]);
    // prettier-ignore
    const colors = new Float32Array([
	1, 1, 1,   1, 1, 1,  // white
    ]);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    return new THREE.LineSegments(geometry, material);
}





////////////////////////////////////////////////////////////////////////////////

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
const cameraInnerRig = new THREE.Group();
cameraInnerRig.matrixAutoUpdate = false;
cameraInnerRig.add(camera);

if (false) {
    cameraInnerRig.matrix.multiply(new THREE.Matrix4().makeTranslation(0, 10, 20));
} else {
    // apply 2nd: move camera to desired world location:
    //cameraInnerRig.matrix.multiply(new THREE.Matrix4().makeTranslation(0, -20, 10));

    // apply first: turn camera to correct orientation while it's at world origin
    cameraInnerRig.matrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
}



/////////// HUD ///////////////////////////////////////////////////////////////////

// --- HUD panel fixed to camera ---
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512;
hudCanvas.height = 512;
const hudCtx = hudCanvas.getContext('2d');

const hudTexture = new THREE.CanvasTexture(hudCanvas);
const hudMaterial = new THREE.MeshBasicMaterial({
    map: hudTexture,
    transparent: true,
    depthTest: false // so it always renders on top, doesn't get occluded by the model
});

const hudGeometry = new THREE.PlaneGeometry(0.4, 0.4); // meters, tune to taste
const hudPanel = new THREE.Mesh(hudGeometry, hudMaterial);

// Position relative to camera: slightly down-left, arm's length away
hudPanel.position.set(0.0, 0.0, -0.5);
hudPanel.renderOrder = 999; // draw last, on top of everything

camera.add(hudPanel); // parent to camera so it tracks head movement
// (camera is already added to cameraRig, which is added to scene, so this works)

// Function to update HUD text
function setHudText(text) {
    hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // semi-transparent background panel
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    
    hudCtx.fillStyle = '#00ff00';
    hudCtx.font = '24px monospace';
    hudCtx.textBaseline = 'top';
    
    const lines = text.split('\n');
    lines.forEach((line, i) => {
	hudCtx.fillText(line, 10, 10 + i * 28);
    });
    
    hudTexture.needsUpdate = true; // tell Three.js the canvas changed
}

// Example usage:
//setHudText('Diagnostics\nFPS: --\nPos: 0,0,0');

let hudMessage = "";

/////////// HUD ///////////////////////////////////////////////////////////////////


//camera.position.set(10, 0, 10);

//  from kscope:
//camera.matrix.identity();
//
//camera.matrix.multiply(new THREE.Matrix4().makeTranslation(this.cameraX, this.cameraY, this.cameraZ));
//camera.matrix.multiply(new THREE.Matrix4().makeRotationY(this.cameraYAngle));
//camera.matrix.multiply(new THREE.Matrix4().makeRotationX(this.cameraXAngle));


// Rig so we can move the camera around in VR (moving camera directly doesn't work well in WebXR)
const cameraRig = new THREE.Group();
cameraRig.matrixAutoUpdate = false;
cameraRig.add(cameraInnerRig);
scene.add(cameraRig);

const INITIAL_CAMERA_POSITION = new THREE.Vector3(0, -30, 30)

const cameraRigPosition = new THREE.Vector3();
cameraRigPosition.copy(INITIAL_CAMERA_POSITION);
//cameraInnerRig.matrix.multiply(new THREE.Matrix4().makeTranslation(0, -20, 10));
let cameraRigZRotation = 0;

function updateCameraRig() {
    cameraRig.matrix.identity();
    cameraRig.matrix.multiply(new THREE.Matrix4().makeTranslation(cameraRigPosition.x, cameraRigPosition.y, cameraRigPosition.z));
    cameraRig.matrix.multiply(new THREE.Matrix4().makeRotationZ(cameraRigZRotation));
}
updateCameraRig();

const axes = createAxes(5.0);
axes.matrixAutoUpdate = false;
axes.matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0));
scene.add(axes);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
const vrButton = VRButton.createButton(renderer);
document.body.appendChild(vrButton);
// Style overrides for visibility
vrButton.style.background = 'rgba(0, 0, 0, 1.0)';
vrButton.opacity = '1';
vrButton.style.color = '#ff3300';
vrButton.style.border = '2px solid #ff3300';
vrButton.style.fontWeight = 'bold';
vrButton.style.fontSize = '16px';

// Lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(3, 10, 5);
scene.add(dirLight);

// Ground grid for spatial reference
const grid = new THREE.GridHelper(140, 140, 0x555555, 0x333333);
grid.rotation.x = -Math.PI / 2;
scene.add(grid);

const pointerHolder = new THREE.Group();
scene.add(pointerHolder);

let pointer = createVector3(1.0, 1.0, 0.3)
pointerHolder.add(pointer)

function updateVector3(x, y, z) {
    pointerHolder.remove(pointer);
    pointer = createVector3(x, y, z);
    pointerHolder.add(pointer)
}

// Load your glTF model — CHANGE THIS PATH
const loader = new GLTFLoader();
loader.load(
  './house.gltf',
(gltf) => {
    //gltf.scene.rotation.x = -Math.PI / 2;
    scene.add(gltf.scene);
  },
  (xhr) => {
    if (xhr.lengthComputable) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
    }
  },
  (error) => {
    console.error(error);
  }
);

// --- Desktop fallback controls (mouse drag to look, WASD to move) ---
let yaw = 0, pitch = 0;
let isDragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('mousedown', (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    yaw -= (e.clientX - lastX) * 0.005;
    pitch -= (e.clientY - lastY) * 0.005;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    lastX = e.clientX; lastY = e.clientY;
});
const keys = {};
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

// --- VR thumbstick locomotion ---
function handleVRMovement() {
    const session = renderer.xr.getSession();
    if (!session) return;
    for (const source of session.inputSources) {
	if (!source.gamepad || !source.handedness) continue;

	//if (source.handedness === 'right') { continue; }

	const lookDir = new THREE.Vector3();
	camera.getWorldDirection(lookDir);
	hudMessage = '';
	hudMessage += `at 0\n`;
	hudMessage += `look: [${lookDir.x.toFixed(4)}, ${lookDir.y.toFixed(4)}, ${lookDir.z.toFixed(4)}]\n`;
	hudMessage += `at 1\n`;
	updateVector3(lookDir.x, lookDir.y, lookDir.z);
	hudMessage += `at 1.1\n`;

	const axes = source.gamepad.axes; // [x, y] or [touchpadX, touchpadY, thumbX, thumbY]
	const x = axes.length >= 4 ? axes[2] : axes[0];
	const y = axes.length >= 4 ? axes[3] : axes[1];
	
	hudMessage += `at 1.2\n`;
	// x & y indicate joy stick movement:
	//    x = horizontal (left-right) movement:
	//          > 0 is toward the right
	//          < 0 is toward the left
	//    y = vertical (up-dwon) movement:
	//          > 0 is toward the bottom
	//          < 0 is toward the top
	//        NOTE the vertical dirs are reverse from what seems right
	// source.handedness tells which hand the motion is for
	// events fire repeatedly (multiple times/sec) when the stick is held out of its home position
	
	

//	if (Math.abs(x) < 0.15 && Math.abs(y) < 0.15) continue;
	hudMessage += `at 1.3\n`;

	const forwardDir = new THREE.Vector3(lookDir.x, lookDir.y, 0);
	hudMessage += `at 1.4\n`;
	forwardDir.normalize();
	hudMessage += `at 1.5\n`;
	const rightDir = new THREE.Vector3().crossVectors(forwardDir, new THREE.Vector3(0, 0, 1));
	
	hudMessage += `at 2\n`;

	if (source.handedness === 'left') {
	hudMessage += `at 3\n`;
	    hudMessage += `left: [${x.toFixed(4)}, ${y.toFixed(4)}]\n`;
	hudMessage += `at 4\n`;
	    // Left stick: move relative to where the headset is facing

	    const buttons = source.gamepad.buttons;
	    const xPressed = buttons[4].pressed;
	    const yPressed = buttons[5].pressed;
	    hudMessage += 'at 5\n';
	    hudMessage += `buttons: ${buttons}\n`;
	    if (xPressed) { hudMessage += 'X pressed\n'; }
	    if (yPressed) { hudMessage += 'Y pressed\n'; }
	    if (xPressed) {
		cameraRigPosition.addScaledVector(new THREE.Vector3(0,0,1), 0.05);
		continue;
	    } else if (yPressed) {
		cameraRigPosition.addScaledVector(new THREE.Vector3(0,0,1), -0.05);
		continue;
	    }
	    

	    //const dir = new THREE.Vector3();
	    //camera.getWorldDirection(dir);
	    //dir.y = 0; dir.normalize();
	    //const strafe = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).negate();
	    //cameraRig.position.addScaledVector(dir, -y * 0.05);
	    //cameraRig.position.addScaledVector(strafe, x * 0.05);

	    cameraRigPosition.addScaledVector(forwardDir, -y*0.05);
	    cameraRigPosition.addScaledVector(rightDir, x*0.05);
	    updateCameraRig();

	} else if (source.handedness === 'right') {
	    hudMessage += `right: [${x.toFixed(4)}, ${y.toFixed(4)}]\n`;

	    cameraRigZRotation += -x * Math.PI/200;
	    updateCameraRig();

	    //cameraRig.rotateZ(-);

	    //// Right stick: snap turn
	    //if (Math.abs(x) > 0.7 && !source._turned) {
	    //  cameraRig.rotateY(x > 0 ? -Math.PI / 8 : Math.PI / 8);
	    //  source._turned = true;
	    //} else if (Math.abs(x) < 0.3) {
	    //   source._turned = false;
	    //}
	}
    }
}

function handleDesktopMovement() {
    const speed = 0.08;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const strafe = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).negate();
    if (keys['KeyW']) camera.position.addScaledVector(dir, speed);
    if (keys['KeyS']) camera.position.addScaledVector(dir, -speed);
    if (keys['KeyA']) camera.position.addScaledVector(strafe, -speed);
    if (keys['KeyD']) camera.position.addScaledVector(strafe, speed);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
    if (renderer.xr.isPresenting) {
	handleVRMovement();
    } else {
	handleDesktopMovement();
    }
    
    setHudText(
	`Pos: ${cameraRig.position.x.toFixed(2)}, ${cameraRig.position.y.toFixed(2)}, ${cameraRig.position.z.toFixed(2)}\n` + hudMessage
    );
    
    renderer.render(scene, camera);
});
