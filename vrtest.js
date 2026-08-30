console.log('BOO!');

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

function ft(f,i=0) {
    return f + i/12;
}

function inch(i) {
    return i/12;
}


const INITIAL_CAMERA_POSITION = new THREE.Vector2(0, -30)

//const INITIAL_EYE_HEIGHT = ft(5,4)

// for lower level:
const INITIAL_EYE_HEIGHT = -ft(10) + ft(5,4)


const ENABLE_HUD = false
const ENABLE_FLOOR_GRID = false

////////////////////////////////////////////////////////////////////////////////

// Utility function for creating a single line segment object; for use in debugging.
// (initially used to display the current head look vector; that code has been removed
// at this point but I'm leaving this function here in case it's needed for something
// similar in the future, e.g. debugging hand pointer directions)
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
if (ENABLE_HUD) {
    camera.add(hudPanel); // parent to camera so it tracks head movement
    // (camera is already added to cameraRig, which is added to scene, so this works)
}

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

//  from kscope:
//camera.matrix.identity();
//
//camera.matrix.multiply(new THREE.Matrix4().makeTranslation(this.cameraX, this.cameraY, this.cameraZ));
//camera.matrix.multiply(new THREE.Matrix4().makeRotationY(this.cameraYAngle));
//camera.matrix.multiply(new THREE.Matrix4().makeRotationX(this.cameraXAngle));


// Rig so we can move the camera around in VR (moving camera directly doesn't work well in WebXR)

// The purpose of the inner rig is just to rotate the camera 90 degrees around the X axis, so
// +Z appears up.  This rotation means that everywhere else we can assume +Z up.  This inner rig
// rotation never changes; all future adjustments to camera position/orientation happen to the
// main (outer) rig (or to the camera itself, for VR head-tracked movement).
const cameraInnerRig = new THREE.Group();
cameraInnerRig.matrixAutoUpdate = false;
cameraInnerRig.add(camera);
cameraInnerRig.matrix.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

const cameraRig = new THREE.Group();
cameraRig.matrixAutoUpdate = false;
cameraRig.add(cameraInnerRig);
scene.add(cameraRig);

const cameraRigPosition = new THREE.Vector3(INITIAL_CAMERA_POSITION.x, INITIAL_CAMERA_POSITION.y, INITIAL_EYE_HEIGHT);
let cameraRigZRotation = 0;

function updateCameraRig() {
    cameraRig.matrix.identity();
    cameraRig.matrix.multiply(new THREE.Matrix4().makeTranslation(cameraRigPosition.x,
								  cameraRigPosition.y,
								  cameraRigPosition.z));
    cameraRig.matrix.multiply(new THREE.Matrix4().makeRotationZ(cameraRigZRotation));
}
updateCameraRig();

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

if (ENABLE_FLOOR_GRID) {
    // Ground grid for spatial reference
    const grid = new THREE.GridHelper(140, 140, 0x555555, 0x333333);
    // THREE.GridHelper returns a grid in the x-z plane.  Rotate 90 deg around x axis
    // to get it into the x-y plane.
    grid.rotation.x = -Math.PI / 2;
    scene.add(grid);
}

const loader = new GLTFLoader();
loader.load(
  './house.gltf',
(gltf) => {
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

	const lookDir = new THREE.Vector3();
	camera.getWorldDirection(lookDir);

	const axes = source.gamepad.axes; // [x, y] or [touchpadX, touchpadY, thumbX, thumbY]
	const x = axes.length >= 4 ? axes[2] : axes[0];
	const y = axes.length >= 4 ? axes[3] : axes[1];
	
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

	const forwardDir = new THREE.Vector3(lookDir.x, lookDir.y, 0);
	forwardDir.normalize();
	const rightDir = new THREE.Vector3().crossVectors(forwardDir, new THREE.Vector3(0, 0, 1));
	
	if (source.handedness === 'left') {
	    // Left stick: move relative to where the headset is facing
	    const buttons = source.gamepad.buttons;
	    const xPressed = buttons[4].pressed;
	    const yPressed = buttons[5].pressed;
	    if (xPressed) {
		cameraRigPosition.addScaledVector(new THREE.Vector3(0,0,1), 0.05);
		continue;
	    } else if (yPressed) {
		cameraRigPosition.addScaledVector(new THREE.Vector3(0,0,1), -0.05);
		continue;
	    }

	    const n = Math.sqrt(x*x + y*y);
	    const s = 0.05 + n*0.1
	    cameraRigPosition.addScaledVector(forwardDir, -y*s);
	    cameraRigPosition.addScaledVector(rightDir, x*s);
	    updateCameraRig();
	} else if (source.handedness === 'right') {
	    hudMessage += `right: [${x.toFixed(4)}, ${y.toFixed(4)}]\n`;

	    cameraRigZRotation += -x * Math.PI/200;
	    updateCameraRig();
	}
    }
}

function handleDesktopMovement() {
    const speed = 0.12;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const strafe = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).negate();
    if (keys['KeyW']) camera.position.addScaledVector(dir, speed);
    if (keys['KeyS']) camera.position.addScaledVector(dir, -speed);
    if (keys['KeyA']) camera.position.addScaledVector(strafe, speed);
    if (keys['KeyD']) camera.position.addScaledVector(strafe, -speed);
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

    if (ENABLE_HUD) {    
	setHudText(
	    `Pos: ${cameraRig.position.x.toFixed(2)}, ${cameraRig.position.y.toFixed(2)}, ${cameraRig.position.z.toFixed(2)}\n` + hudMessage
	);
    }
    
    renderer.render(scene, camera);
});
