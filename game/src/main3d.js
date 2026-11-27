// Skybound Run 3D — WebGL flight game (Three.js, vendored locally, offline).
(function () {
"use strict";
var canvas = document.getElementById("game");
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;

var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe4f5, 1400, 5600);
var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);

window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- deterministic noise ----------
function hash(x, z) { var n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
function smoothNoise(x, z) {
  var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  var u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return hash(xi, zi) * (1 - u) * (1 - v) + hash(xi + 1, zi) * u * (1 - v) +
         hash(xi, zi + 1) * (1 - u) * v + hash(xi + 1, zi + 1) * u * v;
}
function terrainHeight(x, z) {
  var h = smoothNoise(x * 0.0016, z * 0.0016) * 190 + smoothNoise(x * 0.006, z * 0.006) * 46 + smoothNoise(x * 0.02, z * 0.02) * 8;
  h -= 14;
  var d = Math.max(Math.abs(x) / 260, Math.abs(z) / 620); // flatten near runway strip
  var t = Math.min(1, Math.max(0, (d - 0.55) / 0.9));
  var s = t * t * (3 - 2 * t);
  return h * s + 5 * (1 - s);
}

// ---------- sky, lights ----------
var skyGeo = new THREE.SphereGeometry(6000, 24, 12);
var skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x3d7dc4) }, mid: { value: new THREE.Color(0x9fd0f2) }, bot: { value: new THREE.Color(0xeaf6ff) } },
  vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.85, h)) : mix(bot, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }"
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

var hemi = new THREE.HemisphereLight(0xbfe0ff, 0x5d7a4a, 0.75); scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
sun.position.set(900, 1400, -700); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -500; sun.shadow.camera.right = 500;
sun.shadow.camera.top = 500; sun.shadow.camera.bottom = -500;
sun.shadow.camera.far = 4000; sun.shadow.bias = -0.0004;
scene.add(sun); scene.add(sun.target);

// sun glow sprite + clouds
function glowTexture(inner, outer) {
  var c = document.createElement("canvas"); c.width = c.height = 128;
  var g = c.getContext("2d"); var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
var sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(255,250,220,1)", "rgba(255,240,190,0)"), fog: false, depthWrite: false }));
sunSpr.scale.set(620, 620, 1); sunSpr.position.set(2600, 2900, -2100); scene.add(sunSpr);

var cloudTex = glowTexture("rgba(255,255,255,0.95)", "rgba(255,255,255,0)");
var clouds = new THREE.Group();
for (var ci = 0; ci < 60; ci++) {
  var cl = new THREE.Group();
  var n = 3 + Math.floor(hash(ci, 7) * 4);
  for (var cj = 0; cj < n; cj++) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false }));
    var sc = 180 + hash(ci, cj) * 260; s.scale.set(sc, sc * 0.42, 1);
    s.position.set((hash(cj, ci) - 0.5) * 260, (hash(ci, cj + 9) - 0.5) * 40, (hash(cj + 3, ci) - 0.5) * 120);
    cl.add(s);
  }
  cl.position.set((hash(ci, 1) - 0.5) * 5200, 420 + hash(ci, 2) * 260, (hash(ci, 3) - 0.5) * 5200);
  clouds.add(cl);
}
scene.add(clouds);

// ---------- terrain ----------
var SIZE = 5200, SEG = 150;
var tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
tGeo.rotateX(-Math.PI / 2);
var pos = tGeo.attributes.position;
var colors = new Float32Array(pos.count * 3);
var cSand = new THREE.Color(0xc9b26e), cGrass = new THREE.Color(0x4f9440), cForest = new THREE.Color(0x2e6628),
    cRock = new THREE.Color(0x756e60), cSnow = new THREE.Color(0xeef4f9), tmpC = new THREE.Color();
for (var i = 0; i < pos.count; i++) {
  var x = pos.getX(i), z = pos.getZ(i), h = terrainHeight(x, z);
  pos.setY(i, h);
  var nse = smoothNoise(x * 0.05, z * 0.05) * 0.14;
  if (h < 3.2) tmpC.copy(cSand);
  else if (h < 58) tmpC.copy(cGrass).lerp(cForest, smoothNoise(x * 0.008, z * 0.008));
  else if (h < 118) tmpC.copy(cForest).lerp(cRock, (h - 58) / 60);
  else if (h < 172) tmpC.copy(cRock);
  else tmpC.copy(cRock).lerp(cSnow, Math.min(1, (h - 172) / 40));
  tmpC.offsetHSL(0, 0, nse - 0.07);
  if (h >= 3.2 && h < 58) { // farmland patchwork
    var cell = hash(Math.floor(x / 90), Math.floor(z / 90));
    if (cell > 0.62) tmpC.lerp(new THREE.Color(0xb9a84e), 0.55);
    else if (cell < 0.18) tmpC.lerp(new THREE.Color(0x7fae56), 0.5);
  }
  colors[i * 3] = tmpC.r; colors[i * 3 + 1] = tmpC.g; colors[i * 3 + 2] = tmpC.b;
}
tGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
tGeo.computeVertexNormals();
var terrain = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
terrain.receiveShadow = true; scene.add(terrain);

// water
var water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshPhongMaterial({ color: 0x1c6cb2, transparent: true, opacity: 0.88, shininess: 220, specular: 0xd8f2ff }));
water.rotation.x = -Math.PI / 2; water.position.y = 1.4; scene.add(water);

// ---------- runway ----------
function runwayTexture() {
  var c = document.createElement("canvas"); c.width = 256; c.height = 1024;
  var g = c.getContext("2d");
  g.fillStyle = "#33383e"; g.fillRect(0, 0, 256, 1024);
  g.fillStyle = "#f5f7f9"; g.fillRect(8, 0, 6, 1024); g.fillRect(242, 0, 6, 1024);
  for (var y = 30; y < 1000; y += 90) g.fillRect(124, y, 8, 46);
  for (var k = 0; k < 6; k++) { g.fillRect(24 + k * 36, 18, 20, 64); g.fillRect(24 + k * 36, 942, 20, 64); }
  g.font = "bold 74px Arial"; g.textAlign = "center"; g.fillText("36", 128, 190);
  g.save(); g.translate(128, 850); g.rotate(Math.PI); g.fillText("18", 0, 26); g.restore();
  return new THREE.CanvasTexture(c);
}
var runway = new THREE.Mesh(new THREE.PlaneGeometry(64, 640), new THREE.MeshLambertMaterial({ map: runwayTexture() }));
runway.rotation.x = -Math.PI / 2; runway.position.y = 5.25; runway.receiveShadow = true; scene.add(runway);

// runway edge lights + hangars + tower
var lightGeo = new THREE.SphereGeometry(0.9, 8, 6);
var lightMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
var edgeLights = new THREE.InstancedMesh(lightGeo, lightMat, 44);
var m4 = new THREE.Matrix4();
for (var li = 0; li < 22; li++) {
  m4.setPosition(-34, 5.9, -315 + li * 30); edgeLights.setMatrixAt(li * 2, m4);
  m4.setPosition(34, 5.9, -315 + li * 30); edgeLights.setMatrixAt(li * 2 + 1, m4);
}
scene.add(edgeLights);
function box(w, h, d, color, x, y, z) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: color }));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
}
box(46, 14, 30, 0x9aa4ad, -95, 12, -120); box(46, 14, 30, 0x8b95a0, -95, 12, -60);
box(10, 30, 10, 0xb8c0c8, 95, 20, 60); box(14, 5, 14, 0x3d6ea5, 95, 37, 60);

// ---------- trees & houses (instanced) ----------
var trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 5, 5), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }), 1600);
var leaf = new THREE.InstancedMesh(new THREE.ConeGeometry(5, 15, 7), new THREE.MeshLambertMaterial({ color: 0x2f6b2e }), 1600);
var placed = 0, guard = 0;
while (placed < 1600 && guard++ < 14000) {
  var tx = (hash(guard, 11) - 0.5) * 4600, tz = (hash(guard, 23) - 0.5) * 4600;
  if (Math.abs(tx) < 120 && Math.abs(tz) < 420) continue;
  var th = terrainHeight(tx, tz); if (th < 3 || th > 95) continue;
  var s = 0.8 + hash(guard, 31) * 0.9;
  m4.makeScale(s, s, s); m4.setPosition(tx, th + 2.4 * s, tz); trunk.setMatrixAt(placed, m4);
  m4.makeScale(s, s, s); m4.setPosition(tx, th + (5 + 7) * s, tz); leaf.setMatrixAt(placed, m4);
  placed++;
}
trunk.count = leaf.count = placed; leaf.castShadow = true;
scene.add(trunk); scene.add(leaf);

var house = new THREE.InstancedMesh(new THREE.BoxGeometry(12, 7, 10), new THREE.MeshLambertMaterial({ color: 0xe8ddc8 }), 60);
var roof = new THREE.InstancedMesh(new THREE.ConeGeometry(9.5, 5, 4), new THREE.MeshLambertMaterial({ color: 0xa84f38 }), 60);
for (var hi = 0; hi < 60; hi++) {
  var hx = 420 + (hash(hi, 41) - 0.5) * 380, hz = -520 + (hash(hi, 43) - 0.5) * 380;
  var hh = Math.max(terrainHeight(hx, hz), 2);
  m4.identity(); m4.setPosition(hx, hh + 3.5, hz); house.setMatrixAt(hi, m4);
  m4.makeRotationY(Math.PI / 4); m4.setPosition(hx, hh + 9.4, hz); roof.setMatrixAt(hi, m4);
}
house.castShadow = roof.castShadow = true;
scene.add(house); scene.add(roof);

// ---------- airplane ----------
var plane = new THREE.Group();
var matWhite = new THREE.MeshPhongMaterial({ color: 0xf2f5f7, shininess: 70, specular: 0x99aabb });
var matRed = new THREE.MeshPhongMaterial({ color: 0xd43a2e, shininess: 60 });
var matDark = new THREE.MeshPhongMaterial({ color: 0x14202e, shininess: 120, specular: 0x88aacc });
function part(geo, mat, x, y, z, rx, ry, rz) {
  var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
  m.castShadow = true; plane.add(m); return m;
}
part(new THREE.CylinderGeometry(1.5, 0.75, 11, 14), matWhite, 0, 0, 0, Math.PI / 2);
part(new THREE.SphereGeometry(1.5, 14, 10), matWhite, 0, 0, -5.4);
part(new THREE.CylinderGeometry(1.53, 1.53, 1.15, 14), matRed, 0, 0, 1.6, Math.PI / 2);
part(new THREE.SphereGeometry(1.05, 12, 8), matDark, 0, 0.85, -2.2).scale.set(1, 0.72, 1.9);
part(new THREE.BoxGeometry(15.5, 0.32, 2.5), matRed, 0, -0.25, -1.2);
part(new THREE.BoxGeometry(1.7, 0.36, 2.5), matWhite, -7.05, -0.25, -1.2);
part(new THREE.BoxGeometry(1.7, 0.36, 2.5), matWhite, 7.05, -0.25, -1.2);
part(new THREE.BoxGeometry(5.6, 0.24, 1.6), matRed, 0, 0.55, 5.1);
part(new THREE.BoxGeometry(0.26, 2.3, 1.7), matRed, 0, 1.2, 5.2);
part(new THREE.BoxGeometry(0.3, 1.1, 1.7), matWhite, 0, 2.35, 5.2);
part(new THREE.SphereGeometry(0.42, 8, 6), matDark, 0, 0, -6.9);
var prop = new THREE.Group(); prop.position.set(0, 0, -7.1); plane.add(prop);
var blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 0.12), matDark); prop.add(blade);
var disc = new THREE.Mesh(new THREE.CircleGeometry(3.6, 24), new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
prop.add(disc);
var navL = part(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4444 }), -7.8, -0.25, -1.2);
var navR = part(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x44ff77 }), 7.8, -0.25, -1.2);
var wheelL = part(new THREE.SphereGeometry(0.62, 8, 6), matDark, -1.7, -1.7, -0.6);
var wheelR = part(new THREE.SphereGeometry(0.62, 8, 6), matDark, 1.7, -1.7, -0.6);
part(new THREE.SphereGeometry(0.45, 8, 6), matDark, 0, -1.5, 4.6);
scene.add(plane);
plane.scale.set(1.5, 1.5, 1.5);

// wingtip contrail: a short ribbon of fading puffs that makes speed and
// banking read at a glance, in motion and in stills alike.
var TRAIL_N = 90;
var trailGeo = new THREE.BufferGeometry();
var trailPos = new Float32Array(TRAIL_N * 3);
var trailLife = new Float32Array(TRAIL_N);
trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
var trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ map: glowTexture("rgba(255,255,255,0.85)", "rgba(255,255,255,0)"), color: 0xffffff, size: 3.4, transparent: true, opacity: 0.35, depthWrite: false }));
trail.frustumCulled = false; scene.add(trail);
var trailHead = 0;
function emitTrail(dt) {
  if (!S.airborne || S.speed < 18) return;
  trailHead = (trailHead + 1) % TRAIL_N;
  var side = trailHead % 2 === 0 ? -11.4 : 11.4;
  var tip = new THREE.Vector3(side, -0.4, 1.6).applyEuler(plane.rotation).add(S.pos);
  trailPos[trailHead * 3] = tip.x; trailPos[trailHead * 3 + 1] = tip.y; trailPos[trailHead * 3 + 2] = tip.z;
  trailLife[trailHead] = 1;
}
function ageTrail(dt) {
  for (var i = 0; i < TRAIL_N; i++) {
    if (trailLife[i] <= 0) continue;
    trailLife[i] -= dt * 0.8;
    trailPos[i * 3 + 1] += dt * 1.5;
    if (trailLife[i] <= 0) trailPos[i * 3 + 1] = -9999;
  }
  trailGeo.attributes.position.needsUpdate = true;
}

// ---------- courses & rings ----------
var COURSES = [
  { name: "Dawn Valley", rings: 6, wind: 0, sunPos: [1500, 700, -900], sunCol: 0xffd9a8, fog: 0xf3d9c2, skyTop: 0x4a6fb5, skyMid: 0xe8a87c, hemi: 0.55 },
  { name: "Coastal Noon", rings: 8, wind: 4, sunPos: [900, 1400, -700], sunCol: 0xfff2d8, fog: 0xcfe4f5, skyTop: 0x3d7dc4, skyMid: 0x9fd0f2, hemi: 0.75 },
  { name: "Dusk Canyon", rings: 10, wind: 7, sunPos: [-1600, 420, -600], sunCol: 0xffb37a, fog: 0xe8b48f, skyTop: 0x35477e, skyMid: 0xd97e5f, hemi: 0.5 }
];
var courseIdx = 1;
var ringGroup = new THREE.Group(); scene.add(ringGroup);
var rings = [];
function buildCourse() {
  while (ringGroup.children.length) ringGroup.remove(ringGroup.children[0]);
  rings = [];
  var n = COURSES[courseIdx].rings;
  for (var i = 0; i < n; i++) {
    var ang = (i / n) * Math.PI * 1.55 - 0.4;
    var rad = 620 + i * 95;
    var px = Math.sin(ang) * rad, pz = -Math.cos(ang) * rad - 350;
    var py = 120 + Math.sin(i * 1.7) * 55 + i * 6;
    py = Math.max(py, terrainHeight(px, pz) + 42);
    var tor = new THREE.Mesh(new THREE.TorusGeometry(20, 2.3, 14, 48),
      new THREE.MeshBasicMaterial({ color: 0xffb02e }));
    tor.position.set(px, py, pz);
    tor.lookAt(px + Math.cos(ang), py, pz + Math.sin(ang));
    var glow = new THREE.Mesh(new THREE.TorusGeometry(20, 4.6, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.copy(tor.position); glow.quaternion.copy(tor.quaternion);
    var discIn = new THREE.Mesh(new THREE.CircleGeometry(19, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    discIn.position.copy(tor.position); discIn.quaternion.copy(tor.quaternion);
    var pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.2, py, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffcf6e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    pillar.position.set(px, py / 2, pz);
    ringGroup.add(tor); ringGroup.add(glow); ringGroup.add(discIn); ringGroup.add(pillar);
    rings.push({ mesh: tor, glow: glow, disc: discIn, pillar: pillar, pos: new THREE.Vector3(px, py, pz), nx: Math.cos(ang), nz: Math.sin(ang), done: false });
  }
}
function applyCourseLook() {
  var c = COURSES[courseIdx];
  sun.position.set(c.sunPos[0], c.sunPos[1], c.sunPos[2]); sun.color.setHex(c.sunCol);
  scene.fog.color.setHex(c.fog);
  skyMat.uniforms.top.value.setHex(c.skyTop); skyMat.uniforms.mid.value.setHex(c.skyMid);
  hemi.intensity = c.hemi;
  sunSpr.position.set(c.sunPos[0] * 2.2, Math.max(c.sunPos[1] * 1.6, 500), c.sunPos[2] * 2.2);
  document.getElementById("course").textContent = c.name;
  ["c1", "c2", "c3"].forEach(function (id, i) { document.getElementById(id).className = i === courseIdx ? "sel" : ""; });
}

// ---------- state ----------
var S = {};
function resetState() {
  S.mode = "start"; S.pos = new THREE.Vector3(0, 7.2, 260);
  S.heading = 0; S.pitch = 0; S.roll = 0; S.speed = 0; S.throttle = 0;
  S.vy = 0; S.airborne = false; S.gear = true; S.flaps = false; S.brake = false;
  S.cam = "chase"; S.score = 0; S.ringIdx = 0; S.time = 0; S.msg = ""; S.msgT = 0;
  S.paused = false; S.landed = false; S.grade = ""; S.mouseSteer = false; S.mx = 0; S.my = 0;
  buildCourse(); applyCourseLook();
  document.getElementById("start").style.display = "flex";
  document.getElementById("end").style.display = "none";
  document.getElementById("panel").style.display = "none";
}
resetState();

// ---------- input ----------
var keys = {};
window.addEventListener("keydown", function (e) {
  keys[e.code] = true;
  if (S.mode === "start") {
    if (e.code === "Digit1") { courseIdx = 0; resetState(); }
    if (e.code === "Digit2") { courseIdx = 1; resetState(); }
    if (e.code === "Digit3") { courseIdx = 2; resetState(); }
    if (e.code === "Enter") { S.mode = "fly"; document.getElementById("start").style.display = "none"; }
  }
  if (S.mode === "fly") {
    if (e.code === "Digit1") { courseIdx = 0; resetState(); launchIntoFlight(); }
    if (e.code === "Digit2") { courseIdx = 1; resetState(); launchIntoFlight(); }
    if (e.code === "Digit3") { courseIdx = 2; resetState(); launchIntoFlight(); }
  }
  if (e.code === "KeyC" && S.mode === "fly") {
    S.cam = S.cam === "chase" ? "cockpit" : "chase";
    document.getElementById("panel").style.display = S.cam === "cockpit" ? "block" : "none";
  }
  if (e.code === "KeyF") S.flaps = !S.flaps;
  if (e.code === "KeyG") S.gear = !S.gear;
  if (e.code === "KeyP") S.paused = !S.paused;
  if (e.code === "KeyR") { resetState(); launchIntoFlight(); }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) e.preventDefault();
});
window.addEventListener("keyup", function (e) { keys[e.code] = false; });
canvas.addEventListener("click", function () { S.mouseSteer = true; });
window.addEventListener("mousemove", function (e) {
  S.mx = (e.clientX / window.innerWidth - 0.5) * 2;
  S.my = (e.clientY / window.innerHeight - 0.5) * 2;
});

// ---------- audio (tiny synth) ----------
var AC = null, engOsc = null, engGain = null;
function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    engOsc = AC.createOscillator(); engOsc.type = "sawtooth"; engOsc.frequency.value = 55;
    var f = AC.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 420;
    engGain = AC.createGain(); engGain.gain.value = 0;
    engOsc.connect(f); f.connect(engGain); engGain.connect(AC.destination); engOsc.start();
  } catch (err) { AC = null; }
}
function chime() {
  if (!AC) return;
  [880, 1174].forEach(function (fr, i) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = fr; g.gain.setValueAtTime(0.12, AC.currentTime + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + i * 0.09 + 0.35);
    o.connect(g); g.connect(AC.destination); o.start(AC.currentTime + i * 0.09); o.stop(AC.currentTime + i * 0.09 + 0.4);
  });
}

// ---------- HUD ----------
var el = {};
["heading", "ringinfo", "score", "view", "spd", "alt", "msg", "sub", "endscore", "endtime", "endline", "grade"].forEach(function (id) { el[id] = document.getElementById(id); });
var mm = document.getElementById("minimap").getContext("2d");
var gg = document.getElementById("gauges").getContext("2d");
function drawGauges() {
  gg.clearRect(0, 0, 900, 150);
  function gauge(cx, label, val, min, max, unit) {
    gg.beginPath(); gg.arc(cx, 78, 58, 0, Math.PI * 2); gg.fillStyle = "#0d1117"; gg.fill();
    gg.strokeStyle = "#5a6672"; gg.lineWidth = 3; gg.stroke();
    for (var i = 0; i <= 10; i++) {
      var a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      gg.beginPath(); gg.moveTo(cx + Math.cos(a) * 46, 78 + Math.sin(a) * 46); gg.lineTo(cx + Math.cos(a) * 54, 78 + Math.sin(a) * 54);
      gg.strokeStyle = "#cfe3f5"; gg.lineWidth = 2; gg.stroke();
    }
    var t = Math.max(0, Math.min(1, (val - min) / (max - min)));
    var na = Math.PI * 0.75 + t * Math.PI * 1.5;
    gg.beginPath(); gg.moveTo(cx, 78); gg.lineTo(cx + Math.cos(na) * 44, 78 + Math.sin(na) * 44);
    gg.strokeStyle = "#ffb84d"; gg.lineWidth = 4; gg.stroke();
    gg.fillStyle = "#eaf4ff"; gg.font = "bold 13px Arial"; gg.textAlign = "center";
    gg.fillText(label, cx, 118); gg.font = "11px Arial"; gg.fillText(unit, cx, 132);
  }
  gauge(150, "AIRSPEED", S.speed * 1.94, 0, 200, "KT");
  gauge(330, "ALTITUDE", S.pos.y * 3.28, 0, 3000, "FT");
  // attitude
  gg.save(); gg.beginPath(); gg.arc(510, 78, 58, 0, Math.PI * 2); gg.clip();
  gg.translate(510, 78); gg.rotate(-S.roll); gg.translate(0, S.pitch * 60);
  gg.fillStyle = "#3d7dc4"; gg.fillRect(-90, -120, 180, 120);
  gg.fillStyle = "#7a5a34"; gg.fillRect(-90, 0, 180, 120);
  gg.restore();
  gg.beginPath(); gg.arc(510, 78, 58, 0, Math.PI * 2); gg.strokeStyle = "#5a6672"; gg.lineWidth = 3; gg.stroke();
  gg.strokeStyle = "#ffd97a"; gg.lineWidth = 3;
  gg.beginPath(); gg.moveTo(478, 78); gg.lineTo(502, 78); gg.moveTo(518, 78); gg.lineTo(542, 78); gg.stroke();
  gg.fillStyle = "#eaf4ff"; gg.font = "bold 13px Arial"; gg.textAlign = "center"; gg.fillText("ATTITUDE", 510, 150 - 18);
  gauge(690, "HEADING", ((S.heading * 180 / Math.PI) % 360 + 360) % 360, 0, 360, "DEG");
  gauge(840, "RPM", S.throttle * 2600, 0, 2600, "RPM");
}
function drawMinimap() {
  mm.clearRect(0, 0, 150, 150);
  mm.fillStyle = "#7fb2e0"; mm.fillRect(72, 30, 6, 90);
  rings.forEach(function (r, i) {
    var x = 75 + r.pos.x * 0.045, y = 75 + r.pos.z * 0.045;
    mm.beginPath(); mm.arc(x, y, i === S.ringIdx ? 5 : 3.4, 0, Math.PI * 2);
    mm.fillStyle = r.done ? "#57d977" : (i === S.ringIdx ? "#ffb02e" : "#9fb6c9"); mm.fill();
  });
  var px = 75 + S.pos.x * 0.045, py = 75 + S.pos.z * 0.045;
  mm.save(); mm.translate(px, py); mm.rotate(-S.heading);
  mm.fillStyle = "#fff"; mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(4.5, 5); mm.lineTo(-4.5, 5); mm.closePath(); mm.fill(); mm.restore();
}
function updateHUD() {
  var hdg = ((S.heading * 180 / Math.PI) % 360 + 360) % 360; if (Math.round(hdg) === 0) hdg = 360;
  el.heading.textContent = "HDG " + String(Math.round(hdg)).padStart(3, "0");
  el.ringinfo.textContent = S.ringIdx < rings.length ? ("RING " + (S.ringIdx + 1) + "/" + rings.length + " · " + Math.round(S.pos.distanceTo(rings[S.ringIdx].pos)) + "m") : "LAND ON RUNWAY 36";
  el.score.textContent = "SCORE " + S.score;
  el.view.innerHTML = (S.cam === "chase" ? "CHASE" : "COCKPIT") + "<br>THR " + Math.round(S.throttle * 100) + "%";
  el.spd.textContent = Math.round(S.speed * 1.94);
  el.alt.textContent = Math.round(Math.max(0, S.pos.y) * 3.28);
  el.sub.textContent = "GEAR " + (S.gear ? "DOWN" : "UP") + " · FLAPS " + (S.flaps ? "ON" : "OFF") + (S.brake ? " · BRAKE" : "");
  el.msg.textContent = S.msgT > 0 ? S.msg : "";
  drawMinimap();
  if (S.cam === "cockpit") drawGauges();
}

// ---------- flight ----------
function step(dt) {
  if (S.mode !== "fly" || S.paused) return;
  S.time += dt; if (S.msgT > 0) S.msgT -= dt;
  audioInit();
  if (keys.KeyW) S.throttle = Math.min(1, S.throttle + dt * 0.8);
  if (keys.KeyS) S.throttle = Math.max(0, S.throttle - dt * 0.8);
  S.brake = !!keys.Space;
  var pitchIn = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
  var rollIn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  if (S.mouseSteer) { rollIn += S.mx * 1.2; pitchIn += S.my * 1.1; }
  var rudder = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  S.roll += (Math.max(-1.1, Math.min(1.1, rollIn)) - S.roll) * Math.min(1, dt * 4);
  S.pitch += (Math.max(-0.55, Math.min(0.55, pitchIn * 0.5)) - S.pitch) * Math.min(1, dt * 3);
  var lift = S.flaps ? 20 : 24;
  var targetSpeed = S.throttle * 62 - Math.sin(S.pitch) * 26 - (S.gear ? 3 : 0);
  S.speed += (targetSpeed - S.speed) * Math.min(1, dt * (S.airborne ? 0.55 : 0.9));
  if (S.brake && !S.airborne) S.speed = Math.max(0, S.speed - dt * 22);
  S.speed = Math.max(0, S.speed);
  S.heading += (Math.sin(S.roll) * 0.55 + rudder * 0.12) * dt * (S.airborne ? 1 : Math.min(1, S.speed / 18));
  var groundY = Math.abs(S.pos.x) < 34 && Math.abs(S.pos.z) < 320 ? 7.2 : Math.max(terrainHeight(S.pos.x, S.pos.z), 1.4) + 2.2;
  if (!S.airborne) {
    S.pos.y = groundY;
    if (S.speed > lift && S.pitch < -0.04) { S.airborne = true; S.vy = 2.5; S.msg = "AIRBORNE"; S.msgT = 1.6; }
  } else {
    var stall = S.speed < 17;
    S.vy = Math.sin(-S.pitch) * S.speed * 0.62 - (stall ? 9 : 0) + (S.flaps ? 1.2 : 0);
    S.pos.y += S.vy * dt;
    if (stall) { S.msg = "STALL"; S.msgT = 0.4; }
    if (S.pos.y <= groundY) {
      var onRunway = Math.abs(S.pos.x) < 30 && Math.abs(S.pos.z) < 320;
      var soft = S.vy > -4.5;
      S.pos.y = groundY; S.airborne = false;
      if (S.ringIdx >= rings.length && onRunway && S.gear) {
        S.grade = soft && S.speed < 34 ? "S" : (soft ? "A" : "B");
        S.score += S.grade === "S" ? 400 : S.grade === "A" ? 250 : 120;
        finish();
      } else if (!soft || !S.gear) {
        S.msg = "HARD TOUCHDOWN — R TO RETRY"; S.msgT = 3; S.speed = 0; S.throttle = 0;
      } else { S.msg = "TOUCHDOWN"; S.msgT = 1.6; }
    }
  }
  var wind = COURSES[courseIdx].wind;
  S.pos.x += (Math.sin(S.heading) * S.speed + wind * 0.35) * dt;
  S.pos.z += (-Math.cos(S.heading) * S.speed) * dt;
  S.pos.x = Math.max(-2400, Math.min(2400, S.pos.x));
  S.pos.z = Math.max(-2400, Math.min(2400, S.pos.z));
  S.pos.y = Math.min(S.pos.y, 900);
  // rings
  if (S.ringIdx < rings.length) {
    var r = rings[S.ringIdx];
    var d = S.pos.distanceTo(r.pos);
    if (d < 21) {
      var perfect = d < 8;
      S.score += perfect ? 150 : 100;
      S.msg = perfect ? "+150 PERFECT" : "+100"; S.msgT = 1.6; chime();
      r.done = true; r.mesh.material = new THREE.MeshBasicMaterial({ color: 0x57d977 });
      r.pillar.visible = false; r.glow.visible = false; r.disc.visible = false; S.ringIdx++;
      if (S.ringIdx >= rings.length) { S.msg = "ALL RINGS — LAND ON RUNWAY 36"; S.msgT = 3; }
    }
  }
  if (engGain) { engGain.gain.value = 0.02 + S.throttle * 0.06; engOsc.frequency.value = 50 + S.throttle * 85; }
}
function finish() {
  S.mode = "end";
  el.grade.textContent = S.grade;
  el.endline.textContent = S.grade === "S" ? "Smooth landing — textbook" : S.grade === "A" ? "Good landing" : "Landed — a bit firm";
  el.endscore.textContent = "Score " + S.score;
  var mm2 = Math.floor(S.time / 60), ss = Math.floor(S.time % 60);
  el.endtime.textContent = "Time " + mm2 + ":" + String(ss).padStart(2, "0");
  document.getElementById("end").style.display = "flex";
}

// ---------- shot staging ----------
var camPos = new THREE.Vector3(0, 12, 300);
var shot = new URLSearchParams(window.location.search).get("shot");
function stageShot() {
  if (!shot) return;
  if (shot === "start") { courseIdx = 2; resetState(); return; }
  courseIdx = shot === "cockpit" ? 2 : 1; resetState();
  S.mode = "fly"; document.getElementById("start").style.display = "none";
  S.airborne = true; S.gear = false; S.throttle = 0.68; S.speed = 41;
  if (shot === "play") {
    S.ringIdx = 5; S.score = 450; S.msg = ""; S.msgT = 0;
    for (var i = 0; i < 5; i++) { rings[i].done = true; rings[i].mesh.material = new THREE.MeshBasicMaterial({ color: 0x57d977 }); rings[i].pillar.visible = false; rings[i].glow.visible = false; rings[i].disc.visible = false; }
    var rp = rings[5].pos;
    S.pos.set(rp.x - rings[5].nx * 74, rp.y + 2, rp.z - rings[5].nz * 74);
    S.heading = Math.atan2(rp.x - S.pos.x, -(rp.z - S.pos.z));
    S.roll = 0.38; S.pitch = -0.04; S.paused = true;
    camPos.set(S.pos.x - Math.sin(S.heading) * 17.5 + Math.cos(S.heading) * 6, S.pos.y + 5.5, S.pos.z + Math.cos(S.heading) * 17.5 + Math.sin(S.heading) * 6);
  } else if (shot === "cockpit") {
    var rp2 = rings[5].pos;
    S.pos.set(rp2.x - rings[5].nx * 130, rp2.y, rp2.z - rings[5].nz * 130);
    S.heading = Math.atan2(rp2.x - S.pos.x, -(rp2.z - S.pos.z));
    S.roll = 0.1; S.pitch = -0.02;
    S.cam = "cockpit"; document.getElementById("panel").style.display = "block";
    S.ringIdx = 5; S.score = 600; S.paused = true;
  } else if (shot === "end") {
    S.score = 1150; S.time = 205; S.grade = "S"; S.ringIdx = rings.length; finish();
    S.pos.set(0, 7.2, -40); S.heading = 0; S.speed = 0;
  }
}
stageShot();

// ---------- autostart: open already flying ----------
// The page must show flight on the very first frame — no click, no Enter.
// We drop the aircraft onto final approach to ring 1 at cruise speed with
// the chase camera already framed behind it and the HUD lit, so whoever
// opens the page is immediately in the air heading for the first ring.
function launchIntoFlight() {
  S.mode = "fly";
  document.getElementById("start").style.display = "none";
  document.getElementById("end").style.display = "none";
  S.airborne = true; S.gear = false; S.flaps = false; S.brake = false;
  S.throttle = 0.68; S.speed = 41; S.vy = 0; S.pitch = 0; S.roll = 0;
  S.cam = "chase"; S.paused = false;
  var rp = rings[0].pos;
  S.pos.set(rp.x - rings[0].nx * 118, rp.y, rp.z - rings[0].nz * 118);
  S.heading = Math.atan2(rp.x - S.pos.x, -(rp.z - S.pos.z));
  S.msg = "FLY THROUGH THE RINGS"; S.msgT = 3;
  camPos.set(S.pos.x - Math.sin(S.heading) * 17.5, S.pos.y + 5.5, S.pos.z + Math.cos(S.heading) * 17.5);
  plane.position.copy(S.pos);
  plane.rotation.set(S.pitch, -S.heading, -S.roll, "YXZ");
  camera.position.copy(camPos);
  camera.lookAt(S.pos.x + Math.sin(S.heading) * 30, S.pos.y + 1.5, S.pos.z - Math.cos(S.heading) * 30);
  updateHUD();
}
if (!shot) launchIntoFlight();

// ---------- main loop ----------
var clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.05);
  step(dt);
  plane.position.copy(S.pos);
  if (S.airborne) plane.position.y += Math.sin(performance.now() * 0.0021) * 0.18;
  plane.rotation.set(S.pitch, -S.heading, -S.roll, "YXZ");
  prop.rotation.z += dt * (4 + S.throttle * 55);
  wheelL.visible = wheelR.visible = S.gear;
  navL.material.color.setHex(Math.sin(performance.now() * 0.006) > 0 ? 0xff4444 : 0x661111);
  clouds.position.x = Math.sin(performance.now() * 0.00002) * 60;
  rings.forEach(function (r, i) {
    if (r.done) return;
    if (i === S.ringIdx) {
      var s = 1 + Math.sin(performance.now() * 0.005) * 0.06;
      r.mesh.scale.set(s, s, s); r.glow.scale.set(s, s, s);
      r.mesh.rotation.z += dt * 0.7;
      r.mesh.material.color.setHex(0xffd34d);
      r.glow.material.opacity = 0.2 + Math.sin(performance.now() * 0.005) * 0.07;
    } else {
      r.mesh.material.color.setHex(0xd98f26);
      r.glow.material.opacity = 0.08;
    }
  });
  water.position.y = 1.4 + Math.sin(performance.now() * 0.0006) * 0.18;
  emitTrail(dt); ageTrail(dt);
  sun.target.position.copy(S.pos);
  sun.position.set(S.pos.x + COURSES[courseIdx].sunPos[0], COURSES[courseIdx].sunPos[1], S.pos.z + COURSES[courseIdx].sunPos[2]);
  if (S.cam === "cockpit" && S.mode !== "start") {
    blade.visible = false;
    var nose = new THREE.Vector3(0, 3.6, -3.4).applyEuler(plane.rotation).add(S.pos);
    camera.position.copy(nose);
    var look = new THREE.Vector3(0, 1.2, -60).applyEuler(plane.rotation).add(S.pos);
    camera.lookAt(look);
  } else {
    blade.visible = true;
    var back = new THREE.Vector3(Math.sin(S.heading) * -17.5, 5.5, Math.cos(S.heading) * 17.5).add(S.pos);
    if (S.mode === "start") back.set(S.pos.x + 30, 9.5, S.pos.z + 22);
    camPos.lerp(back, Math.min(1, dt * 3.2));
    camera.position.copy(camPos);
    if (S.mode === "start") camera.lookAt(S.pos.x + 18, S.pos.y + 2.5, S.pos.z);
    else camera.lookAt(S.pos.x + Math.sin(S.heading) * 30, S.pos.y + 1.5, S.pos.z - Math.cos(S.heading) * 30);
  }
  updateHUD();
  renderer.render(scene, camera);
}
animate();
})();
