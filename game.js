import * as THREE from "https://esm.sh/three@0.160.0";

/* =========================================================
   VICE CITY — UPDATE 32
   Complete game.js
   Original Update 23 visuals preserved.
   Multiplayer connection and reconnection improvements.
   + Two extra floating drone billboards
   ========================================================= */

const CONFIG = {
  CITY_LIMIT: 900,
  ROAD_SPACING: 200,
  ROAD_WIDTH: 24,
  SIDEWALK_WIDTH: 5,
  MAX_TRAFFIC: 9,
  MAX_PEDESTRIANS: 8,
  NETWORK_RATE: 50
};

const VEHICLES = {
  sport: {
    name: "911 SPORTS",
    subtitle: "Sports coupe",
    topSpeed: 294, reverseSpeed: 48,
    acceleration: 9.2, braking: 16,
    friction: 4.8, steering: 1.72, grip: 0.92,
    color: 0xe33b2e
  },
  supercar: {
    name: "296 SUPERCAR",
    subtitle: "High-performance supercar",
    topSpeed: 330, reverseSpeed: 55,
    acceleration: 11.5, braking: 18,
    friction: 4.5, steering: 1.95, grip: 0.88,
    color: 0xd71920
  },
  suv: {
    name: "PERFORMANCE SUV",
    subtitle: "Luxury performance SUV",
    topSpeed: 250, reverseSpeed: 42,
    acceleration: 6.8, braking: 13.5,
    friction: 5.8, steering: 1.22, grip: 0.78,
    color: 0x202a35
  },
  sedan: {
    name: "SPORT SEDAN",
    subtitle: "Four-door performance sedan",
    topSpeed: 230, reverseSpeed: 40,
    acceleration: 5.4, braking: 12.5,
    friction: 5.4, steering: 1.48, grip: 0.85,
    color: 0x2467a6
  },
  jeep: {
    name: "OFF-ROAD JEEP",
    subtitle: "Rugged off-road vehicle",
    topSpeed: 180, reverseSpeed: 38,
    acceleration: 4.2, braking: 10.5,
    friction: 6.5, steering: 1.08, grip: 0.72,
    color: 0x47714b
  }
};

const VEHICLE_ORDER = ["sport", "supercar", "suv", "sedan", "jeep"];
const carPaints = [
  0xe33b2e, 0x2467a6, 0xf0c33c, 0x252a32,
  0xe8e8e3, 0x21835b, 0x713c91, 0xffffff
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91c4df);
scene.fog = new THREE.Fog(0x87b0cc, 260, 1200);

const camera = new THREE.PerspectiveCamera(
  65, innerWidth / innerHeight, 0.5, 1200
);

let pixelRatio = Math.min(devicePixelRatio || 1, 1);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
  precision: (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) ? "mediump" : "highp"
});

renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = THREE.MathUtils.clamp;

/* =========================================================
   GAMEPLAY TUNING
   ========================================================= */

const WALK_SPEED = 7.5;
const SPRINT_SPEED = 14.5;
const BACK_SPEED = 4.2;
const STAMINA_MAX = 100;
const NITRO_MAX = 100;
const WHEELBASE = 2.9;

// Touch devices get an on-screen joystick and buttons
const touchCapable =
  !!(window.matchMedia && window.matchMedia("(pointer:coarse)").matches) ||
  (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
let touchUIActive = false;

// Fewer cars and pedestrians on phones
if (touchCapable) {
  CONFIG.MAX_TRAFFIC = 6;
  CONFIG.MAX_PEDESTRIANS = 6;
}

(function setupMobilePage() {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  meta.content =
    "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

  const style = document.createElement("style");
  style.textContent = `
html,body{overscroll-behavior:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
body.vice-touch{-webkit-user-select:none;user-select:none}
body.vice-touch input{-webkit-user-select:text;user-select:text}
canvas{touch-action:none;display:block}
#vice-garage,#vice-chat-log{touch-action:pan-y}`;
  document.head.appendChild(style);
})();

// Start on a road intersection (the map centre is the middle of a block)
const SPAWN = { carX: 100, carZ: 96, playerX: 100, playerZ: 106 };

// The owner's private estate (a whole city block) and who owns it
const VILLA = { x: 400, z: 0, half: 82 };
const VILLA_NAME = "NAYAK VILLA";
const OWNER_NAMES = ["nayak", "subham", "subham nayak"];    // player names (lower case) that own the villa
const OWNER_PASSCODE = "";        // optional: if set, the owner must also type  /owner <passcode>  in chat

const VILLA_POOL = { x0: VILLA.x - 12, x1: VILLA.x + 12, z0: VILLA.z - 28, z1: VILLA.z - 16 };
const VILLA_SPA = { x: VILLA.x + 28, z: VILLA.z - 22, r: 3.4 };
const VILLA_GYM = { x0: VILLA.x + 35, x1: VILLA.x + 57, z0: VILLA.z - 43, z1: VILLA.z - 29 };
const VILLA_HOUSE = { x0: VILLA.x - 32, x1: VILLA.x + 32, z0: VILLA.z - 2, z1: VILLA.z + 30 };

function inVillaWater(x, z) {
  return (x > VILLA_POOL.x0 && x < VILLA_POOL.x1 && z > VILLA_POOL.z0 && z < VILLA_POOL.z1) ||
    Math.hypot(x - VILLA_SPA.x, z - VILLA_SPA.z) < VILLA_SPA.r;
}

// Heights of each surface type (0 road, 1 curb, 2 lot grass, 3 park grass, 4 villa estate)
const GROUND_HEIGHT = [0, .235, -.28, .29, 0];

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12);

function box(parent, x, y, z, sx, sy, sz, material) {
  const mesh = new THREE.Mesh(boxGeo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, x, y, z, radius, height, material) {
  const mesh = new THREE.Mesh(cylinderGeo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(radius, height, radius);
  parent.add(mesh);
  return mesh;
}

/* =========================================================
   PROCEDURAL MATERIALS
   ========================================================= */

function makeTexture(base, type) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  if (type === "asphalt") {
    for (let i = 0; i < 5000; i++) {
      const shade = Math.floor(rand(35, 95));
      ctx.fillStyle =
        `rgba(${shade},${shade},${shade},${rand(.08,.25)})`;
      ctx.fillRect(rand(0, 256), rand(0, 256), 2, 2);
    }
  }

  if (type === "concrete") {
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgba(50,50,50,${rand(.025,.12)})`;
      ctx.fillRect(rand(0, 256), rand(0, 256), 3, 3);
    }
  }

  if (type === "grass") {
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = `rgba(20,90,25,.2)`;
      ctx.fillRect(rand(0, 256), rand(0, 256), 2, 2);
    }
  }

  if (type === "building") {
    for (let y = 10; y < 256; y += 32) {
      for (let x = 10; x < 256; x += 42) {
        ctx.fillStyle = Math.random() > .25
          ? "rgba(105,165,190,.65)"
          : "rgba(35,45,55,.65)";
        ctx.fillRect(x, y, 25, 19);
        ctx.strokeStyle = "rgba(20,25,30,.5)";
        ctx.strokeRect(x, y, 25, 19);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

const asphaltTexture = makeTexture("#30343a", "asphalt");
asphaltTexture.repeat.set(8, 35);

const pavementTexture = makeTexture("#aaa9a2", "concrete");
pavementTexture.repeat.set(4, 25);

const grassTexture = makeTexture("#477b43", "grass");
grassTexture.repeat.set(48, 48);

function makeBuildingTexture() {
  // One tile = 24 units wide (4 window columns) and 32 units tall (8 floors).
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#d2cdc0";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(70,66,58,${rand(.02, .07)})`;
    ctx.fillRect(rand(0, 256), rand(0, 256), 3, 3);
  }

  const cols = 4, rows = 8, cw = 64, rh = 32;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + 12, y = r * rh + 7, w = 40, h = 18;
      const lit = Math.random() > .86;
      const glass = ctx.createLinearGradient(0, y, 0, y + h);
      glass.addColorStop(0, lit ? "#f6e3a0" : "#86b8cc");
      glass.addColorStop(1, lit ? "#c99c4a" : "#2c4b5e");
      ctx.fillStyle = glass;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#3a3f45";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#8d887c";
      ctx.fillRect(x - 3, y + h, w + 6, 3);
    }
    ctx.fillStyle = "rgba(0,0,0,.10)";
    ctx.fillRect(0, r * rh + rh - 3, 256, 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  return texture;
}

const buildingTexture = makeBuildingTexture();

const mat = {
  // A flat dark material avoids stretched UVs and white-looking roads.
  road: new THREE.MeshLambertMaterial({
    color: 0x2a2e34
  }),
  sidewalk: new THREE.MeshLambertMaterial({ map: pavementTexture }),
  grass: new THREE.MeshLambertMaterial({ map: grassTexture }),
  concrete: new THREE.MeshLambertMaterial({ color: 0xb5b3ad }),
  white: new THREE.MeshLambertMaterial({ color: 0xece9df }),
  yellow: new THREE.MeshLambertMaterial({ color: 0xf5c84c }),
  tree: new THREE.MeshLambertMaterial({ color: 0x28613a }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x755238 })
};

const buildingMaterials = [
  0x9b9b91, 0xc3b8a5, 0x777e82, 0xb6a18b,
  0x6c7c86, 0xd0c5b1, 0x8d8d83, 0x77736c
].map(color => new THREE.MeshLambertMaterial({
  color,
  map: buildingTexture
}));

const hemiLight = new THREE.HemisphereLight(0xd8f0ff, 0x455538, 2.35);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff5e0, 1.75);
sun.position.set(-250, 500, 200);
scene.add(sun);

/* =========================================================
   REALISTIC SKY, CLOUDS AND ANIMATED BIRDS
   ========================================================= */

const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(1150, 32, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x347fbd) },
      horizonColor: { value: new THREE.Color(0xb9d9e9) },
      lowerColor: { value: new THREE.Color(0xe4e4d8) }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 lowerColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 color = mix(horizonColor, topColor, smoothstep(0.02, 0.72, h));
        color = mix(lowerColor, color, smoothstep(-0.22, 0.08, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `
  })
);
skyDome.position.y = 0;
scene.add(skyDome);

const skyClouds = [];
const cloudMaterial = new THREE.MeshLambertMaterial({
  color: 0xf7fbff, transparent: true, opacity: .82,
  depthWrite: false
});

for (let i = 0; i < 15; i++) {
  const cloud = new THREE.Group();
  const puffCount = 4 + Math.floor(Math.random() * 4);
  for (let j = 0; j < puffCount; j++) {
    const puff = new THREE.Mesh(sphereGeo, cloudMaterial);
    puff.position.set((j - puffCount / 2) * 12, rand(-2, 2), rand(-5, 5));
    puff.scale.set(rand(8, 15), rand(3, 6), rand(5, 9));
    cloud.add(puff);
  }
  cloud.position.set(rand(-850, 850), rand(115, 190), rand(-850, 850));
  cloud.userData.speed = rand(2, 5);
  skyClouds.push(cloud);
  scene.add(cloud);
}

const skyBirds = [];
const birdMaterial = new THREE.MeshBasicMaterial({ color: 0x263746 });
for (let i = 0; i < 12; i++) {
  const bird = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.55, 7, 5), birdMaterial);
  body.scale.set(1.5, .45, .55);
  bird.add(body);
  const leftWing = new THREE.Group();
  const rightWing = new THREE.Group();
  const wingGeo = new THREE.BoxGeometry(2.2, .12, .55);
  const leftMesh = new THREE.Mesh(wingGeo, birdMaterial);
  const rightMesh = new THREE.Mesh(wingGeo, birdMaterial);
  leftMesh.position.x = -1.05;
  rightMesh.position.x = 1.05;
  leftWing.add(leftMesh);
  rightWing.add(rightMesh);
  leftWing.position.x = -.55;
  rightWing.position.x = .55;
  bird.add(leftWing, rightWing);
  bird.position.set(rand(-700, 700), rand(75, 130), rand(-700, 700));
  bird.userData = {
    leftWing, rightWing, phase: rand(0, Math.PI * 2),
    speed: rand(12, 22), turn: rand(0, Math.PI * 2)
  };
  skyBirds.push(bird);
  scene.add(bird);
}

function updateSky(dt) {
  for (const cloud of skyClouds) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 1000) cloud.position.x = -1000;
  }
  for (const bird of skyBirds) {
    const data = bird.userData;
    data.phase += dt * 8;
    data.leftWing.rotation.z = Math.sin(data.phase) * .55;
    data.rightWing.rotation.z = -Math.sin(data.phase) * .55;
    bird.position.x += Math.cos(data.turn) * data.speed * dt;
    bird.position.z += Math.sin(data.turn) * data.speed * dt;
    bird.position.y += Math.sin(data.phase * .25) * .025;
    if (Math.abs(bird.position.x) > 950 || Math.abs(bird.position.z) > 950) {
      bird.position.set(rand(-700, 700), rand(75, 130), rand(-700, 700));
    }
    bird.rotation.y = -data.turn;
  }
}
/* =========================================================
   CITY AND ROADS
   ========================================================= */

const roadLines = [];
const buildings = [];
const parks = [];

/* Draws many identical boxes with ONE draw call (fast). */
function makeInstancedBoxes(material, items) {
  makeInstanced(boxGeo, material, items);
}

// items: [x, y, z, sx, sy, sz, colourHex?, rotationY?]
function makeInstanced(geo, material, items) {
  if (!items.length) return;

  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  const d = new THREE.Object3D();
  const tint = new THREE.Color();
  const useColor = items.some(item => item[6] !== undefined);

  items.forEach((item, i) => {
    const [x, y, z, sx, sy, sz, color, ry] = item;
    d.position.set(x, y, z);
    d.rotation.set(0, ry || 0, 0);
    d.scale.set(sx, sy, sz);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    if (useColor) mesh.setColorAt(i, tint.setHex(color !== undefined ? color : 0xffffff));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  world.add(mesh);
}

function createRoads() {
  const L = CONFIG.CITY_LIMIT;
  const S = CONFIG.ROAD_SPACING;
  const W = CONFIG.ROAD_WIDTH;
  const SW = CONFIG.SIDEWALK_WIDTH;

  const sidewalkCenter = W / 2 + 3;          // 15
  const sidewalkEdge = sidewalkCenter + SW / 2; // 17.5

  for (let p = -L; p <= L; p += S) roadLines.push(p);

  // ROAD SURFACES — both directions now use the dark road material
  // (the east-west roads had no material, which made them render WHITE).
  // The z-direction roads sit 0.005 lower so the intersection never z-fights.
  for (const p of roadLines) {
    box(world, p, -.52, 0, W, .16, L * 2.1, mat.road);
    box(world, 0, -.525, p, L * 2.1, .16, W, mat.road);
  }

  // Build segment lists BETWEEN intersections so sidewalks and lines
  // never run across the roads that cross them.
  const pts = [-L * 1.05, ...roadLines, L * 1.05];
  const sidewalkSegments = [];
  const lineSegments = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const first = i === 0;
    const last = i === pts.length - 2;

    const sStart = first ? pts[0] : pts[i] + sidewalkEdge;
    const sEnd = last ? pts[i + 1] : pts[i + 1] - sidewalkEdge;
    sidewalkSegments.push([(sStart + sEnd) / 2, sEnd - sStart]);

    const lStart = first ? pts[0] : pts[i] + W / 2;
    const lEnd = last ? pts[i + 1] : pts[i + 1] - W / 2;
    lineSegments.push([(lStart + lEnd) / 2, lEnd - lStart]);
  }

  const sidewalkItems = [];
  const lineItems = [];

  for (const p of roadLines) {
    for (const side of [-1, 1]) {
      const offset = p + side * sidewalkCenter;

      for (const [center, length] of sidewalkSegments) {
        sidewalkItems.push([offset, -.38, center, SW, .35, length]);
        sidewalkItems.push([center, -.38, offset, length, .35, SW]);
      }
    }

    for (const [center, length] of lineSegments) {
      lineItems.push([p - .18, -.425, center, .10, .03, length]);
      lineItems.push([p + .18, -.425, center, .10, .03, length]);
      lineItems.push([center, -.425, p - .18, length, .03, .10]);
      lineItems.push([center, -.425, p + .18, length, .03, .10]);
    }
  }

  // Square sidewalk pads on the four corners of every intersection
  for (const p of roadLines) {
    for (const q of roadLines) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          sidewalkItems.push([
            p + sx * sidewalkCenter, -.38,
            q + sz * sidewalkCenter,
            SW, .35, SW
          ]);
        }
      }
    }
  }

  makeInstancedBoxes(
    new THREE.MeshLambertMaterial({ color: 0xb2b0a8 }),
    sidewalkItems
  );
  makeInstancedBoxes(mat.yellow, lineItems);

  // White edge lines along both sides of every road
  const edgeItems = [];
  for (const p of roadLines) {
    for (const [center, length] of lineSegments) {
      for (const s of [-1, 1]) {
        edgeItems.push([p + s * 10.9, -.428, center, .14, .02, length]);
        edgeItems.push([center, -.428, p + s * 10.9, length, .02, .14]);
      }
    }
  }
  makeInstancedBoxes(mat.white, edgeItems);
}

function createCrosswalks() {
  const items = [];

  for (const x of roadLines) {
    for (const z of roadLines) {
      for (const s of [-1, 1]) {
        for (let i = -4; i <= 4; i++) {
          // Stripes lie ON the road surface, just before each intersection
          items.push([x + i * 2.3, -.405, z + s * 14.8, 1.1, .02, 5]);
          items.push([x + s * 14.8, -.405, z + i * 2.3, 5, .02, 1.1]);
        }
      }
    }
  }

  makeInstancedBoxes(mat.white, items);
}

/* =========================================================
   TREES — OAK, PINE, CYPRESS, BIRCH AND AUTUMN (all instanced)
   ========================================================= */

const TREE_SCALE = touchCapable ? .55 : 1;

const treeGeo = {
  trunk: new THREE.CylinderGeometry(.6, 1, 1, 6),
  blob: new THREE.IcosahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 7)
};
const treeWhite = new THREE.MeshLambertMaterial({ color: 0xffffff });
const treeItems = { trunk: [], blob: [], cone: [] };

const OAK_GREENS = [0x2f6b3a, 0x3a7d44, 0x4a8f3f, 0x2a5e35, 0x5a9a48, 0x36723a];
const PINE_GREENS = [0x1f4d33, 0x245a3a, 0x1b4430, 0x2a6240];
const BIRCH_GREENS = [0x7fb55a, 0x8ec166, 0x6fa84f, 0x9bc76e];
const AUTUMN_COLORS = [0xc8782a, 0xb5532a, 0xd7a22f, 0xa8421f];

function plantTree(x, z, species, size = 1) {
  const ry = rand(0, 6.28);

  if (species === "pine") {
    const h = rand(8, 13) * size;
    treeItems.trunk.push([x, h * .25, z, .5 * size, h * .5, .5 * size, 0x5a3e2b]);
    const color = pick(PINE_GREENS);
    const coneH = h * .42;
    [3.4, 2.6, 1.7].forEach((radius, k) => {
      treeItems.cone.push([
        x, h * .18 + k * coneH * .55 + coneH / 2, z,
        radius * (h / 10), coneH, radius * (h / 10), color, ry
      ]);
    });
  } else if (species === "cypress") {
    const h = rand(10, 16) * size;
    treeItems.trunk.push([x, 1, z, .4 * size, 2, .4 * size, 0x5a3e2b]);
    treeItems.cone.push([x, h / 2 + 1, z, 1.7 * size, h, 1.7 * size, pick(PINE_GREENS), ry]);
  } else if (species === "birch") {
    const h = rand(5, 7) * size;
    treeItems.trunk.push([x, h / 2, z, .35 * size, h, .35 * size, 0xe6e2d6]);
    const color = pick(BIRCH_GREENS);
    const r = rand(1.9, 2.5) * size;
    treeItems.blob.push([x, h + r * .5, z, r, r * 1.15, r, color, ry]);
    treeItems.blob.push([x + r * .5, h - .3, z - r * .3, r * .7, r * .75, r * .7, color, ry]);
  } else {
    // oak (and autumn oak): three overlapping crowns
    const h = rand(3.2, 4.4) * size;
    treeItems.trunk.push([x, h / 2, z, .55 * size, h, .55 * size, 0x6b4a32]);
    const palette = species === "autumn" ? AUTUMN_COLORS : OAK_GREENS;
    const r = rand(2.6, 3.4) * size;
    treeItems.blob.push([x, h + r * .55, z, r * 1.1, r * .9, r * 1.1, pick(palette), ry]);
    treeItems.blob.push([x + r * .75, h + r * .2, z + r * .3, r * .8, r * .7, r * .8, pick(palette), ry]);
    treeItems.blob.push([x - r * .6, h + r * .3, z - r * .5, r * .85, r * .75, r * .85, pick(palette), ry]);
  }
}

function randomSpecies() {
  const roll = Math.random();
  if (roll < .35) return "oak";
  if (roll < .6) return "pine";
  if (roll < .78) return "birch";
  if (roll < .88) return "autumn";
  return "cypress";
}

const parkGrassItems = [];
const parkPathItems = [];

function createPark(x, z) {
  parks.push({ x, z });
  parkGrassItems.push([x, -.35, z, 125, .4, 125]);
  parkPathItems.push([x, -.12, z, 8, .08, 105], [x, -.11, z, 105, .08, 8]);

  const count = Math.round(14 * TREE_SCALE + 2);
  for (let i = 0; i < count; i++) {
    const tx = x + rand(-55, 55);
    const tz = z + rand(-55, 55);
    if (Math.abs(tx - x) < 6 || Math.abs(tz - z) < 6) continue;   // keep paths clear
    plantTree(tx, tz, randomSpecies(), rand(.85, 1.2));
  }
}

// Trees on empty lots and along the pavements
function scatterTrees() {
  const lotTrees = Math.round(140 * TREE_SCALE);
  for (let i = 0, placed = 0; i < lotTrees * 4 && placed < lotTrees; i++) {
    const x = rand(-880, 880), z = rand(-880, 880);
    if (groundType(x, z) !== 2 || circleHitsBuilding(x, z, 7)) continue;
    plantTree(x, z, randomSpecies(), rand(.8, 1.25));
    placed++;
  }

  const streetTrees = Math.round(150 * TREE_SCALE);
  for (let i = 0, placed = 0; i < streetTrees * 5 && placed < streetTrees; i++) {
    const road = pick(roadLines);
    const t = rand(-880, 880);
    const side = Math.random() > .5 ? 1 : -1;
    const alongX = Math.random() > .5;
    const x = alongX ? t : road + side * 20.5;
    const z = alongX ? road + side * 20.5 : t;

    if (Math.abs(t - nearestRoadLine(t)) < 28) continue;      // keep junctions clear
    if (groundType(x, z) !== 2 || circleHitsBuilding(x, z, 4)) continue;
    plantTree(x, z, pick(["oak", "birch", "cypress", "oak"]), rand(.7, .95));
    placed++;
  }
}

/* =========================================================
   BUILDINGS — TOWERS, OFFICES, APARTMENTS, WAREHOUSES, HOUSES
   ========================================================= */

const COLS = 4, ROWS = 8, CELL_W = 64, CELL_H = 32;   // one texture tile = 24 x 32 units

function makeFacadeTexture(painter) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  painter(canvas.getContext("2d"));

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  return texture;
}

// fn(column, row, x, y, isGroundFloor) for every window cell
function eachCell(fn) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      fn(c, r, c * CELL_W, r * CELL_H, r === ROWS - 1);
    }
  }
}

const facadeTextures = {
  glass: makeFacadeTexture(ctx => {
    ctx.fillStyle = "#4f7690";
    ctx.fillRect(0, 0, 256, 256);
    eachCell((c, r, x, y) => {
      const lit = Math.random() > .92;
      const g = ctx.createLinearGradient(0, y, 0, y + CELL_H);
      g.addColorStop(0, lit ? "#f4e3a6" : "#9cc8e0");
      g.addColorStop(1, lit ? "#caa24e" : "#386a8a");
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, y + 2, CELL_W - 4, CELL_H - 9);
      ctx.fillStyle = "#2b3a46";
      ctx.fillRect(x, y + CELL_H - 6, CELL_W, 6);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.fillRect(x + 6, y + 4, 8, CELL_H - 14);
    });
    ctx.fillStyle = "#26323c";
    for (let c = 0; c < COLS; c++) ctx.fillRect(c * CELL_W - 1, 0, 3, 256);
  }),

  brick: makeFacadeTexture(ctx => {
    ctx.fillStyle = "#9b4f3b";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(60,25,20,.35)";
    for (let y = 0; y < 256; y += 8) {
      ctx.fillRect(0, y, 256, 1);
      for (let x = (y / 8 % 2) * 8; x < 256; x += 16) ctx.fillRect(x, y, 1, 8);
    }
    eachCell((c, r, x, y) => {
      const lit = Math.random() > .85;
      ctx.fillStyle = "#efe6d6";
      ctx.fillRect(x + 14, y + 4, 36, 24);
      ctx.fillStyle = lit ? "#e8c86a" : "#2b3b47";
      ctx.fillRect(x + 17, y + 7, 30, 18);
      ctx.fillStyle = "#d8cdb8";
      ctx.fillRect(x + 12, y + 28, 40, 3);
      if (r % 2 === 0) {
        ctx.fillStyle = "#3a3a3a";
        ctx.fillRect(x + 10, y + 31, 44, 1);
      }
    });
  }),

  industrial: makeFacadeTexture(ctx => {
    ctx.fillStyle = "#a5adb1";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(0,0,0,.13)";
    for (let x = 0; x < 256; x += 6) ctx.fillRect(x, 0, 2, 256);
    eachCell((c, r, x, y, ground) => {
      if (ground && c % 2 === 1) {
        ctx.fillStyle = "#6d7a82";
        ctx.fillRect(x + 6, y + 4, 52, 28);
        ctx.fillStyle = "rgba(0,0,0,.25)";
        for (let k = 8; k < 30; k += 5) ctx.fillRect(x + 6, y + k, 52, 1);
      }
      if (r === 5) {
        ctx.fillStyle = "#2d3d47";
        ctx.fillRect(x + 8, y + 10, 48, 9);
      }
    });
  }),

  house: makeFacadeTexture(ctx => {
    ctx.fillStyle = "#eadfca";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(110,95,70,.07)";
    for (let i = 0; i < 400; i++) ctx.fillRect(rand(0, 256), rand(0, 256), 3, 2);
    eachCell((c, r, x, y, ground) => {
      if (ground && c === 1) {
        ctx.fillStyle = "#6a4a35";
        ctx.fillRect(x + 20, y + 4, 24, 28);
        ctx.fillStyle = "#d8b24a";
        ctx.fillRect(x + 38, y + 18, 3, 3);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 10, y + 5, 44, 22);
      ctx.fillStyle = Math.random() > .8 ? "#e8c86a" : "#2f4352";
      ctx.fillRect(x + 13, y + 8, 38, 16);
      ctx.fillStyle = "#6c8a5a";
      ctx.fillRect(x + 6, y + 5, 4, 22);
      ctx.fillRect(x + 54, y + 5, 4, 22);
    });
  }),

  modern: makeFacadeTexture(ctx => {
    ctx.fillStyle = "#c9c6bf";
    ctx.fillRect(0, 0, 256, 256);
    for (let r = 0; r < ROWS; r++) {
      const g = ctx.createLinearGradient(0, r * CELL_H, 0, r * CELL_H + 16);
      g.addColorStop(0, "#5f8ea5");
      g.addColorStop(1, "#26424f");
      ctx.fillStyle = g;
      ctx.fillRect(4, r * CELL_H + 8, 248, 15);
      ctx.fillStyle = "#a9a69f";
      ctx.fillRect(0, r * CELL_H + CELL_H - 3, 256, 3);
    }
    ctx.fillStyle = "#9d9a93";
    for (let c = 0; c < COLS; c++) ctx.fillRect(c * CELL_W - 2, 0, 4, 256);
  })
};

function tintedMaterials(texture, tints) {
  return tints.map(color => new THREE.MeshLambertMaterial({ color, map: texture }));
}

const facadeMats = {
  office: buildingMaterials,
  glass: tintedMaterials(facadeTextures.glass, [0xffffff, 0xcfe6f2, 0xb8d4c8, 0xd9d2f0]),
  brick: tintedMaterials(facadeTextures.brick, [0xffffff, 0xe0b8a0, 0xc79a86]),
  industrial: tintedMaterials(facadeTextures.industrial, [0xffffff, 0xcfd6d9, 0xd9cfa6]),
  house: tintedMaterials(facadeTextures.house, [0xffffff, 0xf3e3c5, 0xd7e6c7, 0xe6c6c6, 0xc7d8e6]),
  modern: tintedMaterials(facadeTextures.modern, [0xffffff, 0xe6e2dc, 0xd0d4d8])
};

const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x66696b });
const roofDetailMaterial = new THREE.MeshLambertMaterial({ color: 0x8c9094 });
const chimneyMaterial = new THREE.MeshLambertMaterial({ color: 0x8a4b3a });
const gableMaterials = [0xa4533a, 0x4a5560, 0x6b4a36, 0x55695a].map(
  color => new THREE.MeshLambertMaterial({ color })
);

const wallBatches = new Map();    // material -> merged geometry data
const roofBatches = new Map();
const roofDetailItems = [];
const tankItems = [];
const chimneyItems = [];

function newBatch() {
  return { positions: [], normals: [], uvs: [], indices: [], count: 0 };
}

function batchIn(map, material) {
  if (!map.has(material)) map.set(material, newBatch());
  return map.get(material);
}

// Copies some faces of a BoxGeometry into a batch, moved to (ox, oy, oz)
function addFaces(batch, geo, faces, ox, oy, oz) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const index = geo.index.array;

  for (const f of faces) {
    const base = batch.count;

    for (let v = f * 4; v < f * 4 + 4; v++) {
      batch.positions.push(pos.getX(v) + ox, pos.getY(v) + oy, pos.getZ(v) + oz);
      batch.normals.push(nor.getX(v), nor.getY(v), nor.getZ(v));
      batch.uvs.push(uv.getX(v), uv.getY(v));
    }

    for (let k = f * 6; k < f * 6 + 6; k++) {
      batch.indices.push(index[k] - f * 4 + base);
    }

    batch.count += 4;
  }
}

// Copies one material group of any indexed geometry (used for cylinders)
function addGroup(batch, geo, groupIndex, ox, oy, oz) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const index = geo.index.array;
  const group = geo.groups[groupIndex];
  const base = batch.count;

  for (let v = 0; v < pos.count; v++) {
    batch.positions.push(pos.getX(v) + ox, pos.getY(v) + oy, pos.getZ(v) + oz);
    batch.normals.push(nor.getX(v), nor.getY(v), nor.getZ(v));
    batch.uvs.push(uv.getX(v), uv.getY(v));
  }

  for (let k = group.start; k < group.start + group.count; k++) {
    batch.indices.push(index[k] + base);
  }

  batch.count += pos.count;
}

// Copies a non-indexed geometry (used for pitched roofs)
function addFlat(batch, geo, ox, oy, oz) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const base = batch.count;

  for (let v = 0; v < pos.count; v++) {
    batch.positions.push(pos.getX(v) + ox, pos.getY(v) + oy, pos.getZ(v) + oz);
    batch.normals.push(nor.getX(v), nor.getY(v), nor.getZ(v));
    batch.uvs.push(0, 0);
    batch.indices.push(base + v);
  }

  batch.count += pos.count;
}

const snap4 = v => Math.max(4, Math.round(v / 4) * 4);
const snap6 = v => Math.max(12, Math.round(v / 6) * 6);

// A plain box with a flat roof
function addMass(material, x, z, w, d, y0, h, roofMat = roofMaterial) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;

  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    const horizontal = face < 2 ? d : w;
    uv.setXY(i, uv.getX(i) * horizontal / 24, uv.getY(i) * h / 32);
  }

  addFaces(batchIn(wallBatches, material), geo, [0, 1, 4, 5], x, y0 + h / 2, z);
  if (roofMat) addFaces(batchIn(roofBatches, roofMat), geo, [2], x, y0 + h / 2, z);
  geo.dispose();
}

// A round tower
function addRoundMass(material, x, z, r, y0, h) {
  const geo = new THREE.CylinderGeometry(r, r, h, 20, 1);
  const uv = geo.attributes.uv;
  const tiles = Math.max(1, Math.round(Math.PI * 2 * r / 24));

  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * tiles, uv.getY(i) * h / 32);
  }

  addGroup(batchIn(wallBatches, material), geo, 0, x, y0 + h / 2, z);
  addGroup(batchIn(roofBatches, roofMaterial), geo, 1, x, y0 + h / 2, z);
  geo.dispose();
}

// A pitched roof (ridge runs along the longer side)
function addGable(x, y, z, w, d, rise, roofMat) {
  const alongZ = d >= w;
  const a = alongZ ? w : d;
  const b = alongZ ? d : w;
  const hw = a / 2 + .5, hd = b / 2 + .4;
  const v = [];
  const tri = (p, q, r) => v.push(...p, ...q, ...r);
  const quad = (p, q, r, s) => { tri(p, q, r); tri(p, r, s); };

  quad([-hw, 0, -hd], [-hw, 0, hd], [0, rise, hd], [0, rise, -hd]);
  quad([hw, 0, hd], [hw, 0, -hd], [0, rise, -hd], [0, rise, hd]);
  tri([-hw, 0, hd], [hw, 0, hd], [0, rise, hd]);
  tri([hw, 0, -hd], [-hw, 0, -hd], [0, rise, -hd]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  if (!alongZ) geo.rotateY(Math.PI / 2);

  addFlat(batchIn(roofBatches, roofMat), geo, x, y, z);
  geo.dispose();
}

function pickFacade(kind) {
  return pick(facadeMats[kind]);
}

function roofClutter(x, z, w, d, roofY, antenna = false) {
  const units = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < units; i++) {
    roofDetailItems.push([
      x + rand(-w * .3, w * .3), roofY + .9, z + rand(-d * .3, d * .3),
      rand(2.5, 4.5), 1.8, rand(2.5, 4.5)
    ]);
  }
  if (antenna) roofDetailItems.push([x, roofY + 7, z, .5, 14, .5]);
}

/* ----- the building types ----- */

// Tall glass / modern tower with stepped upper levels and a spire
function buildTower(x, z, w, d, h) {
  const material = pickFacade(Math.random() < .65 ? "glass" : "modern");
  const tiers = Math.random() < .55 ? 3 : 2;
  let cw = snap6(w), cd = snap6(d), y0 = -.25;
  let total = snap4(h);

  const first = snap4(total * (tiers === 3 ? .5 : .65));
  addMass(material, x, z, cw, cd, y0, first);
  buildings.push({ x, z, width: cw, depth: cd, height: total });
  y0 += first;

  cw = snap6(cw * .72); cd = snap6(cd * .72);
  const second = snap4((total - first) * (tiers === 3 ? .55 : 1));
  addMass(material, x, z, cw, cd, y0, second);
  y0 += second;

  if (tiers === 3) {
    cw = snap6(cw * .7); cd = snap6(cd * .7);
    const third = snap4(total - first - second);
    addMass(material, x, z, cw, cd, y0, third);
    y0 += third;
  }

  roofClutter(x, z, cw, cd, y0, true);
}

// Round glass tower
function buildRoundTower(x, z, r, h) {
  const material = pickFacade("glass");
  const height = snap4(h);
  addRoundMass(material, x, z, r, -.25, height);
  buildings.push({ x, z, width: r * 2, depth: r * 2, height });
  roofClutter(x, z, r, r, height - .25, Math.random() > .5);
}

// Office block, sometimes with a lower wing
function buildOffice(x, z, w, d, h) {
  const material = pickFacade(Math.random() < .6 ? "office" : "modern");
  w = snap6(w); d = snap6(d); h = snap4(h);

  addMass(material, x, z, w, d, -.25, h);
  buildings.push({ x, z, width: w, depth: d, height: h });

  if (Math.random() < .4) {
    const ww = snap6(w * .5), wd = snap6(d * .7), wh = snap4(h * .45);
    const wx = x + w / 2 + ww / 2;
    addMass(material, wx, z, ww, wd, -.25, wh);
    buildings.push({ x: wx, z, width: ww, depth: wd, height: wh });
    roofClutter(wx, z, ww, wd, wh - .25);
  }

  roofClutter(x, z, w, d, h - .25, h > 70);
}

// Brick apartment block with a rooftop water tank
function buildApartment(x, z, w, d, h) {
  const material = pickFacade("brick");
  w = snap6(w); d = snap6(d); h = snap4(h);

  addMass(material, x, z, w, d, -.25, h);
  buildings.push({ x, z, width: w, depth: d, height: h });

  const roofY = h - .25;
  tankItems.push([x + rand(-w * .25, w * .25), roofY + 2.4, z + rand(-d * .25, d * .25), 2, 4.4, 2]);
  roofClutter(x, z, w, d, roofY);
}

// Low warehouse with a shallow pitched roof
function buildWarehouse(x, z, w, d, h) {
  const material = pickFacade("industrial");
  w = snap6(w); d = snap6(d); h = snap4(h);

  addMass(material, x, z, w, d, -.25, h, null);
  addGable(x, h - .25, z, w, d, 2.8, pick(gableMaterials));
  buildings.push({ x, z, width: w, depth: d, height: h + 3 });
}

// Small house with a pitched roof and chimney
function buildHouse(x, z, w, d, h) {
  const material = pickFacade("house");
  w = snap6(w); d = snap6(d); h = snap4(h);

  addMass(material, x, z, w, d, -.25, h, null);
  const rise = Math.min(w, d) * .32;
  addGable(x, h - .25, z, w, d, rise, pick(gableMaterials));
  buildings.push({ x, z, width: w, depth: d, height: h + rise });

  chimneyItems.push([
    x + rand(-w * .25, w * .25), h + rise * .55, z + rand(-d * .2, d * .2),
    1.2, rise + 2.2, 1.2
  ]);
}

function flushCity() {
  const build = (batch, material) => {
    if (!batch.count) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(batch.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(batch.uvs, 2));
    geo.setIndex(
      batch.count > 65535
        ? new THREE.Uint32BufferAttribute(batch.indices, 1)
        : new THREE.Uint16BufferAttribute(batch.indices, 1)
    );
    geo.computeBoundingSphere();
    world.add(new THREE.Mesh(geo, material));
  };

  for (const [material, batch] of wallBatches) build(batch, material);
  for (const [material, batch] of roofBatches) build(batch, material);

  makeInstancedBoxes(roofDetailMaterial, roofDetailItems);
  makeInstancedBoxes(chimneyMaterial, chimneyItems);
  makeInstanced(cylinderGeo, roofDetailMaterial, tankItems);

  makeInstancedBoxes(mat.grass, parkGrassItems);
  makeInstancedBoxes(mat.sidewalk, parkPathItems);

  makeInstanced(treeGeo.trunk, treeWhite, treeItems.trunk);
  makeInstanced(treeGeo.blob, treeWhite, treeItems.blob);
  makeInstanced(treeGeo.cone, treeWhite, treeItems.cone);
}

// Picks a building type for a lot depending on how far it is from the centre
function chooseBuilding(distance) {
  const roll = Math.random();

  if (distance < 300) {                       // downtown
    if (roll < .55) return { type: "tower", w: rand(36, 56), d: rand(36, 56), h: rand(100, 210) };
    if (roll < .72) { const r = rand(15, 22); return { type: "round", w: r * 2, d: r * 2, r, h: rand(90, 170) }; }
    return { type: "office", w: rand(34, 56), d: rand(34, 56), h: rand(60, 120) };
  }

  if (distance < 600) {                       // mid-town
    if (roll < .4) return { type: "office", w: rand(30, 56), d: rand(30, 56), h: rand(40, 90) };
    if (roll < .8) return { type: "apartment", w: rand(30, 54), d: rand(24, 36), h: rand(20, 44) };
    return { type: "tower", w: rand(30, 44), d: rand(30, 44), h: rand(60, 100) };
  }

  if (roll < .5) return { type: "house", w: rand(18, 30), d: rand(18, 28), h: rand(8, 12) };
  if (roll < .72) return { type: "apartment", w: rand(30, 48), d: rand(24, 32), h: rand(16, 32) };
  if (roll < .92) return { type: "warehouse", w: rand(42, 66), d: rand(30, 48), h: rand(8, 16) };
  return { type: "office", w: rand(30, 48), d: rand(30, 48), h: rand(24, 50) };
}

function createCity() {
  const S = CONFIG.ROAD_SPACING;
  const L = CONFIG.CITY_LIMIT;

  for (let gx = -L + 100; gx < L; gx += S) {
    for (let gz = -L + 100; gz < L; gz += S) {
      if (gx === VILLA.x && gz === VILLA.z) {
        createVilla();
        continue;
      }

      const n = Math.abs(
        Math.floor(gx / S) * 7 + Math.floor(gz / S) * 11
      );

      if (n % 13 === 0) {
        createPark(gx, gz);
        continue;
      }

      const distance = Math.max(Math.abs(gx), Math.abs(gz));
      const wanted = distance < 300 ? 3 : distance < 600 ? 2 : 4;
      const placed = [];

      for (let i = 0; i < wanted; i++) {
        const spec = chooseBuilding(distance);

        // Try a few positions so buildings in the same lot do not overlap
        for (let attempt = 0; attempt < 8; attempt++) {
          const bw = Math.round(spec.w / 6) * 6 + 6;
          const bd = Math.round(spec.d / 6) * 6 + 6;
          const x = gx + rand(-(78 - bw / 2), 78 - bw / 2);
          const z = gz + rand(-(78 - bd / 2), 78 - bd / 2);

          const clear = placed.every(p =>
            Math.abs(x - p.x) > (bw + p.w) / 2 + 2 ||
            Math.abs(z - p.z) > (bd + p.d) / 2 + 2
          );
          if (!clear) continue;

          placed.push({ x, z, w: bw, d: bd });

          if (spec.type === "tower") buildTower(x, z, spec.w, spec.d, spec.h);
          else if (spec.type === "round") buildRoundTower(x, z, spec.r, spec.h);
          else if (spec.type === "office") buildOffice(x, z, spec.w, spec.d, spec.h);
          else if (spec.type === "apartment") buildApartment(x, z, spec.w, spec.d, spec.h);
          else if (spec.type === "warehouse") buildWarehouse(x, z, spec.w, spec.d, spec.h);
          else buildHouse(x, z, spec.w, spec.d, spec.h);
          break;
        }
      }
    }
  }

  scatterTrees();
  flushCity();
}

function createStreetlights() {
  const positions = [];

  for (let p = -900; p <= 900; p += 200) {
    for (let q = -900; q <= 900; q += 200) {
      positions.push([p + 17, q + 17], [p - 17, q - 17]);
    }
  }

  const poles = new THREE.InstancedMesh(
    cylinderGeo,
    new THREE.MeshLambertMaterial({ color: 0x343b40 }),
    positions.length
  );

  const lamps = new THREE.InstancedMesh(
    sphereGeo,
    new THREE.MeshBasicMaterial({ color: 0xffe5a1 }),
    positions.length
  );

  const d = new THREE.Object3D();

  positions.forEach(([x, z], i) => {
    d.position.set(x, 5, z);
    d.scale.set(.25, 10, .25);
    d.updateMatrix();
    poles.setMatrixAt(i, d.matrix);

    d.position.set(x, 10.2, z);
    d.scale.set(.9, .45, .9);
    d.updateMatrix();
    lamps.setMatrixAt(i, d.matrix);
  });

  world.add(poles, lamps);
}

function createPalms() {
  const count = 55;
  const frondsPer = 7;

  const trunks = new THREE.InstancedMesh(cylinderGeo, mat.trunk, count);
  const fronds = new THREE.InstancedMesh(boxGeo, mat.tree, count * frondsPer);
  const d = new THREE.Object3D();
  let f = 0;

  for (let i = 0; i < count; i++) {
    let x = 0, z = 0, tries = 0;
    do {
      x = rand(-880, 880);
      z = rand(-880, 880);
      tries++;
    } while (tries < 30 && (groundType(x, z) !== 2 || circleHitsBuilding(x, z, 4)));

    const tiltX = rand(-.07, .07);
    const tiltZ = rand(-.07, .07);

    d.position.set(x, 4, z);
    d.rotation.set(tiltX, 0, tiltZ);
    d.scale.set(.55, 8, .55);
    d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);

    const topX = x - Math.sin(tiltZ) * 8;
    const topZ = z + Math.sin(tiltX) * 8;

    for (let k = 0; k < frondsPer; k++) {
      const a = (k / frondsPer) * Math.PI * 2 + rand(-.2, .2);
      d.position.set(
        topX + Math.cos(a) * 2.5, 8.1, topZ + Math.sin(a) * 2.5
      );
      d.rotation.set(0, -a, -.38);
      d.scale.set(5.4, .16, 1.25);
      d.updateMatrix();
      fronds.setMatrixAt(f++, d.matrix);
    }
  }

  for (const mesh of [trunks, fronds]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    world.add(mesh);
  }
}

/* =========================================================
   PLAYER CHARACTERS
   ========================================================= */

let selectedGender = "male";
const STREET_BLUE = 0x315d9b;

const charGeo = {
  torso: new THREE.CapsuleGeometry(.31, .48, 4, 8),
  waist: new THREE.BoxGeometry(.48, .22, .32),
  neck: new THREE.CylinderGeometry(.105, .12, .2, 8),
  head: new THREE.SphereGeometry(.27, 12, 10),
  cap: new THREE.SphereGeometry(.285, 10, 8),
  back: new THREE.SphereGeometry(.25, 8, 6),
  lock: new THREE.CapsuleGeometry(.075, .35, 3, 6),
  eye: new THREE.SphereGeometry(.025, 6, 5),
  nose: new THREE.SphereGeometry(.045, 6, 5),
  upperArm: new THREE.CapsuleGeometry(.105, .27, 4, 7),
  foreArm: new THREE.CapsuleGeometry(.075, .22, 4, 7),
  hand: new THREE.SphereGeometry(.09, 7, 6),
  thigh: new THREE.CapsuleGeometry(.115, .28, 4, 7),
  lower: new THREE.CapsuleGeometry(.085, .26, 4, 7),
  shoe: new THREE.BoxGeometry(.23, .14, .36)
};

const charMats = {
  pants: new THREE.MeshLambertMaterial({ color: 0x26364a }),
  skin: new THREE.MeshLambertMaterial({ color: 0xc88e68 }),
  hair: new THREE.MeshLambertMaterial({ color: 0x241914 }),
  shoe: new THREE.MeshLambertMaterial({ color: 0x17191d }),
  eye: new THREE.MeshBasicMaterial({ color: 0x171717 })
};

const shirtCache = new Map();
function shirtMaterial(color) {
  if (!shirtCache.has(color)) {
    shirtCache.set(color, new THREE.MeshLambertMaterial({ color }));
  }
  return shirtCache.get(color);
}

const charShadowGeo = new THREE.CircleGeometry(.75, 14);
const charShadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: .3, depthWrite: false
});

function charPart(geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

function createCharacter(color = STREET_BLUE, gender = "male") {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.position.y = -.18;           // feet touch the ground
  root.add(rig);

  const female = gender === "female";
  const shirt = shirtMaterial(color);
  const { pants, skin, hair, shoe, eye } = charMats;

  const upper = new THREE.Group();  // pivots at the waist for leaning
  upper.position.y = 1.0;
  rig.add(upper);

  const torso = charPart(charGeo.torso, shirt, 0, .42, 0);
  torso.scale.set(female ? .88 : 1, 1, .72);
  upper.add(torso);

  rig.add(charPart(charGeo.waist, pants, 0, 1.02, 0));
  upper.add(charPart(charGeo.neck, skin, 0, .86, 0));

  const head = charPart(charGeo.head, skin, 0, 1.15, 0);
  head.scale.set(.92, 1.18, .92);
  upper.add(head);

  const cap = charPart(charGeo.cap, hair, 0, 1.3, -.025);
  cap.scale.set(1, .58, 1);
  upper.add(cap);

  if (female) {
    const back = charPart(charGeo.back, hair, 0, 1.03, -.16);
    back.scale.set(1.05, 1.35, .65);
    upper.add(back);
    for (const s of [-1, 1]) {
      upper.add(charPart(charGeo.lock, hair, s * .23, 1.02, .015));
    }
  }

  for (const x of [-.095, .095]) {
    upper.add(charPart(charGeo.eye, eye, x, 1.17, .245));
  }
  upper.add(charPart(charGeo.nose, skin, 0, 1.1, .27));

  const arms = [], elbows = [], legs = [], knees = [];

  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * .34, .68, 0);
    upper.add(shoulder);
    shoulder.add(charPart(charGeo.upperArm, shirt, 0, -.19, 0));

    const elbow = new THREE.Group();
    elbow.position.y = -.36;
    shoulder.add(elbow);
    elbow.add(charPart(charGeo.foreArm, skin, 0, -.12, 0));
    elbow.add(charPart(charGeo.hand, skin, 0, -.30, .015));
    arms.push(shoulder);
    elbows.push(elbow);

    const hip = new THREE.Group();
    hip.position.set(s * .16, .96, 0);
    rig.add(hip);
    hip.add(charPart(charGeo.thigh, pants, 0, -.2, 0));

    const knee = new THREE.Group();
    knee.position.y = -.34;
    hip.add(knee);
    knee.add(charPart(charGeo.lower, pants, 0, -.14, 0));
    knee.add(charPart(charGeo.shoe, shoe, 0, -.36, .09));
    legs.push(hip);
    knees.push(knee);
  }

  const shadow = new THREE.Mesh(charShadowGeo, charShadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .03;
  root.add(shadow);

  root.userData = {
    arms, elbows, legs, knees, upper, rig, shadow,
    walkTime: 0, amp: 0, runBlend: 0, airborne: false, gender
  };
  return root;
}

function animateCharacter(c, dt, moving, speed = 1, sprint = false) {
  const d = c.userData;
  if (!d.arms || !d.legs) return;

  d.amp += ((moving ? 1 : 0) - d.amp) * Math.min(1, dt * 9);
  d.runBlend += ((sprint && moving ? 1 : 0) - d.runBlend) * Math.min(1, dt * 6);

  if (d.amp > .01) {
    d.walkTime += dt * Math.min(18, 5 + speed * 2.2 + d.runBlend * 3);
  }

  if (d.seated) {
    const driver = d.seatIndex === 0;
    d.legs[0].rotation.x = d.legs[1].rotation.x = -1.45;
    d.knees[0].rotation.x = d.knees[1].rotation.x = 1.5;
    d.arms[0].rotation.x = d.arms[1].rotation.x = driver ? -.95 : -.5;
    d.elbows[0].rotation.x = d.elbows[1].rotation.x = driver ? -.5 : -.9;
    d.upper.rotation.x = .02;
    d.rig.position.y = -.18;
    return;
  }

  if (d.airborne) {
    d.arms[0].rotation.x = -1;
    d.arms[1].rotation.x = -.8;
    d.elbows[0].rotation.x = d.elbows[1].rotation.x = -.6;
    d.legs[0].rotation.x = -.55;
    d.legs[1].rotation.x = .3;
    d.knees[0].rotation.x = .9;
    d.knees[1].rotation.x = .5;
    d.upper.rotation.x = .08;
    d.rig.position.y = -.18;
    return;
  }

  const run = d.runBlend, amp = d.amp;
  const swing = Math.sin(d.walkTime) * amp;
  const armAmp = .62 + run * .55;
  const legAmp = .62 + run * .38;

  d.arms[0].rotation.x = swing * armAmp;
  d.arms[1].rotation.x = -swing * armAmp;
  d.legs[0].rotation.x = -swing * legAmp;
  d.legs[1].rotation.x = swing * legAmp;

  const elbowBend = -(.18 + run * .85) * amp;
  d.elbows[0].rotation.x = elbowBend;
  d.elbows[1].rotation.x = elbowBend;

  const kneeBend = (.35 + run * .75) * amp;
  const c0 = Math.cos(d.walkTime);
  d.knees[0].rotation.x = Math.max(0, c0) * kneeBend;
  d.knees[1].rotation.x = Math.max(0, -c0) * kneeBend;

  d.upper.rotation.x = (.05 + run * .2) * amp;
  d.rig.position.y =
    -.18 + Math.abs(Math.sin(d.walkTime)) * .055 * (1 + run) * amp;
}

function createNameTag(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  function draw(value) {
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = "rgba(0,0,0,.78)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(12, 12, 488, 104, 20);
    else ctx.rect(12, 12, 488, 104);
    ctx.fill();

    ctx.strokeStyle = "#f5c84c";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      String(value || "Driver").slice(0, 16).toUpperCase(),
      256, 64
    );
  }

  draw(name);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    })
  );

  sprite.scale.set(6, 1.5, 1);
  sprite.position.y = 3.65;
  sprite.userData.setName = value => {
    draw(value);
    texture.needsUpdate = true;
  };

  return sprite;
}

/* =========================================================
   VEHICLES — FIVE DISTINCT STYLES
   ========================================================= */

const TAIL_DIM = 0xb81f18;
const TAIL_BRAKE = 0xff5a48;

function makeCarMaterials(rich) {
  const M = rich
    ? (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, ...o })
    : c => new THREE.MeshLambertMaterial({ color: c });
  return {
    dark: M(0x171c22, { specular: 0x222222, shininess: 30 }),
    glass: M(0x183746, { specular: 0x99bbcc, shininess: 100, transparent: true, opacity: .55 }),
    rubber: new THREE.MeshLambertMaterial({ color: 0x101214 }),
    alloy: M(0xb9c2c8, { specular: 0xffffff, shininess: 90 })
  };
}

const carMatsRich = makeCarMaterials(true);
const carMatsBasic = makeCarMaterials(false);
const carLampMat = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
const plateMat = new THREE.MeshLambertMaterial({ color: 0xeeeeea });
const carGlassClear = new THREE.MeshLambertMaterial({ color: 0x183746, transparent: true, opacity: .5 });

const carShadowGeo = new THREE.PlaneGeometry(1, 1);
const carShadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000, transparent: true, opacity: .32, depthWrite: false
});

const flameGeo = new THREE.ConeGeometry(.28, 1.8, 8);
const flameMat = new THREE.MeshBasicMaterial({
  color: 0xff9a3a, transparent: true, opacity: .85,
  blending: THREE.AdditiveBlending, depthWrite: false
});

const wheelGeoCache = new Map();
function wheelGeometry(radius, width) {
  const key = radius + "_" + width;
  if (!wheelGeoCache.has(key)) {
    wheelGeoCache.set(key, {
      tire: new THREE.CylinderGeometry(radius, radius, width, 16),
      rim: new THREE.CylinderGeometry(radius * .62, radius * .62, width * 1.04, 12),
      hub: new THREE.CylinderGeometry(radius * .17, radius * .17, width * 1.08, 8)
    });
  }
  return wheelGeoCache.get(key);
}

// Side profiles are [z, y] points (z = forward). They are extruded sideways
// into a smooth body shell, with a separate glass cabin on top.
const CAR_DESIGN = {
  sport: {
    width: 2.38, front: 2.22, rear: -2.24,
    body: [[2.22, .45], [2.24, .74], [2.05, .9], [1.25, 1.02], [.7, 1.07], [-1.25, 1.07], [-1.95, 1.04], [-2.2, .96], [-2.24, .62], [-2.16, .45]],
    cabin: [[.78, 1.07], [.05, 1.64], [-.85, 1.68], [-1.5, 1.12], [-1.5, 1.07]], cabinW: 1.95,
    roof: [.05, -.85, 1.67],
    pillars: [[.78, 1.07, .05, 1.64], [-1.5, 1.12, -.85, 1.68]],
    wheels: { x: 1.2, zf: 1.48, zr: -1.5, r: .43, w: .29 },
    lamp: [.78, .8, 2.24, .46, .12], tail: [.8, .9, -2.27, .5, .12], grilleY: .64,
    mirror: [1.27, 1.35, .65], plateY: .72, plateF: 2.3, plateR: -2.3, tailZ: -2.3,
    cockpit: [.42, 1.36, -.05], doors: [.45, -.7],
    seats: [[.42, 1.36, -.05], [-.42, 1.36, -.05]], skirt: [-.01, 2.08], exhaust: true
  },
  supercar: {
    width: 2.35, front: 2.25, rear: -2.28,
    body: [[2.25, .4], [2.28, .62], [2.0, .78], [1.2, .9], [.6, .98], [-1.2, .98], [-1.8, .98], [-2.2, .92], [-2.28, .6], [-2.2, .4]],
    cabin: [[.6, .98], [-.2, 1.45], [-.95, 1.47], [-1.6, 1.02]], cabinW: 1.7,
    roof: [-.2, -.95, 1.48],
    pillars: [[.6, .98, -.2, 1.45], [-1.6, 1.02, -.95, 1.47]],
    wheels: { x: 1.18, zf: 1.48, zr: -1.5, r: .43, w: .29 },
    lamp: [.78, .74, 2.28, .6, .1], tail: [.85, .84, -2.31, .5, .1], grilleY: .56,
    mirror: [1.22, 1.08, .5], plateY: .6, plateF: 2.34, plateR: -2.34, tailZ: -2.3,
    cockpit: [.4, 1.12, -.15], doors: [.35, -.8],
    seats: [[.4, 1.12, -.15], [-.4, 1.12, -.15]], skirt: [-.01, 2.08], exhaust: true, vent: true, wing: true
  },
  suv: {
    width: 2.65, front: 2.38, rear: -2.4,
    body: [[2.38, .55], [2.4, 1.05], [2.2, 1.3], [1.4, 1.42], [.8, 1.46], [-2.0, 1.46], [-2.35, 1.4], [-2.4, .9], [-2.35, .55]],
    cabin: [[.85, 1.46], [.55, 2.55], [-2.0, 2.6], [-2.3, 1.46]], cabinW: 2.2,
    roof: [.55, -2.0, 2.6],
    pillars: [[.85, 1.46, .55, 2.55], [-2.3, 1.46, -2.0, 2.6]],
    wheels: { x: 1.35, zf: 1.5, zr: -1.52, r: .53, w: .34 },
    lamp: [.92, 1.14, 2.42, .5, .22], tail: [.95, 1.15, -2.43, .5, .2], grilleY: .98,
    mirror: [1.43, 2.0, .9], plateY: .95, plateF: 2.46, plateR: -2.46, tailZ: -2.45,
    cockpit: [.5, 2.0, .25], doors: [.6, -.5, -1.55],
    seats: [[.5, 2.0, .25], [-.5, 2.0, .25], [.7, 2.0, -.7], [0, 2.0, -.7], [-.7, 2.0, -.7], [.5, 2.0, -1.6], [-.5, 2.0, -1.6]], skirt: [0, 2.2], rails: true
  },
  sedan: {
    width: 2.48, front: 2.4, rear: -2.42,
    body: [[2.4, .45], [2.42, .8], [2.2, .98], [1.4, 1.08], [.9, 1.14], [-1.4, 1.14], [-2.05, 1.1], [-2.38, 1.02], [-2.42, .7], [-2.34, .45]],
    cabin: [[.95, 1.14], [.2, 1.78], [-.95, 1.8], [-1.5, 1.14]], cabinW: 2.0,
    roof: [.2, -.95, 1.82],
    pillars: [[.95, 1.14, .2, 1.78], [-1.5, 1.14, -.95, 1.8]],
    wheels: { x: 1.23, zf: 1.52, zr: -1.55, r: .43, w: .29 },
    lamp: [.8, .92, 2.44, .5, .14], tail: [.82, .98, -2.45, .55, .14], grilleY: .72,
    mirror: [1.3, 1.68, .8], plateY: .85, plateF: 2.48, plateR: -2.48, tailZ: -2.45,
    cockpit: [.45, 1.62, .2], doors: [.6, -.45, -1.4],
    seats: [[.45, 1.62, .2], [-.45, 1.62, .2], [.6, 1.62, -.8], [0, 1.62, -.8], [-.6, 1.62, -.8]], skirt: [-.02, 2.3], exhaust: true
  },
  jeep: {
    width: 2.55, front: 2.2, rear: -2.2,
    body: [[2.2, .6], [2.22, 1.25], [2.0, 1.4], [1.1, 1.46], [.75, 1.5], [-1.9, 1.5], [-2.2, 1.4], [-2.2, .6]],
    cabin: [[.75, 1.5], [.7, 2.4], [-1.9, 2.42], [-1.95, 1.5]], cabinW: 2.15,
    roof: [.7, -1.9, 2.42],
    pillars: [[.75, 1.5, .7, 2.4], [-1.95, 1.5, -1.9, 2.42]],
    wheels: { x: 1.3, zf: 1.42, zr: -1.38, r: .55, w: .38 },
    lamp: [.85, 1.42, 2.25, .4, .4], tail: [1.0, 1.28, -2.23, .4, .2], grilleY: 1.38, round: true, slats: true, spare: true,
    mirror: [1.4, 1.95, 1.0], plateY: 1.0, plateF: 2.31, plateR: -2.25, tailZ: -2.3,
    cockpit: [.5, 1.95, 0], doors: [.4, -.55],
    seats: [[.5, 1.95, 0], [-.5, 1.95, 0], [.5, 1.95, -1.2], [-.5, 1.95, -1.2]], skirt: [0, 1.9], rails: true
  }
};

const carShellCache = new Map();

function carShellGeometry(key, profile, width) {
  if (carShellCache.has(key)) return carShellCache.get(key);

  const shape = new THREE.Shape();
  profile.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();

  const bevel = .07;
  const depth = Math.max(.1, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 1
  });

  geo.translate(0, 0, -depth / 2);   // centre across the width
  geo.rotateY(-Math.PI / 2);         // shape x -> car z (forward)
  carShellCache.set(key, geo);
  return geo;
}

// A thin bar between two side-profile points (window pillars, roof rails)
function strut(parent, x, z1, y1, z2, y2, thickness, material) {
  const dz = z2 - z1, dy = y2 - y1;
  const m = new THREE.Mesh(boxGeo, material);
  m.position.set(x, (y1 + y2) / 2, (z1 + z2) / 2);
  m.rotation.x = -Math.atan2(dy, dz);
  m.scale.set(thickness, thickness, Math.hypot(dz, dy) + thickness);
  parent.add(m);
  return m;
}

const roundLampGeo = new THREE.CylinderGeometry(.2, .2, .09, 12);
const steeringWheelGeo = new THREE.TorusGeometry(.2, .03, 6, 14);

function createCar(color = 0xe33b2e, style = "sport", rich = false, seatView = false) {
  const car = new THREE.Group();
  car.rotation.order = "YXZ";   // yaw first, then pitch / roll
  const spec = VEHICLES[style] || VEHICLES.sport;
  const design = CAR_DESIGN[style] || CAR_DESIGN.sport;
  const W = design.width;

  const paint = rich
    ? new THREE.MeshPhongMaterial({ color, specular: 0x555555, shininess: 70 })
    : new THREE.MeshLambertMaterial({ color });

  const M = rich ? carMatsRich : carMatsBasic;
  const { dark, rubber, alloy } = M;
  // seatView: other players' cars show see-through glass so you can see who is inside
  const glass = rich ? M.glass : seatView ? carGlassClear : M.glass;
  const lamp = carLampMat;
  const redLamp = new THREE.MeshBasicMaterial({ color: TAIL_DIM });

  const wheels = [];
  const frontWheels = [];

  const part = (x, y, z, sx, sy, sz, material) => box(car, x, y, z, sx, sy, sz, material);

  function addWheel(x, z, radius, width) {
    const g = wheelGeometry(radius, width);
    const tire = new THREE.Mesh(g.tire, rubber);
    const rim = new THREE.Mesh(g.rim, alloy);
    const hub = new THREE.Mesh(g.hub, dark);

    // Traffic cars skip the tiny hub cap to save draw calls
    for (const m of rich ? [tire, rim, hub] : [tire, rim]) {
      m.rotation.order = "YXZ";          // steer (Y), then spin (X)
      m.rotation.z = Math.PI / 2;
      m.position.set(x, radius, z);
      car.add(m);
      wheels.push(m);
      if (z > 0) frontWheels.push(m);
    }

    if (rich) {
      // Dark wheel-arch ring on the side of the body
      const arch = new THREE.Mesh(cylinderGeo, dark);
      arch.rotation.z = Math.PI / 2;
      arch.scale.set(radius + .11, .05, radius + .11);
      arch.position.set(Math.sign(x) * (W / 2 + .01), radius, z);
      car.add(arch);
    }
  }

  /* ----- shell: body, glass cabin, roof ----- */
  car.add(new THREE.Mesh(carShellGeometry(style + "_body", design.body, W), paint));

  const cabin = new THREE.Mesh(carShellGeometry(style + "_cabin", design.cabin, design.cabinW), glass);
  cabin.renderOrder = 1;
  car.add(cabin);

  const [roofFront, roofRear, roofY] = design.roof;
  part(0, roofY + .03, (roofFront + roofRear) / 2, design.cabinW + .06, .09, roofFront - roofRear + .1, paint);

  if (rich) {
    for (const s of [-1, 1]) {
      for (const p of design.pillars) {
        strut(car, s * design.cabinW / 2, p[0], p[1], p[2], p[3], .08, paint);
      }
    }
  }

  /* ----- front and rear ----- */
  const L = design.lamp, T = design.tail;
  for (const s of [-1, 1]) {
    if (design.round) {
      const head = new THREE.Mesh(roundLampGeo, lamp);
      head.rotation.x = Math.PI / 2;
      head.position.set(s * L[0], L[1], L[2]);
      car.add(head);
    } else {
      part(s * L[0], L[1], L[2], L[3], L[4], .08, lamp);
    }
    part(s * T[0], T[1], T[2], T[3], T[4], .08, redLamp);
  }

  part(0, design.grilleY, design.front + .04, W * .42, .2, .07, dark);
  part(0, .5, design.front + .02, W - .1, .17, .14, dark);       // front bumper
  part(0, .5, design.rear - .02, W - .1, .17, .14, dark);        // rear bumper

  if (design.slats) {
    for (let i = -3; i <= 3; i++) part(i * .14, design.grilleY, design.front + .09, .055, .37, .025, alloy);
  }

  if (design.wing) {
    part(0, 1.3, -2.0, 2.2, .07, .55, dark);
    for (const s of [-1, 1]) part(s * .7, 1.12, -2.0, .08, .34, .12, dark);
  }

  if (design.vent) part(0, .95, 1.25, .7, .03, .7, dark);

  if (design.exhaust) {
    for (const s of [-.55, .55]) {
      const pipe = new THREE.Mesh(cylinderGeo, alloy);
      pipe.rotation.x = Math.PI / 2;
      pipe.scale.set(.07, .3, .07);
      pipe.position.set(s, .42, design.rear - .06);
      car.add(pipe);
    }
  }

  if (design.spare) {
    const spare = new THREE.Mesh(new THREE.TorusGeometry(.39, .13, 6, 14), rubber);
    spare.position.set(0, 1.45, design.rear - .12);
    car.add(spare);
  }

  /* ----- sides ----- */
  for (const s of [-1, 1]) {
    part(s * design.mirror[0], design.mirror[1], design.mirror[2], .22, .16, .1, paint);
  }

  part(0, design.plateY, design.plateF, .62, .2, .04, plateMat);
  part(0, design.plateY, design.plateR, .62, .2, .04, plateMat);

  if (rich) {
    for (const z of design.doors) {
      for (const s of [-1, 1]) part(s * (W / 2 + .012), .8, z, .02, .5, .025, dark);
    }
    for (const s of [-1, 1]) part(s * (W / 2), .5, design.skirt[0], .07, .12, design.skirt[1], dark);

    if (design.rails) {
      for (const s of [-1, 1]) {
        part(s * design.cabinW * .36, roofY + .1, (roofFront + roofRear) / 2, .07, .07, roofFront - roofRear - .2, dark);
      }
    }

    part(.55, roofY + .2, roofRear + .5, .02, .4, .02, dark);   // aerial
  }

  /* ----- wheels ----- */
  const w = design.wheels;
  for (const x of [-w.x, w.x]) {
    addWheel(x, w.zr, w.r, w.w);
    addWheel(x, w.zf, w.r, w.w);
  }

  /* ----- interior (visible through the glass on the player's car) ----- */
  if (rich || seatView) {
    const [cx, cy, cz] = design.cockpit;

    for (const [sx, sy, sz] of design.seats) {
      part(sx, sy - .62, sz - .15, .52, .14, .55, dark);       // seat
      part(sx, sy - .3, sz - .45, .52, .6, .12, dark);         // back rest
    }

    part(0, cy - .42, cz + .7, W * .62, .26, .5, dark);        // dashboard

    const wheel = new THREE.Mesh(steeringWheelGeo, dark);
    wheel.position.set(cx, cy - .3, cz + .42);
    wheel.rotation.x = -.8;
    car.add(wheel);
  }

  // Soft shadow under the car
  const shadow = new THREE.Mesh(carShadowGeo, carShadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .04;
  shadow.scale.set(2.9, 5.6, 1);
  car.add(shadow);

  // Nitro flames (only built for the player's own car)
  if (rich) {
    const flames = new THREE.Group();
    for (const s of [-1, 1]) {
      const cone = new THREE.Mesh(flameGeo, flameMat);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(s * .62, .7, design.tailZ - .9);
      flames.add(cone);
    }
    flames.visible = false;
    car.add(flames);
    car.userData.flames = flames;
  }

  car.userData.wheels = wheels;
  car.userData.frontWheels = frontWheels;
  car.userData.paint = paint;
  car.userData.tail = redLamp;
  car.userData.tailLit = false;
  car.userData.style = style;
  car.userData.spec = spec;
  car.userData.cockpit = design.cockpit;
  car.userData.seats = design.seats;
  car.userData.vehicleName = spec.name;
  return car;
}

/* =========================================================
   LOCAL PLAYER
   ========================================================= */

const player = createCharacter(STREET_BLUE, selectedGender);
scene.add(player);
player.rotation.order = "YXZ";   // lets the body fall over when killed
player.position.set(SPAWN.playerX, 0, SPAWN.playerZ);

const localNameTag = createNameTag("Driver");
player.add(localNameTag);

function rebuildLocalCharacter(gender) {
  const pos = player.position.clone();
  const rot = player.rotation.y;
  const replacement = createCharacter(STREET_BLUE, gender);

  player.clear();
  while (replacement.children.length) {
    player.add(replacement.children[0]);
  }

  player.userData = replacement.userData;
  player.position.copy(pos);
  player.rotation.y = rot;
  player.add(localNameTag);
  setCharacterGun(player, currentWeapon);
}

let selectedVehicleType = "sport";
let car = createCar(VEHICLES.sport.color, selectedVehicleType, true);
car.position.set(SPAWN.carX, 0, SPAWN.carZ);
scene.add(car);

let driving = false;
let carSpeed = 0;
let carRotation = 0;
let playerRotation = 0;

let garageOpen = false;
let paused = false;
let started = false;
let chatOpen = false;
let messageTimer = 0;

const JUMP_FORCE = 9.5;
const GRAVITY = 24;
let verticalVelocity = 0;
let jumping = false;

// Physics state
const carVel = new THREE.Vector2();   // world velocity (x, z)
let carLateral = 0;                   // sideways slip speed
let steerVisual = 0;                  // smoothed steering input
let nitro = NITRO_MAX;
let nitroActive = false;
let nitroDelay = 0;
let stamina = STAMINA_MAX;
let sprinting = false;
let exhausted = false;
let staminaDelay = 0;
let playerGround = 0;
let jumpOffset = 0;
let playerSpeedNow = 0;
let strafeNow = 0;
let lastMoveSign = 1;
let camShake = 0;
let crashCooldown = 0;
let embedTimer = 0;
let stuckTimer = 0;
let longAccSmooth = 0;
let prevCarSpeed = 0;
let carPitch = 0;
let carRoll = 0;

const hud = {
  speed: document.getElementById("speed"),
  cash: document.getElementById("cash"),
  mode: document.getElementById("mode"),
  mission: document.getElementById("mission"),
  progress: document.getElementById("progress"),
  message: document.getElementById("message")
};

function showMessage(message) {
  if (!hud.message) return;
  hud.message.textContent = message;
  hud.message.style.opacity = "1";
  messageTimer = 2.2;
}

/* =========================================================
   VEHICLE AUDIO — ENGINE AND HORN
   ========================================================= */

let vehicleAudio = null;
let engineRunning = false;

function ensureVehicleAudio() {
  if (vehicleAudio) {
    if (vehicleAudio.context.state === "suspended") {
      vehicleAudio.context.resume().catch(() => {});
    }
    return vehicleAudio;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    showMessage("AUDIO IS NOT SUPPORTED IN THIS BROWSER");
    return null;
  }

  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.55;
  master.connect(context.destination);

  // Low rumble (noise-based)
  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 180;
  const noiseGain = context.createGain();
  noiseGain.gain.value = 0;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start();

  // Main engine oscillators
  const engineGain = context.createGain();
  engineGain.gain.value = 0;
  engineGain.connect(master);

  const low = context.createOscillator();
  const mid = context.createOscillator();
  const high = context.createOscillator();
  const filter = context.createBiquadFilter();
  low.type = "sawtooth";
  mid.type = "triangle";
  high.type = "square";
  filter.type = "lowpass";
  filter.frequency.value = 600;
  filter.Q.value = 0.7;

  low.connect(filter);
  mid.connect(filter);
  high.connect(filter);
  filter.connect(engineGain);

  low.start();
  mid.start();
  high.start();

  vehicleAudio = {
    context, master, engineGain, low, mid, high, filter,
    noise, noiseFilter, noiseGain
  };
  return vehicleAudio;
}

function playIgnitionSound(audio) {
  if (!audio) return;
  const now = audio.context.currentTime;
  const osc = audio.context.createOscillator();
  const gain = audio.context.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(55, now + 0.35);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(now);
  osc.stop(now + 0.5);
}

function playCrashSound(intensity = .6) {
  const audio = vehicleAudio;
  if (!audio) return;
  if (audio.context.state === "suspended") audio.context.resume().catch(() => {});

  const now = audio.context.currentTime;
  const osc = audio.context.createOscillator();
  const gain = audio.context.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + .25);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.05 + intensity * .3, now + .02);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .3);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(now);
  osc.stop(now + .35);
}

function setEngineRunning(running) {
  const nextState = !!running;

  if (nextState === engineRunning) {
    updateVehicleButtons();
    return;
  }

  engineRunning = nextState;   // set first so an audio problem can never stop the car
  let audio = vehicleAudio;
  try {
    if (nextState) audio = ensureVehicleAudio();
  } catch (error) {
    console.warn("Audio unavailable", error);
    audio = null;
  }

  if (audio) {
    if (audio.context.state === "suspended") {
      audio.context.resume().catch(() => {});
    }
    const now = audio.context.currentTime;
    audio.engineGain.gain.cancelScheduledValues(now);
    audio.noiseGain.gain.cancelScheduledValues(now);
    const target = engineRunning ? 0.42 : 0;
    const noiseTarget = engineRunning ? 0.22 : 0;
    audio.engineGain.gain.setTargetAtTime(target, now, 0.1);
    audio.noiseGain.gain.setTargetAtTime(noiseTarget, now, 0.12);
    if (engineRunning) playIgnitionSound(audio);
  }

  updateVehicleButtons();
  showMessage(engineRunning ? "ENGINE STARTED" : "ENGINE STOPPED");
}

function toggleEngine() {
  if (!started || paused || !driving || chatOpen || garageOpen) return;
  setEngineRunning(!engineRunning);
}

function playVehicleHorn() {
  if (!driving || !started || paused || chatOpen || garageOpen) return;
  const audio = ensureVehicleAudio();
  if (!audio) return;
  if (audio.context.state === "suspended") audio.context.resume().catch(() => {});

  const now = audio.context.currentTime;
  const hornGain = audio.context.createGain();
  const hornA = audio.context.createOscillator();
  const hornB = audio.context.createOscillator();
  const lfo = audio.context.createOscillator();
  const lfoGain = audio.context.createGain();

  hornA.type = "square";
  hornB.type = "sawtooth";
  hornA.frequency.setValueAtTime(380, now);
  hornB.frequency.setValueAtTime(480, now);

  // Slight modulation for a more mechanical horn
  lfo.frequency.setValueAtTime(8, now);
  lfoGain.gain.setValueAtTime(6, now);
  lfo.connect(lfoGain);
  lfoGain.connect(hornA.frequency);
  lfoGain.connect(hornB.frequency);

  hornGain.gain.setValueAtTime(0.0001, now);
  hornGain.gain.exponentialRampToValueAtTime(0.28, now + 0.03);
  hornGain.gain.setValueAtTime(0.28, now + 0.25);
  hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

  hornA.connect(hornGain);
  hornB.connect(hornGain);
  hornGain.connect(audio.master);

  hornA.start(now);
  hornB.start(now);
  lfo.start(now);
  hornA.stop(now + 0.6);
  hornB.stop(now + 0.6);
  lfo.stop(now + 0.6);
}

function updateVehicleAudio() {
  if (!vehicleAudio || !engineRunning) return;
  const audio = vehicleAudio;

  const stylePitch = {
    sport: 1.05, supercar: 1.35, suv: 0.75, sedan: 0.88, jeep: 0.62
  }[selectedVehicleType] || 1;

  const maxSpeed = car.userData.spec.topSpeed / 3.6;
  const throttle =
    (keys.w || keys.arrowup || controls.accelerate || nitroActive) ? 1 : 0;
  const speed = Math.abs(carSpeed);
  const ratio = clamp(speed / maxSpeed, 0, 1);

  // Six simulated gears: RPM climbs, drops on each shift
  const gears = 6;
  const gearPos = Math.min(gears - .001, ratio * gears * 1.15);
  const inGear = gearPos - Math.floor(gearPos);
  let rpmNorm = .22 + inGear * .78;
  if (speed < 1.5) rpmNorm = .18 + throttle * .55;

  const rpm =
    (55 + rpmNorm * 170 + throttle * 20) * stylePitch * (nitroActive ? 1.12 : 1);

  const now = audio.context.currentTime;
  audio.low.frequency.setTargetAtTime(rpm * 0.85, now, 0.06);
  audio.mid.frequency.setTargetAtTime(rpm * 1.6, now, 0.06);
  audio.high.frequency.setTargetAtTime(rpm * 2.4, now, 0.06);
  audio.filter.frequency.setTargetAtTime(
    380 + rpmNorm * 900 + throttle * 200, now, 0.08
  );
  audio.noiseFilter.frequency.setTargetAtTime(
    140 + speed * 14 + (nitroActive ? 500 : 0), now, 0.1
  );

  const skid = Math.min(.3, Math.abs(carLateral) * .02);
  audio.noiseGain.gain.setTargetAtTime(
    .22 + (nitroActive ? .3 : 0) + skid, now, 0.1
  );

  audio.engineGain.gain.setTargetAtTime(
    .34 + throttle * .08 + rpmNorm * .08, now, 0.08
  );
}

const vehicleControlStyle = document.createElement("style");
vehicleControlStyle.textContent = `
#vice-vehicle-controls{position:fixed;right:22px;bottom:28px;z-index:2147483000;display:none;gap:10px;flex-direction:column;align-items:stretch;pointer-events:auto}
#vice-vehicle-controls button{border:2px solid rgba(255,255,255,.8);border-radius:10px;padding:14px 18px;min-width:154px;min-height:48px;background:rgba(12,24,36,.96);color:#fff;font-size:13px;font-weight:900;letter-spacing:.6px;cursor:pointer;box-shadow:0 5px 18px #0009;touch-action:manipulation}
#vice-vehicle-controls button:active{transform:scale(.97)}
#vice-engine-button{background:rgba(25,105,65,.95)!important}
#vice-horn-button{background:rgba(35,75,125,.95)!important}
#vice-nitro-button{background:rgba(190,95,15,.95)!important}
@media(max-width:700px){#vice-vehicle-controls{right:12px;bottom:155px}#vice-vehicle-controls button{padding:11px 12px;min-width:128px;min-height:44px;font-size:11px}}
`;
document.head.appendChild(vehicleControlStyle);

const vehicleControls = document.createElement("div");
vehicleControls.id = "vice-vehicle-controls";
const engineButton = document.createElement("button");
engineButton.id = "vice-engine-button";
engineButton.type = "button";
const hornButton = document.createElement("button");
hornButton.id = "vice-horn-button";
hornButton.type = "button";
hornButton.textContent = "HORN";
engineButton.addEventListener("click", toggleEngine);
hornButton.addEventListener("click", playVehicleHorn);
const nitroButton = document.createElement("button");
nitroButton.id = "vice-nitro-button";
nitroButton.type = "button";
nitroButton.textContent = "NITRO";
vehicleControls.append(engineButton, hornButton, nitroButton);
document.body.appendChild(vehicleControls);
bindMobileControl("vice-nitro-button", "boost");

function updateVehicleButtons() {
  engineButton.textContent = engineRunning ? "STOP ENGINE" : "START ENGINE";
  vehicleControls.style.display =
    driving && started && !paused && !touchUIActive ? "flex" : "none";
}

function jump() {
  if (
    !started || paused || driving || chatOpen || garageOpen || jumping
  ) return;

  jumping = true;
  verticalVelocity = sprinting ? JUMP_FORCE * 1.08 : JUMP_FORCE;
}

function updateJump(dt) {
  const gy = groundHeightAt(player.position.x, player.position.z);

  if (ridingIn) {
    jumpOffset = 0;
    verticalVelocity = 0;
    jumping = false;
    playerGround = player.position.y;
    return;
  }

  if (driving) {
    jumpOffset = 0;
    verticalVelocity = 0;
    jumping = false;
    playerGround = gy;
    player.position.y = gy;
    return;
  }

  if (jumping) {
    verticalVelocity -= GRAVITY * dt;
    jumpOffset += verticalVelocity * dt;

    if (jumpOffset <= 0) {
      jumpOffset = 0;
      verticalVelocity = 0;
      jumping = false;
    }
  }

  // Smoothly step up and down curbs
  playerGround += (gy - playerGround) * Math.min(1, 18 * dt);
  player.position.y = playerGround + jumpOffset;

  const shadow = player.userData.shadow;
  if (shadow) shadow.position.y = .03 - jumpOffset;
  player.userData.airborne = jumping;
}

/* =========================================================
   GARAGE
   ========================================================= */

const garageStyle = document.createElement("style");
garageStyle.textContent = `
#vice-garage{
  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
  width:min(760px,92vw);max-height:85vh;overflow-y:auto;
  padding:22px;background:rgba(8,15,24,.96);
  border:2px solid #e6b93e;border-radius:16px;
  color:#fff;font-family:Arial,sans-serif;z-index:10020;
  box-shadow:0 15px 55px rgba(0,0,0,.65)
}
#vice-garage.hidden{display:none}
#vice-garage h2{margin:0 0 5px;text-align:center;color:#ffd45b;font-size:27px}
#vice-garage .garage-sub{text-align:center;color:#c5d1dc;font-size:12px;margin-bottom:18px}
#vice-garage-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.vice-vehicle-card{
  text-align:left;padding:14px;border-radius:11px;
  border:1px solid #65717e;background:#172431;color:#fff;
  cursor:pointer;min-width:0
}
.vice-vehicle-card:hover{background:#293b4c;border-color:#ffd45b}
.vice-vehicle-card.selected{border:2px solid #ffd45b;background:#39402e}
.vice-vehicle-card strong{display:block;color:#ffd45b;font-size:15px;margin-bottom:5px}
.vice-vehicle-card span{display:block;color:#d7e0e8;font-size:11px;line-height:1.45}
.vice-vehicle-card .garage-speed{margin-top:8px;color:#fff;font-weight:bold;font-size:13px}
#vice-garage-footer{display:flex;justify-content:space-between;gap:10px;margin-top:17px;flex-wrap:wrap}
#vice-garage-footer button{
  padding:11px 17px;border:0;border-radius:8px;
  background:#d6a62e;color:#151515;font-weight:bold;cursor:pointer
}
#vice-garage-footer button:last-child{background:#374657;color:#fff}
#vice-garage-current{text-align:center;color:#9fd9ff;font-size:12px;margin-top:12px}
@media(max-width:520px){
  #vice-garage{padding:14px}
  #vice-garage-grid{grid-template-columns:1fr}
  #vice-garage h2{font-size:22px}
}`;
document.head.appendChild(garageStyle);

const garagePanel = document.createElement("div");
garagePanel.id = "vice-garage";
garagePanel.className = "hidden";

const garageTitle = document.createElement("h2");
garageTitle.textContent = "VICE CITY VEHICLE GARAGE";

const garageSub = document.createElement("div");
garageSub.className = "garage-sub";
garageSub.textContent =
  "Choose your ride. Every vehicle has different performance.";

const garageGrid = document.createElement("div");
garageGrid.id = "vice-garage-grid";

const garageFooter = document.createElement("div");
garageFooter.id = "vice-garage-footer";

const garageCurrent = document.createElement("div");
garageCurrent.id = "vice-garage-current";

const garageClose = document.createElement("button");
garageClose.textContent = "CLOSE GARAGE";

const garageHelp = document.createElement("button");
garageHelp.textContent = "V OR ESC TO CLOSE";
garageFooter.append(garageClose, garageHelp);
garagePanel.append(
  garageTitle, garageSub, garageGrid, garageFooter, garageCurrent
);
document.body.appendChild(garagePanel);

function updateGarageCurrent() {
  const spec = VEHICLES[selectedVehicleType];
  garageCurrent.textContent =
    `CURRENT VEHICLE: ${spec.name} | TOP SPEED: ${spec.topSpeed} KM/H`;
}

function spawnVehicle(type) {
  if (!VEHICLES[type] || driving) return;

  const oldPosition = player.position.clone();
  const oldRotation = playerRotation;

  scene.remove(car);
  if (car.userData.paint) car.userData.paint.dispose();
  selectedVehicleType = type;

  const spec = VEHICLES[type];
  car = createCar(spec.color, type, true);

  const wanted = [
    oldPosition.x + Math.sin(oldRotation) * 5,
    oldPosition.z + Math.cos(oldRotation) * 5
  ];
  const free = findFreeSpot(wanted[0], wanted[1], CAR_RADIUS) || wanted;
  car.position.set(free[0], 0, free[1]);

  carRotation = oldRotation;
  car.rotation.y = carRotation;
  carSpeed = 0;
  carVel.set(0, 0);
  car.position.y = groundHeightAt(car.position.x, car.position.z);
  scene.add(car);

  showMessage(`${spec.name} SPAWNED`);
  updateGarageCurrent();
}

function refreshGarageCards() {
  garageGrid.replaceChildren();

  for (const type of VEHICLE_ORDER) {
    const spec = VEHICLES[type];
    const card = document.createElement("button");

    card.type = "button";
    card.className =
      "vice-vehicle-card" +
      (selectedVehicleType === type ? " selected" : "");

    const title = document.createElement("strong");
    title.textContent = spec.name;

    const description = document.createElement("span");
    description.textContent = spec.subtitle;

    const speed = document.createElement("span");
    speed.className = "garage-speed";
    speed.textContent = `TOP SPEED: ${spec.topSpeed} KM/H`;

    const acceleration = document.createElement("span");
    acceleration.textContent =
      `Acceleration rating: ${spec.acceleration.toFixed(1)}`;

    card.append(title, description, speed, acceleration);

    card.addEventListener("click", () => {
      spawnVehicle(type);
      refreshGarageCards();
    });

    garageGrid.appendChild(card);
  }

  updateGarageCurrent();
}

function openGarage() {
  if (!started || paused || driving || chatOpen) return;
  releaseMouse();
  garageOpen = true;
  garagePanel.classList.remove("hidden");
  refreshGarageCards();
  clearControls();
}

function closeGarage() {
  garageOpen = false;
  garagePanel.classList.add("hidden");
  if (typeof missionMenu !== "undefined") missionMenu.classList.add("hidden");
}

function toggleGarage() {
  if (garageOpen) closeGarage();
  else openGarage();
}

garageClose.addEventListener("click", closeGarage);
garageHelp.addEventListener("click", closeGarage);

/* =========================================================
   MULTIPLAYER — IMPROVED JOIN AND RECONNECTION HANDLING
   ========================================================= */

function createOfflineSocket() {
  // Used only if the socket.io script failed to load, so the page does not crash
  console.warn("socket.io not available — multiplayer is offline");
  const stub = {
    connected: false,
    id: null,
    on() { return stub; },
    emit() {},
    connect() {},
    disconnect() {}
  };
  return stub;
}

const socket = (window.io || createOfflineSocket)({
  autoConnect: true,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

let myPlayerId = null;
let myPlayerName = "Driver";
let multiplayerJoined = false;
let requestedStart = false;
let networkTimer = 0;

const remotePlayers = new Map();

const connectionElement = document.getElementById("connection");
const playerCountElement = document.getElementById("player-count");

function updateConnection(online) {
  if (!connectionElement) return;
  connectionElement.textContent = online ? "ONLINE" : "DISCONNECTED";
  connectionElement.classList.toggle("online", online);
  connectionElement.classList.toggle("offline", !online);
}

function updatePlayerCount() {
  if (!playerCountElement) return;
  playerCountElement.textContent =
    "PLAYERS: " + (remotePlayers.size + (myPlayerId ? 1 : 0));
}

function removeRemotePlayer(id) {
  const remote = remotePlayers.get(id);
  if (!remote) return;

  if (remote.avatar.parent) remote.avatar.parent.remove(remote.avatar);
  seated.delete(id);

  scene.remove(remote.root);

  // Geometry and most materials are shared, so only free per-player assets.
  remote.root.traverse(object => {
    if (object.isSprite && object.material) {
      if (object.material.map) object.material.map.dispose();
      object.material.dispose();
    }
  });

  if (remote.vehicle.userData.paint) remote.vehicle.userData.paint.dispose();
  remotePlayers.delete(id);
}

function clearRemotePlayers() {
  for (const id of [...remotePlayers.keys()]) {
    removeRemotePlayer(id);
  }
  seated.clear();
  if (ridingIn) {
    ridingIn = null;
    player.visible = !driving;
  }
  updatePlayerCount();
}

function joinGame() {
  if (
    !socket.connected ||
    multiplayerJoined ||
    !requestedStart
  ) return;

  multiplayerJoined = true;

  socket.emit("player:join", {
    name: myPlayerName,
    gender: selectedGender,
    skin: "street-blue",
    vehicleType: selectedVehicleType,
    color: car.userData.paint.color.getHex()
  });
}

socket.on("connect", () => {
  updateConnection(true);

  // A fresh connection needs a fresh server-side join.
  myPlayerId = null;
  multiplayerJoined = false;
  updatePlayerCount();

  if (requestedStart) {
    joinGame();
  }
});

socket.on("disconnect", () => {
  updateConnection(false);
  multiplayerJoined = false;
  myPlayerId = null;
  clearRemotePlayers();

  if (started) {
    started = false;
    paused = false;

    if (pauseScreen) pauseScreen.classList.add("hidden");
    if (startScreen) startScreen.classList.remove("hidden");

    showMessage("CONNECTION LOST — RECONNECTING");
  }

  updatePlayerCount();
});

socket.on("connect_error", () => {
  updateConnection(false);
});

socket.on("player:assigned", data => {
  /*
    Accept the common server assignment formats:
    { id: "..." }
    { playerId: "..." }
    { socketId: "..." }
    or a direct string ID.

    socket.id is the fallback for servers that identify
    players by their Socket.IO connection ID.
  */

  const assignedId = typeof data === "string"
    ? data
    : data?.id || data?.playerId || data?.socketId || socket.id;

  if (!assignedId) {
    multiplayerJoined = false;
    showMessage("SERVER DID NOT ASSIGN A PLAYER ID");
    return;
  }

  myPlayerId = assignedId;

  if (data && typeof data === "object") {
    myPlayerName = data.name || myPlayerName;

    const gender = data.gender === "female" ? "female" : "male";

    if (gender !== selectedGender) {
      selectedGender = gender;
      rebuildLocalCharacter(gender);

      if (typeof updateGenderButtons === "function") {
        updateGenderButtons();
      }
    }
  }

  localNameTag.userData.setName(myPlayerName);
  updatePlayerCount();

  showMessage("WELCOME " + myPlayerName.toUpperCase());

  if (requestedStart && !started) {
    startGame();
  }
});
function addRemotePlayer(data) {
  if (!data || typeof data !== "object") return;

  const id = data.id || data.playerId || data.socketId;
  if (!id || id === myPlayerId || remotePlayers.has(id)) return;

  const gender = data.gender === "female" ? "female" : "male";
  const type = VEHICLES[data.vehicleType] ? data.vehicleType : "sport";

  const root = new THREE.Group();
  const avatar = createCharacter(STREET_BLUE, gender);
  const vehicle = createCar(
    Number.isFinite(data.color) ? data.color : 0x2874bb,
    type, false, true
  );
  const nameTag = createNameTag(data.name || "Driver");

  root.add(avatar, vehicle, nameTag);
  scene.add(root);

  const remote = {
    id,
    root,
    avatar,
    vehicle,
    nameTag,
    name: data.name || "Driver",
    gender,
    vehicleType: type,
    targetPosition: new THREE.Vector3(
      Number.isFinite(data.x) ? data.x : 0,
      Number.isFinite(data.y) ? data.y : 0,
      Number.isFinite(data.z) ? data.z : 0
    ),
    targetRotation: Number.isFinite(data.rotation) ? data.rotation : 0,
    driving: data.driving === true,
    jumping: data.jumping === true,
    speed: Number.isFinite(data.speed) ? data.speed : 0
  };

  avatar.visible = !remote.driving;
  vehicle.visible = remote.driving;

  root.position.copy(remote.targetPosition);
  root.rotation.y = remote.targetRotation;

  remotePlayers.set(id, remote);
}

socket.on("players:init", players => {
  if (Array.isArray(players)) {
    players.forEach(addRemotePlayer);
  }
  updatePlayerCount();
});

socket.on("player:joined", data => {
  addRemotePlayer(data);
  setTimeout(announceState, 500);

  if (data?.name) {
    showMessage(data.name + " JOINED THE CITY");
  }

  updatePlayerCount();
});

socket.on("player:update", data => {
  if (!data || typeof data !== "object") return;

  const id = data.id || data.playerId || data.socketId;
  if (!id || id === myPlayerId) return;

  if (!remotePlayers.has(id)) {
    addRemotePlayer(data);
  }

  const remote = remotePlayers.get(id);
  if (!remote) return;

  if (![data.x, data.y, data.z, data.rotation].every(Number.isFinite)) {
    return;
  }

  remote.targetPosition.set(
    clamp(data.x, -950, 950),
    clamp(data.y, -1, 12),
    clamp(data.z, -950, 950)
  );

  remote.targetRotation = data.rotation;
  remote.driving = data.driving === true;
  remote.jumping = data.jumping === true;
  remote.avatar.userData.airborne = remote.jumping;
  if (Number.isFinite(data.weapon)) remote.weapon = data.weapon;
  remote.speed = Number.isFinite(data.speed) ? data.speed : 0;

  const gender = data.gender === "female" ? "female" : "male";

  if (gender !== remote.gender) {
    if (remote.avatar.parent) remote.avatar.parent.remove(remote.avatar);
    remote.avatar = createCharacter(STREET_BLUE, gender);
    remote.root.add(remote.avatar);
    remote.gender = gender;
  }

  if (
    VEHICLES[data.vehicleType] &&
    data.vehicleType !== remote.vehicleType
  ) {
    remote.root.remove(remote.vehicle);
    remote.vehicle = createCar(
      Number.isFinite(data.color) ? data.color : 0x2874bb,
      data.vehicleType, false, true
    );
    remote.root.add(remote.vehicle);
    remote.vehicleType = data.vehicleType;
  }

  remote.avatar.visible = !remote.driving;
  remote.vehicle.visible = remote.driving;
});

socket.on("player:left", id => {
  removeRemotePlayer(id);
  updatePlayerCount();
});

function updateRemotePlayers(dt) {
  const smoothing = 1 - Math.pow(.002, dt);

  validateSeats();

  for (const remote of remotePlayers.values()) {
    remote.root.position.lerp(remote.targetPosition, smoothing);

    const diff = Math.atan2(
      Math.sin(remote.targetRotation - remote.root.rotation.y),
      Math.cos(remote.targetRotation - remote.root.rotation.y)
    );

    remote.root.rotation.y += diff * smoothing;

    if (!remote.driving) {
      remote.avatar.userData.airborne = remote.jumping;
      animateCharacter(
        remote.avatar,
        dt,
        remote.speed > .5,
        remote.speed / 4,
        remote.speed > 11
      );
      applyAimPose(remote.avatar);
    } else {
      remote.vehicle.userData.wheels.forEach(wheel => {
        wheel.rotation.x += remote.speed * dt * .15;
      });
    }

    // Guns synced from other players, then seat layout (inside vehicles)
    if (!remote.driving && remote.weapon !== undefined) setCharacterGun(remote.avatar, remote.weapon);
    layoutRemoteSeat(remote);
  }
}

function sendPlayerUpdate(dt) {
  if (!socket.connected || !multiplayerJoined || !myPlayerId) return;

  networkTimer += dt * 1000;
  if (networkTimer < CONFIG.NETWORK_RATE) return;
  networkTimer = 0;

  const current = driving ? car : player;

  socket.emit("player:update", {
    x: current.position.x,
    y: driving ? 0 : player.position.y,
    z: current.position.z,
    rotation: driving ? carRotation : playerRotation,
    driving,
    jumping: !driving && jumping,
    speed: driving ? carSpeed : playerSpeedNow,
    gender: selectedGender,
    weapon: currentWeapon,
    vehicleType: selectedVehicleType,
    color: car.userData.paint.color.getHex()
  });
}

/* =========================================================
   CHAT
   ========================================================= */

const chatStyle = document.createElement("style");
chatStyle.textContent = `
#vice-chat{
  position:relative;width:100%;max-width:340px;margin-top:10px;
  color:#fff;font-family:Arial,sans-serif;pointer-events:auto;z-index:10001
}
#vice-chat-log{
  height:125px;overflow-y:auto;padding:9px;margin-bottom:7px;
  border:1px solid rgba(255,255,255,.25);border-radius:9px;
  background:rgba(8,16,24,.88);font-size:12px;line-height:1.4;
  overflow-wrap:anywhere
}
#vice-chat-entry{display:flex;gap:6px}
#vice-chat-input{
  min-width:0;flex:1;padding:9px;border:1px solid #d5b34d;
  border-radius:7px;background:#17232e;color:white;outline:none
}
#vice-chat-send{
  padding:9px 12px;border:0;border-radius:7px;
  background:#d6a62e;color:#171717;font-weight:bold;cursor:pointer
}
#vice-chat-hint{margin-top:4px;color:#eee;font-size:10px;text-shadow:0 1px 2px #000}
.vice-chat-line{margin-bottom:4px}
.vice-chat-name{color:#ffd65b;font-weight:bold}
.vice-chat-system{color:#8fd7ff;font-style:italic}
`;
document.head.appendChild(chatStyle);

const chatPanel = document.createElement("div");
chatPanel.id = "vice-chat";

const chatLog = document.createElement("div");
chatLog.id = "vice-chat-log";

const chatEntry = document.createElement("div");
chatEntry.id = "vice-chat-entry";

const chatInput = document.createElement("input");
chatInput.id = "vice-chat-input";
chatInput.type = "text";
chatInput.maxLength = 180;
chatInput.placeholder = "Press Enter to chat...";
chatInput.autocomplete = "off";

const chatSend = document.createElement("button");
chatSend.id = "vice-chat-send";
chatSend.type = "button";
chatSend.textContent = "SEND";

const chatHint = document.createElement("div");
chatHint.id = "vice-chat-hint";
chatHint.textContent = "ENTER: chat  |  T: show / hide  |  ESC: close";

chatEntry.append(chatInput, chatSend);
chatPanel.append(chatLog, chatEntry, chatHint);

const missionPanel = document.getElementById("mission-panel");
if (missionPanel) missionPanel.appendChild(chatPanel);
else document.body.appendChild(chatPanel);

function addChatLine(name, message, system = false) {
  const line = document.createElement("div");
  line.className = "vice-chat-line";

  if (system) {
    const text = document.createElement("span");
    text.className = "vice-chat-system";
    text.textContent = message;
    line.appendChild(text);
  } else {
    const label = document.createElement("span");
    label.className = "vice-chat-name";
    label.textContent = name + ": ";

    const text = document.createElement("span");
    text.textContent = message;
    line.append(label, text);
  }

  chatLog.appendChild(line);
  while (chatLog.children.length > 45) {
    chatLog.removeChild(chatLog.firstChild);
  }

  chatLog.scrollTop = chatLog.scrollHeight;

  if (!system && typeof chatVisible !== "undefined" && !chatVisible) {
    chatUnread++;
    updateChatBadge();
  }
}

function openChat() {
  if (!started || paused || garageOpen) return;
  if (!chatVisible) setChatVisible(true);
  releaseMouse();
  chatOpen = true;
  chatInput.placeholder = "Write a message...";
  chatInput.focus();
}

function closeChat() {
  chatOpen = false;
  chatInput.blur();
  chatInput.value = "";
}

function sendChatMessage() {
  const message = chatInput.value.trim();

  // /owner <passcode> unlocks the villa when a passcode is configured
  if (message.toLowerCase().startsWith("/owner ")) {
    chatInput.value = "";
    if (OWNER_PASSCODE && message.slice(7).trim() === OWNER_PASSCODE) {
      ownerUnlocked = true;
      showMessage("OWNER ACCESS UNLOCKED");
    } else {
      showMessage("WRONG OWNER CODE");
    }
    return;
  }

  if (!message || !socket.connected || !myPlayerId) return;

  socket.emit("chat:message", message);
  chatInput.value = "";
  if (!touchUIActive) chatInput.focus();
}

chatSend.addEventListener("click", sendChatMessage);

chatInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendChatMessage();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeChat();
  }
});

socket.on("chat:message", data => {
  if (data?.message && String(data.message).startsWith(NET_PREFIX)) {
    handleChatNet(data);
    return;
  }

  if (data?.message) {
    addChatLine(
      data.name || "Driver",
      String(data.message).slice(0, 180)
    );
  }
});

/* ---------- Chat show / hide toggle ---------- */

const chatToggleStyle = document.createElement("style");
chatToggleStyle.textContent = `
#vice-chat-toggle{position:relative;padding:6px 11px;border:1px solid #d5b34d;border-radius:8px;background:#17232e;color:#ffd65b;font:bold 11px Arial,sans-serif;letter-spacing:.5px;cursor:pointer;touch-action:manipulation}
#vice-chat-toggle.on{background:#b7831c;color:#fff}
#vice-chat-badge{position:absolute;right:-6px;top:-7px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#e0392d;color:#fff;font:bold 10px/16px Arial,sans-serif;text-align:center;display:none;box-sizing:border-box}
body.vice-touch #vice-chat{position:fixed;left:50%;top:calc(56px + env(safe-area-inset-top,0px));transform:translateX(-50%);width:min(420px,72vw);max-width:none;margin:0;z-index:2147483001}
body.vice-touch #vice-chat-log{height:84px}
body.vice-touch #vice-chat-hint{display:none}
body.vice-touch #vice-chat-input{font-size:16px}
`;
document.head.appendChild(chatToggleStyle);

const chatToggle = document.createElement("button");
chatToggle.id = "vice-chat-toggle";
chatToggle.type = "button";
chatToggle.textContent = touchCapable ? "CHAT" : "CHAT [T]";
const chatBadge = document.createElement("span");
chatBadge.id = "vice-chat-badge";
chatToggle.appendChild(chatBadge);

let chatVisible = !touchCapable;   // hidden by default on phones
try {
  const savedChat = localStorage.getItem("viceChatVisible");
  if (savedChat !== null) chatVisible = savedChat === "1";
} catch (error) { /* storage not available */ }
let chatUnread = 0;

function updateChatBadge() {
  chatBadge.style.display = chatUnread > 0 ? "block" : "none";
  chatBadge.textContent = chatUnread > 9 ? "9+" : String(chatUnread);
}

function setChatVisible(visible) {
  chatVisible = visible;
  try { localStorage.setItem("viceChatVisible", visible ? "1" : "0"); } catch (error) { /* ignore */ }
  chatPanel.style.display = visible ? "" : "none";
  chatToggle.classList.toggle("on", visible);

  if (visible) {
    chatUnread = 0;
    updateChatBadge();
    chatLog.scrollTop = chatLog.scrollHeight;
  } else if (chatOpen) {
    closeChat();
  }
}

function toggleChatPanel() {
  setChatVisible(!chatVisible);
}

chatToggle.addEventListener("click", toggleChatPanel);

// Desktop: the button sits just above the chat box
if (missionPanel) missionPanel.insertBefore(chatToggle, chatPanel);
else {
  chatToggle.style.cssText = "position:fixed;left:10px;top:10px;z-index:10001";
  document.body.appendChild(chatToggle);
}

// Typing in the box always pauses movement keys; leaving it resumes them
chatInput.addEventListener("focus", () => {
  if (started && !paused && !garageOpen) {
    releaseMouse();
    chatOpen = true;
    clearControls();
  }
});
chatInput.addEventListener("blur", () => {
  chatOpen = false;
});

setChatVisible(chatVisible);

addChatLine("VICE CITY", "Welcome! Press ENTER to chat.", true);

/* =========================================================
   ROAD HELPERS
   ========================================================= */

const ROAD_HALF = CONFIG.ROAD_WIDTH / 2;
const TRAFFIC_LANE_OFFSET = 4.5;
const SIDEWALK_OFFSET =
  ROAD_HALF + CONFIG.SIDEWALK_WIDTH / 2 + 1.5;

// Roads sit at -900, -700 ... -100, 100 ... 900 (100 mod 200)
function nearestRoadLine(value) {
  return clamp(
    Math.round((value - 100) / CONFIG.ROAD_SPACING) * CONFIG.ROAD_SPACING + 100,
    -CONFIG.CITY_LIMIT,
    CONFIG.CITY_LIMIT
  );
}

// 0 = road, 1 = curb / sidewalk, 2 = lot grass, 3 = park grass
function groundType(x, z) {
  if (Math.abs(x - VILLA.x) < VILLA.half && Math.abs(z - VILLA.z) < VILLA.half) return 4;

  for (const p of parks) {
    if (Math.abs(x - p.x) < 62.5 && Math.abs(z - p.z) < 62.5) return 3;
  }

  const dx = Math.abs(x - nearestRoadLine(x));
  const dz = Math.abs(z - nearestRoadLine(z));
  const half = CONFIG.ROAD_WIDTH / 2;
  const edge = half + 3 + CONFIG.SIDEWALK_WIDTH / 2;

  if (dx < half || dz < half) return 0;
  if (dx <= edge || dz <= edge) return 1;
  return 2;
}

function groundHeightAt(x, z) {
  const type = groundType(x, z);
  // wading in the pool or spa
  if (type === 4 && inVillaWater(x, z)) return -.45;
  return GROUND_HEIGHT[type];
}

function randomRoadLine() {
  return pick(roadLines);
}

function roadLane(axis, road, direction) {
  if (axis === "x") {
    return road + (direction > 0
      ? -TRAFFIC_LANE_OFFSET
      : TRAFFIC_LANE_OFFSET);
  }

  return road + (direction > 0
    ? TRAFFIC_LANE_OFFSET
    : -TRAFFIC_LANE_OFFSET);
}

/* =========================================================
   COLLISION SYSTEM
   ========================================================= */

const PLAYER_RADIUS = .65;
const CAR_RADIUS = 2.25;
const TRAFFIC_RADIUS = 2.0;
const PEDESTRIAN_RADIUS = .55;

function circleHitsBuilding(x, z, radius) {
  for (const b of buildings) {
    // Quick reject before the exact test
    if (
      Math.abs(x - b.x) > b.width / 2 + radius ||
      Math.abs(z - b.z) > b.depth / 2 + radius
    ) continue;

    const closestX = clamp(x, b.x - b.width / 2, b.x + b.width / 2);
    const closestZ = clamp(z, b.z - b.depth / 2, b.z + b.depth / 2);
    const dx = x - closestX;
    const dz = z - closestZ;

    if (dx * dx + dz * dz < radius * radius) return true;
  }

  return false;
}

function circleHitsCar(x, z, radius) {
  const dx = x - car.position.x;
  const dz = z - car.position.z;
  const minimum = radius + CAR_RADIUS + .15;
  return dx * dx + dz * dz < minimum * minimum;
}

function circleHitsTraffic(x, z, radius) {
  for (const t of traffic) {
    const dx = x - t.mesh.position.x;
    const dz = z - t.mesh.position.z;
    const minimum = radius + TRAFFIC_RADIUS;

    if (dx * dx + dz * dz < minimum * minimum) {
      return true;
    }
  }

  return false;
}

function circleHitsPedestrians(x, z, radius) {
  for (const p of pedestrians) {
    if (p.dead) continue;
    const dx = x - p.mesh.position.x;
    const dz = z - p.mesh.position.z;
    const minimum = radius + PEDESTRIAN_RADIUS;

    if (dx * dx + dz * dz < minimum * minimum) {
      return true;
    }
  }

  return false;
}

function positionBlocked(x, z, radius, options = {}) {
  if (
    Math.abs(x) > CONFIG.CITY_LIMIT - radius ||
    Math.abs(z) > CONFIG.CITY_LIMIT - radius
  ) return true;

  if (circleHitsBuilding(x, z, radius)) return true;
  if (options.traffic && circleHitsTraffic(x, z, radius)) return true;
  if (options.pedestrians && circleHitsPedestrians(x, z, radius)) return true;
  if (options.car && circleHitsCar(x, z, radius)) return true;
  if (options.vehicle && inVillaWater(x, z)) return true;   // cars stay out of the pool

  return false;
}

// Finds the nearest position that is not blocked (spiral search)
function findFreeSpot(x, z, radius) {
  const options = { traffic: true, pedestrians: true, vehicle: radius > 1.5 };

  for (const r of [0, 3, 6, 9, 13, 18, 24, 32, 42]) {
    const steps = r === 0 ? 1 : 12;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (!positionBlocked(px, pz, radius, options)) return [px, pz];
    }
  }

  return null;
}

function placeCar(x, z, heading) {
  car.position.set(x, 0, z);
  carRotation = heading;
  car.rotation.set(0, heading, 0);
  carVel.set(0, 0);
  carSpeed = 0;
  prevCarSpeed = 0;
  carLateral = 0;
}

// Driving: snap the car back onto the nearest road.
// On foot: bring the car to a free spot in front of the player.
function recoverCar(auto = false) {
  if (!started || paused || playerDead) return;

  if (!driving) {
    const spot = findFreeSpot(
      player.position.x + Math.sin(playerRotation) * 6,
      player.position.z + Math.cos(playerRotation) * 6,
      CAR_RADIUS
    );

    if (!spot) {
      showMessage("NO ROOM TO PLACE VEHICLE");
      return;
    }

    placeCar(spot[0], spot[1], playerRotation);
    showMessage("VEHICLE DELIVERED");
    return;
  }

  const x = car.position.x, z = car.position.z;
  const rx = nearestRoadLine(x), rz = nearestRoadLine(z);
  const alongZ = Math.cos(carRotation) >= 0 ? 0 : Math.PI;
  const alongX = Math.sin(carRotation) >= 0 ? Math.PI / 2 : -Math.PI / 2;

  const candidates = [
    [rx, z, alongZ, Math.abs(x - rx)],
    [x, rz, alongX, Math.abs(z - rz)]
  ].sort((a, b) => a[3] - b[3]);

  for (const [cx, cz, heading] of candidates) {
    const spot = findFreeSpot(cx, cz, CAR_RADIUS);
    if (spot) {
      placeCar(spot[0], spot[1], heading);
      showMessage(auto ? "VEHICLE RECOVERED" : "VEHICLE RESET TO ROAD");
      return;
    }
  }

  showMessage("COULD NOT RESET VEHICLE");
}

function moveWithCollision(object, dx, dz, radius, options = {}) {
  const oldX = object.position.x;
  const oldZ = object.position.z;

  const nextX = oldX + dx;
  const nextZ = oldZ + dz;

  if (!positionBlocked(nextX, oldZ, radius, options)) {
    object.position.x = nextX;
  }

  if (!positionBlocked(object.position.x, nextZ, radius, options)) {
    object.position.z = nextZ;
  }

  return (
    Math.abs(object.position.x - oldX) > .0001 ||
    Math.abs(object.position.z - oldZ) > .0001
  );
}

function updateTrafficCollisions() {
  for (const t of traffic) {
    const dx = t.mesh.position.x - car.position.x;
    const dz = t.mesh.position.z - car.position.z;
    const distanceSq = dx * dx + dz * dz;

    if (driving && distanceSq < 30) {
      t.speed = Math.max(0, t.speed - .15);
    }
  }
}

/* =========================================================
   TRAFFIC
   ========================================================= */

const traffic = [];

const TRAFFIC_TURN_CHANCE = .32;
const TRAFFIC_MIN_SPEED = 12;
const TRAFFIC_MAX_SPEED = 23;

function orientTrafficVehicle(t) {
  if (t.axis === "x") {
    t.mesh.rotation.y =
      t.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    t.mesh.rotation.y = t.direction > 0 ? 0 : Math.PI;
  }
}

function setTrafficLane(t) {
  if (t.axis === "x") {
    t.mesh.position.z = roadLane("x", t.road, t.direction);
  } else {
    t.mesh.position.x = roadLane("z", t.road, t.direction);
  }
}

function turnTraffic(t) {
  const oldAxis = t.axis;
  const oldDirection = t.direction;
  const intersection = t.nextIntersection;

  if (Math.random() < TRAFFIC_TURN_CHANCE) {
    t.axis = oldAxis === "x" ? "z" : "x";
    t.direction = Math.random() > .5 ? 1 : -1;
    t.road = intersection;

    if (t.axis === "x") {
      t.mesh.position.x = intersection;
      t.mesh.position.z =
        roadLane("x", t.road, t.direction);
    } else {
      t.mesh.position.z = intersection;
      t.mesh.position.x =
        roadLane("z", t.road, t.direction);
    }
  } else {
    t.road = intersection;

    if (oldAxis === "x") {
      t.mesh.position.z =
        roadLane("x", t.road, oldDirection);
    } else {
      t.mesh.position.x =
        roadLane("z", t.road, oldDirection);
    }
  }

  orientTrafficVehicle(t);
  setTrafficLane(t);

  t.nextIntersection =
    t.road + t.direction * CONFIG.ROAD_SPACING;
}

function createTraffic() {
  const styles = ["sport", "sedan", "suv", "jeep", "supercar"];

  for (let i = 0; i < CONFIG.MAX_TRAFFIC; i++) {
    const type = pick(styles);
    const vehicle = createCar(pick(carPaints), type);

    const axis = Math.random() > .5 ? "x" : "z";
    const direction = Math.random() > .5 ? 1 : -1;
    const road = randomRoadLine();

    const t = {
      mesh: vehicle,
      axis,
      road,
      direction,
      speed: rand(TRAFFIC_MIN_SPEED, TRAFFIC_MAX_SPEED),
      nextIntersection: road + direction * CONFIG.ROAD_SPACING
    };

    if (axis === "x") {
      vehicle.position.set(
        rand(-850, 850), 0,
        roadLane(axis, road, direction)
      );
    } else {
      vehicle.position.set(
        roadLane(axis, road, direction), 0,
        rand(-850, 850)
      );
    }

    orientTrafficVehicle(t);
    scene.add(vehicle);
    traffic.push(t);
  }
}

// Returns true if something sits in this vehicle's lane just ahead.
function trafficObstacleAhead(t, ignoreOthers = false) {
  const fx = t.axis === "x" ? t.direction : 0;
  const fz = t.axis === "z" ? t.direction : 0;
  const px = t.mesh.position.x;
  const pz = t.mesh.position.z;

  const test = (ox, oz, reach, width) => {
    const dx = ox - px;
    const dz = oz - pz;
    const ahead = dx * fx + dz * fz;
    if (ahead < 1 || ahead > reach) return false;
    return Math.abs(dz * fx - dx * fz) < width;
  };

  if (test(car.position.x, car.position.z, 20, 3.3)) return true;

  if (ignoreOthers) return false;

  for (const other of traffic) {
    if (other === t) continue;
    if (test(other.mesh.position.x, other.mesh.position.z, 16, 3)) return true;
  }

  for (const p of pedestrians) {
    if (p.dead) continue;
    if (test(p.mesh.position.x, p.mesh.position.z, 14, 2.4)) return true;
  }

  return false;
}

function updateTraffic(dt) {
  for (const t of traffic) {
    if (!t.cruise) t.cruise = t.speed;

    // Slow down for obstacles ahead, then recover to cruising speed
    const blocked = trafficObstacleAhead(t, t.pushThrough > 0);
    if (t.pushThrough > 0) t.pushThrough -= dt;

    // Two cars facing each other at a junction would wait forever: let one go
    if (blocked && t.speed < 1) {
      t.blockedTime = (t.blockedTime || 0) + dt;
      if (t.blockedTime > 2.5) {
        t.pushThrough = 2.5;
        t.blockedTime = 0;
      }
    } else if (!blocked) {
      t.blockedTime = 0;
    }
    const target = blocked ? 0 : t.cruise;
    const rate = blocked ? 4 : .9;
    t.speed += (target - t.speed) * Math.min(1, rate * dt);

    t.mesh.position[t.axis] += t.speed * t.direction * dt;

    const passed = t.direction > 0
      ? t.mesh.position[t.axis] >= t.nextIntersection
      : t.mesh.position[t.axis] <= t.nextIntersection;

    if (passed) {
      t.mesh.position[t.axis] = t.nextIntersection;
      turnTraffic(t);
    }

    if (
      Math.abs(t.mesh.position.x) > CONFIG.CITY_LIMIT - 20 ||
      Math.abs(t.mesh.position.z) > CONFIG.CITY_LIMIT - 20
    ) {
      t.mesh.position[t.axis] =
        -t.direction * (CONFIG.CITY_LIMIT - 30);

      t.road = randomRoadLine();
      setTrafficLane(t);

      t.nextIntersection =
        t.road + t.direction * CONFIG.ROAD_SPACING;
    }

    // Far-away cars are hidden: fewer draw calls and no wheel animation
    const cdx = t.mesh.position.x - camera.position.x;
    const cdz = t.mesh.position.z - camera.position.z;
    const lod = quality === 2 ? 420 : quality === 1 ? 300 : 200;
    const near = cdx * cdx + cdz * cdz < lod * lod;
    t.mesh.visible = near;

    if (near) {
      const wheels = t.mesh.userData.wheels;
      for (let i = 0; i < wheels.length; i++) {
        wheels[i].rotation.x += t.speed * dt * .9;
      }
    }
  }
}

/* =========================================================
   PEDESTRIANS — GRID-ALIGNED SIDEWALK ROUTES
   ========================================================= */

const pedestrians = [];

const pedestrianColors = [
  0x315caa, 0xb34d35, 0x3b874e,
  0x9b6ab2, 0xd5a43c, 0xeeeeee
];

function sidewalkCoordinate(axis, road, side) {
  return road + side * SIDEWALK_OFFSET;
}

function setPedestrianPathPosition(p) {
  if (p.axis === "x") {
    p.mesh.position.z =
      sidewalkCoordinate("x", p.road, p.side);
  } else {
    p.mesh.position.x =
      sidewalkCoordinate("z", p.road, p.side);
  }
}
function setPedestrianRotation(p) {
  p.mesh.rotation.y = p.axis === "x"
    ? (p.direction > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (p.direction > 0 ? 0 : Math.PI);
}

function choosePedestrianRoute(p) {
  const intersection = p.progressRoad;

  if (Math.random() > .5) {
    p.axis = p.axis === "x" ? "z" : "x";
    p.direction = Math.random() > .5 ? 1 : -1;
    p.road = intersection;
    p.side = Math.random() > .5 ? 1 : -1;
  } else {
    p.direction *= -1;
  }

  if (p.axis === "x") {
    p.mesh.position.x = intersection;
  } else {
    p.mesh.position.z = intersection;
  }

  setPedestrianPathPosition(p);

  p.nextIntersection =
    intersection + p.direction * CONFIG.ROAD_SPACING;

  setPedestrianRotation(p);
}

function createPedestrian() {
  const gender = Math.random() > .5 ? "male" : "female";
  const person = createCharacter(pick(pedestrianColors), gender);

  const axis = Math.random() > .5 ? "x" : "z";
  const road = randomRoadLine();
  const direction = Math.random() > .5 ? 1 : -1;
  const side = Math.random() > .5 ? 1 : -1;

  const progress = rand(-800, 800);
  // Intersections are at 100 mod 200 (same as the roads)
  const lowerGrid = Math.floor((progress - 100) / CONFIG.ROAD_SPACING) *
    CONFIG.ROAD_SPACING + 100;

  const nextIntersection = direction > 0
    ? lowerGrid + CONFIG.ROAD_SPACING
    : lowerGrid;

  person.rotation.order = "YXZ";

  const p = {
    mesh: person,
    hp: 60,
    dead: false,
    deadTimer: 0,
    fall: 0,
    fleeTimer: 0,
    axis,
    road,
    direction,
    side,
    speed: rand(1.1, 2.0),
    progressRoad: progress,
    nextIntersection
  };

  if (axis === "x") {
    person.position.set(
      progress, 0,
      sidewalkCoordinate(axis, road, side)
    );
  } else {
    person.position.set(
      sidewalkCoordinate(axis, road, side), 0,
      progress
    );
  }

  setPedestrianRotation(p);
  scene.add(person);
  pedestrians.push(p);
}

function respawnPedestrian(p) {
  const progress = rand(-800, 800);
  const lower = Math.floor((progress - 100) / CONFIG.ROAD_SPACING) *
    CONFIG.ROAD_SPACING + 100;

  p.dead = false;
  p.hp = 60;
  p.fall = 0;
  p.fleeTimer = 0;
  p.mesh.rotation.x = 0;
  p.progressRoad = progress;
  p.mesh.position[p.axis] = progress;
  p.nextIntersection = p.direction > 0 ? lower + CONFIG.ROAD_SPACING : lower;
}

function updatePedestrians(dt) {
  for (const p of pedestrians) {
    if (p.dead) {
      p.fall = Math.min(1, p.fall + dt * 2.2);
      p.mesh.rotation.x = -Math.PI / 2 * p.fall;
      p.deadTimer -= dt;
      if (p.deadTimer <= 0) respawnPedestrian(p);
      continue;
    }

    // Frightened pedestrians run away at sprint speed
    const fleeing = p.fleeTimer > 0;
    if (fleeing) p.fleeTimer -= dt;
    const pace = p.speed * (fleeing ? 3.4 : 1);

    p.mesh.position[p.axis] += pace * p.direction * dt;

    const coordinate = p.mesh.position[p.axis];

    const reached = p.direction > 0
      ? coordinate >= p.nextIntersection
      : coordinate <= p.nextIntersection;

    if (reached) {
      p.progressRoad = p.nextIntersection;
      p.mesh.position[p.axis] = p.progressRoad;
      choosePedestrianRoute(p);
    }

    if (Math.abs(p.mesh.position[p.axis]) > 870) {
      p.direction *= -1;
      p.progressRoad = p.mesh.position[p.axis];
      p.nextIntersection =
        p.progressRoad + p.direction * CONFIG.ROAD_SPACING;
      setPedestrianRotation(p);
    }

    // Stand on the sidewalk / road surface
    const gy = groundHeightAt(p.mesh.position.x, p.mesh.position.z);
    p.mesh.position.y += (gy - p.mesh.position.y) * Math.min(1, 12 * dt);

    const pdx = p.mesh.position.x - camera.position.x;
    const pdz = p.mesh.position.z - camera.position.z;
    const pedLod = quality === 2 ? 260 : quality === 1 ? 180 : 120;
    const pedNear = pdx * pdx + pdz * pdz < pedLod * pedLod;
    p.mesh.visible = pedNear;
    if (pedNear) animateCharacter(p.mesh, dt, true, pace * 1.2, fleeing);
  }
}

/* =========================================================
   MISSIONS — PICK A JOB (M), FOLLOW THE BEAM, GET PAID
   ========================================================= */

let cash = 0;
const MISSION_SAVE_KEY = "viceMissionsV2";
const missionSave = { done: {}, cash: 0 };

try {
  const raw = localStorage.getItem(MISSION_SAVE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      missionSave.done = parsed.done || {};
      cash = Number(parsed.cash) || 0;
    }
  }
} catch (error) { /* storage not available */ }

function saveMissions() {
  missionSave.cash = cash;
  try { localStorage.setItem(MISSION_SAVE_KEY, JSON.stringify(missionSave)); } catch (error) { /* ignore */ }
}

const P = (x, z, label, r) => ({ x, z, label, r });

function inVehicleNow() { return driving || !!ridingIn; }

function needsSatisfied(needs) {
  if (needs === "car") return inVehicleNow();
  if (needs === "foot") return !inVehicleNow();
  return true;
}

function subjectPosition() {
  const host = ridingIn ? remotePlayers.get(ridingIn.driverId) : null;
  if (host) return host.root.position;
  return driving ? car.position : player.position;
}

function isOwner() {
  const name = String(myPlayerName || "").trim().toLowerCase();
  if (!OWNER_NAMES.includes(name)) return false;
  return !OWNER_PASSCODE || ownerUnlocked;
}

let ownerUnlocked = false;

const MISSION_CATEGORIES = ["ON FOOT", "DRIVING", "STUNTS", "COMBAT", "EXPLORE", "OWNER"];

const MISSION_DEFS = [
  {
    id: "first_steps", title: "FIRST STEPS", category: "ON FOOT", kind: "route",
    needs: "foot", radius: 6, reward: 100, time: 0,
    brief: "Walk to three markers near the start. Hold SHIFT to sprint.",
    points: () => [P(100, 170, "WALK TO THE FIRST MARKER"), P(170, 100, "NOW THE NEXT ONE"), P(100, 30, "BACK TO THE START")]
  },
  {
    id: "morning_run", title: "MORNING RUN", category: "ON FOOT", kind: "route",
    needs: "foot", radius: 7, reward: 300, time: 160,
    brief: "Jog one lap around the block before time runs out.",
    points: () => [P(300, 100, "RUN TO THE EAST CORNER"), P(300, -100, "TURN NORTH"), P(100, -100, "HEAD WEST"), P(100, 100, "FINISH AT THE START")]
  },
  {
    id: "package_hunt", title: "PACKAGE HUNT", category: "ON FOOT", kind: "collect",
    needs: "any", count: 8, reward: 450, time: 300,
    brief: "Eight packages are hidden along the streets. Find them all."
  },
  {
    id: "delivery", title: "DOWNTOWN DELIVERY", category: "DRIVING", kind: "route",
    needs: "car", radius: 10, reward: 600, time: 140,
    brief: "Pick up a package and deliver it across town. Take a car!",
    points: () => [P(-100, -100, "PICK UP THE PACKAGE"), P(300, 300, "DELIVER IT TO THE CLIENT")]
  },
  {
    id: "checkpoint_sprint", title: "CHECKPOINT SPRINT", category: "DRIVING", kind: "route",
    needs: "car", radius: 11, reward: 700, time: 110,
    brief: "Six checkpoints against the clock.",
    points: () => [P(300, 100, "CHECKPOINT"), P(300, -300, "CHECKPOINT"), P(-100, -300, "CHECKPOINT"), P(-300, -100, "CHECKPOINT"), P(-300, 300, "CHECKPOINT"), P(100, 300, "FINISH LINE")]
  },
  {
    id: "city_loop", title: "GRAND CITY LOOP", category: "DRIVING", kind: "route",
    needs: "car", radius: 12, reward: 1500, time: 300,
    brief: "A big loop around the whole city. Big money, big distance.",
    points: () => [P(500, 100, "EAST SIDE"), P(700, -100, "EAST SIDE"), P(500, -500, "NORTH-EAST"), P(100, -700, "NORTH"), P(-300, -700, "NORTH-WEST"), P(-700, -300, "WEST"), P(-700, 300, "WEST"), P(-300, 700, "SOUTH-WEST"), P(100, 700, "SOUTH"), P(500, 500, "SOUTH-EAST"), P(300, 100, "HEADING HOME"), P(100, 100, "FINISH")]
  },
  {
    id: "speed_demon", title: "SPEED DEMON", category: "STUNTS", kind: "speed",
    needs: "car", reach: 200, keep: 150, hold: 8, reward: 450, time: 90,
    brief: "Hit 200 km/h, then stay above 150 km/h for 8 seconds."
  },
  {
    id: "drift_king", title: "DRIFT KING", category: "STUNTS", kind: "drift",
    needs: "car", seconds: 20, reward: 500, time: 120,
    brief: "Slide the car sideways (SPACE = handbrake) for 20 seconds in total."
  },
  {
    id: "nitro_rush", title: "NITRO RUSH", category: "STUNTS", kind: "nitro",
    needs: "car", seconds: 15, reward: 400, time: 90,
    brief: "Burn 15 seconds of nitro (hold SHIFT while driving)."
  },
  {
    id: "careful_driver", title: "CAREFUL DRIVER", category: "STUNTS", kind: "distance",
    needs: "car", meters: 1800, reward: 800, time: 240,
    brief: "Drive 1,800 m without a single crash. A crash resets the count."
  },
  {
    id: "target_practice", title: "TARGET PRACTICE", category: "COMBAT", kind: "targets",
    needs: "foot", gun: true, reward: 500, time: 75,
    spawn: () => ({ count: 10, minR: 14, maxR: 30, moving: false }),
    brief: "Pop ten targets around you. A pistol is drawn for you."
  },
  {
    id: "sharpshooter", title: "SHARPSHOOTER", category: "COMBAT", kind: "targets",
    needs: "foot", gun: true, reward: 900, time: 90,
    spawn: () => ({ count: 14, minR: 22, maxR: 45, moving: true }),
    brief: "Fourteen moving targets, further away. Try the SMG."
  },
  {
    id: "city_explorer", title: "CITY EXPLORER", category: "EXPLORE", kind: "route",
    needs: "any", radius: 10, reward: 600, time: 240,
    brief: "Visit five landmarks around the city, on foot or by car.",
    points: () => [P(100, -24, "BILLBOARD PLAZA"), P(-70, -100, "WEST BILLBOARD"), P(80, -100, "EAST BILLBOARD"), P(400, 100, "THE VILLA GATE"), P(-100, 300, "SKYLINE CORNER")]
  },
  {
    id: "villa_tour", title: "VILLA TOUR", category: "OWNER", kind: "route",
    needs: "any", radius: 4.5, reward: 800, time: 0, ownerOnly: true,
    brief: "Visit every facility of your villa.",
    points: () => villaTourPoints()
  },
  {
    id: "owner_range", title: "OWNER'S RANGE", category: "OWNER", kind: "targets",
    needs: "foot", gun: true, reward: 700, time: 60, ownerOnly: true,
    spawn: () => ({ list: villaRangeTargets() }),
    brief: "Clear the targets on your private shooting range."
  }
];

let activeMission = null;
const missionBanner = { text: "", sub: "", timer: 0, good: true };

/* ---------- targets (balloons) for shooting missions ---------- */

const targetRedMat = new THREE.MeshLambertMaterial({ color: 0xe0392d });
const targetWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const targetRingGeo = new THREE.TorusGeometry(.95, .09, 6, 18);
const targetPool = [];
const missionTargets = [];

for (let i = 0; i < 16; i++) {
  const group = new THREE.Group();
  const ball = new THREE.Mesh(sphereGeo, targetRedMat);
  ball.scale.setScalar(.7);
  const ring = new THREE.Mesh(targetRingGeo, targetWhiteMat);
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(.75);
  const dot = new THREE.Mesh(sphereGeo, targetWhiteMat);
  dot.scale.setScalar(.28);
  dot.position.z = .62;
  group.add(ball, ring, dot);
  group.visible = false;
  scene.add(group);
  targetPool.push({ group, x: 0, z: 0, y: 1.6, x0: 0, z0: 0, ax: 0, az: 0, speed: 0, phase: rand(0, 6), alive: false });
}

function spawnMissionTargets(list) {
  missionTargets.length = 0;

  list.slice(0, targetPool.length).forEach((spec, i) => {
    const t = targetPool[i];
    t.x0 = t.x = spec.x;
    t.z0 = t.z = spec.z;
    t.y = spec.y;
    t.ax = spec.ax || 0;
    t.az = spec.az || 0;
    t.speed = spec.speed || 0;
    t.alive = true;
    t.group.visible = true;
    missionTargets.push(t);
  });
}

function clearMissionTargets() {
  for (const t of targetPool) {
    t.alive = false;
    t.group.visible = false;
  }
  missionTargets.length = 0;
}

function popMissionTarget(t) {
  if (!t.alive) return;
  t.alive = false;
  t.group.visible = false;
  hitMarker = .18;
  spawnImpact(t.x, groundHeightAt(t.x, t.z) + t.y, t.z, "spark");
}

function updateMissionTargets(dt) {
  for (const t of missionTargets) {
    if (!t.alive) continue;
    t.phase += dt * t.speed;
    t.x = t.x0 + Math.sin(t.phase) * t.ax;
    t.z = t.z0 + Math.cos(t.phase * 1.3) * t.az;
    const bob = Math.sin(performance.now() * .003 + t.x0) * .12;
    t.group.position.set(t.x, groundHeightAt(t.x, t.z) + t.y + bob, t.z);
    t.group.rotation.y += dt * 1.2;
  }
}

function makeTargetSpawns(spec) {
  if (spec.list) return spec.list.map(p => ({ x: p.x, z: p.z, y: p.y || 1.6, ax: 0, az: 0, speed: 0 }));

  const pos = subjectPosition();
  const list = [];

  for (let tries = 0; list.length < spec.count && tries < 300; tries++) {
    const a = rand(0, Math.PI * 2), r = rand(spec.minR, spec.maxR);
    const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
    if (circleHitsBuilding(x, z, 2)) continue;
    if (list.some(t => Math.hypot(t.x - x, t.z - z) < 5)) continue;

    list.push({
      x, z, y: rand(1.3, 3),
      ax: spec.moving ? rand(2, 5) : 0, az: spec.moving ? rand(2, 5) : 0,
      speed: spec.moving ? rand(.8, 1.6) : 0
    });
  }

  return list;
}

/* ---------- beams and rings in the world ---------- */

const markerRingGeo = new THREE.RingGeometry(.86, 1, 36);
const markerBeamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);

function makeMarker(color) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: .4, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, side: THREE.DoubleSide
  });

  const ring = new THREE.Mesh(markerRingGeo, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .25;

  const beam = new THREE.Mesh(markerBeamGeo, material);
  const core = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color, fog: false }));

  group.add(ring, beam, core);
  group.visible = false;
  scene.add(group);
  return { group, ring, beam, core };
}

const primaryMarker = makeMarker(0xffd34d);
const packageMarkers = Array.from({ length: 12 }, () => makeMarker(0x33e0ff));

function placeMarker(marker, item, beamHeight, time) {
  const r = Math.max(1.5, item.r || 6);
  marker.group.visible = true;
  marker.group.position.set(item.x, groundHeightAt(item.x, item.z), item.z);
  marker.ring.scale.setScalar(r);
  const width = Math.max(.7, r * .3);
  marker.beam.scale.set(width, beamHeight, width);
  marker.beam.position.y = beamHeight / 2;
  marker.core.position.y = 1.6 + Math.sin(time * 2) * .25;
  marker.core.scale.setScalar(Math.min(1.2, .5 + r * .08));
  marker.core.rotation.y = time * 1.5;
  marker.core.rotation.x = time * .9;
}

/* ---------- mission logic ---------- */

function missionRadius(m, p) {
  return p.r || m.def.radius || 8;
}

function missionTargetList(m) {
  const def = m.def;
  const list = [];

  if (def.kind === "route") {
    const p = m.points[m.index];
    if (p) list.push({ x: p.x, z: p.z, r: missionRadius(m, p), primary: true, style: "beam" });
  } else if (def.kind === "collect") {
    const pos = subjectPosition();
    let best = -1, bestDist = Infinity;
    m.items.forEach((item, i) => {
      if (item.got) return;
      const d = Math.hypot(item.x - pos.x, item.z - pos.z);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    m.items.forEach((item, i) => {
      if (!item.got) list.push({ x: item.x, z: item.z, r: 3.5, primary: i === best, style: "beam" });
    });
  } else if (def.kind === "targets") {
    const pos = subjectPosition();
    let best = null, bestDist = Infinity;
    for (const t of missionTargets) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - pos.x, t.z - pos.z);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    if (best) list.push({ x: best.x, z: best.z, r: 1, primary: true, style: "target" });
  }

  return list;
}

function missionObjective(m) {
  const def = m.def;

  if (def.needs === "car" && !inVehicleNow()) return "GET IN A VEHICLE";
  if (def.needs === "foot" && !def.gun && inVehicleNow()) return "GET OUT AND GO ON FOOT";

  switch (def.kind) {
    case "route": {
      const p = m.points[m.index];
      return p ? p.label : "";
    }
    case "collect":
      return "COLLECT THE PACKAGES  (" + (m.total - m.progress) + " LEFT)";
    case "targets":
      if (inVehicleNow()) return "GET OUT OF THE VEHICLE";
      if (currentWeapon < 0) return "DRAW A GUN  (KEYS 1 - 3)";
      return "SHOOT THE TARGETS  (" + (m.total - m.progress) + " LEFT)";
    case "speed":
      return m.phase === 0
        ? "REACH " + def.reach + " KM/H"
        : "STAY ABOVE " + def.keep + " KM/H  " + Math.floor(m.hold) + " / " + def.hold + " S";
    case "drift":
      return "DRIFT!  " + Math.floor(m.counter) + " / " + def.seconds + " S";
    case "nitro":
      return "HOLD SHIFT FOR NITRO  " + Math.floor(m.counter) + " / " + def.seconds + " S";
    case "distance":
      return "DRIVE " + Math.floor(m.counter) + " / " + def.meters + " M WITHOUT CRASHING";
  }
  return "";
}

function missionProgressText(m) {
  const def = m.def;
  if (def.kind === "route" || def.kind === "collect" || def.kind === "targets") {
    return m.progress + " / " + m.total;
  }
  return "";
}

function missionProgressFraction(m) {
  const def = m.def;
  if (def.kind === "route" || def.kind === "collect" || def.kind === "targets") return m.total ? m.progress / m.total : 0;
  if (def.kind === "speed") return m.phase === 0 ? 0 : Math.min(1, m.hold / def.hold);
  if (def.kind === "drift" || def.kind === "nitro") return Math.min(1, m.counter / def.seconds);
  if (def.kind === "distance") return Math.min(1, m.counter / def.meters);
  return 0;
}

function missionMapTargets() {
  return activeMission ? missionTargetList(activeMission) : [];
}

function startMission(def) {
  if (!started || paused) return false;

  if (def.ownerOnly && !isOwner()) {
    showMessage("OWNER ONLY MISSION");
    return false;
  }

  cancelMission(true);

  const m = { def, time: def.time || 0, progress: 0, total: 1, index: 0, phase: 0, hold: 0, counter: 0, points: [], items: [] };

  if (def.kind === "route") {
    m.points = def.points();
    m.total = m.points.length;
  } else if (def.kind === "collect") {
    for (let i = 0; i < def.count; i++) {
      const road = pick(roadLines);
      const t = rand(-800, 800);
      const alongX = Math.random() > .5;
      m.items.push({ x: alongX ? t : road, z: alongX ? road : t, got: false });
    }
    m.total = def.count;
  } else if (def.kind === "targets") {
    spawnMissionTargets(makeTargetSpawns(def.spawn()));
    m.total = missionTargets.length || 1;
    if (def.gun && currentWeapon < 0 && !inVehicleNow()) selectWeapon(0);
  }

  activeMission = m;
  missionBanner.timer = 0;
  showMessage("MISSION STARTED: " + def.title);
  playMissionChime(true);
  return true;
}

function endMissionState() {
  activeMission = null;
  clearMissionTargets();
}

function cancelMission(silent = false) {
  if (!activeMission) return;
  endMissionState();
  if (!silent) showMessage("MISSION CANCELLED");
}

function completeMission() {
  const m = activeMission;
  const def = m.def;
  const bonus = def.time ? Math.floor(Math.max(0, m.time) * 2) : 0;
  const total = def.reward + bonus;

  cash += total;
  missionSave.done[def.id] = (missionSave.done[def.id] || 0) + 1;
  saveMissions();

  missionBanner.text = "MISSION COMPLETE";
  missionBanner.sub = def.title + "  +$" + total.toLocaleString("en-US") + (bonus ? "  (TIME BONUS $" + bonus + ")" : "");
  missionBanner.good = true;
  missionBanner.timer = 5;

  showMessage("MISSION COMPLETE  +$" + total.toLocaleString("en-US"));
  playMissionChime(true);
  endMissionState();
}

function failMission(reason) {
  if (!activeMission) return;

  missionBanner.text = "MISSION FAILED";
  missionBanner.sub = reason;
  missionBanner.good = false;
  missionBanner.timer = 4;

  showMessage("MISSION FAILED — " + reason);
  playMissionChime(false);
  endMissionState();
}

// Called by the car physics when the car crashes
function missionOnCrash() {
  if (activeMission && activeMission.def.kind === "distance" && activeMission.counter > 0) {
    activeMission.counter = 0;
    showMessage("CRASH — DISTANCE RESET");
  }
}

function playMissionChime(good) {
  const audio = getSfx();
  if (!audio) return;
  const t = audio.context.currentTime;
  const notes = good ? [520, 660, 880] : [330, 247];
  notes.forEach((f, i) => toneBurst(audio, t + i * .12, f, f * .98, .25, .25, "triangle"));
}

function stepMission(m, dt) {
  const def = m.def;

  if (def.time) {
    m.time -= dt;
    if (m.time <= 0) return "fail";
  }

  if (def.needs === "car" && !inVehicleNow()) return null;
  if (def.needs === "foot" && inVehicleNow()) return null;

  const pos = subjectPosition();
  const driverNow = driving && mySeat === 0 && engineRunning;
  const kmh = Math.abs(carSpeed) * 3.6;

  switch (def.kind) {
    case "route": {
      const p = m.points[m.index];
      if (p && Math.hypot(pos.x - p.x, pos.z - p.z) < missionRadius(m, p)) {
        m.index++;
        m.progress = m.index;
        if (m.index >= m.total) return "done";
        showMessage("CHECKPOINT  " + m.index + " / " + m.total);
        playMissionChime(true);
      }
      break;
    }

    case "collect":
      for (const item of m.items) {
        if (!item.got && Math.hypot(pos.x - item.x, pos.z - item.z) < 3.8) {
          item.got = true;
          m.progress++;
          showMessage("PACKAGE  " + m.progress + " / " + m.total);
          playMissionChime(true);
        }
      }
      if (m.progress >= m.total) return "done";
      break;

    case "targets": {
      const alive = missionTargets.filter(t => t.alive).length;
      m.progress = m.total - alive;
      if (alive === 0 && m.total > 0) return "done";
      break;
    }

    case "speed":
      if (!driverNow) break;
      if (m.phase === 0) {
        if (kmh >= def.reach) {
          m.phase = 1;
          showMessage("NOW HOLD IT!");
        }
      } else if (kmh >= def.keep) {
        m.hold += dt;
        if (m.hold >= def.hold) return "done";
      } else {
        m.hold = 0;
      }
      break;

    case "drift":
      if (driverNow && Math.abs(carLateral) > 3 && Math.abs(carSpeed) > 10) {
        m.counter += dt;
        if (m.counter >= def.seconds) return "done";
      }
      break;

    case "nitro":
      if (driverNow && nitroActive) {
        m.counter += dt;
        if (m.counter >= def.seconds) return "done";
      }
      break;

    case "distance":
      if (driverNow) {
        m.counter += Math.abs(carSpeed) * dt;
        if (m.counter >= def.meters) return "done";
      }
      break;
  }

  return null;
}

/* ---------- mission panel (bottom-left) and mission list ---------- */

/* =========================================================
   PHONE POLISH — INTERFACE SIZE, READABILITY, BIG MAP
   ========================================================= */

const UI_SCALES = [.85, 1, 1.15, 1.3];
let uiScale = 1;
let uiScaleManual = false;

try {
  const savedScale = Number(localStorage.getItem("viceUiScale"));
  if (savedScale > 0) { uiScale = savedScale; uiScaleManual = true; }
} catch (error) { /* storage not available */ }

function autoUiScale() {
  const small = Math.min(innerWidth, innerHeight);
  return small < 380 ? .9 : small < 520 ? 1 : small < 800 ? 1.1 : 1.25;
}

function applyUiScale() {
  document.documentElement.style.setProperty("--ui", String(uiScaleManual ? uiScale : autoUiScale()));
}

function cycleUiScale() {
  const current = uiScaleManual ? uiScale : autoUiScale();
  let index = UI_SCALES.findIndex(v => Math.abs(v - current) < .05);
  index = (index + 1) % UI_SCALES.length;
  uiScale = UI_SCALES[index];
  uiScaleManual = true;
  try { localStorage.setItem("viceUiScale", String(uiScale)); } catch (error) { /* ignore */ }
  applyUiScale();
  showMessage("INTERFACE SIZE: " + Math.round(uiScale * 100) + "%");
}

window.addEventListener("resize", applyUiScale);
applyUiScale();

const phoneStyle = document.createElement("style");
phoneStyle.textContent = `
body.vice-touch #vice-stick{transform:scale(var(--ui,1));transform-origin:left bottom}
body.vice-touch #vice-touch-right{transform:scale(var(--ui,1));transform-origin:right bottom}
body.vice-touch #vice-touch-top{transform:translateX(-50%) scale(var(--ui,1));transform-origin:top center;flex-wrap:wrap;justify-content:center;max-width:96vw;gap:6px}
body.vice-touch .vt-sys{width:42px;height:36px;font-size:9px}
body.vice-touch .vt-btn{font-size:12px}
body.vice-touch #vice-combat{transform:translateX(-50%) scale(var(--ui,1));transform-origin:bottom center}
body.vice-touch #vice-bars{transform:translateX(-50%) scale(var(--ui,1));transform-origin:bottom center}
body.vice-touch #vice-money{transform:scale(var(--ui,1));transform-origin:top right;font-size:12px}
body.vice-touch #vice-chat{top:calc(100px + env(safe-area-inset-top,0px))}
body.vice-touch #message{position:fixed!important;top:calc(56px + env(safe-area-inset-top,0px))!important;left:50%!important;right:auto!important;bottom:auto!important;transform:translateX(-50%)!important;max-width:78vw;text-align:center;font-size:15px!important;font-weight:bold;line-height:1.3;padding:6px 12px;border-radius:8px;background:rgba(0,0,0,.62);text-shadow:0 2px 6px #000;z-index:10010;pointer-events:none}
#minimap{cursor:pointer}
`;
document.head.appendChild(phoneStyle);

const missionStyle = document.createElement("style");
missionStyle.textContent = `
#vice-mission{position:fixed;left:calc(14px + env(safe-area-inset-left,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px));width:min(262px,72vw);z-index:9000;display:none;box-sizing:border-box;color:#fff;font-family:Arial,sans-serif;background:rgba(8,16,24,.74);border:1px solid rgba(255,255,255,.25);border-left:4px solid #ffd45b;border-radius:10px;padding:8px 10px;text-shadow:0 1px 2px #000;pointer-events:none}
#vice-mission.good{border-left-color:#4cd37b}
#vice-mission.bad{border-left-color:#e0483a}
#vice-mission .mh{display:flex;justify-content:space-between;align-items:center;gap:8px}
#vice-m-title{font-weight:900;font-size:13px;letter-spacing:.8px;color:#ffd45b;line-height:1.2}
#vice-m-list{pointer-events:auto;flex:0 0 auto;border:1px solid rgba(255,255,255,.6);background:rgba(12,24,36,.9);color:#fff;font:bold 10px Arial,sans-serif;border-radius:6px;padding:4px 8px;cursor:pointer;touch-action:manipulation}
#vice-m-obj{font-size:12px;font-weight:bold;margin-top:5px;line-height:1.25}
#vice-mission .mrow{display:flex;justify-content:space-between;font-size:11px;margin-top:4px}
#vice-m-time.low{color:#ff6b5a}
#vice-mission .mnav{display:flex;align-items:center;gap:8px;margin-top:5px;font-size:12px;font-weight:bold}
#vice-m-arrow{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;font-size:17px;color:#ffd45b}
#vice-mission .mbar{height:5px;background:rgba(255,255,255,.18);border-radius:3px;margin-top:6px;overflow:hidden}
#vice-m-fill{height:100%;width:0;background:#4cd37b}
#vice-missions-menu{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(800px,94vw);max-height:86vh;overflow-y:auto;box-sizing:border-box;padding:16px;background:rgba(8,15,24,.97);border:2px solid #e6b93e;border-radius:14px;color:#fff;font-family:Arial,sans-serif;z-index:10025;touch-action:pan-y;box-shadow:0 15px 55px rgba(0,0,0,.65)}
#vice-missions-menu.hidden{display:none}
#vice-missions-menu h2{margin:0 0 4px;text-align:center;color:#ffd45b;font-size:24px}
#vice-missions-menu .msub{text-align:center;color:#c5d1dc;font-size:12px;margin-bottom:12px}
#vice-missions-menu h3{margin:14px 0 6px;color:#9fd9ff;font-size:12px;letter-spacing:1.5px}
.vice-mcards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.vice-mcard{text-align:left;padding:11px;border-radius:10px;border:1px solid #65717e;background:#172431;color:#fff;cursor:pointer;font-family:Arial,sans-serif;touch-action:manipulation}
.vice-mcard:hover{background:#293b4c;border-color:#ffd45b}
.vice-mcard.locked{opacity:.45;cursor:not-allowed}
.vice-mcard .mt{display:flex;justify-content:space-between;gap:6px;color:#ffd45b;font-weight:bold;font-size:14px}
.vice-mcard .mb{display:block;margin-top:4px;color:#d7e0e8;font-size:11px;line-height:1.4}
.vice-mcard .mr{display:block;margin-top:6px;color:#8ff0a4;font-size:12px;font-weight:bold}
.vice-mcard .done{color:#8ff0a4}
#vice-missions-footer{display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;margin-top:14px}
#vice-missions-footer button{padding:10px 16px;border:0;border-radius:8px;background:#d6a62e;color:#151515;font-weight:bold;cursor:pointer}
#vice-missions-footer button.secondary{background:#374657;color:#fff}
@media(max-width:560px){.vice-mcards{grid-template-columns:1fr}#vice-missions-menu h2{font-size:20px}}
body.vice-touch #vice-mission{bottom:calc(172px + env(safe-area-inset-bottom,0px));width:clamp(150px,30vw,214px);padding:6px 8px;transform:scale(var(--ui,1));transform-origin:left bottom}
body.vice-touch #vice-m-obj{font-size:11px}
body.vice-touch #vice-m-title{font-size:12px}
`;
document.head.appendChild(missionStyle);

const missionPanel2 = document.createElement("div");
missionPanel2.id = "vice-mission";
missionPanel2.innerHTML =
  '<div class="mh"><span id="vice-m-title"></span><button id="vice-m-list" type="button" tabindex="-1">LIST [M]</button></div>' +
  '<div id="vice-m-obj"></div>' +
  '<div class="mrow"><span id="vice-m-prog"></span><span id="vice-m-time"></span></div>' +
  '<div class="mnav"><span id="vice-m-arrow">▲</span><span id="vice-m-dist"></span></div>' +
  '<div class="mbar"><div id="vice-m-fill"></div></div>';
document.body.appendChild(missionPanel2);

const mTitle = document.getElementById("vice-m-title");
const mObj = document.getElementById("vice-m-obj");
const mProg = document.getElementById("vice-m-prog");
const mTime = document.getElementById("vice-m-time");
const mArrow = document.getElementById("vice-m-arrow");
const mDist = document.getElementById("vice-m-dist");
const mFill = document.getElementById("vice-m-fill");
const mNav = missionPanel2.querySelector(".mnav");

document.getElementById("vice-m-list").addEventListener("mousedown", event => event.preventDefault());
document.getElementById("vice-m-list").addEventListener("click", event => {
  toggleMissionMenu();
  event.currentTarget.blur();
});

const camDirection = new THREE.Vector3();
let missionPanelTimer = 0;
let lastMissionKey = "";

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function updateMissionPanel(dt) {
  const show = started && !paused;
  missionPanel2.style.display = show ? "block" : "none";
  if (!show) return;

  missionPanelTimer -= dt;
  if (missionPanelTimer > 0) return;
  missionPanelTimer = .1;

  let title, objective, progress, timeText, timeLow = false, fraction = 0, navText = "", arrowDeg = null;
  let state = "";

  if (missionBanner.timer > 0 && !activeMission) {
    title = missionBanner.text;
    objective = missionBanner.sub;
    progress = ""; timeText = "";
    state = missionBanner.good ? "good" : "bad";
    fraction = missionBanner.good ? 1 : 0;
  } else if (!activeMission) {
    title = "MISSIONS";
    objective = touchUIActive ? "Tap LIST to pick a job" : "Press M to pick a job";
    progress = ""; timeText = "";
  } else {
    const m = activeMission;
    title = m.def.title;
    objective = missionObjective(m);
    progress = missionProgressText(m);
    timeText = m.def.time ? formatTime(m.time) : "";
    timeLow = m.def.time && m.time < 15;
    fraction = missionProgressFraction(m);

    const list = missionTargetList(m);
    const target = list.find(item => item.primary) || list[0];

    if (target) {
      const pos = subjectPosition();
      const dx = target.x - pos.x, dz = target.z - pos.z;
      navText = Math.round(Math.hypot(dx, dz)) + " m";
      camera.getWorldDirection(camDirection);
      const diff = Math.atan2(dx, dz) - Math.atan2(camDirection.x, camDirection.z);
      arrowDeg = -diff * 180 / Math.PI;
    }
  }

  const key = [title, objective, progress, timeText, timeLow, navText, Math.round(fraction * 100), state].join("|");
  if (key !== lastMissionKey) {
    lastMissionKey = key;
    mTitle.textContent = title;
    mObj.textContent = objective;
    mProg.textContent = progress;
    mTime.textContent = timeText;
    mTime.classList.toggle("low", !!timeLow);
    mFill.style.width = Math.round(fraction * 100) + "%";
    missionPanel2.classList.toggle("good", state === "good");
    missionPanel2.classList.toggle("bad", state === "bad");
    mDist.textContent = navText;
    mNav.style.display = navText ? "flex" : "none";
  }

  if (arrowDeg !== null) mArrow.style.transform = "rotate(" + arrowDeg.toFixed(0) + "deg)";
}

function syncMissionMarkers() {
  const list = activeMission ? missionTargetList(activeMission) : [];
  const time = performance.now() * .002;

  primaryMarker.group.visible = false;
  for (const marker of packageMarkers) marker.group.visible = false;

  let packageIndex = 0;
  for (const item of list) {
    if (item.style === "target") continue;

    if (item.primary) {
      placeMarker(primaryMarker, item, 140, time);
    } else if (packageIndex < packageMarkers.length) {
      placeMarker(packageMarkers[packageIndex++], item, 18, time + packageIndex);
    }
  }
}

const missionMenu = document.createElement("div");
missionMenu.id = "vice-missions-menu";
missionMenu.className = "hidden";
document.body.appendChild(missionMenu);

function buildMissionMenu() {
  missionMenu.replaceChildren();

  const title = document.createElement("h2");
  title.textContent = "MISSIONS";
  const sub = document.createElement("div");
  sub.className = "msub";
  const total = MISSION_DEFS.length;
  const done = MISSION_DEFS.filter(d => missionSave.done[d.id]).length;
  sub.textContent = "Pick a job, follow the beam and get paid.   Completed " + done + " / " + total + "   ·   Cash $" + cash.toLocaleString("en-US");
  missionMenu.append(title, sub);

  for (const category of MISSION_CATEGORIES) {
    const defs = MISSION_DEFS.filter(d => d.category === category);
    if (!defs.length) continue;

    const heading = document.createElement("h3");
    heading.textContent = category;
    const grid = document.createElement("div");
    grid.className = "vice-mcards";

    for (const def of defs) {
      const locked = def.ownerOnly && !isOwner();
      const card = document.createElement("button");
      card.type = "button";
      card.tabIndex = -1;
      card.className = "vice-mcard" + (locked ? " locked" : "");

      const top = document.createElement("span");
      top.className = "mt";
      const name = document.createElement("span");
      name.textContent = def.title;
      const status = document.createElement("span");
      status.className = "done";
      status.textContent = missionSave.done[def.id] ? "✓ x" + missionSave.done[def.id] : "";
      top.append(name, status);

      const brief = document.createElement("span");
      brief.className = "mb";
      brief.textContent = def.brief;

      const reward = document.createElement("span");
      reward.className = "mr";
      reward.textContent = locked
        ? "OWNER ONLY"
        : "REWARD $" + def.reward + (def.time ? "   ·   TIME " + formatTime(def.time) : "   ·   NO TIME LIMIT");

      card.append(top, brief, reward);
      card.addEventListener("click", () => {
        if (locked) { showMessage("OWNER ONLY MISSION"); return; }
        if (startMission(def)) closeGarage();
      });
      grid.appendChild(card);
    }

    missionMenu.append(heading, grid);
  }

  const footer = document.createElement("div");
  footer.id = "vice-missions-footer";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary";
  cancel.textContent = "CANCEL CURRENT MISSION";
  cancel.addEventListener("click", () => { cancelMission(false); closeGarage(); });
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "CLOSE  [M / ESC]";
  close.addEventListener("click", () => closeGarage());
  footer.append(cancel, close);
  missionMenu.appendChild(footer);
}

function openMissionMenu() {
  if (!started || paused || chatOpen) return;
  releaseMouse();
  buildMissionMenu();
  garagePanel.classList.add("hidden");
  missionMenu.classList.remove("hidden");
  garageOpen = true;          // freezes the controls while the list is open
  clearControls();
}

function toggleMissionMenu() {
  if (!missionMenu.classList.contains("hidden")) closeGarage();
  else openMissionMenu();
}

function updateMission(dt) {
  updateMissionTargets(dt);
  if (missionBanner.timer > 0) missionBanner.timer -= dt;

  if (activeMission && !playerDead) {
    const result = stepMission(activeMission, dt);
    if (result === "done") completeMission();
    else if (result === "fail") failMission("TIME'S UP");
  }

  syncMissionMarkers();
  updateMissionPanel(dt);
}

/* =========================================================
   INPUT AND MOBILE CONTROLS
   ========================================================= */

const keys = Object.create(null);

const controls = {
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
  handbrake: false,
  fire: false,
  axisX: 0,   // touch joystick: + = right
  axisY: 0    // touch joystick: + = up
};

function clearControls() {
  for (const key in keys) keys[key] = false;
  for (const key in controls) {
    controls[key] = typeof controls[key] === "number" ? 0 : false;
  }
}

function pressed(...names) {
  return names.some(name => keys[name]);
}

window.addEventListener("keydown", event => {
  // Let the player type normally in the name box (spaces, R, E, V ...)
  const tag = event.target && event.target.tagName;
  if (!chatOpen && (tag === "INPUT" || tag === "TEXTAREA")) return;

  if (chatOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeChat();
    }
    return;
  }

  const key = event.key.toLowerCase();

  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "spacebar"]
      .includes(key)
  ) {
    event.preventDefault();
  }

  if (garageOpen) {
    if (key === "v" || key === "escape" || key === "m") {
      event.preventDefault();
      closeGarage();
    }
    return;
  }

  if (key === "enter" && started && !paused) {
    event.preventDefault();
    openChat();
    return;
  }

  keys[key] = true;

  if (key === " " && !event.repeat) jump();
  if (key === "e" && !event.repeat) toggleVehicle();
  if (key === "v" && !event.repeat) toggleGarage();
  if (key === "escape" && !event.repeat) togglePause();
  if (key === "r" && !event.repeat && started) {
    if (event.shiftKey) restartGame();   // Shift + R restarts
    else startReload();                  // R reloads
  }
  if ((key === "1" || key === "2" || key === "3") && !event.repeat) {
    selectWeapon(Number(key) - 1);
  }
  if (key === "h" && !event.repeat) playVehicleHorn();
  if (key === "q" && !event.repeat && started) cycleQuality();
  if (key === "t" && !event.repeat && started) toggleChatPanel();
  if (key === "g" && !event.repeat && started) cycleWeather();
  if (key === "u" && !event.repeat && started) recoverCar(false);
  if (key === "p" && !event.repeat && started) togglePOV();
  if ((key === "+" || key === "=") && started) zoomBy(.88);
  if ((key === "-" || key === "_") && started) zoomBy(1.14);
  if (key === "l" && !event.repeat && started) toggleMouseLock();
  if (key === "x" && !event.repeat && started) cycleWeapon(1);
  if (key === "k" && !event.repeat && started) cycleSeat();
  if (key === "m" && !event.repeat && started) toggleMissionMenu();
  if (key === "o" && !event.repeat && started) goHome();

  if (key === "c" && !event.repeat && driving) {
    const color = pick(carPaints);
    car.userData.paint.color.setHex(color);
    showMessage("NEW VEHICLE COLOUR");
  }
});

window.addEventListener("keyup", event => {
  keys[event.key.toLowerCase()] = false;
});

window.addEventListener("blur", clearControls);
document.addEventListener("visibilitychange", clearControls);

function bindMobileControl(id, name) {
  const element = document.getElementById(id);
  if (!element) return;

  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    controls[name] = true;
    element.setPointerCapture?.(event.pointerId);
  });

  const release = () => {
    controls[name] = false;
  };

  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("lostpointercapture", release);
}

bindMobileControl("accelerate", "accelerate");
bindMobileControl("brake", "brake");
bindMobileControl("left", "left");
bindMobileControl("right", "right");
/* =========================================================
   ENTER / EXIT VEHICLE
   ========================================================= */

function toggleVehicle() {
  if (!started || paused || chatOpen || garageOpen) return;

  if (ridingIn) {
    leaveSeat(false);
    return;
  }

  if (!driving) {
    // The owner's showcase cars in the villa garage
    const showcase = findShowcaseCar();
    if (showcase && showcase.dist < player.position.distanceTo(car.position)) {
      takeShowcaseCar(showcase.entry);
      return;
    }

    // Another player's vehicle that is closer than mine: get in as a passenger
    const host = findBoardableRemote();
    if (host && host.dist < player.position.distanceTo(car.position)) {
      boardRemoteVehicle(host.remote);
      return;
    }

    if (player.position.distanceTo(car.position) < 9) {
      driving = true;
      mySeat = 0;
      engineRunning = false;
      carSpeed = 0;
      jumping = false;
      jumpOffset = 0;
      verticalVelocity = 0;
      sprinting = false;
      playerSpeedNow = 0;
      player.visible = false;
      updateVehicleButtons();
      if (touchUIActive) setEngineRunning(true);
      else showMessage("VEHICLE ENTERED — PRESS START ENGINE");
    } else {
      showMessage("MOVE CLOSER TO YOUR CAR");
    }
    return;
  }

  // Try the left side, then the right side, then the front
  const lx = Math.cos(carRotation), lz = -Math.sin(carRotation);
  const candidates = [
    [car.position.x + lx * 3.6, car.position.z + lz * 3.6],
    [car.position.x - lx * 3.6, car.position.z - lz * 3.6],
    [
      car.position.x + Math.sin(carRotation) * 4.6,
      car.position.z + Math.cos(carRotation) * 4.6
    ]
  ];

  let spot = null;
  for (const [x, z] of candidates) {
    if (!positionBlocked(x, z, PLAYER_RADIUS, { traffic: true, pedestrians: true })) {
      spot = [x, z];
      break;
    }
  }

  if (!spot) {
    showMessage("NOT ENOUGH ROOM TO EXIT");
    return;
  }

  driving = false;
  mySeat = 0;
  setEngineRunning(false);
  player.visible = true;
  playerGround = groundHeightAt(spot[0], spot[1]);
  jumpOffset = 0;
  player.position.set(spot[0], playerGround, spot[1]);
  playerRotation = carRotation;
  updateVehicleButtons();
  showMessage("VEHICLE EXITED");
}

/* =========================================================
   MOVEMENT — ON FOOT (WALK + SPRINT)
   ========================================================= */

const walkDirection = new THREE.Vector3();

function updatePlayer(dt) {
  if (ridingIn) {
    const host = remotePlayers.get(ridingIn.driverId);
    if (host) {
      player.position.set(host.root.position.x, host.root.position.y, host.root.position.z);
      playerRotation = host.root.rotation.y;
      player.rotation.y = playerRotation;
    }
    playerSpeedNow = 0;
    strafeNow = 0;
    sprinting = false;
    return;
  }

  if (driving) {
    playerSpeedNow = 0;
    strafeNow = 0;
    sprinting = false;
    return;
  }

  const locked = chatOpen || garageOpen || playerDead;
  const forward = !locked &&
    (pressed("w", "arrowup") || controls.accelerate || controls.axisY > .25);
  const backward = !locked &&
    (pressed("s", "arrowdown") || controls.brake || controls.axisY < -.25);
  const wantSprint = !locked && (pressed("shift") || controls.boost);

  // Turning works even while standing still (keys or touch joystick)
  const sideInput = locked ? 0 : clamp(
    ((pressed("a", "arrowleft") || controls.left) ? 1 : 0) -
    ((pressed("d", "arrowright") || controls.right) ? 1 : 0) -
    controls.axisX, -1, 1
  );

  // With the mouse locked, or in first person, A / D strafe instead of turning
  const strafeMode = pointerLocked || firstPerson;
  const turn = strafeMode ? 0 : sideInput;
  const turnRate =
    (forward || backward ? 2.4 : 2.9) * (touchUIActive ? 1.2 : 1) *
    (sprinting ? .75 : 1);
  playerRotation += turn * turnRate * dt;

  // Sprint costs stamina; running dry forces a short rest
  if (wantSprint && forward && !exhausted && stamina > 0) {
    sprinting = true;
    stamina = Math.max(0, stamina - 24 * dt);
    staminaDelay = .9;

    if (stamina <= 0) {
      exhausted = true;
      sprinting = false;
      showMessage("OUT OF BREATH");
    }
  } else {
    sprinting = false;
    staminaDelay = Math.max(0, staminaDelay - dt);

    if (staminaDelay <= 0) {
      stamina = Math.min(STAMINA_MAX, stamina + (forward || backward ? 14 : 26) * dt);
    }
    if (exhausted && stamina >= 30) exhausted = false;
  }

  // Smooth acceleration and deceleration
  // Gentle joystick pushes walk slower; keys always give full speed
  const keyMove = pressed("w", "arrowup", "s", "arrowdown") ||
    controls.accelerate || controls.brake;
  const analog = keyMove ? 1 : clamp(Math.abs(controls.axisY) * 1.25, .45, 1);
  const target = (forward
    ? (sprinting ? SPRINT_SPEED : WALK_SPEED)
    : backward ? BACK_SPEED : 0) * analog *
    (inVillaWater(player.position.x, player.position.z) ? .55 : 1);
  playerSpeedNow += (target - playerSpeedNow) * Math.min(1, dt * (target > playerSpeedNow ? 7 : 11));
  if (playerSpeedNow < .05 && target === 0) playerSpeedNow = 0;

  if (forward || backward) lastMoveSign = forward ? 1 : -1;

  walkDirection.set(Math.sin(playerRotation), 0, Math.cos(playerRotation));
  const strafeTarget = strafeMode
    ? sideInput * (sprinting ? SPRINT_SPEED : WALK_SPEED) * .8
    : 0;
  strafeNow += (strafeTarget - strafeNow) * Math.min(1, dt * 9);
  if (Math.abs(strafeNow) < .05 && strafeTarget === 0) strafeNow = 0;

  const dx = walkDirection.x * playerSpeedNow * lastMoveSign * dt +
    Math.cos(playerRotation) * strafeNow * dt;
  const dz = walkDirection.z * playerSpeedNow * lastMoveSign * dt -
    Math.sin(playerRotation) * strafeNow * dt;

  if (playerSpeedNow > 0 || strafeNow !== 0) {
    if (jumping) {
      moveWithCollision(player, dx, dz, PLAYER_RADIUS);
    } else {
      moveWithCollision(player, dx, dz, PLAYER_RADIUS, {
        traffic: true, pedestrians: true, car: true
      });
    }
  }

  player.rotation.y = playerRotation;
  animateCharacter(
    player, dt,
    Math.hypot(playerSpeedNow, strafeNow) > .8,
    Math.hypot(playerSpeedNow, strafeNow) / 4,
    sprinting
  );
  applyAimPose(player);
}

/* =========================================================
   CAR PHYSICS — GRIP, DRIFT, NITRO, WEIGHT TRANSFER
   ========================================================= */

function updateCar(dt) {
  crashCooldown = Math.max(0, crashCooldown - dt);
  const spec = car.userData.spec;
  const locked = chatOpen || garageOpen || playerDead;
  const driver = driving && engineRunning && !locked && mySeat === 0;

  // Parked and still: nothing to simulate
  if (!driving && carVel.lengthSq() < .0004) {
    carVel.set(0, 0);
    carSpeed = 0;
    carLateral = 0;
    nitroActive = false;
    if (car.userData.flames) car.userData.flames.visible = false;
    return;
  }

  let throttle = 0, brake = 0, steer = 0;
  let handbrake = false, wantNitro = false;

  if (driver) {
    throttle = (pressed("w", "arrowup") || controls.accelerate) ? 1 : 0;
    brake = (pressed("s", "arrowdown") || controls.brake) ? 1 : 0;
    steer = clamp(
      ((pressed("a", "arrowleft") || controls.left) ? 1 : 0) -
      ((pressed("d", "arrowright") || controls.right) ? 1 : 0) -
      controls.axisX, -1, 1
    );
    handbrake = !!keys[" "] || controls.handbrake;
    wantNitro = pressed("shift", "n") || controls.boost;
  }

  // Recover automatically if the car is wedged inside something
  if (driving) {
    embedTimer += dt;
    if (embedTimer > .5) {
      embedTimer = 0;
      if (circleHitsBuilding(car.position.x, car.position.z, CAR_RADIUS - .3)) {
        recoverCar(true);
        return;
      }
    }

    if (driver && throttle && Math.abs(carSpeed) < .4) {
      stuckTimer += dt;
      if (stuckTimer > 4) {
        stuckTimer = 0;
        recoverCar(true);
        return;
      }
    } else {
      stuckTimer = 0;
    }
  }

  const maxBase = spec.topSpeed / 3.6;
  const reverseMax = spec.reverseSpeed / 3.6;

  const fx = Math.sin(carRotation), fz = Math.cos(carRotation);
  let vF = carVel.x * fx + carVel.y * fz;     // forward speed

  const surface = groundType(car.position.x, car.position.z);
  const offroad = surface === 2 || surface === 3;

  // ---- Nitro ----
  nitroActive = false;
  if (driver && wantNitro && nitro > 0 && !brake) {
    nitroActive = true;
    throttle = 1;
    nitro = Math.max(0, nitro - 28 * dt);
    nitroDelay = 1.2;
  } else {
    nitroDelay = Math.max(0, nitroDelay - dt);
    if (nitroDelay <= 0) nitro = Math.min(NITRO_MAX, nitro + 9 * dt);
  }

  let maxSpeed = maxBase * (nitroActive ? 1.3 : 1);
  if (offroad) maxSpeed *= selectedVehicleType === "jeep" ? .8 : .55;

  // ---- Engine, brakes, drag ----
  const oldVF = vF;

  if (throttle) {
    const ratio = Math.max(0, vF / maxSpeed);
    const curve = Math.max(.22, 1 - Math.pow(ratio, 1.5));
    let a = spec.acceleration * curve * (nitroActive ? 2.4 : 1);
    if (vF < 0) a += spec.braking;
    vF += a * dt;
  } else if (brake) {
    if (vF > .6) vF = Math.max(0, vF - spec.braking * 1.15 * dt);
    else vF = Math.max(-reverseMax, vF - spec.braking * .55 * dt);
  } else if (driver) {
    const coast = spec.friction * (.5 + Math.abs(vF) * .012);
    if (vF > 0) vF = Math.max(0, vF - coast * dt);
    else vF = Math.min(0, vF + coast * dt);
  } else {
    // Engine off or nobody inside: rolling resistance brings it to a stop
    vF -= vF * Math.min(1, (driving ? 1.4 : 3.5) * dt);
  }

  if (handbrake) vF -= vF * Math.min(1, .45 * dt);

  if (offroad) {
    vF -= vF * Math.min(1, (selectedVehicleType === "jeep" ? .35 : .9) * dt);
  }

  if (vF > maxSpeed) vF -= (vF - maxSpeed) * Math.min(1, 2.2 * dt);
  vF = Math.max(-reverseMax, vF);

  // Apply the engine / brake change to the world velocity
  carVel.x += fx * (vF - oldVF);
  carVel.y += fz * (vF - oldVF);

  // ---- Steering (speed-sensitive bicycle model) ----
  steerVisual += (steer - steerVisual) * Math.min(1, dt * 7);

  const absF = Math.abs(vF);
  const maxAngle = .62 / (1 + Math.pow(absF / 14, 2));
  const angle = steerVisual * maxAngle * (spec.steering / 1.5);
  let yawRate = (vF / WHEELBASE) * Math.tan(angle);
  if (handbrake) yawRate *= 1.5;
  carRotation += yawRate * dt;

  // ---- Tyre grip: removes sideways velocity (less grip = more drift) ----
  const nfx = Math.sin(carRotation), nfz = Math.cos(carRotation);
  const nlx = Math.cos(carRotation), nlz = -Math.sin(carRotation);

  let vF2 = carVel.x * nfx + carVel.y * nfz;
  let vL = carVel.x * nlx + carVel.y * nlz;

  const speedRatio = Math.min(1, Math.abs(vF2) / maxBase);
  let gripRate = 10 * (spec.grip / .85) * (1 - speedRatio * .3);
  if (handbrake) gripRate *= .12;
  if (offroad) gripRate *= .6;
  vL *= Math.exp(-gripRate * dt);

  carVel.x = nfx * vF2 + nlx * vL;
  carVel.y = nfz * vF2 + nlz * vL;
  carLateral = vL;

  // ---- Move with collision and bounce ----
  const opts = { traffic: true, pedestrians: true, vehicle: true };
  let impact = 0;

  // Hard hits bounce a little; light scrapes just slide along the wall
  const nx = car.position.x + carVel.x * dt;
  if (positionBlocked(nx, car.position.z, CAR_RADIUS, opts)) {
    impact = Math.max(impact, Math.abs(carVel.x));
    carVel.x = impact > 3 ? carVel.x * -.2 : 0;
    carVel.y *= .985;
  } else {
    car.position.x = nx;
  }

  const nz = car.position.z + carVel.y * dt;
  if (positionBlocked(car.position.x, nz, CAR_RADIUS, opts)) {
    impact = Math.max(impact, Math.abs(carVel.y));
    carVel.y = impact > 3 ? carVel.y * -.2 : 0;
    carVel.x *= .985;
  } else {
    car.position.z = nz;
  }

  if (impact > 6 && driving && crashCooldown <= 0) {
    crashCooldown = .6;
    missionOnCrash();
    camShake = Math.max(camShake, Math.min(1.2, impact / 18));
    showMessage("CRASH");
    playCrashSound(Math.min(1, impact / 25));
    if (touchUIActive && navigator.vibrate) navigator.vibrate(40);
    if (impact > 10) damagePlayer(Math.min(35, (impact - 8) * 1.6), "A CRASH");
  }

  carSpeed = carVel.x * Math.sin(carRotation) + carVel.y * Math.cos(carRotation);

  // ---- Visuals: ground height, body pitch and roll, wheels ----
  const gy = GROUND_HEIGHT[groundType(car.position.x, car.position.z)];
  car.position.y += (gy - car.position.y) * Math.min(1, 14 * dt);
  car.rotation.y = carRotation;

  const rawAcc = (carSpeed - prevCarSpeed) / Math.max(dt, .001);
  prevCarSpeed = carSpeed;
  longAccSmooth += (clamp(rawAcc, -40, 40) - longAccSmooth) * Math.min(1, dt * 6);

  const pitchTarget = -clamp(longAccSmooth * .0035, -.07, .07);
  const rollTarget =
    steerVisual * Math.min(1, Math.abs(carSpeed) / 40) * .07 + vL * .004;
  const blend = Math.min(1, 6 * dt);
  carPitch += (pitchTarget - carPitch) * blend;
  carRoll += (rollTarget - carRoll) * blend;
  car.rotation.x = carPitch;
  car.rotation.z = carRoll;

  const wheels = car.userData.wheels;
  for (let i = 0; i < wheels.length; i++) {
    wheels[i].rotation.x += carSpeed * dt * .9;
  }

  const front = car.userData.frontWheels;
  for (let i = 0; i < front.length; i++) {
    front[i].rotation.y = steerVisual * .5;
  }

  // Brake lights
  const braking = brake > 0 || (handbrake && Math.abs(carSpeed) > 1);
  if (braking !== car.userData.tailLit) {
    car.userData.tailLit = braking;
    car.userData.tail.color.setHex(braking ? TAIL_BRAKE : TAIL_DIM);
  }

  // Nitro flames
  const flames = car.userData.flames;
  if (flames) {
    flames.visible = nitroActive;
    if (nitroActive) {
      for (const cone of flames.children) {
        cone.scale.y = .7 + Math.random() * .8;
        cone.scale.x = cone.scale.z = .8 + Math.random() * .4;
      }
    }
  }
}

/* =========================================================
   CAMERA
   ========================================================= */

const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
let fovCurrent = 65;
let camHeading = 0;
let camDistance = 9.5;
let camFocusY = 0;

// Zoom and look state
let camZoom = 1;              // 1 = normal chase camera, smaller = closer
let camZoomTarget = 1;
let firstPerson = false;
let lookYaw = 0;              // free look while driving
let lookPitch = 0;
let lastLookTime = 0;
let pointerLocked = false;
let fpRecoil = 0;
const FP_THRESHOLD = .16;
const MOUSE_SENS = .0024;

function zoomBy(factor) {
  let target = camZoomTarget * factor;

  if (camZoomTarget <= FP_THRESHOLD && factor > 1) target = .5;     // out of first person
  else if (target < .3 && factor < 1) target = .05;                  // into first person

  camZoomTarget = clamp(target, .05, 2.4);
}

function togglePOV() {
  const goFirstPerson = !firstPerson;
  camZoomTarget = goFirstPerson ? .05 : 1;
  showMessage(goFirstPerson ? "FIRST PERSON" : "THIRD PERSON");
}

function applyLook(dx, dy) {
  lastLookTime = performance.now();

  if (!driving && !ridingIn) playerRotation -= dx * MOUSE_SENS;
  else lookYaw = clamp(lookYaw - dx * MOUSE_SENS, -3.1, 3.1);

  lookPitch = clamp(lookPitch - dy * MOUSE_SENS, -1.1, 1.1);
}

function releaseMouse() {
  if (document.pointerLockElement) document.exitPointerLock();
}

function toggleMouseLock() {
  if (!started || paused) return;

  if (document.pointerLockElement) {
    document.exitPointerLock();
    return;
  }

  const canvas = renderer.domElement;
  if (!canvas.requestPointerLock) {
    showMessage("MOUSE LOCK IS NOT SUPPORTED HERE");
    return;
  }

  const result = canvas.requestPointerLock();
  if (result && result.catch) result.catch(() => {});
}

// Eye position: the driver's seat, or the player's head
function updateFirstPersonCamera(dt) {
  let px, py, pz, yaw;

  const host = ridingIn ? remotePlayers.get(ridingIn.driverId) : null;

  if (host) {
    const seats = host.vehicle.userData.seats || [];
    const c = seats[ridingIn.seat] || host.vehicle.userData.cockpit;
    const heading = host.root.rotation.y;
    const cos = Math.cos(heading), sin = Math.sin(heading);
    px = host.root.position.x + c[0] * cos + c[2] * sin;
    pz = host.root.position.z - c[0] * sin + c[2] * cos;
    py = host.root.position.y + c[1];
    yaw = heading + lookYaw;
  } else if (driving) {
    const seats = car.userData.seats || [];
    const c = seats[mySeat] || car.userData.cockpit;
    const cos = Math.cos(carRotation), sin = Math.sin(carRotation);
    px = car.position.x + c[0] * cos + c[2] * sin;
    pz = car.position.z - c[0] * sin + c[2] * cos;
    py = car.position.y + c[1];
    yaw = carRotation + lookYaw;
  } else {
    const d = player.userData;
    const bob = Math.sin(d.walkTime * 2) * .035 * d.amp;
    px = player.position.x + Math.sin(playerRotation) * .12;
    pz = player.position.z + Math.cos(playerRotation) * .12;
    py = player.position.y + (playerDead ? .35 : 1.72 + bob);
    yaw = playerRotation;
  }

  const shake = camShake + (nitroActive ? .02 : 0);
  if (shake > .01) {
    px += (Math.random() - .5) * shake * .3;
    py += (Math.random() - .5) * shake * .2;
  }
  camShake *= Math.max(0, 1 - 5 * dt);

  camera.position.set(px, py, pz);
  const cp = Math.cos(lookPitch);
  camera.lookAt(
    px + Math.sin(yaw) * cp * 10,
    py + Math.sin(lookPitch) * 10,
    pz + Math.cos(yaw) * cp * 10
  );

  const kmh = Math.abs(carSpeed) * 3.6;
  const targetFov = 78 + (driving ? Math.min(kmh / 300, 1) * 8 + (nitroActive ? 8 : 0) : (sprinting ? 5 : 0));
  fovCurrent += (targetFov - fovCurrent) * (1 - Math.exp(-4 * dt));
  if (Math.abs(camera.fov - fovCurrent) > .05) {
    camera.fov = fovCurrent;
    camera.updateProjectionMatrix();
  }
}

// All smoothing is frame-rate independent (exp), so it stays smooth at low FPS.
function updateCamera(dt) {
  camZoom += (camZoomTarget - camZoom) * (1 - Math.exp(-10 * dt));

  const wasFirstPerson = firstPerson;
  firstPerson = camZoom < FP_THRESHOLD;

  if (firstPerson !== wasFirstPerson) {
    camera.near = firstPerson ? .1 : .5;
    camera.updateProjectionMatrix();
    if (!firstPerson) lookPitch = 0;
  }

  // Free look eases back to centre when the mouse / finger is idle
  if ((driving || ridingIn) && !isLookDragging() && performance.now() - lastLookTime > 1000) {
    lookYaw *= Math.exp(-3 * dt);
    lookPitch *= Math.exp(-2 * dt);
  }
  if (!driving && !ridingIn) lookYaw = 0;

  // The body is hidden in first person
  if (!driving && !ridingIn) player.visible = !firstPerson;

  if (firstPerson) {
    updateFirstPersonCamera(dt);
    return;
  }

  const host = ridingIn ? remotePlayers.get(ridingIn.driverId) : null;
  const inVehicle = driving || !!host;
  const target = host ? host.root : (driving ? car : player);
  const heading = (host ? host.root.rotation.y : (driving ? carRotation : playerRotation)) +
    (inVehicle ? lookYaw : 0);
  const kmh = host ? Math.abs(host.speed) * 3.6 : Math.abs(carSpeed) * 3.6;

  // The camera swings round gently behind the vehicle instead of snapping
  const diff = Math.atan2(
    Math.sin(heading - camHeading), Math.cos(heading - camHeading)
  );
  camHeading += diff * (1 - Math.exp(-(driving ? 6 : 10) * dt));

  const distanceTarget = (inVehicle
    ? 14 + Math.min(kmh / 70, 4) + (nitroActive ? 2 : 0)
    : 9.5 + (sprinting ? 1 : 0)) * camZoom;
  camDistance += (distanceTarget - camDistance) * (1 - Math.exp(-5 * dt));

  const height = (inVehicle ? 6.6 + Math.min(kmh / 150, 1.2) : 5.2) * (.3 + .7 * camZoom);
  const lookHeight = inVehicle ? 1.6 : 1.8;

  // Curb bumps and jumps do not jerk the camera
  camFocusY += (target.position.y - camFocusY) * (1 - Math.exp(-8 * dt));

  cameraTarget.set(target.position.x, camFocusY + lookHeight, target.position.z);

  // Pull the camera in if a building would be in the way
  let px = 0, pz = 0;
  for (const k of [1, .72, .5, .32]) {
    px = target.position.x - Math.sin(camHeading) * camDistance * k;
    pz = target.position.z - Math.cos(camHeading) * camDistance * k;
    if (!circleHitsBuilding(px, pz, 1.4)) break;
  }

  cameraPosition.set(px, camFocusY + height + lookPitch * camDistance * .6, pz);
  camera.position.lerp(cameraPosition, 1 - Math.exp(-(inVehicle ? 12 : 10) * dt));

  const shake = camShake + (nitroActive ? .08 : 0);
  if (shake > .01) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake * .6;
  }
  camShake *= Math.max(0, 1 - 5 * dt);

  camera.lookAt(cameraTarget);

  const targetFov = 65 + (inVehicle
    ? Math.min(kmh / 300, 1) * 10 + (nitroActive ? 9 : 0)
    : (sprinting ? 6 : 0));
  fovCurrent += (targetFov - fovCurrent) * (1 - Math.exp(-4 * dt));

  if (Math.abs(camera.fov - fovCurrent) > .05) {
    camera.fov = fovCurrent;
    camera.updateProjectionMatrix();
  }
}

/* =========================================================
   HUD
   ========================================================= */

const barStyle = document.createElement("style");
barStyle.textContent = `
#vice-bars{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(300px,56vw);z-index:9000;display:none;pointer-events:none;font-family:Arial,sans-serif}
#vice-bar-label{display:flex;justify-content:space-between;font-size:11px;font-weight:bold;letter-spacing:1px;color:#fff;text-shadow:0 1px 3px #000;margin-bottom:3px}
#vice-bar-hint{font-weight:normal;opacity:.85;font-size:10px}
#vice-bar-track{height:11px;border-radius:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);overflow:hidden}
#vice-bar-fill{height:100%;width:100%;background:#4cd37b}
#vice-sprint-button{position:fixed;right:12px;bottom:155px;z-index:2147483000;display:none;border:2px solid rgba(255,255,255,.8);border-radius:10px;padding:12px 16px;min-width:128px;min-height:46px;background:rgba(25,105,65,.95);color:#fff;font-size:12px;font-weight:900;letter-spacing:.6px;touch-action:manipulation}
`;
document.head.appendChild(barStyle);

const barsRoot = document.createElement("div");
barsRoot.id = "vice-bars";
const barLabel = document.createElement("div");
barLabel.id = "vice-bar-label";
const barName = document.createElement("span");
const barHint = document.createElement("span");
barHint.id = "vice-bar-hint";
barLabel.append(barName, barHint);
const barTrack = document.createElement("div");
barTrack.id = "vice-bar-track";
const barFill = document.createElement("div");
barFill.id = "vice-bar-fill";
barTrack.appendChild(barFill);
barsRoot.append(barLabel, barTrack);
document.body.appendChild(barsRoot);

const sprintButton = document.createElement("button");
sprintButton.id = "vice-sprint-button";
sprintButton.type = "button";
sprintButton.textContent = "SPRINT";
document.body.appendChild(sprintButton);
bindMobileControl("vice-sprint-button", "boost");

const isTouchDevice =
  !!(window.matchMedia && window.matchMedia("(pointer:coarse)").matches);

let lastBarMode = "";
let lastBarPercent = -1;
let lastBarColor = "";

function updateBars() {
  const show = started && !paused;
  barsRoot.style.display = show ? "block" : "none";
  sprintButton.style.display = "none";   // replaced by the touch UI
  if (!show) return;

  const mode = driving ? "nitro" : "stamina";

  if (mode !== lastBarMode) {
    lastBarMode = mode;
    barName.textContent = driving ? "NITRO" : "STAMINA";
    barHint.textContent = driving
      ? "SHIFT: boost   SPACE: handbrake"
      : "SHIFT: sprint";
    lastBarPercent = -1;
  }

  const percent = Math.round(driving ? nitro : stamina);
  const color = driving
    ? (nitroActive ? "#ff9a2e" : "#35a7ff")
    : (exhausted ? "#e0483a" : "#4cd37b");

  if (percent !== lastBarPercent) {
    lastBarPercent = percent;
    barFill.style.width = percent + "%";
  }

  if (color !== lastBarColor) {
    lastBarColor = color;
    barFill.style.background = color;
  }
}

const moneyStyle = document.createElement("style");
moneyStyle.textContent = `
#vice-money{position:fixed;right:12px;top:12px;z-index:10000;display:none;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.6);border-left:3px solid #ffd45b;color:#ffd45b;font:bold 11px Arial,sans-serif;letter-spacing:.5px;text-align:center;pointer-events:none;box-sizing:border-box;white-space:nowrap}
`;
document.head.appendChild(moneyStyle);

const moneyBadge = document.createElement("div");
moneyBadge.id = "vice-money";
document.body.appendChild(moneyBadge);

let lastMoneyLabel = "";

function updateMoneyBadge() {
  const label = "$" + cash.toLocaleString("en-US");

  if (label !== lastMoneyLabel) {
    lastMoneyLabel = label;
    moneyBadge.textContent = label;
  }
}

// The old cash / speed / mode / mission read-outs are replaced by the small
// badges above, so hide them (and any panel that only held them).
function hideLegacyHud() {
  const keep = [
    document.body, document.documentElement, missionPanel, minimap,
    connectionElement, playerCountElement, hud.message
  ].filter(Boolean);

  const rows = [];

  for (const id of ["speed", "cash", "mode", "mission", "progress"]) {
    const el = document.getElementById(id);
    if (!el) continue;

    el.style.setProperty("display", "none", "important");

    let row = el.parentElement;
    const blocked = !row || keep.includes(row) ||
      keep.some(k => k !== row && row.contains(k)) ||
      row.querySelector("canvas, input, button");

    if (!blocked) {
      row.style.setProperty("display", "none", "important");
      rows.push(row);
    }
  }

  // Hide wrappers whose children are all hidden now
  for (let row of rows) {
    while (
      row.parentElement &&
      !keep.includes(row.parentElement) &&
      !keep.some(k => row.parentElement.contains(k)) &&
      [...row.parentElement.children].every(c => c.style.display === "none")
    ) {
      row.parentElement.style.setProperty("display", "none", "important");
      row = row.parentElement;
    }
  }

  // The mission panel only keeps the chat
  if (missionPanel) {
    for (const child of [...missionPanel.children]) {
      if (child !== chatPanel && child !== chatToggle) {
        child.style.setProperty("display", "none", "important");
      }
    }
  }
}

// Finds any leftover speed read-out / speed bar from the old HTML and hides it
function hideSpeedWidgets() {
  const guards = [
    startScreen, pauseScreen, missionPanel, minimap,
    connectionElement, playerCountElement, hud.message
  ].filter(Boolean);

  const visible = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const found = [];

  document.querySelectorAll("body *").forEach(el => {
    if (["SCRIPT", "STYLE", "CANVAS"].includes(el.tagName)) return;
    if (el.closest("[id^='vice-']") || el.closest(".vt-btn")) return;
    if (guards.some(g => g.contains(el))) return;

    const text = (el.textContent || "").trim();
    const label = (el.id + " " + (typeof el.className === "string" ? el.className : "")).toLowerCase();
    const looksLikeSpeed = /speed|speedo|kmh|km-h/.test(label) ||
      (el.children.length === 0 && /^\d{0,3}\s*(km\/?h|kph|mph)$/i.test(text));

    if (looksLikeSpeed && visible(el)) found.push(el);
  });

  for (const el of found) {
    let node = el;
    node.style.setProperty("display", "none", "important");

    // also hide small wrappers that only held the speed read-out
    while (
      node.parentElement &&
      node.parentElement !== document.body &&
      !guards.some(g => g.contains(node.parentElement) || node.parentElement.contains(g)) &&
      !node.parentElement.querySelector("canvas, input, button") &&
      (node.parentElement.textContent || "").trim().length <= 24
    ) {
      node = node.parentElement;
      node.style.setProperty("display", "none", "important");
    }
  }
}

[0, 800, 2500, 6000].forEach(delay => {
  setTimeout(hideLegacyHud, delay);
  setTimeout(hideSpeedWidgets, delay + 200);
});

function updateHUD(dt) {
  updateMoneyBadge();

  if (messageTimer > 0) {
    messageTimer -= dt;

    if (messageTimer <= 0 && hud.message) {
      hud.message.style.opacity = "0";
    }
  }

  updateBars();
}

/* =========================================================
   TOUCH UI — JOYSTICK AND BUTTONS FOR PHONES AND TABLETS
   ========================================================= */

const touchStyle = document.createElement("style");
touchStyle.textContent = `
#vice-stick{position:fixed;left:calc(22px + env(safe-area-inset-left,0px));bottom:calc(22px + env(safe-area-inset-bottom,0px));width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.45);display:none;z-index:2147483000;touch-action:none}
#vice-stick-knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid rgba(255,255,255,.9);pointer-events:none}
#vice-touch-right{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));width:250px;height:240px;pointer-events:none;display:none;z-index:2147483000}
.vt-btn{position:absolute;pointer-events:auto;display:none;align-items:center;justify-content:center;border-radius:50%;border:2px solid rgba(255,255,255,.85);background:rgba(12,24,36,.72);color:#fff;font:900 11px Arial,sans-serif;letter-spacing:.4px;touch-action:none;-webkit-user-select:none;user-select:none}
.vt-btn.pressed{transform:scale(.92);filter:brightness(1.5)}
#vice-touch-top{position:fixed;left:50%;top:calc(6px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:none;gap:8px;z-index:2147483002}
.vt-sys{position:relative;width:44px;height:38px;border-radius:10px;border:2px solid rgba(255,255,255,.7);background:rgba(12,24,36,.72);color:#fff;font:900 10px Arial,sans-serif;touch-action:manipulation}
#vice-touch-top #vice-chat-toggle{width:44px;height:38px;padding:0;border-radius:10px;border:2px solid rgba(255,255,255,.7);background:rgba(12,24,36,.72);color:#fff}
#vice-touch-top #vice-chat-toggle.on{background:rgba(183,131,28,.9)}
#vice-rotate-hint{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 18px;border-radius:12px;background:rgba(0,0,0,.78);color:#fff;font:bold 14px Arial,sans-serif;text-align:center;z-index:2147483003;pointer-events:none;display:none;max-width:78vw}
body.vice-touch #vice-bars{bottom:auto;top:calc(52px + env(safe-area-inset-top,0px));width:min(210px,38vw)}
body.vice-touch #vice-bar-hint{display:none}
`;
document.head.appendChild(touchStyle);

const TOUCH_BUTTONS = [
  { label: "GAS",    mode: "drive", size: 88, right: 8,   bottom: 8,   hold: "accelerate", bg: "rgba(30,140,70,.8)" },
  { label: "BRAKE",  mode: "drive", size: 68, right: 108, bottom: 8,   hold: "brake",      bg: "rgba(190,50,40,.8)" },
  { label: "NITRO",  mode: "drive", size: 60, right: 14,  bottom: 110, hold: "boost",      bg: "rgba(200,100,20,.85)" },
  { label: "DRIFT",  mode: "drive", size: 58, right: 86,  bottom: 100, hold: "handbrake" },
  { label: "HORN",   mode: "drive", size: 50, right: 152, bottom: 98,  tap: () => playVehicleHorn() },
  { id: "engine", label: "ENGINE", mode: "drive", size: 52, right: 188, bottom: 8, tap: () => toggleEngine() },
  { label: "EXIT",   mode: "drive", size: 52, right: 20,  bottom: 178, tap: () => toggleVehicle() },
  { label: "RESET",  mode: "drive", size: 48, right: 84,  bottom: 178, tap: () => recoverCar(false) },
  { label: "SEAT",   mode: "drive", size: 48, right: 140, bottom: 178, tap: () => cycleSeat() },
  { label: "JUMP",   mode: "foot",  size: 88, right: 8,   bottom: 8,   tap: () => jump(), bg: "rgba(30,110,170,.8)" },
  { label: "SPRINT", mode: "foot",  size: 68, right: 108, bottom: 8,   hold: "boost",      bg: "rgba(30,140,70,.8)" },
  { label: "ENTER",  mode: "foot",  size: 60, right: 14,  bottom: 110, tap: () => toggleVehicle() },
  { label: "FIRE",   mode: "foot",  size: 72, right: 90,  bottom: 96,  hold: "fire", bg: "rgba(200,40,40,.85)" },
  { label: "RELOAD", mode: "foot",  size: 50, right: 176, bottom: 100, tap: () => startReload() }
];

let touchBuilt = false;
let stickEl = null, stickKnob = null, touchRight = null, touchTop = null, rotateHint = null;
let stickPointer = null;
let engineTouchButton = null;
const touchModeButtons = [];
let touchSignature = "";
let touchHintShown = false;

function buildTouchUI() {
  if (touchBuilt) return;
  touchBuilt = true;
  touchUIActive = true;
  document.body.classList.add("vice-touch");

  // Hide any old HTML on-screen buttons so they do not overlap ours
  for (const id of ["accelerate", "brake", "left", "right"]) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty("display", "none", "important");
  }
  document.querySelectorAll(
    "#mobile-controls,.mobile-controls,#touch-controls,.touch-controls"
  ).forEach(el => el.style.setProperty("display", "none", "important"));

  /* ----- joystick ----- */
  stickEl = document.createElement("div");
  stickEl.id = "vice-stick";
  stickKnob = document.createElement("div");
  stickKnob.id = "vice-stick-knob";
  stickEl.appendChild(stickKnob);
  document.body.appendChild(stickEl);

  const STICK_RADIUS = 52;

  function moveStick(event) {
    const rect = stickEl.getBoundingClientRect();
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);

    if (length > STICK_RADIUS) {
      dx = dx / length * STICK_RADIUS;
      dy = dy / length * STICK_RADIUS;
    }

    stickKnob.style.transform = `translate(${dx}px,${dy}px)`;

    let ax = dx / STICK_RADIUS;
    let ay = -dy / STICK_RADIUS;
    if (Math.hypot(ax, ay) < .12) { ax = 0; ay = 0; }

    controls.axisX = ax;
    controls.axisY = ay;
  }

  function endStick(event) {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    stickKnob.style.transform = "translate(0,0)";
    controls.axisX = 0;
    controls.axisY = 0;
  }

  stickEl.addEventListener("pointerdown", event => {
    event.preventDefault();
    stickPointer = event.pointerId;
    stickEl.setPointerCapture?.(event.pointerId);
    moveStick(event);
  });
  stickEl.addEventListener("pointermove", event => {
    if (event.pointerId === stickPointer) moveStick(event);
  });
  stickEl.addEventListener("pointerup", endStick);
  stickEl.addEventListener("pointercancel", endStick);
  stickEl.addEventListener("lostpointercapture", endStick);

  /* ----- action buttons ----- */
  touchRight = document.createElement("div");
  touchRight.id = "vice-touch-right";
  document.body.appendChild(touchRight);

  for (const def of TOUCH_BUTTONS) {
    const button = document.createElement("div");
    button.className = "vt-btn";
    button.textContent = def.label;
    button.style.width = button.style.height = def.size + "px";
    button.style.right = def.right + "px";
    button.style.bottom = def.bottom + "px";
    if (def.bg) button.style.background = def.bg;

    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.classList.add("pressed");
      button.setPointerCapture?.(event.pointerId);
      if (def.hold) controls[def.hold] = true;
      if (def.tap) def.tap();
    });

    const release = () => {
      button.classList.remove("pressed");
      if (def.hold) controls[def.hold] = false;
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);

    touchRight.appendChild(button);
    touchModeButtons.push({ el: button, mode: def.mode });
    if (def.id === "engine") engineTouchButton = button;
  }

  /* ----- top row: pause, chat, garage, fullscreen ----- */
  touchTop = document.createElement("div");
  touchTop.id = "vice-touch-top";

  const makeSys = (label, action) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vt-sys";
    b.textContent = label;
    b.addEventListener("click", action);
    return b;
  };

  touchTop.appendChild(makeSys("PAUSE", () => togglePause()));
  touchTop.appendChild(chatToggle);               // chat toggle moves here
  document.body.appendChild(chatPanel);          // chat becomes a floating overlay
  touchTop.appendChild(makeSys("CARS", () => toggleGarage()));
  touchTop.appendChild(makeSys("SKY", () => cycleWeather()));
  touchTop.appendChild(makeSys("VIEW", () => togglePOV()));
  touchTop.appendChild(makeSys("HOME", () => goHome()));
  touchTop.appendChild(makeSys("MSN", () => toggleMissionMenu()));
  touchTop.appendChild(makeSys("UI", () => cycleUiScale()));
  touchTop.appendChild(makeSys("GFX", () => cycleQuality()));

  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
    touchTop.appendChild(makeSys("FULL", toggleFullscreen));
  }
  document.body.appendChild(touchTop);

  rotateHint = document.createElement("div");
  rotateHint.id = "vice-rotate-hint";
  rotateHint.textContent = "Rotate your phone to landscape for the best experience";
  document.body.appendChild(rotateHint);

  // Stop the page from scrolling / zooming while playing
  document.addEventListener("touchmove", event => {
    const inside = event.target.closest && event.target.closest("#vice-chat, #vice-garage");
    if (started && !inside) event.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", event => event.preventDefault());
  document.addEventListener("contextmenu", event => event.preventDefault());

  updateVehicleButtons();
}

function toggleFullscreen() {
  const element = document.documentElement;
  const active = document.fullscreenElement || document.webkitFullscreenElement;

  if (!active) {
    const request = element.requestFullscreen || element.webkitRequestFullscreen;
    if (request) request.call(element);
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(() => {});
      }
    } catch (error) { /* not supported */ }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  }
}

function updateTouchUI() {
  if (!touchUIActive) return;

  const active = started && !paused;
  const mode = active ? (driving || ridingIn ? "drive" : "foot") : "off";
  const portrait = innerHeight > innerWidth;
  const signature = mode + (engineRunning ? "1" : "0") + (portrait ? "p" : "l") + (started ? "s" : "x");

  if (signature === touchSignature) return;
  touchSignature = signature;

  if (active && !touchHintShown) {
    touchHintShown = true;
    showMessage("DRAG = LOOK  •  PINCH = ZOOM  •  VIEW = FIRST PERSON");
  }

  stickEl.style.display = active ? "block" : "none";
  touchRight.style.display = active ? "block" : "none";
  touchTop.style.display = started && !paused ? "flex" : "none";
  rotateHint.style.display = active && portrait ? "block" : "none";

  for (const item of touchModeButtons) {
    item.el.style.display = item.mode === mode ? "flex" : "none";
  }

  if (engineTouchButton) {
    engineTouchButton.textContent = engineRunning ? "STOP" : "START";
  }

  if (!active) clearControls();
}

// Phones are detected at load; hybrid devices switch on the first touch.
if (touchCapable) buildTouchUI();
else window.addEventListener("touchstart", buildTouchUI, { once: true, passive: true });

window.addEventListener("orientationchange", () => {
  setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
});

/* =========================================================
   MINIMAP
   ========================================================= */

const minimap = document.getElementById("minimap");
const mapContext = minimap ? minimap.getContext("2d") : null;

/* Place the minimap in the top-right corner, just below the
   ONLINE status and PLAYERS count. */
function positionMinimap() {
  if (!minimap) return;

  if (minimap.parentElement !== document.body) {
    document.body.appendChild(minimap);
  }

  let top = 12;
  for (const element of [connectionElement, playerCountElement]) {
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top < innerHeight / 2) {
      top = Math.max(top, rect.bottom + 8);
    }
  }

  const smallScreen = Math.min(innerWidth, innerHeight) < 600;
  const size = minimapBig ? (smallScreen ? 230 : 320) : (smallScreen ? 120 : 180);

  if (moneyBadge) {
    moneyBadge.style.top = top + "px";
    moneyBadge.style.width = size + "px";
    moneyBadge.style.display = started ? "block" : "none";
    top += (moneyBadge.offsetHeight || 20) + 4;
  }
  const set = (name, value) => minimap.style.setProperty(name, value, "important");

  set("position", "fixed");
  set("top", top + "px");
  set("right", "12px");
  set("left", "auto");
  set("bottom", "auto");
  set("margin", "0");
  set("transform", "none");
  set("width", size + "px");
  set("height", "auto");
  set("z-index", "10000");
  set("pointer-events", "auto");
  set("display", started ? "block" : "none");
}

// Tap (or click) the map to make it bigger or smaller
let minimapBig = false;
if (minimap) {
  minimap.addEventListener("click", () => {
    minimapBig = !minimapBig;
    positionMinimap();
  });
}

window.addEventListener("resize", positionMinimap);
setInterval(positionMinimap, 500);
positionMinimap();

let minimapBackground = null;

function buildMinimapBackground(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");

  const scale = w / 1800;
  const cx = w / 2;
  const cy = h / 2;

  g.fillStyle = "#263c32";
  g.fillRect(0, 0, w, h);

  g.fillStyle = "#2f5a3a";
  for (const p of parks) {
    g.fillRect(cx + (p.x - 62.5) * scale, cy + (p.z - 62.5) * scale, 125 * scale, 125 * scale);
  }

  g.fillStyle = "#4a5359";
  for (const b of buildings) {
    g.fillRect(
      cx + (b.x - b.width / 2) * scale, cy + (b.z - b.depth / 2) * scale,
      b.width * scale, b.depth * scale
    );
  }

  g.strokeStyle = "#8a9399";
  g.lineWidth = Math.max(1, 24 * scale);
  for (const p of roadLines) {
    g.beginPath();
    g.moveTo(cx + p * scale, 0);
    g.lineTo(cx + p * scale, h);
    g.stroke();
    g.beginPath();
    g.moveTo(0, cy + p * scale);
    g.lineTo(w, cy + p * scale);
    g.stroke();
  }

  return canvas;
}

function drawMinimap() {
  if (!minimap || !mapContext) return;

  const w = minimap.width;
  const h = minimap.height;

  if (!minimapBackground || minimapBackground.width !== w || minimapBackground.height !== h) {
    minimapBackground = buildMinimapBackground(w, h);
  }

  const scale = w / 1800;
  const cx = w / 2;
  const cy = h / 2;

  mapContext.drawImage(minimapBackground, 0, 0);

  // The villa (gold = yours, grey = private)
  const villaX = cx + VILLA.x * scale, villaY = cy + VILLA.z * scale;
  const villaSize = Math.max(5, w * .035);
  mapContext.fillStyle = isOwner() ? "#4cd37b" : "#b9a05a";
  mapContext.fillRect(villaX - villaSize / 2, villaY - villaSize / 2, villaSize, villaSize);
  mapContext.strokeStyle = "#000";
  mapContext.lineWidth = 1;
  mapContext.strokeRect(villaX - villaSize / 2, villaY - villaSize / 2, villaSize, villaSize);

  // Mission targets: the nearest one is bigger and brighter
  const dot = Math.max(3, w * .022);
  for (const item of missionMapTargets()) {
    const tx = cx + item.x * scale, ty = cy + item.z * scale;
    mapContext.fillStyle = item.primary ? "#fff07a" : "#33e0ff";
    mapContext.beginPath();
    mapContext.arc(tx, ty, item.primary ? dot * 1.5 : dot, 0, Math.PI * 2);
    mapContext.fill();
    if (item.primary) {
      mapContext.strokeStyle = "#000";
      mapContext.stroke();
    }
  }

  mapContext.fillStyle = "#55d9ff";
  for (const remote of remotePlayers.values()) {
    mapContext.beginPath();
    mapContext.arc(
      cx + remote.root.position.x * scale,
      cy + remote.root.position.z * scale,
      3, 0, Math.PI * 2
    );
    mapContext.fill();
  }

  // Player arrow pointing in the direction of travel
  const position = driving ? car.position : player.position;
  const heading = driving ? carRotation : playerRotation;
  const px = cx + position.x * scale;
  const py = cy + position.z * scale;
  const dx = Math.sin(heading), dz = Math.cos(heading);

  mapContext.fillStyle = "#ff4136";
  mapContext.beginPath();
  mapContext.moveTo(px + dx * 8, py + dz * 8);
  mapContext.lineTo(px - dx * 4 - dz * 4.5, py - dz * 4 + dx * 4.5);
  mapContext.lineTo(px - dx * 4 + dz * 4.5, py - dz * 4 - dx * 4.5);
  mapContext.closePath();
  mapContext.fill();
}

/* =========================================================
   START / PAUSE / GENDER SELECTION
   ========================================================= */

const pauseScreen = document.getElementById("pause-screen");
const startScreen = document.getElementById("start-screen");

const genderStyle = document.createElement("style");
genderStyle.textContent = `
#gender-selector{
  display:flex;justify-content:center;gap:12px;
  margin:14px auto;flex-wrap:wrap
}
#gender-selector button{
  min-width:120px;padding:12px 20px;
  border:2px solid #f5c84c;border-radius:10px;
  background:#18232d;color:white;font-weight:bold;
  cursor:pointer;transition:background .15s,border-color .15s
}
#gender-selector button.selected{
  background:#b7831c;border-color:#fff0a8;color:#fff
}
#gender-selector button:disabled{
  cursor:not-allowed;opacity:.55
}`;
document.head.appendChild(genderStyle);

const genderSelector = document.createElement("div");
genderSelector.id = "gender-selector";

function makeGenderButton(gender, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.gender = gender;

  button.addEventListener("click", () => {
    if (requestedStart) return;

    selectedGender = gender;
    rebuildLocalCharacter(gender);
    updateGenderButtons();
  });

  return button;
}

const maleButton = makeGenderButton("male", "MALE");
const femaleButton = makeGenderButton("female", "FEMALE");
genderSelector.append(maleButton, femaleButton);

const nameInput = document.getElementById("player-name");
const startButton = document.getElementById("start");

if (nameInput) {
  nameInput.insertAdjacentElement("afterend", genderSelector);
} else if (startScreen) {
  startScreen.appendChild(genderSelector);
} else {
  document.body.appendChild(genderSelector);
}

function updateGenderButtons() {
  for (const button of [maleButton, femaleButton]) {
    const selected = button.dataset.gender === selectedGender;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

updateGenderButtons();

function startGame() {
  if (started || !myPlayerId) {
    if (!myPlayerId) showMessage("WAITING FOR SERVER IDENTITY");
    return;
  }

  started = true;
  paused = false;

  if (startScreen) startScreen.classList.add("hidden");
  if (pauseScreen) pauseScreen.classList.add("hidden");

  showMessage("WELCOME TO VICE CITY");
  setTimeout(hideSpeedWidgets, 300);
  setTimeout(() => showMessage(touchUIActive ? "TAP LIST TO PICK A MISSION" : "PRESS M TO PICK A MISSION"), 3000);
  updateVehicleButtons();
}

function togglePause() {
  if (!started || chatOpen || garageOpen) return;

  paused = !paused;
  if (paused) releaseMouse();

  if (pauseScreen) {
    pauseScreen.classList.toggle("hidden", !paused);
  }

  if (paused) {
    clearControls();
    setEngineRunning(false);
  }
  updateVehicleButtons();
}

function restartGame() {
  resetCombat();
  closeGarage();
  closeChat();

  car.position.set(SPAWN.carX, 0, SPAWN.carZ);
  carVel.set(0, 0);
  carSpeed = 0;
  stamina = STAMINA_MAX;
  nitro = NITRO_MAX;
  exhausted = false;
  sprinting = false;
  nitroActive = false;
  playerSpeedNow = 0;
  playerGround = 0;
  jumpOffset = 0;
  carRotation = 0;
  car.rotation.y = 0;

  player.position.set(SPAWN.playerX, 0, SPAWN.playerZ);
  playerRotation = 0;
  player.rotation.y = 0;
  player.visible = true;

  driving = false;
  setEngineRunning(false);
  updateVehicleButtons();
  jumping = false;
  verticalVelocity = 0;

  cancelMission(true);
  paused = false;
  clearControls();

  if (pauseScreen) pauseScreen.classList.add("hidden");

  if (!started) {
    if (myPlayerId) startGame();
    else showMessage("CONNECTING TO SERVER");
  } else {
    showMessage("GAME RESTARTED");
  }
}

if (startButton) {
  startButton.addEventListener("click", () => {
    const entered = nameInput ? nameInput.value.trim() : "";

    if (!entered) {
      showMessage("ENTER YOUR PLAYER NAME");
      if (nameInput) nameInput.focus();
      return;
    }

    if (!socket.connected) {
      showMessage("SERVER NOT CONNECTED");
      return;
    }

    myPlayerName = entered.slice(0, 16);
    requestedStart = true;

    maleButton.disabled = true;
    femaleButton.disabled = true;

    joinGame();
    showMessage("CONNECTING AS " + myPlayerName.toUpperCase());
  });
}

if (nameInput) {
  nameInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && startButton) {
      startButton.click();
    }
  });
}

const resumeButton = document.getElementById("resume-button");
const restartButton = document.getElementById("restart-button");
const menuButton = document.getElementById("menu-button");

if (resumeButton) {
  resumeButton.addEventListener("click", () => {
    if (paused) togglePause();
  });
}

if (restartButton) {
  restartButton.addEventListener("click", restartGame);
}

if (menuButton) {
  menuButton.addEventListener("click", () => {
    closeGarage();
    closeChat();

    paused = false;
    setEngineRunning(false);
    updateVehicleButtons();
    started = false;
    requestedStart = false;
    multiplayerJoined = false;
    myPlayerId = null;

    socket.disconnect();
    clearRemotePlayers();

    maleButton.disabled = false;
    femaleButton.disabled = false;

    if (pauseScreen) pauseScreen.classList.add("hidden");
    if (startScreen) startScreen.classList.remove("hidden");

    clearControls();

    setTimeout(() => {
      if (!socket.connected) socket.connect();
    }, 300);
  });
}

/* =========================================================
   RESIZE
   ========================================================= */

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(pixelRatio);
});

/* =========================================================
   BASE GRASS GROUND AND FLOATING BILLBOARDS
   ========================================================= */

function createBaseGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.CITY_LIMIT * 2.35, CONFIG.CITY_LIMIT * 2.35),
    new THREE.MeshLambertMaterial({ color: 0x4a8246, map: grassTexture })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.72;
  ground.renderOrder = -2;
  world.add(ground);
}

function createCentralBillboard() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 1024, 512);
  gradient.addColorStop(0, "#0d1535");
  gradient.addColorStop(0.5, "#5a2d6b");
  gradient.addColorStop(1, "#e85a62");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.strokeStyle = "#ffe6a6";
  ctx.lineWidth = 22;
  ctx.strokeRect(18, 18, 988, 476);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#ffb7d5";
  ctx.shadowBlur = 32;
  ctx.fillStyle = "#fff5d9";
  ctx.font = "bold 110px Arial";
  ctx.fillText("My love", 512, 185);
  ctx.font = "bold 140px Arial";
  ctx.fillText("Mayuri", 512, 340);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

  const frameMat = new THREE.MeshLambertMaterial({ color: 0x1e2430 });
  const droneBodyMat = new THREE.MeshLambertMaterial({ color: 0x2a3038 });
  const droneArmMat = new THREE.MeshLambertMaterial({ color: 0x3a424c });
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.65 });

  const group = new THREE.Group();
  group.position.set(29, 38, -24); // floating high in the air

  // Main sign
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 21),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
  );
  group.add(sign);

  // Frame
  box(group, 0, 11.2, 0, 43.5, 0.9, 1.4, frameMat);
  box(group, 0, -11.2, 0, 43.5, 0.9, 1.4, frameMat);
  box(group, -21.5, 0, 0, 0.9, 22.5, 1.4, frameMat);
  box(group, 21.5, 0, 0, 0.9, 22.5, 1.4, frameMat);

  // Four drones holding the corners
  const droneOffsets = [
    [-20, 10.5, 1.8],
    [20, 10.5, 1.8],
    [-20, -10.5, 1.8],
    [20, -10.5, 1.8]
  ];

  const drones = [];
  for (const [dx, dy, dz] of droneOffsets) {
    const drone = new THREE.Group();
    drone.position.set(dx, dy, dz);

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 1.4), droneBodyMat);
    drone.add(body);

    // Arms
    for (const ax of [-0.9, 0.9]) {
      for (const az of [-0.9, 0.9]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.12), droneArmMat);
        arm.position.set(ax * 0.6, 0.1, az * 0.6);
        arm.rotation.y = Math.atan2(az, ax);
        drone.add(arm);
      }
    }

    // Rotors (simple spinning discs)
    const rotor1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 12), rotorMat);
    rotor1.position.set(-0.9, 0.28, -0.9);
    const rotor2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 12), rotorMat);
    rotor2.position.set(0.9, 0.28, -0.9);
    const rotor3 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 12), rotorMat);
    rotor3.position.set(-0.9, 0.28, 0.9);
    const rotor4 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 12), rotorMat);
    rotor4.position.set(0.9, 0.28, 0.9);
    drone.add(rotor1, rotor2, rotor3, rotor4);

    drones.push({ drone, rotors: [rotor1, rotor2, rotor3, rotor4] });
    group.add(drone);
  }

  // Soft hover animation data
  group.userData.hoverTime = Math.random() * Math.PI * 2;
  group.userData.drones = drones;
  group.userData.dynamic = true;

  world.add(group);

  // Store for animation
  if (!window.floatingBillboards) window.floatingBillboards = [];
  window.floatingBillboards.push(group);
}

/* ---------------------------------------------------------
   EXTRA BILLBOARDS (added) — same look as the original sign
   Usage: createExtraBillboard(lines, x, y, z, colors, glow)
   --------------------------------------------------------- */

function createExtraBillboard(lines, x, y, z, colors, glow) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 1024, 512);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.5, colors[1]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.strokeStyle = "#ffe6a6";
  ctx.lineWidth = 22;
  ctx.strokeRect(18, 18, 988, 476);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = glow;
  ctx.shadowBlur = 32;
  ctx.fillStyle = "#fff5d9";

  // Shrink each line until it fits inside the frame
  const step = 512 / (lines.length + 1);
  lines.forEach((text, i) => {
    let size = 130;
    ctx.font = `bold ${size}px Arial`;
    while (ctx.measureText(text).width > 900 && size > 30) {
      size -= 4;
      ctx.font = `bold ${size}px Arial`;
    }
    ctx.fillText(text, 512, step * (i + 1));
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

  const frameMat = new THREE.MeshLambertMaterial({ color: 0x1e2430 });
  const droneBodyMat = new THREE.MeshLambertMaterial({ color: 0x2a3038 });
  const droneArmMat = new THREE.MeshLambertMaterial({ color: 0x3a424c });
  const rotorMat = new THREE.MeshBasicMaterial({
    color: 0x88aacc, transparent: true, opacity: 0.65
  });

  const group = new THREE.Group();
  group.position.set(x, y, z);

  group.add(new THREE.Mesh(
    new THREE.PlaneGeometry(42, 21),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
  ));

  box(group, 0, 11.2, 0, 43.5, 0.9, 1.4, frameMat);
  box(group, 0, -11.2, 0, 43.5, 0.9, 1.4, frameMat);
  box(group, -21.5, 0, 0, 0.9, 22.5, 1.4, frameMat);
  box(group, 21.5, 0, 0, 0.9, 22.5, 1.4, frameMat);

  const drones = [];
  for (const [dx, dy] of [[-20, 10.5], [20, 10.5], [-20, -10.5], [20, -10.5]]) {
    const drone = new THREE.Group();
    drone.position.set(dx, dy, 1.8);

    drone.add(new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.45, 1.4), droneBodyMat
    ));

    for (const ax of [-0.9, 0.9]) {
      for (const az of [-0.9, 0.9]) {
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.12, 0.12), droneArmMat
        );
        arm.position.set(ax * 0.6, 0.1, az * 0.6);
        arm.rotation.y = Math.atan2(az, ax);
        drone.add(arm);
      }
    }

    const rotors = [];
    for (const [rx, rz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.04, 12), rotorMat
      );
      rotor.position.set(rx, 0.28, rz);
      drone.add(rotor);
      rotors.push(rotor);
    }

    drones.push({ drone, rotors });
    group.add(drone);
  }

  group.userData.hoverTime = Math.random() * Math.PI * 2;
  group.userData.baseY = y;
  group.userData.drones = drones;
  group.userData.dynamic = true;

  world.add(group);

  if (!window.floatingBillboards) window.floatingBillboards = [];
  window.floatingBillboards.push(group);
}

/* =========================================================
   THE OWNER'S VILLA  (a gated estate with every facility)
   ========================================================= */

const villaState = {
  ready: false, time: 0, gateOpen: 0, gatePanels: [], gateColliders: [],
  droplets: [], rotorMain: null, rotorTail: null, flag: null, waterMat: null,
  showcase: [], noticeTimer: 0, tipTimer: 0, greeted: false
};

const villaWhiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const villaLampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

function villaSignTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1b1e24";
  ctx.fillRect(0, 0, 1024, 128);
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 1012, 116);
  ctx.fillStyle = "#e9c75a";
  ctx.font = "bold 78px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createVilla() {
  const X = VILLA.x, Z = VILLA.z, GY = -.44;   // GY = ground level inside the (raised) world group
  const boxes = [], cyls = [], sphs = [], cones = [], lamps = [], waters = [], waterCyls = [];

  const vb = (x, z, w, d, y0, h, color, solid = false) => {
    boxes.push([X + x, GY + y0 + h / 2, Z + z, w, h, d, color]);
    if (solid) buildings.push({ x: X + x, z: Z + z, width: w, depth: d, height: y0 + h });
  };
  const vc = (x, z, r, y0, h, color) => cyls.push([X + x, GY + y0 + h / 2, Z + z, r, h, r, color]);
  const vs = (x, y, z, sx, sy, sz, color) => sphs.push([X + x, GY + y, Z + z, sx, sy, sz, color]);
  const vcone = (x, y0, z, r, h, color) => cones.push([X + x, GY + y0 + h / 2, Z + z, r, h, r, color]);
  const vlamp = (x, y, z, r, color = 0xfff0c0) => lamps.push([X + x, GY + y, Z + z, r, r, r, color]);
  const solid = (x, z, w, d, h) => buildings.push({ x: X + x, z: Z + z, width: w, depth: d, height: h });
  const wallX = (x0, x1, z, h, t, color) => vb((x0 + x1) / 2, z, x1 - x0, t, 0, h, color, true);
  const wallZ = (z0, z1, x, h, t, color) => vb(x, (z0 + z1) / 2, t, z1 - z0, 0, h, color, true);
  const seg = (list, fn) => list.forEach(([a, b]) => fn(a, b));

  const PLASTER = 0xf1ece0, STONE = 0xd9d2c0, DARKC = 0x2b2f36, GLASS = 0x1d3b52, WOOD = 0x6b4a32;
  const GOLD = 0xd4af37, ASPHALT = 0x3b3f45, PAVER = 0xb5ab98, HEDGE = 0x2f6b3a, WHITE = 0xf6f4ee;

  /* ----- lawn platform (top is exactly at road level) ----- */
  boxes.push([X, GY - .25, Z, 164, .5, 164, 0x4f8c40]);
  for (let i = -7; i <= 7; i += 2) boxes.push([X, GY + .01, Z + i * 10, 164, .02, 5, 0x5a9a48]);

  /* ----- boundary wall, pillars and gate ----- */
  const capWall = (x0, x1, z) => vb((x0 + x1) / 2, z, x1 - x0 + .4, 1.6, 3.2, .3, 0xb9ad98);
  wallX(-80, 80, -79.4, 3.2, 1.2, STONE); capWall(-80, 80, -79.4);
  wallZ(-80, 80, -79.4, 3.2, 1.2, STONE); vb(-79.4, 0, 1.6, 160.4, 3.2, .3, 0xb9ad98);
  wallZ(-80, 80, 79.4, 3.2, 1.2, STONE); vb(79.4, 0, 1.6, 160.4, 3.2, .3, 0xb9ad98);
  wallX(-80, -7.8, 79.4, 3.2, 1.2, STONE); capWall(-80, -7.8, 79.4);
  wallX(7.8, 80, 79.4, 3.2, 1.2, STONE); capWall(7.8, 80, 79.4);

  for (const px of [-60, -40, -20, 0, 20, 40, 60]) {
    vb(px, -79.4, 2, 2, 0, 4.2, 0xcfc6b2); vlamp(px, 4.6, -79.4, .45);
  }
  for (const pz of [-60, -40, -20, 0, 20, 40, 60]) {
    vb(-79.4, pz, 2, 2, 0, 4.2, 0xcfc6b2); vlamp(-79.4, 4.6, pz, .45);
    vb(79.4, pz, 2, 2, 0, 4.2, 0xcfc6b2); vlamp(79.4, 4.6, pz, .45);
  }
  for (const px of [-60, -40, -20, 20, 40, 60]) {
    vb(px, 79.4, 2, 2, 0, 4.2, 0xcfc6b2); vlamp(px, 4.6, 79.4, .45);
  }

  for (const s of [-1, 1]) {
    vb(s * 8.4, 79.4, 2.4, 2.4, 0, 5.4, 0xcfc6b2, true);
    vb(s * 8.4, 79.4, 2.8, 2.8, 5.4, .3, GOLD);
    vlamp(s * 8.4, 6.1, 79.4, .6);
  }
  vb(0, 79.4, 14.4, .7, 3.4, 1.9, DARKC);                 // sign beam above the gate

  // guard house next to the gate
  vb(-14, 72, 6, 6, 0, 3.2, 0xdad2c0, true);
  vb(-14, 72, 7.2, 7.2, 3.2, .3, 0x7a4a2e);
  vb(-14, 75.05, 3.4, .2, 1.2, 1.2, GLASS);
  vb(-10.95, 72, .2, 3.4, 1.2, 1.2, GLASS);

  /* ----- driveway, fountain roundabout, parking aprons ----- */
  vb(0, 70, 9, 20, 0, .06, ASPHALT);
  vc(0, 48, 14, 0, .06, ASPHALT);
  vc(0, 48, 8.8, 0, .16, 0x4f8c40);
  vc(0, 48, 5.2, 0, .9, 0xcfc8b6);
  waterCyls.push([X, GY + .9, Z + 48, 4.6, .1, 4.6]);
  vc(0, 48, .8, 0, 2.6, 0xcfc8b6);
  vc(0, 48, 2.2, 2.2, .35, 0xcfc8b6);
  waterCyls.push([X, GY + 2.58, Z + 48, 1.9, .06, 1.9]);
  solid(0, 48, 10.4, 10.4, 1);
  vb(0, 32, 9, 4, 0, .06, ASPHALT);
  vb(-58, 40, 34, 20, 0, .06, ASPHALT);
  vb(-27, 48, 28, 8, 0, .06, ASPHALT);
  vb(55, 37, 8, 18, 0, .06, PAVER);
  vb(32, 48, 38, 6, 0, .06, PAVER);
  vb(0, 33, 66, 6, 0, .12, STONE);                           // front terrace

  for (const lz of [74, 66]) {
    for (const s of [-1, 1]) { vc(s * 5.5, lz, .15, 0, 4.5, 0x333840); vlamp(s * 5.5, 4.8, lz, .5); }
  }
  vb(-6.6, 70, .9, 20, 0, 1.1, HEDGE); vb(6.6, 70, .9, 20, 0, 1.1, HEDGE);
  for (let i = 0; i < 8; i++) {                               // flower beds along the terrace
    const bx = -24 + i * 6.8;
    vb(bx, 37.6, 3.6, 1.4, 0, .5, 0x6a4a2e);
    for (let k = -1; k <= 1; k++) vs(bx + k * 1.1, .75, 37.6, .35, .35, .35, [0xe0392d, 0xf2c230, 0xff7aa8][(i + k + 3) % 3]);
  }

  /* ----- the mansion: walls, doors, rooms ----- */
  vb(0, 14, 64, 32, 0, .04, 0xe7e2d6);                        // marble floor
  seg([[-32, -3], [3, 32]], (a, b) => wallX(a, b, 30, 5, .8, PLASTER));     // front, front door in the middle
  seg([[-32, -4], [4, 32]], (a, b) => wallX(a, b, -2, 5, .8, PLASTER));     // back, door to the pool
  wallZ(-2, 30, -32, 5, .8, PLASTER); wallZ(-2, 30, 32, 5, .8, PLASTER);
  vb(0, 30, 6.4, .9, 3.8, 1.2, PLASTER); vb(0, -2, 8.4, .9, 3.8, 1.2, PLASTER);   // door lintels
  for (const s of [-1, 1]) { vb(s * 3.2, 30, .4, 1, 0, 3.8, GOLD); vb(s * 4.2, -2, .4, 1, 0, 3.8, GOLD); }

  for (const px of [-12, 12]) seg([[-2, 2], [8, 16], [22, 30]], (a, b) => wallZ(a, b, px, 5, .5, 0xe8e2d4));
  seg([[-32, -24], [-19, -12]], (a, b) => wallX(a, b, 14, 5, .5, 0xe8e2d4));
  seg([[12, 19], [24, 32]], (a, b) => wallX(a, b, 14, 5, .5, 0xe8e2d4));

  vb(0, 14, 65, 33, 4.9, .3, 0xcfc8b6);                       // ceiling / terrace slab
  vb(0, 14, 52, 28, 5.2, 4.4, 0xf3eee3);                      // upper floor
  addGable(X, GY + 9.6, Z + 14, 52, 28, 3.6, gableMaterials[0]);
  for (const wx of [-20, -10, 0, 10, 20]) {
    vb(wx, 28.15, 3.6, .2, 6.6, 2.4, GLASS); vb(wx, -.15, 3.6, .2, 6.6, 2.4, GLASS);
  }
  for (const wx of [-26, -20, -14, 14, 20, 26]) vb(wx, 30.45, 3.6, .2, 1.1, 2.6, GLASS);
  for (const wz of [4, 10, 20, 26]) { vb(-32.45, wz, .2, 3.6, 1.1, 2.6, GLASS); vb(32.45, wz, .2, 3.6, 1.1, 2.6, GLASS); }
  vb(0, 32.5, 62, 5, 4.9, .4, STONE);                         // balcony slab and columns
  vb(0, 34.9, 62, .3, 5.3, .9, WHITE);
  for (const cx of [-27, -16, -5, 5, 16, 27]) vc(cx, 34, .55, 0, 4.9, 0xf3eee3);

  // living room (centre front)
  vb(0, 22, 14, 9, .04, .03, 0x8b2f3a);
  vb(0, 27, 9, 2.4, 0, .9, 0x5b6b7a, true); vb(0, 28.1, 9, .6, .9, .9, 0x4a5866);
  vb(-7, 22, 2.2, 2.2, 0, .9, 0x5b6b7a, true); vb(7, 22, 2.2, 2.2, 0, .9, 0x5b6b7a, true);
  vb(0, 22, 3.4, 1.8, 0, .5, 0x5a3b25, true);
  vb(0, 14.8, 9, .6, 0, 1.1, DARKC, true); vb(0, 14.6, 6.4, .15, 1.2, 2.6, 0x0f1318); vb(0, 14.5, 6, .05, 1.35, 2.3, 0x264a73);
  for (const px of [-10.5, 10.5]) { vc(px, 28.5, .6, 0, 1, 0x9a6a3a); vs(px, 2.1, 28.5, 1, 1.1, 1, 0x2f7a3a); }
  vs(0, 3.5, 22, .9, .5, .9, 0xffe8a0);

  // entrance hall (centre back): piano, plants, statue
  vb(4, 6, 3.2, 2.2, 0, 1.1, 0x111418, true); vb(4, 6, 3.2, 2.2, 1.1, .1, 0x111418);
  for (const px of [-9, 9]) { vc(px, 10, .9, 0, 1.2, 0xcfc8b6); vs(px, 2.2, 10, .8, .8, .8, 0xe9e2d0); }
  vs(0, 3.6, 6, .9, .5, .9, 0xffe8a0);

  // kitchen (west front) and dining room (west back)
  vb(-30.8, 22, 1.4, 14, 0, 1, 0xcfc8b6, true); vb(-31.2, 22, .8, 14, 2, 1.2, 0xb8b1a2);
  vb(-30.6, 15, 1.6, 1.6, 0, 2.2, 0xc0c4c8, true);
  vb(-22, 24, 8, 2.4, 0, 1.05, 0xd9d4c8, true);
  for (let i = -3; i <= 3; i += 2) vc(i - 22, 26.2, .35, 0, .8, 0x333840);
  vb(-22, 6, 10, 2.8, 0, .85, WOOD, true);
  for (let i = -4; i <= 4; i += 2.2) { vb(-22 + i, 3.7, .8, .8, 0, .9, 0x3a2a1c); vb(-22 + i, 8.3, .8, .8, 0, .9, 0x3a2a1c); }
  vb(-31, 6, 1, 8, 0, 1, 0x4a3321, true);

  // home cinema (east front) and bar
  vb(31.4, 22, .2, 10, 1, 3.8, 0xeef1f4); vb(31.5, 22, .1, 10.6, .8, 4.2, DARKC);
  for (const row of [16, 19.5, 23]) for (const sz of [17, 20, 23, 26]) {
    vb(row, sz, 1.3, 1.3, 0, .7, 0x7a1f2b); vb(row - .6, sz, .3, 1.3, .7, .8, 0x7a1f2b);
  }
  vb(16, 28.6, 6, 1.4, 0, 1.1, 0x3a2a1c, true);
  for (let i = -2; i <= 2; i += 2) vc(16 + i, 27, .3, 0, .75, 0x333840);
  for (let i = -2; i <= 2; i++) vs(16 + i * .9, 1.4, 28.6, .12, .3, .12, [0x2f7a3a, 0xa4533a, 0xd4af37][(i + 2) % 3]);

  // master bedroom (east back)
  vb(26, 5, 6, 4.4, 0, .7, 0xf0eae0, true); vb(26, 2.9, 6.4, .4, .7, 1.6, WOOD);
  vb(24.5, 3.5, 1.4, .8, .7, .3, 0xffffff); vb(27.5, 3.5, 1.4, .8, .7, .3, 0xffffff);
  for (const nx of [21.5, 30.5]) vb(nx, 3.2, 1.1, 1.1, 0, .6, WOOD, true);
  vb(31, 10, 1.2, 5, 0, 3.2, 0x4a3321, true);
  vb(21, 8, 6, 4, .04, .03, 0x2f4a6b);

  /* ----- garage with the owner's showcase cars ----- */
  vb(-57, 18, 30, 24, 0, .05, 0x6d7176);
  wallX(-72, -42, 6, 4.5, .8, STONE); wallZ(6, 30, -72, 4.5, .8, STONE); wallZ(6, 30, -42, 4.5, .8, STONE);
  vb(-57, 18, 31, 25, 4.5, .4, 0x5a5f66);
  vb(-57, 30, 30, .8, 3.7, .8, STONE);
  for (const gx of [-66, -60, -54, -48]) vb(gx, 29.6, .7, .7, 0, 3.7, STONE, true);
  vb(-57, 6.6, 26, .6, 1.2, 2.6, 0x4a4f58); vb(-57, 6.6, 26, .6, 2.2, 1.4, 0x6b6f75);   // shelves
  vb(-57, 30.5, 10, .2, 3.7, .6, GOLD);

  /* ----- guest house ----- */
  vb(56, 17, 28, 22, 0, .04, 0xe0d6c0);
  wallX(42, 70, 6, 4, .7, PLASTER); wallZ(6, 28, 42, 4, .7, PLASTER); wallZ(6, 28, 70, 4, .7, PLASTER);
  seg([[42, 54], [58, 70]], (a, b) => wallX(a, b, 28, 4, .7, PLASTER));
  addGable(X + 56, GY + 4, Z + 17, 28, 22, 3.4, gableMaterials[2]);
  vb(56, 28.4, 4.4, .9, 3, 1, PLASTER);
  vb(63, 10, 5, 3.8, 0, .7, 0xdfe8f0, true); vb(50, 24, 5, 2, 0, .9, 0x6a7a5a, true); vb(58, 14, 3, 1.6, 0, .5, WOOD, true);
  for (const wx of [46, 64]) vb(wx, 28.4, 3, .2, 1.2, 2, GLASS);

  /* ----- pool, deck, loungers, spa ----- */
  vb(0, -21, 44, 30, 0, .1, STONE);
  vb(0, -28.5, 26, 1, 0, .3, 0xf6f4ee); vb(0, -15.5, 26, 1, 0, .3, 0xf6f4ee);
  vb(-12.5, -22, 1, 13, 0, .3, 0xf6f4ee); vb(12.5, -22, 1, 13, 0, .3, 0xf6f4ee);
  vb(0, -22, 24, 12, .1, .01, 0x2a8fbd);
  waters.push([X, GY + .22, Z - 22, 24, .06, 12]);
  for (const lx of [-9, -5, -1, 3, 7, 11]) { vb(lx, -12, 1, 2.2, .1, .4, 0xf8f8f8); vb(lx, -13.1, 1, .3, .3, .9, 0xf8f8f8); }
  for (const ux of [-7, 5]) { vc(ux, -9.5, .08, 0, 2.6, 0xcccccc); vcone(ux, 2.4, -9.5, 2.3, .6, 0xe9d36a); }
  vb(15, -22, 3.5, .8, .3, .1, 0xf1f1f1); vb(13.8, -22, .4, .6, 0, .4, 0xcccccc);
  vc(28, -22, 3.7, 0, .45, STONE);
  waterCyls.push([X + 28, GY + .42, Z - 22, 3.2, .06, 3.2]);
  for (const [lx, lz] of [[-12, -28], [12, -28], [-12, -16], [12, -16]]) vlamp(lx, .35, lz, .18, 0x66e0ff);

  /* ----- fitness centre ----- */
  vb(46, -36, 24, 16, 0, .04, 0x2a5a3a);
  wallX(34, 58, -44, 4, .6, 0xdcd6c8); wallZ(-44, -28, 34, 4, .6, 0xdcd6c8); wallZ(-44, -28, 58, 4, .6, 0xdcd6c8);
  seg([[34, 44], [48, 58]], (a, b) => wallX(a, b, -28, 4, .6, 0xdcd6c8));
  vb(46, -36, 25, 17, 4, .3, 0x5a5f66);
  for (const wx of [38, 54]) vb(wx, -27.6, 4, .2, 1.2, 2.2, GLASS);
  for (const tx of [37, 40, 43]) { vb(tx, -40, 1, 2, 0, 1.2, 0x222428, true); vb(tx, -41, .8, .2, 1.2, .5, 0x39a7ff); }
  vb(52, -34, 2.2, 1, 0, .5, 0x333840, true); vb(52, -34, 3, .15, .9, .15, 0xaaaaaa);
  vb(56.5, -38, 1, 4, 0, 1, 0x333840, true);
  for (let i = 0; i < 4; i++) vs(56.5, 1.15, -39.5 + i * 1.1, .3, .3, .3, 0x888c92);
  vb(46, -43.6, 16, .1, .4, 2.4, 0xcfe3ee);

  /* ----- tennis court and basketball court ----- */
  vb(-57, -50, 28, 15, 0, .05, 0x2f6f9f);
  const L = .13;
  vb(-69, -50, .15, 11, .05, L, WHITE); vb(-45, -50, .15, 11, .05, L, WHITE);
  vb(-57, -55.5, 24, .15, .05, L, WHITE); vb(-57, -44.5, 24, .15, .05, L, WHITE);
  vb(-63.4, -50, .15, 8.3, .05, L, WHITE); vb(-50.6, -50, .15, 8.3, .05, L, WHITE); vb(-57, -50, 12.8, .15, .05, L, WHITE);
  vb(-57, -50, .12, 12, .05, .9, 0xf2f2f2);
  for (const pz of [-56, -44]) vb(-57, pz, .2, .2, 0, 1.1, 0x333840);
  for (let i = -14; i <= 14; i += 4.7) { vb(-57 + i, -58.4, .12, .12, 0, 3, 0x1d3b2a); vb(-57 + i, -41.6, .12, .12, 0, 3, 0x1d3b2a); }
  vb(-57, -58.4, 28.6, .08, 3, .1, 0x1d3b2a); vb(-57, -41.6, 28.6, .08, 3, .1, 0x1d3b2a);
  vb(-30, -50, 12, 14, 0, .05, 0xb5532a);
  vb(-30, -50, 11, .12, .05, L, WHITE); vb(-30, -56, 11, .12, .05, L, WHITE);
  vb(-24.5, -50, .3, .3, 0, 3.4, 0x333840, true); vb(-24.8, -50, .12, 2.4, 2.8, 1.5, 0xffffff);

  /* ----- helipad with a helicopter ----- */
  vc(56, -62, 11, 0, .12, ASPHALT); vc(56, -62, 9.8, 0, .125, 0xf2c230); vc(56, -62, 9.3, 0, .13, ASPHALT);
  vb(53.8, -62, 1, 6, .13, .01, 0xf2c230); vb(58.2, -62, 1, 6, .13, .01, 0xf2c230); vb(56, -62, 4.4, 1, .13, .01, 0xf2c230);
  vs(56, 2, -62, 1.5, 1.2, 2.4, 0xf5f6f8);
  vs(56, 2.15, -60.4, 1.1, .75, 1.1, 0x1d3b52);
  vb(56, -66.6, .5, 5, 2.2, .5, 0xe9ecef);
  vb(56, -69, .2, .5, 2.2, 1.5, 0x2467a6);
  for (const s of [-1, 1]) {
    vb(56 + s * 1.3, -62, .12, 4.4, .25, .12, 0x333840);
    vb(56 + s * 1.2, -63, .1, .1, .25, 1.1, 0x333840); vb(56 + s * 1.2, -61, .1, .1, .25, 1.1, 0x333840);
  }
  solid(56, -62, 4, 6, 3);
  vb(56, -62, .5, .5, 3.1, .5, 0x333840);                    // rotor mast

  /* ----- shooting range ----- */
  vb(-25, -72, 100, 6, 0, .05, 0x8a8d90);
  vb(-60, -72, 1, 5.5, 0, 1.1, 0x6b6f75, true); vb(-62.5, -72, 5, 6, 2.6, .3, 0x5a5f66);
  for (const pz of [-74.5, -69.5]) vb(-64.5, pz, .3, .3, 0, 2.6, 0x333840);
  vb(-17, -75.8, 85, .4, 0, 1.2, 0x6b6f75, true); vb(-17, -68.2, 85, .4, 0, 1.2, 0x6b6f75, true);
  vb(27, -72, 6, 8, 0, 3.5, 0x8a7a5c, true);
  for (const tx of [-35, -18, -1, 16]) {
    vb(tx, -72, .15, .15, 0, 1.2, 0x444444); vb(tx, -72, .15, 1.4, 1.2, 1.4, 0xffffff); vb(tx + .1, -72, .17, .9, 1.45, .9, 0xd63b2f);
  }

  /* ----- barbecue patio ----- */
  vb(-26, -10, 18, 10, 0, .08, PAVER);
  vb(-31, -12, 2.4, 1.2, .08, 1.1, 0x222428, true);
  vb(-24, -8, 4, 1.8, .08, .8, WOOD, true);
  for (const [cx2, cz2] of [[-26.5, -8], [-21.5, -8], [-24, -6.2], [-24, -9.8]]) vb(cx2, cz2, .8, .8, .08, .6, 0x3a2a1c);
  vc(-24, -8, .08, .08, 2.7, 0xcccccc); vcone(-24, 2.7, -8, 2.7, .7, 0xd63b2f);
  vc(-18, -12, 1, 0, .5, 0x555a60); vs(-18, .75, -12, .5, .45, .5, 0xff8a2a);

  /* ----- garden: hedges, trees, flag pole ----- */
  vb(-20, 38.8, 24, .8, 0, 1, HEDGE); vb(20, 38.8, 24, .8, 0, 1, HEDGE);
  const gardenTrees = [
    [-72, 62, "oak"], [72, 62, "oak"], [-30, 60, "pine"], [30, 60, "pine"], [-68, 54, "cypress"], [70, 48, "cypress"],
    [-30, -30, "birch"], [30, -52, "oak"], [70, -30, "oak"], [-76, -30, "birch"], [-8, -60, "pine"], [10, -58, "birch"],
    [72, 36, "oak"], [-76, 38, "oak"], [36, 62, "birch"], [-36, 62, "birch"]
  ];
  for (const [tx, tz, species] of gardenTrees) plantTree(X + tx, Z + tz, species, rand(.9, 1.2));
  vc(12, 70, .12, 0, 9, 0xdddddd); vlamp(12, 9.1, 70, .25, 0xd4af37);

  // gate sign
  const sign = villaSignTexture(VILLA_NAME);
  for (const side of [1, -1]) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 1.6),
      new THREE.MeshBasicMaterial({ map: sign })
    );
    board.position.set(X, GY + 4.55, Z + 79.4 + side * .38);
    if (side < 0) board.rotation.y = Math.PI;
    world.add(board);
  }

  /* ----- flush the merged / instanced parts ----- */
  makeInstanced(boxGeo, villaWhiteMat, boxes);
  makeInstanced(cylinderGeo, villaWhiteMat, cyls);
  makeInstanced(sphereGeo, villaWhiteMat, sphs);
  makeInstanced(treeGeo.cone, villaWhiteMat, cones);
  makeInstanced(sphereGeo, villaLampMat, lamps);

  villaState.waterMat = new THREE.MeshLambertMaterial({
    color: 0x2aa9d8, transparent: true, opacity: .7, depthWrite: false
  });
  makeInstanced(boxGeo, villaState.waterMat, waters);
  makeInstanced(cylinderGeo, villaState.waterMat, waterCyls);

  /* ----- moving parts: gate, fountain, rotors, flag ----- */
  const dynamic = new THREE.Group();
  dynamic.userData.dynamic = true;
  world.add(dynamic);

  const gateMat = new THREE.MeshLambertMaterial({ color: 0x20242a });
  const goldMat = new THREE.MeshLambertMaterial({ color: GOLD });

  for (const s of [-1, 1]) {
    const panel = new THREE.Group();
    const slab = new THREE.Mesh(boxGeo, gateMat);
    slab.scale.set(6.6, 2.6, .25);
    slab.position.y = 1.5;
    panel.add(slab);
    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(boxGeo, goldMat);
      bar.scale.set(.1, 3, .35);
      bar.position.set(i * .9, 1.5, 0);
      panel.add(bar);
    }
    panel.position.set(X + s * 3.3, GY, Z + 79.4);
    dynamic.add(panel);
    villaState.gatePanels.push({ panel, side: s });

    const collider = { x: X + s * 3.3, z: Z + 79.4, width: 6.8, depth: 1, height: 3 };
    buildings.push(collider);
    villaState.gateColliders.push({ collider, baseX: collider.x });
  }

  const dropMat = new THREE.MeshBasicMaterial({ color: 0xcfeeff });
  for (let i = 0; i < 12; i++) {
    const drop = new THREE.Mesh(sphereGeo, dropMat);
    drop.scale.setScalar(.14);
    dynamic.add(drop);
    villaState.droplets.push(drop);
  }

  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const rotorMain = new THREE.Group();
  for (const ry of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(boxGeo, bladeMat);
    blade.scale.set(9, .05, .35);
    blade.rotation.y = ry;
    rotorMain.add(blade);
  }
  rotorMain.position.set(X + 56, GY + 3.75, Z - 62);
  dynamic.add(rotorMain);
  villaState.rotorMain = rotorMain;

  const rotorTail = new THREE.Group();
  const tailBlade = new THREE.Mesh(boxGeo, bladeMat);
  tailBlade.scale.set(.05, 1.5, .2);
  rotorTail.add(tailBlade);
  rotorTail.position.set(X + 56.35, GY + 3.2, Z - 68.8);
  dynamic.add(rotorTail);
  villaState.rotorTail = rotorTail;

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x2467a6, side: THREE.DoubleSide })
  );
  flag.position.set(X + 13.3, GY + 8, Z + 70);
  dynamic.add(flag);
  villaState.flag = flag;

  /* ----- the owner's car collection ----- */
  const models = [["sport", 0xe33b2e], ["supercar", 0xf2c230], ["suv", 0x202a35], ["sedan", 0x2467a6], ["jeep", 0x47714b]];
  models.forEach(([type, color], i) => {
    const mesh = createCar(color, type, false, false);
    const cx = X - 69 + i * 6, cz = Z + 17;
    mesh.position.set(cx, 0, cz);
    scene.add(mesh);
    buildings.push({ x: cx, z: cz, width: 2.8, depth: 5.4, height: 1.8 });
    villaState.showcase.push({ mesh, type, color, x: cx, z: cz });
  });

  villaState.ready = true;
}

function villaTourPoints() {
  const X = VILLA.x, Z = VILLA.z;
  return [
    P(X, Z + 70, "ENTER THROUGH THE GATE"),
    P(X, Z + 58, "THE FOUNTAIN"),
    P(X, Z + 19, "THE LIVING ROOM"),
    P(X + 20, Z + 22, "THE HOME CINEMA"),
    P(X + 17, Z + 6, "THE MASTER BEDROOM"),
    P(X - 22, Z + 19, "THE KITCHEN"),
    P(X, Z - 8, "THE POOL DECK"),
    P(X + 28, Z - 22, "THE SPA"),
    P(X + 46, Z - 34, "THE FITNESS CENTER"),
    P(X - 57, Z - 50, "THE TENNIS COURT"),
    P(X + 56, Z - 52, "THE HELIPAD"),
    P(X - 57, Z + 25, "THE GARAGE"),
    P(X - 64, Z - 72, "THE SHOOTING RANGE")
  ];
}

function villaRangeTargets() {
  const X = VILLA.x, Z = VILLA.z;
  return [
    { x: X - 35, z: Z - 72, y: 1.5 }, { x: X - 18, z: Z - 72, y: 1.5 },
    { x: X - 1, z: Z - 72, y: 1.5 }, { x: X + 16, z: Z - 72, y: 1.5 },
    { x: X - 44, z: Z - 72, y: 2.7 }, { x: X - 26, z: Z - 72, y: 2.7 },
    { x: X - 9, z: Z - 72, y: 2.7 }, { x: X + 8, z: Z - 72, y: 2.7 }
  ];
}

function findShowcaseCar() {
  let best = null;
  for (const entry of villaState.showcase) {
    const dist = Math.hypot(entry.x - player.position.x, entry.z - player.position.z);
    if (dist < 6 && (!best || dist < best.dist)) best = { entry, dist };
  }
  return best;
}

function takeShowcaseCar(entry) {
  if (!isOwner()) {
    showMessage("PRIVATE COLLECTION — OWNER ONLY");
    return;
  }
  spawnVehicle(entry.type);
  car.userData.paint.color.setHex(entry.color);
  showMessage("YOUR " + VEHICLES[entry.type].name + " IS READY — PRESS E TO GET IN");
}

function goHome() {
  if (!started || paused || playerDead) return;

  if (!isOwner()) {
    showMessage("ONLY THE OWNER CAN TELEPORT HOME");
    return;
  }

  if (ridingIn) leaveSeat(true);

  if (driving) {
    placeCar(VILLA.x + 8, VILLA.z + 60, Math.PI);
  } else {
    player.position.set(VILLA.x, 0, VILLA.z + 58);
    playerRotation = Math.PI;
    player.rotation.y = playerRotation;
    playerGround = 0;
    jumpOffset = 0;
  }

  showMessage("WELCOME HOME");
}

function villaTip(text) {
  if (villaState.tipTimer > 0) return;
  villaState.tipTimer = 8;
  showMessage(text);
}

function updateVilla(dt) {
  if (!villaState.ready) return;

  villaState.time += dt;
  villaState.noticeTimer = Math.max(0, villaState.noticeTimer - dt);
  villaState.tipTimer = Math.max(0, villaState.tipTimer - dt);

  const owner = isOwner();
  const subject = subjectPosition();
  const X = VILLA.x, Z = VILLA.z;

  // gate: only opens for the owner
  const nearGate = Math.hypot(subject.x - X, subject.z - (Z + 79.4)) < 16;
  villaState.gateOpen += ((owner && nearGate ? 1 : 0) - villaState.gateOpen) * Math.min(1, dt * 2.5);

  for (const { panel, side } of villaState.gatePanels) {
    panel.position.x = X + side * (3.3 + 8.2 * villaState.gateOpen);
  }
  for (const { collider, baseX } of villaState.gateColliders) {
    collider.x = villaState.gateOpen > .85 ? 1e7 : baseX;
  }

  if (!owner && nearGate && villaState.noticeTimer <= 0) {
    villaState.noticeTimer = 9;
    showMessage("PRIVATE PROPERTY — " + VILLA_NAME + "  (OWNER ONLY)");
  }

  if (owner && started && !villaState.greeted) {
    villaState.greeted = true;
    showMessage("WELCOME, OWNER — PRESS O TO TELEPORT HOME");
  }

  // animations
  const t = villaState.time;
  villaState.rotorMain.rotation.y += dt * 22;
  villaState.rotorTail.rotation.x += dt * 30;
  villaState.flag.rotation.y = Math.sin(t * 3) * .35;
  villaState.waterMat.opacity = .68 + Math.sin(t * 2) * .06;

  villaState.droplets.forEach((drop, i) => {
    const phase = (t * 1.2 + i / villaState.droplets.length) % 1;
    const angle = i * (Math.PI * 2 / villaState.droplets.length);
    const radius = .4 + 2.3 * phase;
    drop.position.set(
      X + Math.cos(angle) * radius,
      -.44 + 2.7 + 6.4 * phase * (1 - phase) - 1.5 * phase,
      Z + 48 + Math.sin(angle) * radius
    );
  });

  // facility effects (on foot, inside the estate)
  if (driving || ridingIn || playerDead) return;

  const px = player.position.x, pz = player.position.z;

  if (Math.hypot(px - VILLA_SPA.x, pz - VILLA_SPA.z) < VILLA_SPA.r + .6 && hp < MAX_HP) {
    hp = Math.min(MAX_HP, hp + 12 * dt);
    villaTip("THE SPA IS HEALING YOU");
  } else if (px > VILLA_GYM.x0 && px < VILLA_GYM.x1 && pz > VILLA_GYM.z0 && pz < VILLA_GYM.z1 && stamina < STAMINA_MAX) {
    stamina = Math.min(STAMINA_MAX, stamina + 45 * dt);
    exhausted = false;
    villaTip("FITNESS CENTER — STAMINA RESTORED");
  } else if (px > VILLA_HOUSE.x0 && px < VILLA_HOUSE.x1 && pz > VILLA_HOUSE.z0 && pz < VILLA_HOUSE.z1 && hp < MAX_HP) {
    hp = Math.min(MAX_HP, hp + 2.5 * dt);
  }
}

/* =========================================================
   BUILD WORLD AND START LOOP
   ========================================================= */

// Raise the world so the road surface sits exactly at y = 0
world.position.y = .44;

createBaseGround();
createRoads();
createCrosswalks();
createCity();
createStreetlights();
createPalms();
createCentralBillboard();

// Extra floating billboards
createExtraBillboard(
  ["I love You", "kutchu puchu"],
  -70, 40, -100,
  ["#2b0a3d", "#a02c6b", "#ff7a8a"], "#ff9ec7"
);

createExtraBillboard(
  ["Welcome to My game", "future Mrs Nayak"],
  80, 44, -100,
  ["#0b2a4a", "#3a2c7a", "#e8a05a"], "#ffd48a"
);

createTraffic();

for (let i = 0; i < CONFIG.MAX_PEDESTRIANS; i++) {
  createPedestrian();
}

/* =========================================================
   WEATHER — CLEAR, CLOUDY, RAIN, STORM, FOG, SUNSET  (press G)
   ========================================================= */

let fogCapNear = 260;     // limits set by the graphics quality level
let fogCapFar = 1200;

const WEATHER_PRESETS = [
  { name: "CLEAR",  top: 0x347fbd, horizon: 0xb9d9e9, lower: 0xe4e4d8, fog: 0x87b0cc, fogNear: 260, fogFar: 1200, hemi: 2.35, sun: 1.75, sunColor: 0xfff5e0, cloud: .82, cloudColor: 0xf7fbff, rain: 0,  wet: 0,  grip: 1 },
  { name: "CLOUDY", top: 0x6f8798, horizon: 0xaab7c0, lower: 0xc3c7c8, fog: 0x9aa8b0, fogNear: 200, fogFar: 1000, hemi: 2.0,  sun: .9,   sunColor: 0xe8ecef, cloud: 1,   cloudColor: 0xcfd6dc, rain: 0,  wet: 0,  grip: 1 },
  { name: "RAIN",   top: 0x4a5a68, horizon: 0x78858f, lower: 0x8d9498, fog: 0x78858f, fogNear: 90,  fogFar: 650,  hemi: 1.7,  sun: .35,  sunColor: 0xc9d3da, cloud: 1,   cloudColor: 0x8a949c, rain: 1,  wet: 1,  grip: .82 },
  { name: "STORM",  top: 0x2b3540, horizon: 0x4b5760, lower: 0x5d666c, fog: 0x4b5760, fogNear: 60,  fogFar: 480,  hemi: 1.45, sun: .2,   sunColor: 0xaab6c0, cloud: 1,   cloudColor: 0x59636b, rain: 1.6, wet: 1, grip: .74, storm: true },
  { name: "FOG",    top: 0x9aa5ab, horizon: 0xc2c8cb, lower: 0xcfd2d2, fog: 0xbfc5c8, fogNear: 12,  fogFar: 260,  hemi: 2.1,  sun: .6,   sunColor: 0xf0f0ea, cloud: .6,  cloudColor: 0xe6e9ea, rain: 0,  wet: .2, grip: .95 },
  { name: "SUNSET", top: 0x3b4b8a, horizon: 0xf09a5c, lower: 0xf5c88a, fog: 0xd9a077, fogNear: 200, fogFar: 1100, hemi: 1.6,  sun: 1.1,  sunColor: 0xffb070, cloud: .8,  cloudColor: 0xffc79a, rain: 0,  wet: 0,  grip: 1 }
];

const COLOR_KEYS = ["top", "horizon", "lower", "fog", "sunColor", "cloudColor"];
const NUMBER_KEYS = ["fogNear", "fogFar", "hemi", "sun", "cloud", "rain", "wet", "grip"];

function makeWeatherState(preset) {
  const state = { name: preset.name, storm: !!preset.storm };
  for (const key of COLOR_KEYS) state[key] = new THREE.Color(preset[key]);
  for (const key of NUMBER_KEYS) state[key] = preset[key];
  return state;
}

const weatherTargets = WEATHER_PRESETS.map(makeWeatherState);
const weatherNow = makeWeatherState(WEATHER_PRESETS[0]);
let weatherIndex = 0;

const roadDryColor = new THREE.Color(0x2a2e34);
const roadWetColor = new THREE.Color(0x14171b);

/* ----- rain streaks (one cheap LineSegments object) ----- */
const RAIN_COUNT = 700;
const rainPositions = new Float32Array(RAIN_COUNT * 6);
const rainLocal = new Float32Array(RAIN_COUNT * 3);

for (let i = 0; i < RAIN_COUNT; i++) {
  rainLocal[i * 3] = rand(-45, 45);
  rainLocal[i * 3 + 1] = rand(0, 40);
  rainLocal[i * 3 + 2] = rand(-45, 45);
}

const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));

const rain = new THREE.LineSegments(
  rainGeo,
  new THREE.LineBasicMaterial({
    color: 0xb7c4cf, transparent: true, opacity: .5, fog: false
  })
);
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);

/* ----- sound effects shared by weather and guns ----- */
let sfx = null;

function getSfx() {
  if (sfx) {
    if (sfx.context.state === "suspended") sfx.context.resume().catch(() => {});
    return sfx;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = .85;
    master.connect(context.destination);

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    sfx = { context, master, buffer, rainGain: null };
    return sfx;
  } catch (error) {
    return null;
  }
}

function startRainSound() {
  const audio = getSfx();
  if (!audio || audio.rainGain) return;

  const source = audio.context.createBufferSource();
  source.buffer = audio.buffer;
  source.loop = true;

  const high = audio.context.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 700;
  const low = audio.context.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 7000;

  audio.rainGain = audio.context.createGain();
  audio.rainGain.gain.value = 0;

  source.connect(high);
  high.connect(low);
  low.connect(audio.rainGain);
  audio.rainGain.connect(audio.master);
  source.start();
}

function playThunder() {
  const audio = getSfx();
  if (!audio) return;

  const now = audio.context.currentTime;
  const source = audio.context.createBufferSource();
  source.buffer = audio.buffer;

  const filter = audio.context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 150;

  const gain = audio.context.createGain();
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.9, now + .08);
  gain.gain.exponentialRampToValueAtTime(.0001, now + 2.6);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.start(now);
  source.stop(now + 2.7);
}

["pointerdown", "keydown", "touchstart"].forEach(name => {
  window.addEventListener(name, () => getSfx(), { once: true, passive: true });
});

let lightningTimer = 8;
let lightningFlash = 0;
const thunderQueue = [];
let rainSoundTimer = 0;

function cycleWeather() {
  weatherIndex = (weatherIndex + 1) % WEATHER_PRESETS.length;
  const next = WEATHER_PRESETS[weatherIndex];

  if (next.rain > 0) startRainSound();
  else getSfx();     // unlock audio on this user gesture

  showMessage("WEATHER: " + next.name + "  (G TO CHANGE)");
}

function updateRain(dt) {
  const amount = weatherNow.rain;

  if (amount < .03) {
    rain.visible = false;
    return;
  }

  rain.visible = true;

  const share = quality === 0 ? .4 : quality === 1 ? .7 : 1;
  const count = Math.min(RAIN_COUNT, Math.floor(RAIN_COUNT * Math.min(1, amount) * share));

  const cx = camera.position.x;
  const cz = camera.position.z;
  const fall = (50 + amount * 10) * dt;

  for (let i = 0; i < count; i++) {
    let y = rainLocal[i * 3 + 1] - fall;

    if (y < 0) {
      y += 40;
      rainLocal[i * 3] = rand(-45, 45);
      rainLocal[i * 3 + 2] = rand(-45, 45);
    }
    rainLocal[i * 3 + 1] = y;

    const x = cx + rainLocal[i * 3];
    const z = cz + rainLocal[i * 3 + 2];
    const o = i * 6;

    rainPositions[o] = x;
    rainPositions[o + 1] = y;
    rainPositions[o + 2] = z;
    rainPositions[o + 3] = x - .12;
    rainPositions[o + 4] = y + .95;
    rainPositions[o + 5] = z;
  }

  rainGeo.attributes.position.needsUpdate = true;
  rainGeo.setDrawRange(0, count * 2);
  rain.material.opacity = Math.min(.55, .25 + amount * .2);
}

function updateWeather(dt) {
  const target = weatherTargets[weatherIndex];
  const k = 1 - Math.exp(-dt * 1.4);

  for (const key of COLOR_KEYS) weatherNow[key].lerp(target[key], k);
  for (const key of NUMBER_KEYS) {
    weatherNow[key] += (target[key] - weatherNow[key]) * k;
  }

  // Lightning during storms
  if (target.storm) {
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningFlash = 1;
      lightningTimer = rand(6, 14);
      thunderQueue.push(rand(.5, 2.4));
    }
  }

  lightningFlash = Math.max(0, lightningFlash - dt * 3.2);
  const flash = lightningFlash * (.65 + Math.random() * .35);

  for (let i = thunderQueue.length - 1; i >= 0; i--) {
    thunderQueue[i] -= dt;
    if (thunderQueue[i] <= 0) {
      thunderQueue.splice(i, 1);
      playThunder();
    }
  }

  const uniforms = skyDome.material.uniforms;
  uniforms.topColor.value.copy(weatherNow.top);
  uniforms.horizonColor.value.copy(weatherNow.horizon);
  uniforms.lowerColor.value.copy(weatherNow.lower);

  scene.background.copy(weatherNow.horizon);
  scene.fog.color.copy(weatherNow.fog);
  scene.fog.near = Math.min(weatherNow.fogNear, fogCapNear);
  scene.fog.far = Math.min(weatherNow.fogFar, fogCapFar);

  hemiLight.intensity = weatherNow.hemi + flash * 2.4;
  sun.intensity = weatherNow.sun + flash * 2;
  sun.color.copy(weatherNow.sunColor);

  cloudMaterial.color.copy(weatherNow.cloudColor);
  cloudMaterial.opacity = weatherNow.cloud;

  mat.road.color.copy(roadDryColor).lerp(roadWetColor, weatherNow.wet);

  updateRain(dt);

  // Rain volume follows the weather (a few times per second is enough)
  rainSoundTimer -= dt;
  if (rainSoundTimer <= 0 && sfx && sfx.rainGain) {
    rainSoundTimer = .25;
    sfx.rainGain.gain.setTargetAtTime(
      weatherNow.rain * .12, sfx.context.currentTime, .4
    );
  }
}

// Freeze the static city: its matrices never need recalculating
function freezeStatic(object) {
  if (object.userData.dynamic) return;
  object.matrixAutoUpdate = false;
  object.children.forEach(freezeStatic);
}

world.updateMatrixWorld(true);
world.children.forEach(freezeStatic);
world.matrixAutoUpdate = false;

camera.position.set(0, 8, 15);
camera.lookAt(0, 0, 0);

/* =========================================================
   COMBAT — GUNS, HEALTH, PICKUPS
   ========================================================= */

const WEAPONS = [
  { id: "pistol",  name: "PISTOL",  damage: 24, rate: .28, mag: 12, reserve: Infinity,  range: 140, pellets: 1, spread: .012, auto: false, reload: 1.1 },
  { id: "smg",     name: "SMG",     damage: 11, rate: .085, mag: 30, reserve: Infinity, range: 110, pellets: 1, spread: .04,  auto: true,  reload: 1.6 },
  { id: "shotgun", name: "SHOTGUN", damage: 9,  rate: .9,  mag: 6,  reserve: Infinity,  range: 50,  pellets: 8, spread: .09,  auto: false, reload: 2.0 }
];

const ammo = WEAPONS.map(w => ({ mag: w.mag, reserve: w.reserve }));
let currentWeapon = -1;          // -1 = gun holstered
let fireCooldown = 0;
let reloadTimer = 0;
let reloading = false;
let firePrev = false;

const MAX_HP = 100;
let hp = MAX_HP;
let playerDead = false;
let deathTimer = 0;
let damageFlash = 0;
let hitMarker = 0;
let sinceDamage = 99;
let spawnProtect = 0;
let lastAttacker = "";
let vehicleHitCooldown = 0;
let carHitSpeed = 0;

/* ---------- gun models ---------- */

const gunBodyMat = new THREE.MeshLambertMaterial({ color: 0x23272e });
const gunAccentMat = new THREE.MeshLambertMaterial({ color: 0x4a4f58 });

function buildGun(index) {
  const g = new THREE.Group();
  const add = (x, y, z, sx, sy, sz, m) => box(g, x, y, z, sx, sy, sz, m);
  const id = WEAPONS[index].id;

  // Barrel points along +z (the group is rotated when attached to the hand)
  if (id === "pistol") {
    add(0, 0, .12, .07, .09, .28, gunBodyMat);
    add(0, -.1, .03, .06, .16, .08, gunAccentMat);
  } else if (id === "smg") {
    add(0, 0, .2, .08, .1, .46, gunBodyMat);
    add(0, -.13, .1, .05, .2, .07, gunAccentMat);
    add(0, -.08, .3, .05, .14, .06, gunAccentMat);
  } else {
    add(0, 0, .3, .07, .08, .7, gunBodyMat);
    add(0, -.04, .2, .09, .09, .3, gunAccentMat);
  }
  return g;
}

function setCharacterGun(character, index) {
  const d = character.userData;
  if (!d.elbows || d.gunIndex === index) return;

  if (d.gun) {
    d.elbows[1].remove(d.gun);
    d.gun = null;
  }

  d.gunIndex = index;
  d.armed = index >= 0 && index < WEAPONS.length;

  if (d.armed) {
    const gun = buildGun(index);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, -.3, .02);
    d.elbows[1].add(gun);
    d.gun = gun;
  }
}

// Raise the arms when holding a gun (called after the walk animation)
function applyAimPose(c) {
  const d = c.userData;
  if (!d.arms) return;

  if (d.armed && !d.airborne && !d.seated) {
    d.arms[1].rotation.x = -1.45;
    d.arms[1].rotation.z = -.2;
    d.elbows[1].rotation.x = -.05;
    d.arms[0].rotation.x = -1.2;
    d.arms[0].rotation.z = .25;
    d.elbows[0].rotation.x = -.5;
    d.aimPoseSet = true;
  } else if (d.aimPoseSet) {
    d.arms[0].rotation.z = 0;
    d.arms[1].rotation.z = 0;
    d.aimPoseSet = false;
  }
}

/* ---------- effects: tracers, impacts, muzzle flash ---------- */

const tracerMat = new THREE.MeshBasicMaterial({
  color: 0xffe9a0, transparent: true, opacity: .9,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const tracerPool = [];
let tracerIndex = 0;

for (let i = 0; i < 16; i++) {
  const mesh = new THREE.Mesh(boxGeo, tracerMat);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.life = 0;
  scene.add(mesh);
  tracerPool.push(mesh);
}

function spawnTracer(ox, oy, oz, dx, dz, length) {
  const t = tracerPool[tracerIndex++ % tracerPool.length];
  const len = Math.max(.5, Math.min(length, 90));
  t.position.set(ox + dx * len / 2, oy, oz + dz * len / 2);
  t.rotation.set(0, Math.atan2(dx, dz), 0);
  t.scale.set(.05, .05, len);
  t.userData.life = .07;
  t.visible = true;
}

const impactMats = {
  spark: new THREE.MeshBasicMaterial({ color: 0xffc44d }),
  dust: new THREE.MeshBasicMaterial({ color: 0xb8b2a6 }),
  person: new THREE.MeshBasicMaterial({ color: 0xd9534f })
};
const impactPool = [];
let impactIndex = 0;

for (let i = 0; i < 12; i++) {
  const mesh = new THREE.Mesh(sphereGeo, impactMats.dust);
  mesh.visible = false;
  mesh.userData.life = 0;
  scene.add(mesh);
  impactPool.push(mesh);
}

function spawnImpact(x, y, z, type) {
  const m = impactPool[impactIndex++ % impactPool.length];
  m.material = impactMats[type] || impactMats.dust;
  m.position.set(x, y, z);
  m.userData.life = .22;
  m.visible = true;
}

const muzzleFlash = new THREE.Mesh(
  sphereGeo,
  new THREE.MeshBasicMaterial({
    color: 0xffd36b, transparent: true, opacity: .9,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
muzzleFlash.scale.setScalar(.3);
muzzleFlash.visible = false;
scene.add(muzzleFlash);
let muzzleTimer = 0;

function updateEffects(dt) {
  for (const t of tracerPool) {
    if (!t.visible) continue;
    t.userData.life -= dt;
    if (t.userData.life <= 0) t.visible = false;
  }

  for (const m of impactPool) {
    if (!m.visible) continue;
    m.userData.life -= dt;
    if (m.userData.life <= 0) m.visible = false;
    else m.scale.setScalar(.05 + .35 * (m.userData.life / .22));
  }

  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    if (muzzleTimer <= 0) muzzleFlash.visible = false;
  }
}

/* ---------- sound ---------- */

let sfxVolume = 1;

// One short burst of filtered noise
function noiseBurst(audio, when, o) {
  const ctx = audio.context;
  const source = ctx.createBufferSource();
  source.buffer = audio.buffer;
  source.playbackRate.value = o.rate || 1;

  const filter = ctx.createBiquadFilter();
  filter.type = o.type || "bandpass";
  filter.frequency.value = o.freq;
  filter.Q.value = o.q || .8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(o.gain * sfxVolume, when);
  gain.gain.exponentialRampToValueAtTime(.001, when + o.duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.start(when, Math.random() * .9);
  source.stop(when + o.duration + .03);
}

// One short pitched tone (boom, thunk, tick)
function toneBurst(audio, when, from, to, duration, volume, type = "sine") {
  const ctx = audio.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + duration);
  gain.gain.setValueAtTime(volume * sfxVolume, when);
  gain.gain.exponentialRampToValueAtTime(.001, when + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(when);
  osc.stop(when + duration + .02);
}

function mechanicalClick(audio, when, freq, volume, duration) {
  noiseBurst(audio, when, { duration, freq, q: 3, gain: volume });
  toneBurst(audio, when, freq * .5, freq * .3, duration, volume * .35, "square");
}

function playGunSound(index) {
  const audio = getSfx();
  if (!audio) return;

  const t = audio.context.currentTime;
  const kind = WEAPONS[index].id;

  if (kind === "shotgun") {
    noiseBurst(audio, t, { duration: .35, freq: 600, q: .5, gain: 1, rate: .7 });
    noiseBurst(audio, t, { duration: .12, freq: 3500, type: "highpass", gain: .8 });
    toneBurst(audio, t, 110, 38, .3, .9);
    noiseBurst(audio, t + .12, { duration: .3, freq: 500, q: .5, gain: .25, rate: .6 });
    // pump action after the shot
    mechanicalClick(audio, t + .38, 900, .5, .06);
    mechanicalClick(audio, t + .55, 1300, .55, .06);
  } else if (kind === "smg") {
    noiseBurst(audio, t, { duration: .1, freq: 1800, q: .7, gain: .75 });
    noiseBurst(audio, t, { duration: .06, freq: 3200, type: "highpass", gain: .5 });
    toneBurst(audio, t, 180, 60, .09, .55);
  } else {
    noiseBurst(audio, t, { duration: .16, freq: 1400, q: .7, gain: .85 });
    noiseBurst(audio, t, { duration: .08, freq: 3000, type: "highpass", gain: .7 });
    toneBurst(audio, t, 150, 55, .12, .7);
    noiseBurst(audio, t + .09, { duration: .22, freq: 900, q: .6, gain: .18, rate: .8 });
  }
}

// Magazine out, magazine in, slide (or shells and pump for the shotgun)
function playReloadSound(index, total) {
  const audio = getSfx();
  if (!audio) return;

  const t = audio.context.currentTime;

  if (WEAPONS[index].id === "shotgun") {
    const span = Math.max(.4, total - .9);
    for (let i = 0; i < 4; i++) {
      mechanicalClick(audio, t + .25 + i * span / 4, 1500, .4, .05);
    }
    mechanicalClick(audio, t + total - .5, 900, .65, .06);
    mechanicalClick(audio, t + total - .2, 1300, .7, .06);
  } else {
    mechanicalClick(audio, t + .05, 900, .55, .07);            // magazine out
    toneBurst(audio, t + .08, 300, 150, .08, .3);
    mechanicalClick(audio, t + total * .55, 1600, .65, .05);   // magazine in
    toneBurst(audio, t + total * .55, 260, 140, .08, .35);
    mechanicalClick(audio, t + total - .22, 1000, .65, .06);   // slide back
    mechanicalClick(audio, t + total - .08, 2000, .75, .05);   // slide release
  }
}

function playDryClick() {
  const audio = getSfx();
  if (audio) mechanicalClick(audio, audio.context.currentTime, 2400, .4, .03);
}

/* ---------- ray casting (flat, top-down) ---------- */

function rayCircle(ox, oz, dx, dz, cx, cz, r) {
  const px = cx - ox, pz = cz - oz;
  const along = px * dx + pz * dz;
  if (along < 0) return -1;
  const d2 = px * px + pz * pz - along * along;
  if (d2 > r * r) return -1;
  return along - Math.sqrt(r * r - d2);
}

function castRay(ox, oz, dx, dz, range) {
  let best = range;
  let kind = null;
  let ref = null;

  for (const b of buildings) {
    const hw = b.width / 2, hd = b.depth / 2;
    let tmin = 0, tmax = best;

    if (Math.abs(dx) < 1e-6) {
      if (ox < b.x - hw || ox > b.x + hw) continue;
    } else {
      let t1 = (b.x - hw - ox) / dx, t2 = (b.x + hw - ox) / dx;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-6) {
      if (oz < b.z - hd || oz > b.z + hd) continue;
    } else {
      let t1 = (b.z - hd - oz) / dz, t2 = (b.z + hd - oz) / dz;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmin < best) {
      best = tmin;
      kind = "building";
      ref = b;
    }
  }

  for (const p of pedestrians) {
    if (p.dead) continue;
    const t = rayCircle(ox, oz, dx, dz, p.mesh.position.x, p.mesh.position.z, .55);
    if (t >= 0 && t < best) { best = t; kind = "ped"; ref = p; }
  }

  for (const remote of remotePlayers.values()) {
    const r = remote.driving ? 2 : .7;
    const t = rayCircle(ox, oz, dx, dz, remote.root.position.x, remote.root.position.z, r);
    if (t >= 0 && t < best) { best = t; kind = "remote"; ref = remote; }
  }

  for (const t of traffic) {
    const hit = rayCircle(ox, oz, dx, dz, t.mesh.position.x, t.mesh.position.z, 2);
    if (hit >= 0 && hit < best) { best = hit; kind = "car"; ref = t; }
  }

  for (const t of missionTargets) {
    if (!t.alive) continue;
    const hit = rayCircle(ox, oz, dx, dz, t.x, t.z, .95);
    if (hit >= 0 && hit < best) { best = hit; kind = "target"; ref = t; }
  }

  const own = rayCircle(ox, oz, dx, dz, car.position.x, car.position.z, 2.1);
  if (own >= 0 && own < best) { best = own; kind = "car"; ref = null; }

  return kind ? { dist: best, kind, ref } : null;
}

// Gentle aim assist: snap to the closest target inside a narrow cone
function findAimAngle(range) {
  const px = player.position.x, pz = player.position.z;
  let best = null, bestScore = Infinity;

  const consider = (x, z) => {
    const dx = x - px, dz = z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist < 1 || dist > range) return;

    const angle = Math.atan2(dx, dz);
    const diff = Math.atan2(
      Math.sin(angle - playerRotation), Math.cos(angle - playerRotation)
    );
    if (Math.abs(diff) > (touchUIActive ? .32 : .2)) return;

    const score = Math.abs(diff) * 40 + dist * .1;
    if (score < bestScore) { bestScore = score; best = angle; }
  };

  for (const p of pedestrians) if (!p.dead) consider(p.mesh.position.x, p.mesh.position.z);
  for (const r of remotePlayers.values()) consider(r.root.position.x, r.root.position.z);
  for (const t of missionTargets) if (t.alive) consider(t.x, t.z);

  return best;
}

/* ---------- shooting ---------- */

function damagePedestrian(p, amount) {
  if (p.dead) return;
  p.hp -= amount;
  p.fleeTimer = 7;
  hitMarker = .18;

  if (p.hp <= 0) {
    p.dead = true;
    p.deadTimer = 10;
    p.fall = 0;
  }
}

function playerFire() {
  const w = WEAPONS[currentWeapon];
  const stock = ammo[currentWeapon];
  stock.mag--;
  fireCooldown = w.rate;

  const assist = findAimAngle(w.range);
  const angle = assist !== null ? assist : playerRotation;

  const ox = player.position.x + Math.sin(playerRotation) * .9 + Math.cos(playerRotation) * .3;
  const oz = player.position.z + Math.cos(playerRotation) * .9 - Math.sin(playerRotation) * .3;
  const oy = player.position.y + 1.35;

  for (let i = 0; i < w.pellets; i++) {
    const a = angle + (Math.random() - .5) * 2 * w.spread;
    const dx = Math.sin(a), dz = Math.cos(a);
    const hit = castRay(ox, oz, dx, dz, w.range);
    const dist = hit ? hit.dist : w.range;

    spawnTracer(ox, oy, oz, dx, dz, dist);
    if (i === 0) netShot(ox, oy, oz, a, Math.min(dist, 90), currentWeapon);

    if (!hit) continue;

    const damage = w.damage * (1 - .6 * (dist / w.range));
    const hx = ox + dx * dist, hz = oz + dz * dist;

    if (hit.kind === "ped") {
      damagePedestrian(hit.ref, damage);
      spawnImpact(hx, oy, hz, "person");
    } else if (hit.kind === "remote") {
      hitMarker = .18;
      netHit(hit.ref.id, damage, currentWeapon);
      spawnImpact(hx, oy, hz, "person");
    } else if (hit.kind === "target") {
      popMissionTarget(hit.ref);
    } else {
      spawnImpact(hx, oy, hz, hit.kind === "car" ? "spark" : "dust");
    }
  }

  muzzleFlash.position.set(ox, oy, oz);
  muzzleFlash.visible = true;
  muzzleTimer = .05;

  playGunSound(currentWeapon);
  camShake = Math.max(camShake, w.id === "shotgun" ? .35 : .12);
  fpRecoil = Math.min(.22, fpRecoil + .12);
}

function startReload() {
  if (currentWeapon < 0 || reloading || playerDead || driving || ridingIn) return;

  const w = WEAPONS[currentWeapon];
  const stock = ammo[currentWeapon];
  if (stock.mag >= w.mag || stock.reserve <= 0) return;

  reloading = true;
  reloadTimer = w.reload;
  playReloadSound(currentWeapon, w.reload);
  showMessage("RELOADING...");
}

function finishReload() {
  const w = WEAPONS[currentWeapon];
  const stock = ammo[currentWeapon];
  if (w) {
    const take = Math.min(w.mag - stock.mag, stock.reserve);
    stock.mag += take;
    stock.reserve -= take;
  }
  reloading = false;
}

function selectWeapon(index) {
  if (!started || paused || driving || ridingIn || playerDead || chatOpen || garageOpen) return;

  currentWeapon = index === currentWeapon ? -1 : index;
  reloading = false;
  setCharacterGun(player, currentWeapon);
  showMessage(currentWeapon < 0 ? "GUN HOLSTERED" : WEAPONS[currentWeapon].name + " READY");
  announceWeapon();
}

function cycleWeapon(direction) {
  const order = [-1, 0, 1, 2];
  const at = order.indexOf(currentWeapon);
  const next = order[(at + direction + order.length) % order.length];

  if (next === -1) {
    if (currentWeapon !== -1) selectWeapon(currentWeapon);   // holster
  } else if (next !== currentWeapon) {
    selectWeapon(next);
  }
}

/* ---------- health, death and respawn ---------- */

function damagePlayer(amount, source = "") {
  if (playerDead || spawnProtect > 0 || !(amount > 0)) return;

  hp = Math.max(0, hp - amount);
  damageFlash = Math.min(1, damageFlash + .35 + amount / 60);
  sinceDamage = 0;
  if (source) lastAttacker = source;
  if (touchUIActive && navigator.vibrate) navigator.vibrate(30);

  if (hp <= 0) killPlayer();
}

function killPlayer() {
  failMission("YOU DIED");
  playerDead = true;
  deathTimer = 3.5;
  reloading = false;
  clearControls();
  if (driving) setEngineRunning(false);

  wastedText.textContent = "WASTED";
  wastedSub.textContent = lastAttacker ? "KILLED BY " + lastAttacker : "";
  wastedPanel.style.display = "flex";
  socket.emit("player:died", { by: lastAttacker });
}

function resetCombat() {
  hp = MAX_HP;
  playerDead = false;
  damageFlash = 0;
  sinceDamage = 99;
  reloading = false;
  lastAttacker = "";
  WEAPONS.forEach((w, i) => { ammo[i].mag = w.mag; ammo[i].reserve = w.reserve; });
  player.rotation.x = 0;
  if (typeof wastedPanel !== "undefined") wastedPanel.style.display = "none";
}

function respawnPlayer() {
  resetCombat();
  spawnProtect = 3;
  cash = Math.floor(cash * .9);

  driving = false;
  player.visible = true;
  placeCar(SPAWN.carX, SPAWN.carZ, 0);
  player.position.set(SPAWN.playerX, 0, SPAWN.playerZ);
  playerRotation = 0;
  playerGround = 0;
  jumpOffset = 0;
  jumping = false;
  updateVehicleButtons();
  showMessage("YOU RESPAWNED — 10% OF YOUR CASH WAS LOST");
}

/* ---------- pickups ---------- */

const pickups = [];

function createPickups() {
  const white = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
  const green = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
  const orange = new THREE.MeshBasicMaterial({ color: 0xf1a431 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x3a2a10 });

  roadLines.forEach((p, i) => {
    roadLines.forEach((q, j) => {
      if ((i * 3 + j * 5) % 7 !== 0) return;

      const med = true;   // ammo is unlimited now, so every crate is a medkit
      const group = new THREE.Group();
      group.position.set(p + 15, 1.1, q + 15);

      if (med) {
        box(group, 0, 0, 0, .9, .65, .9, white);
        for (const s of [-1, 1]) {
          box(group, 0, 0, s * .46, .5, .14, .03, green);
          box(group, 0, 0, s * .46, .14, .5, .03, green);
        }
      } else {
        box(group, 0, 0, 0, .9, .6, .9, orange);
        box(group, 0, .31, 0, .9, .05, .3, dark);
      }

      scene.add(group);
      pickups.push({
        group, med, active: true, timer: 0, phase: rand(0, 6.28)
      });
    });
  });
}

function updatePickups(dt) {
  const px = player.position.x, pz = player.position.z;
  const time = performance.now() * .003;

  for (const k of pickups) {
    if (!k.active) {
      k.timer -= dt;
      if (k.timer <= 0) {
        k.active = true;
        k.group.visible = true;
      }
      continue;
    }

    k.group.rotation.y += dt * 1.6;
    k.group.position.y = 1.1 + Math.sin(time + k.phase) * .15;

    if (driving || playerDead) continue;

    const dx = k.group.position.x - px;
    const dz = k.group.position.z - pz;
    if (dx * dx + dz * dz > 5.8) continue;

    if (k.med) {
      if (hp >= MAX_HP) continue;
      hp = Math.min(MAX_HP, hp + 50);
      showMessage("MEDKIT +50 HP");
    } else {
      let added = false;
      WEAPONS.forEach((w, i) => {
        const cap = w.reserve * 2;
        if (ammo[i].reserve < cap) {
          ammo[i].reserve = Math.min(cap, ammo[i].reserve + Math.ceil(w.mag * 1.5));
          added = true;
        }
      });
      if (!added) continue;
      showMessage("AMMO COLLECTED");
    }

    k.active = false;
    k.timer = 25;
    k.group.visible = false;
  }
}

/* ---------- combat HUD ---------- */

const combatStyle = document.createElement("style");
combatStyle.textContent = `
#vice-combat{position:fixed;left:50%;bottom:calc(58px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(300px,56vw);z-index:9000;display:none;pointer-events:none;font-family:Arial,sans-serif;color:#fff;text-shadow:0 1px 3px #000}
#vice-speed{display:none;text-align:center;font:italic 900 22px Arial,sans-serif;letter-spacing:1px;margin-bottom:4px}
#vice-speed small{font-size:11px;font-style:normal;opacity:.85;margin-left:5px;letter-spacing:.5px}
#vice-hp-label{display:flex;justify-content:space-between;font-size:11px;font-weight:bold;letter-spacing:1px;margin-bottom:3px}
#vice-hp-track{height:12px;border-radius:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);overflow:hidden}
#vice-hp-fill{height:100%;width:100%;background:#4cd37b}
#vice-weapon{display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:12px;font-weight:bold;letter-spacing:.8px}
#vice-weapon-row{display:flex;gap:6px;margin-top:5px;pointer-events:auto}
.vice-slot{flex:1;min-width:0;height:30px;padding:0;border:2px solid rgba(255,255,255,.6);border-radius:8px;background:rgba(12,24,36,.72);color:#fff;font:900 11px Arial,sans-serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.vice-slot.sel{background:rgba(214,166,46,.92);color:#111;border-color:#fff0a8;text-shadow:none}
.vice-slot.reload{flex:0 0 40px}
#vice-crosshair{position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;z-index:9000;pointer-events:none;display:none}
#vice-crosshair::before,#vice-crosshair::after{content:"";position:absolute;background:rgba(255,255,255,.9);box-shadow:0 0 2px #000}
#vice-crosshair::before{left:10px;top:0;width:2px;height:22px}
#vice-crosshair::after{top:10px;left:0;height:2px;width:22px}
#vice-crosshair.hit::before,#vice-crosshair.hit::after{background:#ff3b30}
#vice-damage{position:fixed;left:0;top:0;right:0;bottom:0;z-index:8999;pointer-events:none;background:radial-gradient(ellipse at center,rgba(255,0,0,0) 45%,rgba(200,0,0,.8) 100%);opacity:0}
#vice-wasted{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483004;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.55);color:#e0392d;font:900 64px Arial,sans-serif;letter-spacing:6px;pointer-events:none;text-shadow:0 3px 12px #000}
#vice-wasted small{font-size:18px;color:#fff;letter-spacing:2px;margin-top:10px}
/* Phones: the health / gun panel and stamina bar share the free space between the joystick and the buttons */
body.vice-touch #vice-combat{width:clamp(130px,calc(100vw - 530px),240px);bottom:calc(52px + env(safe-area-inset-bottom,0px))}
body.vice-touch #vice-bars{top:auto;bottom:calc(12px + env(safe-area-inset-bottom,0px));width:clamp(130px,calc(100vw - 530px),240px)}
body.vice-touch .vice-slot{height:34px;font-size:10px}
body.vice-touch #vice-weapon{font-size:11px}
@media(max-width:700px){#vice-wasted{font-size:40px}}
`;
document.head.appendChild(combatStyle);

const combatPanel = document.createElement("div");
combatPanel.id = "vice-combat";
combatPanel.innerHTML =
  '<div id="vice-speed"></div>' +
  '<div id="vice-hp-label"><span>HEALTH</span><span id="vice-hp-text">100</span></div>' +
  '<div id="vice-hp-track"><div id="vice-hp-fill"></div></div>' +
  '<div id="vice-weapon"><span id="vice-weapon-name"></span><span id="vice-weapon-ammo"></span></div>' +
  '<div id="vice-weapon-row"></div>';
document.body.appendChild(combatPanel);

const speedEl = document.getElementById("vice-speed");
const hpText = document.getElementById("vice-hp-text");
const hpFill = document.getElementById("vice-hp-fill");
const weaponName = document.getElementById("vice-weapon-name");
const weaponAmmo = document.getElementById("vice-weapon-ammo");
const weaponRow = document.getElementById("vice-weapon-row");

// Tap / click buttons for each gun and reload (work with mouse and touch)
const slotButtons = [];

function makeSlotButton(label, action, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  button.className = "vice-slot " + extraClass;
  button.textContent = label;
  // Never keep keyboard focus, otherwise Space would "click" it again
  button.addEventListener("mousedown", event => event.preventDefault());
  button.addEventListener("click", () => {
    action();
    button.blur();
  });
  weaponRow.appendChild(button);
  return button;
}

const SLOT_LABELS = touchCapable
  ? ["1 PST", "2 SMG", "3 SG"]
  : ["1 PISTOL", "2 SMG", "3 SHOTGUN"];

WEAPONS.forEach((w, i) => {
  slotButtons.push(makeSlotButton(SLOT_LABELS[i], () => selectWeapon(i)));
});
makeSlotButton("R", () => startReload(), "reload");

const crosshair = document.createElement("div");
crosshair.id = "vice-crosshair";
document.body.appendChild(crosshair);

const damageOverlay = document.createElement("div");
damageOverlay.id = "vice-damage";
document.body.appendChild(damageOverlay);

const wastedPanel = document.createElement("div");
wastedPanel.id = "vice-wasted";
const wastedText = document.createElement("div");
const wastedSub = document.createElement("small");
wastedPanel.append(wastedText, wastedSub);
document.body.appendChild(wastedPanel);

let lastHpShown = -1;
let lastSpeedLabel = "";
let lastWeaponLabel = "";
let lastCrossState = "";

function updateCombatHud(dt) {
  const show = started && !paused;
  combatPanel.style.display = show ? "block" : "none";
  viewStack.style.display = show && !touchUIActive ? "flex" : "none";
  povButton.classList.toggle("on", firstPerson);
  updateViewModel(dt);

  if (show && !viewHintShown && !touchUIActive) {
    viewHintShown = true;
    showMessage("DRAG = ROTATE VIEW  •  WHEEL = ZOOM  •  P = FIRST PERSON  •  K = SEAT");
  }

  damageFlash = Math.max(0, damageFlash - dt * 1.4);
  hitMarker = Math.max(0, hitMarker - dt);

  if (!show) {
    crosshair.style.display = "none";
    damageOverlay.style.opacity = "0";
    return;
  }

  // Speed (and seat number) above the health bar while in a vehicle
  const speedHost = ridingIn ? remotePlayers.get(ridingIn.driverId) : null;
  const inCar = driving || !!speedHost;
  const speedKmh = inCar
    ? Math.round(Math.abs(speedHost ? speedHost.speed : carSpeed) * 3.6) : -1;
  const seatNumber = ridingIn ? ridingIn.seat : mySeat;
  const seatCount = speedHost
    ? ((speedHost.vehicle.userData.seats || []).length || 1)
    : ((car.userData.seats || []).length || 1);
  const speedLabel = speedKmh + "|" + seatNumber + "|" + seatCount;

  if (speedLabel !== lastSpeedLabel) {
    lastSpeedLabel = speedLabel;
    speedEl.style.display = speedKmh >= 0 ? "block" : "none";
    if (speedKmh >= 0) {
      speedEl.innerHTML = speedKmh + "<small>KM/H</small>" +
        (seatCount > 1 ? "<small>SEAT " + (seatNumber + 1) + "/" + seatCount + "</small>" : "");
    }
  }

  const shownHp = Math.ceil(hp);
  if (shownHp !== lastHpShown) {
    lastHpShown = shownHp;
    hpText.textContent = shownHp;
    hpFill.style.width = Math.max(0, hp) + "%";
    hpFill.style.background = hp > 60 ? "#4cd37b" : hp > 30 ? "#f0b429" : "#e0483a";
  }

  let nameLabel, ammoLabel;
  if (currentWeapon < 0) {
    nameLabel = "UNARMED";
    ammoLabel = touchUIActive ? "" : "[1-3] DRAW";
  } else {
    const stock = ammo[currentWeapon];
    nameLabel = WEAPONS[currentWeapon].name;
    ammoLabel = reloading
      ? "RELOADING..."
      : stock.mag + " / " + (stock.reserve === Infinity ? "∞" : stock.reserve);
  }

  const label = nameLabel + "|" + ammoLabel + "|" + currentWeapon;
  if (label !== lastWeaponLabel) {
    lastWeaponLabel = label;
    weaponName.textContent = nameLabel;
    weaponAmmo.textContent = ammoLabel;
    slotButtons.forEach((b, i) => b.classList.toggle("sel", i === currentWeapon));
  }

  const aiming = currentWeapon >= 0 && !driving && !playerDead;
  const crossState = aiming ? (hitMarker > 0 ? "hit" : "on") : "off";
  if (crossState !== lastCrossState) {
    lastCrossState = crossState;
    crosshair.style.display = aiming ? "block" : "none";
    crosshair.classList.toggle("hit", crossState === "hit");
  }

  const lowHealth = hp < 25 && !playerDead ? .25 + Math.sin(performance.now() * .006) * .1 : 0;
  damageOverlay.style.opacity = String(Math.min(1, Math.max(damageFlash, lowHealth)));
}

/* ---------- per-frame combat update ---------- */

function updateCombat(dt) {
  sinceDamage += dt;
  spawnProtect = Math.max(0, spawnProtect - dt);
  vehicleHitCooldown = Math.max(0, vehicleHitCooldown - dt);
  fireCooldown = Math.max(0, fireCooldown - dt);

  // Keep other players up to date (also helps people who join later)
  weaponAnnounceTimer -= dt;
  if (weaponAnnounceTimer <= 0) {
    weaponAnnounceTimer = 5;
    if (currentWeapon >= 0) announceWeapon();
    announceSeat();
  }
  flushNetHits(dt);

  // Body falls over when dead, stands up again afterwards
  const lying = playerDead && !driving ? -1.5 : 0;
  player.rotation.x += (lying - player.rotation.x) * Math.min(1, dt * 8);

  if (playerDead) {
    deathTimer -= dt;
    if (deathTimer <= 0) respawnPlayer();
    return;
  }

  if (reloading) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) finishReload();
  }

  // Slow health regeneration when out of trouble
  if (sinceDamage > 10 && hp < MAX_HP) hp = Math.min(MAX_HP, hp + 2 * dt);

  // Firing
  const locked = chatOpen || garageOpen;
  const held = !locked && (controls.fire || !!keys["f"]);

  if (currentWeapon >= 0 && !driving && !ridingIn) {
    const w = WEAPONS[currentWeapon];
    const wants = w.auto ? held : (held && !firePrev);

    if (wants && fireCooldown <= 0) {
      if (reloading) {
        // Trigger pulled with an empty gun while reloading
        if (!firePrev && ammo[currentWeapon].mag === 0) {
          playDryClick();
          fireCooldown = .3;
        }
      } else if (ammo[currentWeapon].mag > 0) {
        playerFire();
      } else {
        startReload();
      }
    }
  }
  firePrev = held;

  // Driving into pedestrians hurts them
  carHitSpeed = Math.max(Math.abs(carSpeed), carHitSpeed * Math.max(0, 1 - 6 * dt));
  if (driving && carHitSpeed > 5) {
    const reach = CAR_RADIUS + PEDESTRIAN_RADIUS + .5;
    for (const p of pedestrians) {
      if (p.dead) continue;
      const dx = p.mesh.position.x - car.position.x;
      const dz = p.mesh.position.z - car.position.z;
      if (dx * dx + dz * dz < reach * reach) damagePedestrian(p, carHitSpeed * 6);
    }
  }

  // Traffic running into the player on foot
  if (!driving && vehicleHitCooldown <= 0) {
    for (const t of traffic) {
      const dx = t.mesh.position.x - player.position.x;
      const dz = t.mesh.position.z - player.position.z;
      const reach = TRAFFIC_RADIUS + PLAYER_RADIUS + .4;
      if (t.speed > 6 && dx * dx + dz * dz < reach * reach) {
        damagePlayer(t.speed * 1.4, "TRAFFIC");
        vehicleHitCooldown = .8;
        break;
      }
    }
  }

  updatePickups(dt);
}

// Mouse: click to shoot, wheel to change weapon
renderer.domElement.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse" && event.button === 0) controls.fire = true;
});
window.addEventListener("pointerup", event => {
  if (event.pointerType === "mouse") controls.fire = false;
});
// Mouse wheel zooms (Shift + wheel changes weapon)
renderer.domElement.addEventListener("wheel", event => {
  if (!started || paused || chatOpen || garageOpen) return;
  event.preventDefault();

  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;

  if (event.shiftKey && !driving) cycleWeapon(delta > 0 ? 1 : -1);
  else zoomBy(delta > 0 ? 1.12 : .89);
}, { passive: false });

/* =========================================================
   NETWORK EVENTS — SHOTS, HITS, GUNS AND SEATS
   Sent both as dedicated events and as hidden chat messages, so they reach
   other players even when the server only relays chat.
   ========================================================= */

const NET_PREFIX = "~vc~";
let relayConfirmed = false;           // true once a dedicated relay event has arrived
const seenNet = [];
let netLastShot = 0;
const pendingHits = new Map();
let hitFlushTimer = 0;
let weaponAnnounceTimer = 5;

function netNumbers(key, value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function netSend(type, payload, dedicatedEvent) {
  if (!socket.connected || !myPlayerId) return;

  const uid = Math.random().toString(36).slice(2, 8);

  if (dedicatedEvent) socket.emit(dedicatedEvent, { ...payload, uid });

  if (!relayConfirmed) {
    const body = JSON.stringify({ u: uid, f: myPlayerId, t: type, ...payload }, netNumbers);
    socket.emit("chat:message", NET_PREFIX + body);
  }

  return uid;
}

function netShot(x, y, z, angle, length, weapon) {
  const now = performance.now();
  if (now - netLastShot < 140) return;
  netLastShot = now;
  netSend("s", { x, y, z, a: angle, l: length, w: weapon }, "player:shoot");
}

function netHit(targetId, damage, weapon) {
  const entry = pendingHits.get(targetId) || { damage: 0, weapon };
  entry.damage += damage;
  pendingHits.set(targetId, entry);
  if (hitFlushTimer <= 0) hitFlushTimer = .12;
}

function flushNetHits(dt) {
  if (hitFlushTimer <= 0) return;
  hitFlushTimer -= dt;
  if (hitFlushTimer > 0) return;

  for (const [targetId, entry] of pendingHits) {
    const damage = Math.round(entry.damage);
    if (damage <= 0) continue;

    const uid = netSend("h", { to: targetId, d: damage, w: entry.weapon });
    socket.emit("player:hit", { targetId, damage, weapon: WEAPONS[entry.weapon]?.id, uid });
  }
  pendingHits.clear();
}

function announceWeapon() {
  netSend("w", { w: currentWeapon }, "player:weapon");
}

function announceSeat() {
  if (ridingIn) netSend("t", { d: ridingIn.driverId, s: ridingIn.seat }, "player:seat");
  else if (driving && mySeat !== 0) netSend("t", { d: myPlayerId, s: mySeat }, "player:seat");
}

function announceState() {
  announceWeapon();
  announceSeat();
}

function remoteNameById(id) {
  const remote = remotePlayers.get(id);
  return remote ? String(remote.name || "PLAYER").toUpperCase() : "ANOTHER PLAYER";
}

// A tracer, muzzle flash and (distance-scaled) gunshot from another player
function showRemoteShot(x, y, z, angle, length, weapon) {
  const dx = Math.sin(angle), dz = Math.cos(angle);
  spawnTracer(x, y, z, dx, dz, length);
  spawnImpact(x, y, z, "spark");

  const dist = Math.hypot(camera.position.x - x, camera.position.z - z);
  const volume = Math.pow(clamp(1 - dist / 150, 0, 1), 1.5);

  if (volume > .04 && WEAPONS[weapon]) {
    sfxVolume = volume;
    playGunSound(weapon);
    sfxVolume = 1;
  }
}

function handleNet(type, msg) {
  const from = msg.f;

  if (type === "s") {
    if (![msg.x, msg.y, msg.z, msg.a, msg.l].every(Number.isFinite)) return;
    showRemoteShot(msg.x, msg.y, msg.z, msg.a, clamp(msg.l, .5, 150), msg.w);
  } else if (type === "h") {
    if (msg.to === myPlayerId && Number.isFinite(msg.d)) {
      damagePlayer(clamp(msg.d, 0, 80), remoteNameById(from));
    }
  } else if (type === "w") {
    const remote = remotePlayers.get(from);
    if (remote && Number.isFinite(msg.w)) remote.weapon = msg.w;
  } else if (type === "t") {
    if (!msg.d) {
      seated.delete(from);
    } else {
      seated.set(from, { driverId: msg.d, seat: Number(msg.s) || 0 });
      if (msg.d === myPlayerId && from !== myPlayerId) {
        showMessage(remoteNameById(from) + " GOT IN YOUR VEHICLE");
      }
    }
  }
}

function handleChatNet(data) {
  let msg;
  try {
    msg = JSON.parse(String(data.message).slice(NET_PREFIX.length));
  } catch (error) {
    return;
  }

  if (!msg || msg.f === myPlayerId || relayConfirmed) return;

  if (msg.u) {
    if (seenNet.includes(msg.u)) return;
    seenNet.push(msg.u);
    if (seenNet.length > 80) seenNet.shift();
  }

  handleNet(msg.t, msg);
}

// Dedicated events (when the server relays them)
function handleDedicated(type, data) {
  if (!data || data.id === myPlayerId) return;
  relayConfirmed = true;

  if (data.uid) {
    if (seenNet.includes(data.uid)) return;
    seenNet.push(data.uid);
    if (seenNet.length > 80) seenNet.shift();
  }

  handleNet(type, data);
}

socket.on("player:shot", data => {
  if (!data) return;
  const angle = Number.isFinite(data.a) ? data.a : Math.atan2(data.dx, data.dz);
  handleDedicated("s", { ...data, a: angle, l: data.len ?? data.l, w: data.weapon ?? data.w, f: data.id });
});

socket.on("player:damaged", data => {
  if (!data || !Number.isFinite(data.damage)) return;
  relayConfirmed = true;
  damagePlayer(clamp(data.damage, 0, 80), remoteNameById(data.by));
});

socket.on("player:hit", data => {
  // Fallback if the server simply relays hits to everyone
  if (!data || data.targetId !== myPlayerId || !Number.isFinite(data.damage)) return;
  relayConfirmed = true;
  damagePlayer(clamp(data.damage, 0, 80), remoteNameById(data.by || data.id));
});

socket.on("player:weapon", data => {
  if (data) handleDedicated("w", { ...data, f: data.id || data.f, w: data.weapon ?? data.w });
});

socket.on("player:seat", data => {
  if (data) handleDedicated("t", { ...data, f: data.id || data.f, d: data.driver ?? data.d, s: data.seat ?? data.s });
});

createPickups();

/* =========================================================
   VIEW CONTROLS — ZOOM, FIRST PERSON, MOUSE LOCK, TOUCH LOOK
   ========================================================= */

const viewStyle = document.createElement("style");
viewStyle.textContent = `
#vice-view-stack{position:fixed;left:10px;top:50%;transform:translateY(-50%);display:none;flex-direction:column;gap:6px;z-index:9000}
.vice-view-btn{width:50px;min-height:36px;padding:4px 2px;border:1px solid rgba(255,255,255,.6);border-radius:8px;background:rgba(12,24,36,.78);color:#fff;font:bold 10px/1.2 Arial,sans-serif;cursor:pointer;touch-action:manipulation}
.vice-view-btn.on{background:rgba(214,166,46,.92);color:#111}
body.vice-touch #vice-view-stack{display:none!important}
`;
document.head.appendChild(viewStyle);

const viewStack = document.createElement("div");
viewStack.id = "vice-view-stack";
document.body.appendChild(viewStack);

function makeViewButton(html, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  button.className = "vice-view-btn";
  button.innerHTML = html;
  button.addEventListener("mousedown", event => event.preventDefault());
  button.addEventListener("click", () => {
    action();
    button.blur();
  });
  viewStack.appendChild(button);
  return button;
}

const povButton = makeViewButton("VIEW<br>[P]", () => togglePOV());
makeViewButton("ZOOM<br>+", () => zoomBy(.8));
makeViewButton("ZOOM<br>−", () => zoomBy(1.25));
const lockButton = makeViewButton("LOCK<br>MOUSE [L]", () => toggleMouseLock());

if (!renderer.domElement.requestPointerLock) lockButton.style.display = "none";

// First-person gun shown in front of the camera
scene.add(camera);
const fpMount = new THREE.Group();
fpMount.position.set(.28, -.26, -.75);
camera.add(fpMount);
let fpGunIndex = -2;
let fpGunMesh = null;

function updateViewModel(dt) {
  const wanted = firstPerson && !driving && currentWeapon >= 0 && !playerDead
    ? currentWeapon : -1;

  if (wanted !== fpGunIndex) {
    if (fpGunMesh) { fpMount.remove(fpGunMesh); fpGunMesh = null; }
    fpGunIndex = wanted;

    if (wanted >= 0) {
      fpGunMesh = buildGun(wanted);
      fpGunMesh.rotation.y = Math.PI;      // barrel points away from the camera
      fpGunMesh.scale.setScalar(1.3);
      fpMount.add(fpGunMesh);
    }
  }

  fpRecoil *= Math.max(0, 1 - 14 * dt);
  fpMount.position.z = -.75 + fpRecoil;
  fpMount.visible = wanted >= 0;
}

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  lockButton.classList.toggle("on", pointerLocked);
  if (started) {
    showMessage(pointerLocked ? "MOUSE LOCKED — ESC TO RELEASE" : "MOUSE RELEASED");
  }
});

document.addEventListener("mousemove", event => {
  if (!pointerLocked || !started || paused || chatOpen || garageOpen || playerDead) return;
  applyLook(event.movementX, event.movementY);
});

/* Touch: drag on empty screen to look, pinch with two fingers to zoom */
const lookPointers = new Map();
let pinchDistance = 0;

function currentPinchDistance() {
  const points = [...lookPointers.values()];
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

renderer.domElement.addEventListener("pointerdown", event => {
  if (event.pointerType !== "touch") return;
  lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (renderer.domElement.setPointerCapture) renderer.domElement.setPointerCapture(event.pointerId);
  if (lookPointers.size === 2) pinchDistance = currentPinchDistance();
});

renderer.domElement.addEventListener("pointermove", event => {
  const point = lookPointers.get(event.pointerId);
  if (!point || !started || paused || chatOpen || garageOpen) return;

  const dx = event.clientX - point.x;
  const dy = event.clientY - point.y;
  point.x = event.clientX;
  point.y = event.clientY;

  if (lookPointers.size >= 2) {
    const distance = currentPinchDistance();
    if (pinchDistance > 0 && distance > 0) zoomBy(pinchDistance / distance);
    pinchDistance = distance;
  } else if (!playerDead) {
    applyLook(dx * 1.4, dy * 1.4);
  }
});

const endLookPointer = event => {
  lookPointers.delete(event.pointerId);
  pinchDistance = lookPointers.size >= 2 ? currentPinchDistance() : 0;
};
renderer.domElement.addEventListener("pointerup", endLookPointer);
renderer.domElement.addEventListener("pointercancel", endLookPointer);

let viewHintShown = false;

/* Desktop: drag with the right mouse button (or the left one when no gun is
   drawn) to rotate the view freely, no mouse lock needed. */
let mouseDrag = null;

function isLookDragging() {
  return lookPointers.size > 0 || mouseDrag !== null;
}

renderer.domElement.addEventListener("contextmenu", event => event.preventDefault());

renderer.domElement.addEventListener("pointerdown", event => {
  if (event.pointerType !== "mouse" || pointerLocked) return;

  const rotate = event.button === 2 || event.button === 1 ||
    (event.button === 0 && (currentWeapon < 0 || driving || ridingIn));

  if (rotate) {
    mouseDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (renderer.domElement.setPointerCapture) renderer.domElement.setPointerCapture(event.pointerId);
  }
});

renderer.domElement.addEventListener("pointermove", event => {
  if (!mouseDrag || event.pointerId !== mouseDrag.id) return;
  if (!started || paused || chatOpen || garageOpen || playerDead) return;

  applyLook(event.clientX - mouseDrag.x, event.clientY - mouseDrag.y);
  mouseDrag.x = event.clientX;
  mouseDrag.y = event.clientY;
});

const endMouseDrag = event => {
  if (mouseDrag && event.pointerId === mouseDrag.id) mouseDrag = null;
};
renderer.domElement.addEventListener("pointerup", endMouseDrag);
renderer.domElement.addEventListener("pointercancel", endMouseDrag);

/* =========================================================
   SEATS — SEVERAL PEOPLE IN ONE VEHICLE
   ========================================================= */

let mySeat = 0;                 // seat number in my own car (0 = driver)
let ridingIn = null;            // { driverId, seat } while I am a passenger in someone else's car
const seated = new Map();       // playerId -> { driverId, seat } for the other players

// Who is sitting where in my car (other players)
function occupiedSeatsOf(driverId) {
  const taken = new Set();
  const host = remotePlayers.get(driverId);

  const hostEntry = seated.get(driverId);
  taken.add(hostEntry && hostEntry.driverId === driverId ? hostEntry.seat : 0);
  if (driverId === myPlayerId) taken.add(mySeat);
  if (host && host.driving === false && driverId !== myPlayerId) taken.add(0);

  for (const entry of seated.values()) {
    if (entry.driverId === driverId) taken.add(entry.seat);
  }

  if (ridingIn && ridingIn.driverId === driverId) taken.add(ridingIn.seat);
  return taken;
}

function cycleSeat() {
  if (!driving || !started || paused) return;

  const seats = car.userData.seats || [];
  if (seats.length < 2) {
    showMessage("THIS VEHICLE HAS ONE SEAT");
    return;
  }

  const taken = occupiedSeatsOf(myPlayerId);
  taken.delete(mySeat);

  for (let i = 1; i <= seats.length; i++) {
    const candidate = (mySeat + i) % seats.length;
    if (!taken.has(candidate)) {
      mySeat = candidate;
      break;
    }
  }

  showMessage(mySeat === 0 ? "DRIVER SEAT" : "PASSENGER SEAT " + (mySeat + 1) + "/" + seats.length + " — PRESS K TO RETURN");
  announceSeat();
  if (mySeat === 0) netSend("t", { d: 0, s: 0 }, "player:seat");
}

function findBoardableRemote() {
  let best = null;

  for (const remote of remotePlayers.values()) {
    if (!remote.driving) continue;
    const dist = Math.hypot(
      remote.root.position.x - player.position.x,
      remote.root.position.z - player.position.z
    );
    if (dist < 9 && (!best || dist < best.dist)) best = { remote, dist };
  }

  return best;
}

function boardRemoteVehicle(remote) {
  const seats = remote.vehicle.userData.seats || [];
  const taken = occupiedSeatsOf(remote.id);

  let seat = -1;
  for (let i = 0; i < seats.length; i++) {
    if (!taken.has(i)) { seat = i; break; }
  }

  if (seat < 0) {
    showMessage("THIS VEHICLE IS FULL");
    return;
  }

  ridingIn = { driverId: remote.id, seat };
  jumping = false;
  jumpOffset = 0;
  sprinting = false;
  playerSpeedNow = 0;
  strafeNow = 0;
  player.visible = false;
  announceSeat();
  showMessage("RIDING WITH " + remoteNameById(remote.id) + " — SEAT " + (seat + 1) + "  (E TO GET OUT)");
}

function leaveSeat(auto = false) {
  if (!ridingIn) return;

  const host = remotePlayers.get(ridingIn.driverId);
  ridingIn = null;
  netSend("t", { d: 0, s: 0 }, "player:seat");

  let x = player.position.x, z = player.position.z;

  if (host) {
    const yaw = host.root.rotation.y;
    const spot = findFreeSpot(
      host.root.position.x + Math.cos(yaw) * 3.8,
      host.root.position.z - Math.sin(yaw) * 3.8,
      PLAYER_RADIUS
    );
    if (spot) { x = spot[0]; z = spot[1]; }
  }

  playerGround = groundHeightAt(x, z);
  jumpOffset = 0;
  player.position.set(x, playerGround, z);
  player.visible = true;
  showMessage(auto ? "THE DRIVER LEFT THE VEHICLE" : "YOU GOT OUT");
}

// Drop seat records whose vehicle is no longer being driven
function validateSeats() {
  for (const [id, entry] of [...seated]) {
    if (entry.driverId === id) {
      const remote = remotePlayers.get(id);
      if (!remote || !remote.driving) seated.delete(id);
      continue;
    }

    const host = entry.driverId === myPlayerId ? { driving } : remotePlayers.get(entry.driverId);
    if (!remotePlayers.has(id) || !host || !host.driving) seated.delete(id);
  }

  if (ridingIn) {
    const host = remotePlayers.get(ridingIn.driverId);
    if (!host || !host.driving) leaveSeat(true);
  }
}

// Where (and in which vehicle) this remote player is sitting, if anywhere
function seatTarget(remote) {
  const entry = seated.get(remote.id);

  if (remote.driving) {
    const index = entry && entry.driverId === remote.id ? entry.seat : 0;
    const seats = remote.vehicle.userData.seats;
    return seats && seats[index] ? { parent: remote.vehicle, seat: seats[index], index } : null;
  }

  if (!entry || entry.driverId === remote.id) return null;

  const hostIsMe = entry.driverId === myPlayerId;
  const host = hostIsMe ? { driving, vehicle: car } : remotePlayers.get(entry.driverId);
  if (!host || !host.driving) return null;

  const seats = host.vehicle.userData.seats;
  return seats && seats[entry.seat]
    ? { parent: host.vehicle, seat: seats[entry.seat], index: entry.seat }
    : null;
}

// Puts the avatar into its seat (inside the vehicle model) or back on foot
function layoutRemoteSeat(remote) {
  const target = seatTarget(remote);
  const d = remote.avatar.userData;

  if (!target) {
    if (d.seated) {
      d.seated = false;
      if (remote.avatar.parent !== remote.root) remote.root.add(remote.avatar);
      remote.avatar.position.set(0, 0, 0);
      remote.avatar.rotation.set(0, 0, 0);
      if (d.gun) d.gun.visible = true;
    }
    return;
  }

  if (remote.avatar.parent !== target.parent) target.parent.add(remote.avatar);

  remote.avatar.position.set(target.seat[0], target.seat[1] - 1.33, target.seat[2]);
  remote.avatar.rotation.set(0, 0, 0);
  remote.avatar.visible = true;
  d.seated = true;
  d.seatIndex = target.index;
  if (d.gun) d.gun.visible = false;
  animateCharacter(remote.avatar, .016, false, 0);
}

/* =========================================================
   PERFORMANCE — AUTOMATIC GRAPHICS QUALITY (LOW-END PCs)
   ========================================================= */

const QUALITY_NAMES = ["LOW", "MEDIUM", "HIGH"];
let quality = 2;
let qualityLocked = false;
let fpsAverage = 60;
let lowFpsTime = 0;

let pixelRatioBase = 1;
let renderScale = 1;
let highFpsTime = 0;

function applyPixelRatio() {
  pixelRatio = pixelRatioBase * renderScale;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
}

function applyQuality(level) {
  quality = level;
  const high = level === 2;
  const mid = level === 1;

  camera.far = high ? 1200 : mid ? 850 : 560;
  camera.updateProjectionMatrix();

  fogCapNear = high ? 260 : mid ? 200 : 130;
  fogCapFar = camera.far * .95;
  skyDome.scale.setScalar(camera.far * .95 / 1150);

  for (const bird of skyBirds) bird.visible = high;
  for (const cloud of skyClouds) cloud.visible = level > 0;

  pixelRatioBase = level === 0 ? (touchCapable ? .8 : .75) : Math.min(devicePixelRatio || 1, 1);
  applyPixelRatio();
}

function cycleQuality() {
  qualityLocked = true;
  applyQuality(quality === 0 ? 2 : quality - 1);
  showMessage("GRAPHICS: " + QUALITY_NAMES[quality] + " (Q TO CHANGE)");
}

function monitorPerformance(raw) {
  if (raw <= 0 || raw > .25) return;

  fpsAverage += (1 / raw - fpsAverage) * .05;

  if (!started) {
    lowFpsTime = 0;
    highFpsTime = 0;
    return;
  }

  // Sharpen the picture again when the device has plenty of headroom
  if (fpsAverage > 56 && renderScale < 1) {
    highFpsTime += raw;
    if (highFpsTime > 10) {
      highFpsTime = 0;
      renderScale = Math.min(1, renderScale + .08);
      applyPixelRatio();
    }
  } else {
    highFpsTime = 0;
  }

  if (qualityLocked) {
    lowFpsTime = 0;
    return;
  }

  if (fpsAverage < 30) {
    lowFpsTime += raw;

    if (lowFpsTime > 3) {
      lowFpsTime = 0;
      fpsAverage = 42;

      // Phones lower the sharpness first (keeps the world detail), then the quality level
      if ((touchCapable || quality === 0) && renderScale > .62) {
        renderScale = Math.max(.6, renderScale - .12);
        applyPixelRatio();
        showMessage("SHARPNESS LOWERED FOR SMOOTHER PLAY");
      } else if (quality > 0) {
        applyQuality(quality - 1);
        showMessage("PERFORMANCE MODE: " + QUALITY_NAMES[quality]);
      }
    }
  } else {
    lowFpsTime = 0;
  }
}

// Weaker machines start on MEDIUM; the game drops further if FPS stays low.
const weakDevice =
  (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
applyQuality(touchCapable ? (weakDevice ? 0 : 1) : (weakDevice ? 1 : 2));

let minimapTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const raw = clock.getDelta();
  const dt = Math.min(raw, .05);

  monitorPerformance(raw);
  if (quality > 0) updateSky(dt);
  skyDome.position.set(camera.position.x, 0, camera.position.z);
  updateWeather(dt);

  // Floating billboard hover + drone rotors
  if (window.floatingBillboards) {
    for (const bb of window.floatingBillboards) {
      bb.userData.hoverTime += dt * 1.4;
      bb.position.y = (bb.userData.baseY ?? 38) + Math.sin(bb.userData.hoverTime) * 1.6;
      bb.rotation.y = Math.sin(bb.userData.hoverTime * 0.3) * 0.04;
      if (bb.userData.drones) {
        for (const d of bb.userData.drones) {
          for (const r of d.rotors) r.rotation.y += dt * 28;
        }
      }
    }
  }

  updateVehicleAudio();

  if (started && !paused) {
    // Physics runs in small fixed steps so movement stays smooth and
    // stable even when the frame rate drops on slower devices.
    const steps = Math.min(3, Math.max(1, Math.ceil(dt * 60 - .15)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      updatePlayer(h);
      updateJump(h);
      updateCar(h);
    }

    updateTraffic(dt);
    updatePedestrians(dt);
    updateRemotePlayers(dt);
    updateCamera(dt);

    updateCombat(dt);
    updateEffects(dt);
    updateMission(dt);
    updateVilla(dt);
    updateHUD(dt);
    updateCombatHud(dt);
    sendPlayerUpdate(dt);

    minimapTimer += dt;

    if (minimapTimer >= (touchUIActive ? .2 : .125)) {
      drawMinimap();
      minimapTimer = 0;
    }
  }

  updateTouchUI();
  renderer.render(scene, camera);
}

updateConnection(false);
updatePlayerCount();
animate();
