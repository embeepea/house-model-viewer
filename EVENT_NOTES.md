# Prompt

Do events in WebXR use some kind of an event model that allows clients to subscribe to events, and be notified when they happen (e.g. by registering listeners)?  Or is it based on polling, as I think is the case in vrtest.js, where the client fetches a list of inputSources and checks them to discover the state of various input devices (head direction, hand controller buttons, etc) ?

# Response

Both — WebXR is a hybrid model, and vrtest.js currently only uses the polling half.

**Event-based side**

`XRSession` is an `EventTarget`, so you can register listeners for discrete, edge-triggered occurrences:

- `inputsourceschange` — fired when a controller/hand is connected or disconnected (input sources added/removed)
- `select`, `selectstart`, `selectend` — the primary trigger action (works even for gaze/tap-based inputs that have no physical trigger)
- `squeeze`, `squeezestart`, `squeezeend` — grip button press
- `visibilitychange` — session visibility state changes
- `end` — session ends

These are one-shot notifications, good for "did the user just pull the trigger" type logic.

**Polling side**

For continuous, per-frame state — head/controller pose, thumbstick axes, analog button pressure — there's no event model. You poll once per animation frame:

- `session.inputSources` — a live list you iterate each frame (this is what vrtest.js:213 does)
- `source.gamepad.axes` / `source.gamepad.buttons` — the standard Gamepad API, which has *never* had an event model for axis/button values; polling is the only way to read it
- `frame.getViewerPose(referenceSpace)` / `frame.getPose(...)` — head and controller position/orientation, obtained from the `XRFrame` passed into your `requestAnimationFrame`/`setAnimationLoop` callback

**In vrtest.js specifically**

Looking at the file: it uses `renderer.setAnimationLoop(...)` (line 281) and calls `handleVRMovement()` inside that loop, which polls `session.inputSources` and reads `source.gamepad.axes` for thumbstick locomotion (lines 211–221). There are no `addEventListener` calls on the XR session anywhere in the file — so right now it's polling-only, which is the correct/idiomatic choice for what it's doing (continuous joystick-driven movement needs a value every frame, not a one-time event). If you later wanted to detect a discrete action like "user pressed the A button to teleport" or "controller connected," that's where you'd add `session.addEventListener('select', ...)` or `session.addEventListener('inputsourceschange', ...)` instead of polling for it.






---

# Prompt

Read ~/claude-house-model/src/main.ts.  It uses an on-demand rendering strategy, whereby the screen is only re-rendered when and if something has changed, e.g. the user drug the mouse so the view needs to be re-rendered from the new camera location.  If nothing is happening, no mouse motion or other events to respond to, the app does nothing at all ... it just sits there waiting for the next event, not wasting any cycles continuously redrawing the same scene over and over.  I gather than with WebXR, an on-demand approach isn't feasible, because some inputs (head gaze, controller joysticks) have to be polled in a tight loop in order to properly be handled.  I suppose it could be possible to make the rendering be on-demand, but have a continuously-running event-checking loop that polls all the relevant devices and decides whether a re-render is needed.  On the other hand, I also wonder whether this would be worth the effort for a VR app.  In VR, as long as the user is wearing the headset, the chances of there being absolutely no head motion  (and therefore no need to re-render) are essentially 0.  (As opposed to a desktop application, which can often sit idle with no events at all when the user switches to a different window or tab.)  Anyway, does all this sound reasonable?  Do developers ever use the on-demand strategy in VR applications?

# Response

Yes, your reasoning holds up, and reading `main.ts` sharpens why the two apps differ so fundamentally.

**Why on-demand doesn't map onto WebXR**

`main.ts`'s trick (lines 145–158) is: nothing schedules a `requestAnimationFrame` unless `requestRender()` is called by an actual event (`controls.addEventListener('change', requestRender)`, resize, a checkbox). Absent input, zero callbacks fire — the tab is truly idle.

WebXR breaks this at the API level, not just as a performance tradeoff:

1. **Pose data only exists inside the XR frame callback.** `XRFrame.getViewerPose()` is only valid inside the callback the runtime schedules for you (`renderer.setAnimationLoop(...)` under the hood, which switches to `session.requestAnimationFrame` while presenting). There's no "peek at head pose whenever I feel like it" API — you can't build the polling-decides-whether-to-render loop you described without already being inside the very loop you'd be trying to avoid.
2. **The compositor expects a frame every vsync, unconditionally.** VR runtimes (Meta/OpenXR/SteamVR etc.) budget for the app submitting a new frame each display refresh (72/90/120Hz). If you stop submitting, the runtime doesn't just show a blank screen — it reprojects/timewarps the last real frame using updated head-pose to paper over the gap. That's a *fallback* mechanism for missed frame deadlines, not something you want to deliberately lean on as your steady-state rendering strategy — sustained non-submission reads to the runtime as your app hanging.
3. **Skipping the callback doesn't save what you think it saves.** On desktop, `requestRender()`'s win is that no callback is scheduled at all — the event loop sleeps, CPU/battery cost is ~0. In VR, the browser calls your XR callback every vsync regardless, because it owns the frame cadence while a session is presenting. Checking "did anything change?" inside that callback and skipping `renderer.render()` still burns the wakeup, still runs your pose/input-processing code, and forfeits the one thing on-demand rendering was buying you on desktop.

So it's not just "more effort than it's worth" — the polling loop you'd build to gate rendering *is* the mandatory XR frame loop, and rendering conditionally inside it saves little.

**Does anyone do on-demand rendering in VR?**

Essentially no, and for the reason you already landed on: head motion (plus natural micro-tremor even when someone tries to hold still) makes "nothing changed" a near-zero-probability state whenever a session is presenting. Unity, Unreal, and native OpenXR apps all render every frame unconditionally while in VR. The optimizations that *do* exist target the cost per frame rather than the frequency of frames:

- Fixed/dynamic foveated rendering (render periphery at lower resolution)
- Dynamic resolution scaling based on GPU headroom
- Reduced simulation/physics tick rate while still rendering every frame (camera view always updates from tracking even if scene logic is static)

The one place "on demand" survives in spirit is handheld WebXR AR (phone-based, not headset) — a user *can* hold a phone still — but even there the spec gives you no alternative frame-delivery model; you still get called every vsync and simply do less work per callback when nothing's moved. There's no equivalent of your `requestRender()` gate for XR sessions.

**Bottom line for vrtest.js:** the polling-in-`setAnimationLoop` approach it already uses isn't a workaround or a missed optimization — it's the only model WebXR offers once a session is presenting.






---

# Prompt

show me a snippt of code that would work in vrtest.js (don't modify any files, just show me the code here) that would let me detect the position and orientation of the hand controllers

# Response

Two ways to do this in Three.js. Since you're not modifying files, here's both — pick the one that fits.

## Option A: Three.js controller objects (simplest, no `XRFrame` needed)

Three.js's `WebXRManager` already tracks each controller's pose internally and exposes it as a regular `Object3D` you can just read `.position` / `.quaternion` from — no need to touch the raw WebXR frame API at all.

```js
// Set up once, outside the animation loop (e.g. near where `scene`/`camera` are created):
const controller0 = renderer.xr.getController(0);
const controller1 = renderer.xr.getController(1);
scene.add(controller0);
scene.add(controller1);

// Then, anywhere inside the setAnimationLoop callback (e.g. inside handleVRMovement):
function logControllerPoses() {
    for (const controller of [controller0, controller1]) {
        if (!controller.visible) continue; // not tracked/connected this frame
        const pos = controller.position;      // THREE.Vector3, in world space
        const quat = controller.quaternion;   // THREE.Quaternion, orientation
        console.log(`pos: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}  ` +
                    `quat: ${quat.x.toFixed(2)}, ${quat.y.toFixed(2)}, ${quat.z.toFixed(2)}, ${quat.w.toFixed(2)}`);
    }
}
```

Note: `getController(0)`/`getController(1)` are indexed by *connection order*, not handedness — index 0 isn't guaranteed to be the left hand. If you need to know which is which, pair this with the `handedness` check you're already doing in `handleVRMovement` via `session.inputSources` (match by `source.handedness === 'left' | 'right'`), or use the `connected`/`disconnected` events Three.js fires on these objects with the `XRInputSource` attached (`event.data.handedness`).

## Option B: Raw WebXR (matches the polling style already in `handleVRMovement`)

This requires the `XRFrame` object, which your current `setAnimationLoop(() => {...})` callback (line 281) doesn't currently receive — you'd add a `frame` parameter:

```js
renderer.setAnimationLoop((time, frame) => {
    if (renderer.xr.isPresenting && frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = frame.session;
        for (const source of session.inputSources) {
            if (!source.gripSpace) continue; // no controller pose for this input source
            const pose = frame.getPose(source.gripSpace, referenceSpace);
            if (!pose) continue;
            const { position, orientation } = pose.transform; // DOMPointReadOnly, x/y/z(/w)
            console.log(source.handedness, position, orientation);
        }
    }
    // ...rest of existing loop
});
```

Option A is the one I'd actually reach for in vrtest.js — it composes naturally with `THREE.Object3D` (attach a controller model as a child, use it for raycasting, etc.) and doesn't require restructuring the animation loop's signature.
