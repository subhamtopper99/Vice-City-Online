import * as THREE from "https://esm.sh/three@0.160.0";

/* =========================================================
   VICE CITY — UPDATE 29
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

// Heights of each surface type (0 road, 1 curb, 2 lot grass, 3 park grass)
const GROUND_HEIGHT = [0, .235, -.28, .29];

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

function makeInstanced(geo, material, items) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  const d = new THREE.Object3D();
  items.forEach(([x, y, z, sx, sy, sz], i) => {
    d.position.set(x, y, z);
    d.scale.set(sx, sy, sz);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
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

const parkGrassItems = [];
const parkPathItems = [];
const parkTrunkItems = [];
const parkCrownItems = [];

function createPark(x, z) {
  parks.push({ x, z });
  parkGrassItems.push([x, -.35, z, 125, .4, 125]);
  parkPathItems.push([x, -.12, z, 8, .08, 105], [x, -.11, z, 105, .08, 8]);

  for (let i = 0; i < 8; i++) {
    const tx = x + rand(-48, 48);
    const tz = z + rand(-48, 48);
    parkTrunkItems.push([tx, 4, tz, 1.2, 8, 1.2]);
    parkCrownItems.push([tx, 9, tz, 5, 5, 5]);
  }
}

const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x66696b });
const roofDetailMaterial = new THREE.MeshLambertMaterial({ color: 0x8c9094 });

// Every building is added to one big mesh per material (2 - 9 draw calls
// for the whole city instead of one per building).
const buildingBatches = new Map();
const roofBatch = { positions: [], normals: [], uvs: [], indices: [], count: 0 };
const roofDetailItems = [];

function batchFor(material) {
  if (!buildingBatches.has(material)) {
    buildingBatches.set(material, { positions: [], normals: [], uvs: [], indices: [], count: 0 });
  }
  return buildingBatches.get(material);
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

function createBuilding(x, z, w, d, h, material) {
  // Snap sizes so whole window columns and floors fit the facade texture.
  w = Math.max(18, Math.round(w / 6) * 6);
  d = Math.max(18, Math.round(d / 6) * 6);
  h = Math.max(12, Math.round(h / 4) * 4);

  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;

  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    const horizontal = face < 2 ? d : w;
    uv.setXY(i, uv.getX(i) * horizontal / 24, uv.getY(i) * h / 32);
  }

  const centerY = h / 2 - .25;
  addFaces(batchFor(material), geo, [0, 1, 4, 5], x, centerY, z);   // walls
  addFaces(roofBatch, geo, [2], x, centerY, z);                     // roof
  geo.dispose();

  buildings.push({ x, z, width: w, depth: d, height: h });

  const roofY = h - .25;

  if (h > 28) {
    const units = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < units; i++) {
      roofDetailItems.push([
        x + rand(-w * .3, w * .3), roofY + .9, z + rand(-d * .3, d * .3),
        rand(2.5, 4.5), 1.8, rand(2.5, 4.5)
      ]);
    }
  }

  if (h > 100 && Math.random() > .4) {
    roofDetailItems.push([x, roofY + 6, z, .5, 12, .5]);   // antenna
  }
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

  for (const [material, batch] of buildingBatches) build(batch, material);
  build(roofBatch, roofMaterial);

  makeInstancedBoxes(roofDetailMaterial, roofDetailItems);
  makeInstancedBoxes(mat.grass, parkGrassItems);
  makeInstancedBoxes(mat.sidewalk, parkPathItems);
  makeInstanced(cylinderGeo, mat.trunk, parkTrunkItems);
  makeInstanced(sphereGeo, mat.tree, parkCrownItems);
}

function createCity() {
  const S = CONFIG.ROAD_SPACING;
  const L = CONFIG.CITY_LIMIT;

  for (let gx = -L + 100; gx < L; gx += S) {
    for (let gz = -L + 100; gz < L; gz += S) {
      const n = Math.abs(
        Math.floor(gx / S) * 7 + Math.floor(gz / S) * 11
      );

      if (n % 13 === 0) {
        createPark(gx, gz);
        continue;
      }

      const downtown = Math.abs(gx) < 300 && Math.abs(gz) < 300;

      for (let i = 0; i < (downtown ? 3 : 2); i++) {
        createBuilding(
          gx + rand(-48, 48),
          gz + rand(-48, 48),
          rand(35, 65),
          rand(35, 65),
          downtown ? rand(90, 210) : rand(22, 75),
          pick(buildingMaterials)
        );
      }
    }
  }

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
    glass: M(0x183746, { specular: 0x99bbcc, shininess: 100 }),
    rubber: new THREE.MeshLambertMaterial({ color: 0x101214 }),
    alloy: M(0xb9c2c8, { specular: 0xffffff, shininess: 90 })
  };
}

const carMatsRich = makeCarMaterials(true);
const carMatsBasic = makeCarMaterials(false);
const carLampMat = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
const plateMat = new THREE.MeshLambertMaterial({ color: 0xeeeeea });

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

// mirror x/y/z, plate y, front plate z, rear plate z
const CAR_DETAIL = {
  sport:    { mirror: [1.24, 1.38, .75], plateY: .78, front: 2.26, rear: -2.24, tailZ: -2.3 },
  supercar: { mirror: [1.2, 1.12, .75],  plateY: .66, front: 2.3,  rear: -2.29, tailZ: -2.3 },
  suv:      { mirror: [1.4, 1.95, .95],  plateY: .95, front: 2.45, rear: -2.4,  tailZ: -2.45 },
  sedan:    { mirror: [1.28, 1.65, .8],  plateY: .9,  front: 2.46, rear: -2.43, tailZ: -2.45 },
  jeep:     { mirror: [1.35, 1.9, 1.1],  plateY: 1.1, front: 2.31, rear: -2.21, tailZ: -2.3 }
};

function createCar(color = 0xe33b2e, style = "sport", rich = false) {
  const car = new THREE.Group();
  car.rotation.order = "YXZ";   // yaw first, then pitch / roll
  const spec = VEHICLES[style] || VEHICLES.sport;
  const detail = CAR_DETAIL[style] || CAR_DETAIL.sport;

  const paint = rich
    ? new THREE.MeshPhongMaterial({ color, specular: 0x555555, shininess: 70 })
    : new THREE.MeshLambertMaterial({ color });

  const M = rich ? carMatsRich : carMatsBasic;
  const { dark, glass, rubber, alloy } = M;
  const lamp = carLampMat;
  const redLamp = new THREE.MeshBasicMaterial({ color: TAIL_DIM });

  const wheels = [];
  const frontWheels = [];

  function part(x, y, z, sx, sy, sz, material) {
    return box(car, x, y, z, sx, sy, sz, material);
  }

  function addWheel(x, z, radius = .43, width = .28) {
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
  }

  if (style === "sport") {
    part(0, .83, 0, 2.38, .55, 4.45, paint);
    part(0, 1.04, 1.35, 2.25, .27, 1.45, paint);
    part(0, 1, -1.55, 2.32, .28, 1.18, paint);
    part(0, 1.65, -.12, 1.75, .65, 1.8, glass);
    part(0, 2, -.12, 1.8, .12, 1.9, paint);
    for (const s of [-1, 1]) {
      part(s * .91, 1.42, -.12, .1, .45, 1.8, paint);
      part(s * .78, 1.06, 2.15, .45, .13, .08, lamp);
      part(s * .82, 1.04, -2.13, .5, .14, .08, redLamp);
    }
    part(0, .63, 2.3, 2.3, .12, .2, dark);
    for (const x of [-1.2, 1.2]) {
      for (const z of [-1.5, 1.48]) addWheel(x, z, .43, .29);
    }
  } else if (style === "supercar") {
    part(0, .68, 0, 2.35, .42, 4.55, paint);
    part(0, .75, 1.45, 2.2, .25, 1.55, paint);
    part(0, .78, -1.62, 2.3, .34, 1.25, paint);
    part(0, 1.46, -.12, 1.65, .5, 1.65, glass);
    part(0, 1.74, -.12, 1.7, .1, 1.7, paint);
    for (const s of [-1, 1]) {
      part(s * 1.15, .86, -.62, .13, .43, .72, dark);
      part(s * .78, .96, 2.18, .62, .1, .1, lamp);
      part(s * .9, 1.02, -2.17, .24, .12, .07, redLamp);
      part(s * .7, 1.12, -2.0, .08, .34, .12, dark);   // spoiler supports
    }
    part(0, 1.3, -2.0, 2.2, .07, .55, dark);           // spoiler wing
    part(0, .55, -2.24, 2.25, .2, .24, dark);
    for (const x of [-1.18, 1.18]) {
      for (const z of [-1.5, 1.48]) addWheel(x, z, .43, .29);
    }
  } else if (style === "suv") {
    part(0, 1.02, 0, 2.65, .78, 4.75, paint);
    part(0, 1.13, 1.52, 2.58, .42, 1.25, paint);
    part(0, 1.16, -1.68, 2.6, .42, 1.1, paint);
    part(0, 2.03, -.12, 2.1, 1.25, 2.65, glass);
    part(0, 2.7, -.12, 2.16, .16, 2.72, paint);
    for (const s of [-1, 1]) {
      part(s * 1.08, 2.02, -.12, .13, 1, 2.65, paint);
      part(s * 1.13, 1.95, .72, .055, .7, .95, glass);
      part(s * 1.13, 1.95, -.55, .055, .7, .9, glass);
      part(s * .91, 1.5, 2.35, .48, .2, .09, lamp);
      part(s * .95, 1.4, -2.39, .5, .16, .08, redLamp);
    }
    part(0, 1.12, 2.42, 1.45, .5, .06, dark);
    for (const x of [-1.35, 1.35]) {
      for (const z of [-1.52, 1.5]) addWheel(x, z, .53, .34);
    }
  } else if (style === "sedan") {
    part(0, .88, 0, 2.48, .58, 4.8, paint);
    part(0, 1.05, 1.45, 2.4, .3, 1.55, paint);
    part(0, 1.06, -1.68, 2.4, .3, 1.18, paint);
    part(0, 1.72, -.18, 1.9, .95, 2.45, glass);
    part(0, 2.23, -.18, 1.95, .13, 2.5, paint);
    for (const s of [-1, 1]) {
      part(s * .98, 1.7, -.18, .08, .82, 2.45, paint);
      part(s * 1.02, 1.74, .57, .04, .62, .82, glass);
      part(s * 1.02, 1.74, -.48, .04, .62, .82, glass);
    }
    part(0, .76, 2.43, 2.48, .23, .2, dark);
    for (const s of [-1, 1]) {
      part(s * .78, 1.12, 2.23, .48, .14, .09, lamp);
      part(s * .82, 1.08, -2.3, .55, .15, .09, redLamp);
    }
    for (const x of [-1.23, 1.23]) {
      for (const z of [-1.55, 1.52]) addWheel(x, z, .43, .29);
    }
  } else {
    part(0, 1, 0, 2.55, .85, 4.35, paint);
    part(0, 1.22, 1.35, 2.52, .55, 1.25, paint);
    part(0, 1.18, -1.55, 2.5, .5, 1.1, paint);
    part(0, 2.05, -.18, 2.1, 1.25, 2.55, paint);
    part(0, 2.73, -.18, 2.25, .2, 2.9, dark);
    part(0, 2.12, 1.1, 1.95, .83, .1, glass);
    for (const s of [-1, 1]) {
      part(s * 1.08, 2.04, -.2, .12, 1.1, 2.55, dark);
      part(s * 1.12, 1.96, -.5, .06, .7, .9, glass);
      part(s * 1.12, 1.96, .55, .06, .7, .9, glass);
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(.2, .2, .09, 12), lamp
      );
      head.rotation.x = Math.PI / 2;
      head.position.set(s * .85, 1.42, 2.26);
      car.add(head);
      part(s * 1.0, 1.2, -2.19, .4, .16, .06, redLamp);
    }
    part(0, 1.38, 2.23, 1.05, .48, .07, dark);
    for (let i = -3; i <= 3; i++) {
      part(i * .14, 1.38, 2.28, .055, .37, .025, alloy);
    }
    const spare = new THREE.Mesh(
      new THREE.TorusGeometry(.39, .13, 6, 14), rubber
    );
    spare.position.set(0, 1.45, -2.25);
    car.add(spare);
    for (const x of [-1.3, 1.3]) {
      for (const z of [-1.38, 1.42]) addWheel(x, z, .55, .38);
    }
  }

  // Side mirrors and number plates
  for (const s of [-1, 1]) {
    part(s * detail.mirror[0], detail.mirror[1], detail.mirror[2], .22, .16, .1, paint);
  }
  part(0, detail.plateY, detail.front, .62, .2, .04, plateMat);
  part(0, detail.plateY, detail.rear, .62, .2, .04, plateMat);

  // Fake soft shadow under the car
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
      cone.position.set(s * .62, .7, detail.tailZ - .9);
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
  garageOpen = true;
  garagePanel.classList.remove("hidden");
  refreshGarageCards();
  clearControls();
}

function closeGarage() {
  garageOpen = false;
  garagePanel.classList.add("hidden");
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
    type
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
  if (Number.isFinite(data.weapon)) setCharacterGun(remote.avatar, data.weapon);
  remote.speed = Number.isFinite(data.speed) ? data.speed : 0;

  const gender = data.gender === "female" ? "female" : "male";

  if (gender !== remote.gender) {
    remote.root.remove(remote.avatar);
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
      data.vehicleType
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
  return GROUND_HEIGHT[groundType(x, z)];
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

  return false;
}

// Finds the nearest position that is not blocked (spiral search)
function findFreeSpot(x, z, radius) {
  const options = { traffic: true, pedestrians: true };

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
   MISSIONS — 20 CHECKPOINTS
   ========================================================= */

const checkpoints = [];
let checkpointIndex = 0;
let cash = 0;

const missionNames = [
  "FIRST STEPS", "DOWNTOWN RUN", "PARKSIDE ROUTE",
  "SUNSET BOULEVARD", "NORTH DISTRICT", "THE LONG DRIVE",
  "COASTAL LOOP", "CITY CENTRE", "EASTSIDE CHECKPOINT",
  "WEST END RUN", "THE GRAND LOOP", "HARBOR ROAD",
  "UPTOWN VISIT", "CROSS-CITY TRIP", "PALM AVENUE",
  "FINAL STRETCH", "SOUTH DISTRICT", "SKYLINE ROUTE",
  "LAST CHALLENGE", "VICE CITY LEGEND"
];

function createCheckpoints() {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd34d,
    wireframe: true
  });

  for (let i = 0; i < 20; i++) {
    const angle = i / 20 * Math.PI * 2;
    const radius = 220 + (i % 4) * 125;

    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(7, .8, 6, 18),
      material
    );

    let cx = Math.cos(angle) * radius;
    let cz = Math.sin(angle) * radius;

    // Snap onto the nearest road so every checkpoint can be reached
    if (Math.abs(cx - nearestRoadLine(cx)) < Math.abs(cz - nearestRoadLine(cz))) {
      cx = nearestRoadLine(cx);
    } else {
      cz = nearestRoadLine(cz);
    }

    marker.position.set(cx, 3, cz);

    marker.rotation.x = Math.PI / 2;
    scene.add(marker);
    checkpoints.push(marker);
  }
}

function updateCheckpoint() {
  const target = checkpoints[checkpointIndex];
  if (!target) return;

  const position = driving ? car.position : player.position;

  if (position.distanceTo(target.position) < 13) {
    const completed = checkpointIndex + 1;
    cash += 150;

    if (completed === checkpoints.length) {
      checkpointIndex = 0;
      cash += 1000;
      showMessage("MISSION ROUTE COMPLETE +$1,150");
    } else {
      checkpointIndex++;
      showMessage("MISSION COMPLETE +$150");
    }
  }
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
    if (key === "v" || key === "escape") {
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

  if (!driving) {
    if (player.position.distanceTo(car.position) < 9) {
      driving = true;
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
  if (driving) {
    playerSpeedNow = 0;
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
  const turn = locked ? 0 : clamp(
    ((pressed("a", "arrowleft") || controls.left) ? 1 : 0) -
    ((pressed("d", "arrowright") || controls.right) ? 1 : 0) -
    controls.axisX, -1, 1
  );
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
    : backward ? BACK_SPEED : 0) * analog;
  playerSpeedNow += (target - playerSpeedNow) * Math.min(1, dt * (target > playerSpeedNow ? 7 : 11));
  if (playerSpeedNow < .05 && target === 0) playerSpeedNow = 0;

  if (forward || backward) lastMoveSign = forward ? 1 : -1;

  walkDirection.set(Math.sin(playerRotation), 0, Math.cos(playerRotation));
  const dx = walkDirection.x * playerSpeedNow * lastMoveSign * dt;
  const dz = walkDirection.z * playerSpeedNow * lastMoveSign * dt;

  if (playerSpeedNow > 0) {
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
    player, dt, playerSpeedNow > .8, playerSpeedNow / 4, sprinting
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
  const driver = driving && engineRunning && !locked;

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
  const offroad = surface >= 2;

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
  const opts = { traffic: true, pedestrians: true };
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

// All smoothing is frame-rate independent (exp), so it stays smooth at low FPS.
function updateCamera(dt) {
  const target = driving ? car : player;
  const heading = driving ? carRotation : playerRotation;
  const kmh = Math.abs(carSpeed) * 3.6;

  // The camera swings round gently behind the vehicle instead of snapping
  const diff = Math.atan2(
    Math.sin(heading - camHeading), Math.cos(heading - camHeading)
  );
  camHeading += diff * (1 - Math.exp(-(driving ? 6 : 10) * dt));

  const distanceTarget = driving
    ? 14 + Math.min(kmh / 70, 4) + (nitroActive ? 2 : 0)
    : 9.5 + (sprinting ? 1 : 0);
  camDistance += (distanceTarget - camDistance) * (1 - Math.exp(-3 * dt));

  const height = driving ? 6.6 + Math.min(kmh / 150, 1.2) : 5.2;
  const lookHeight = driving ? 1.6 : 1.8;

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

  cameraPosition.set(px, camFocusY + height, pz);
  camera.position.lerp(cameraPosition, 1 - Math.exp(-(driving ? 12 : 10) * dt));

  const shake = camShake + (nitroActive ? .08 : 0);
  if (shake > .01) {
    camera.position.x += (Math.random() - .5) * shake;
    camera.position.y += (Math.random() - .5) * shake * .6;
  }
  camShake *= Math.max(0, 1 - 5 * dt);

  camera.lookAt(cameraTarget);

  const targetFov = 65 + (driving
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

function updateHUD(dt) {
  if (hud.speed) {
    hud.speed.textContent = Math.round(Math.abs(carSpeed) * 3.6);
  }

  if (hud.cash) hud.cash.textContent = "$" + cash;

  if (hud.mode) {
    hud.mode.textContent = driving
      ? (nitroActive ? "NITRO" : "DRIVING")
      : jumping ? "JUMPING" : sprinting ? "SPRINTING" : "ON FOOT";
  }

  if (hud.mission) {
    hud.mission.textContent =
      missionNames[checkpointIndex] || "ROUTE COMPLETE";
  }

  if (hud.progress) {
    hud.progress.textContent =
      `${checkpointIndex + 1} / ${checkpoints.length}`;
  }

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
  const mode = active ? (driving ? "drive" : "foot") : "off";
  const portrait = innerHeight > innerWidth;
  const signature = mode + (engineRunning ? "1" : "0") + (portrait ? "p" : "l") + (started ? "s" : "x");

  if (signature === touchSignature) return;
  touchSignature = signature;

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

  const size = Math.min(innerWidth, innerHeight) < 600 ? 108 : 180;
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
  set("pointer-events", "none");
  set("display", started ? "block" : "none");
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

  // Checkpoints: the active one is larger and brighter
  checkpoints.forEach((p, i) => {
    const active = i === checkpointIndex;
    mapContext.fillStyle = active ? "#fff07a" : "#c79a2c";
    mapContext.beginPath();
    mapContext.arc(
      cx + p.position.x * scale, cy + p.position.z * scale,
      active ? 4 : 2, 0, Math.PI * 2
    );
    mapContext.fill();
  });

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
  updateVehicleButtons();
}

function togglePause() {
  if (!started || chatOpen || garageOpen) return;

  paused = !paused;

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

  cash = 0;
  checkpointIndex = 0;
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
createCheckpoints();

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

  if (d.armed && !d.airborne) {
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
  gain.gain.setValueAtTime(o.gain, when);
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
  gain.gain.setValueAtTime(volume, when);
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
    socket.emit("player:shoot", { x: ox, y: oy, z: oz, dx, dz, len: Math.min(dist, 90), weapon: currentWeapon });

    if (!hit) continue;

    const damage = w.damage * (1 - .6 * (dist / w.range));
    const hx = ox + dx * dist, hz = oz + dz * dist;

    if (hit.kind === "ped") {
      damagePedestrian(hit.ref, damage);
      spawnImpact(hx, oy, hz, "person");
    } else if (hit.kind === "remote") {
      hitMarker = .18;
      socket.emit("player:hit", { targetId: hit.ref.id, damage: Math.round(damage), weapon: w.id });
      spawnImpact(hx, oy, hz, "person");
    } else {
      spawnImpact(hx, oy, hz, hit.kind === "car" ? "spark" : "dust");
    }
  }

  muzzleFlash.position.set(ox, oy, oz);
  muzzleFlash.visible = true;
  muzzleTimer = .05;

  playGunSound(currentWeapon);
  camShake = Math.max(camShake, w.id === "shotgun" ? .35 : .12);
}

function startReload() {
  if (currentWeapon < 0 || reloading || playerDead || driving) return;

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
  if (!started || paused || driving || playerDead || chatOpen || garageOpen) return;

  currentWeapon = index === currentWeapon ? -1 : index;
  reloading = false;
  setCharacterGun(player, currentWeapon);
  showMessage(currentWeapon < 0 ? "GUN HOLSTERED" : WEAPONS[currentWeapon].name + " READY");
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
  '<div id="vice-hp-label"><span>HEALTH</span><span id="vice-hp-text">100</span></div>' +
  '<div id="vice-hp-track"><div id="vice-hp-fill"></div></div>' +
  '<div id="vice-weapon"><span id="vice-weapon-name"></span><span id="vice-weapon-ammo"></span></div>' +
  '<div id="vice-weapon-row"></div>';
document.body.appendChild(combatPanel);

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
let lastWeaponLabel = "";
let lastCrossState = "";

function updateCombatHud(dt) {
  const show = started && !paused;
  combatPanel.style.display = show ? "block" : "none";

  damageFlash = Math.max(0, damageFlash - dt * 1.4);
  hitMarker = Math.max(0, hitMarker - dt);

  if (!show) {
    crosshair.style.display = "none";
    damageOverlay.style.opacity = "0";
    return;
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

  if (currentWeapon >= 0 && !driving) {
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
renderer.domElement.addEventListener("wheel", event => {
  if (started && !paused && !driving && !chatOpen && !garageOpen) {
    event.preventDefault();
    cycleWeapon(event.deltaY > 0 ? 1 : -1);
  }
}, { passive: false });

// Messages from other players (needs the small server relay shown in the notes)
socket.on("player:shot", data => {
  if (!data || ![data.x, data.y, data.z, data.dx, data.dz, data.len].every(Number.isFinite)) return;
  spawnTracer(data.x, data.y, data.z, data.dx, data.dz, data.len);
});

function remoteNameById(id) {
  const remote = remotePlayers.get(id);
  return remote ? String(remote.name || "PLAYER").toUpperCase() : "ANOTHER PLAYER";
}

socket.on("player:damaged", data => {
  if (data && Number.isFinite(data.damage)) {
    damagePlayer(clamp(data.damage, 0, 60), remoteNameById(data.by));
  }
});

socket.on("player:hit", data => {
  // Fallback if the server simply relays hits to everyone
  if (data && data.targetId && data.targetId === myPlayerId && Number.isFinite(data.damage)) {
    damagePlayer(clamp(data.damage, 0, 60), remoteNameById(data.by));
  }
});

createPickups();

/* =========================================================
   PERFORMANCE — AUTOMATIC GRAPHICS QUALITY (LOW-END PCs)
   ========================================================= */

const QUALITY_NAMES = ["LOW", "MEDIUM", "HIGH"];
let quality = 2;
let qualityLocked = false;
let fpsAverage = 60;
let lowFpsTime = 0;

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

  pixelRatio = level === 0 ? (touchCapable ? .7 : .75) : Math.min(devicePixelRatio || 1, 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
}

function cycleQuality() {
  qualityLocked = true;
  applyQuality(quality === 0 ? 2 : quality - 1);
  showMessage("GRAPHICS: " + QUALITY_NAMES[quality] + " (Q TO CHANGE)");
}

function monitorPerformance(raw) {
  if (raw <= 0 || raw > .25) return;

  fpsAverage += (1 / raw - fpsAverage) * .05;

  if (qualityLocked || quality === 0 || !started) {
    lowFpsTime = 0;
    return;
  }

  if (fpsAverage < 32) {
    lowFpsTime += raw;

    if (lowFpsTime > 4) {
      applyQuality(quality - 1);
      lowFpsTime = 0;
      fpsAverage = 45;
      showMessage("PERFORMANCE MODE: " + QUALITY_NAMES[quality]);
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
    updateCheckpoint();
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
