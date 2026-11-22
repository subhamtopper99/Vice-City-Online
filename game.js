import * as THREE from "https://esm.sh/three@0.160.0";

/* =========================================================
   VICE CITY — UPDATE 26
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
  powerPreference: "high-performance"
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

scene.add(new THREE.HemisphereLight(0xd8f0ff, 0x455538, 2.35));

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
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(boxGeo, material, items.length);
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

function createPark(x, z) {
  parks.push({ x, z });
  box(world, x, -.35, z, 125, .4, 125, mat.grass);
  box(world, x, -.12, z, 8, .08, 105, mat.sidewalk);
  box(world, x, -.11, z, 105, .08, 8, mat.sidewalk);

  for (let i = 0; i < 8; i++) {
    const tx = x + rand(-48, 48);
    const tz = z + rand(-48, 48);
    cylinder(world, tx, 4, tz, 1.2, 8, mat.trunk);

    const crown = new THREE.Mesh(sphereGeo, mat.tree);
    crown.position.set(tx, 9, tz);
    crown.scale.set(5, 5, 5);
    world.add(crown);
  }
}

const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x66696b });
const roofDetailMaterial = new THREE.MeshLambertMaterial({ color: 0x8c9094 });

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
  uv.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, [
    material, material, roofMaterial, roofMaterial, material, material
  ]);
  mesh.position.set(x, h / 2 - .25, z);
  world.add(mesh);

  buildings.push({ x, z, width: w, depth: d, height: h });

  const roofY = h - .25;

  if (h > 28) {
    const units = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < units; i++) {
      box(
        world,
        x + rand(-w * .3, w * .3), roofY + .9, z + rand(-d * .3, d * .3),
        rand(2.5, 4.5), 1.8, rand(2.5, 4.5), roofDetailMaterial
      );
    }
  }

  if (h > 100 && Math.random() > .4) {
    cylinder(world, x, roofY + 6, z, .25, 12, roofDetailMaterial);
  }
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
    ctx.roundRect(12, 12, 488, 104, 20);
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

    for (const m of [tire, rim, hub]) {
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
player.position.set(0, 0, 30);

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
}

let selectedVehicleType = "sport";
let car = createCar(VEHICLES.sport.color, selectedVehicleType, true);
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

  let audio = vehicleAudio;
  if (nextState) audio = ensureVehicleAudio();
  engineRunning = nextState;

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
  vehicleControls.style.display = driving && started && !paused ? "flex" : "none";
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
  selectedVehicleType = type;

  const spec = VEHICLES[type];
  car = createCar(spec.color, type, true);

  car.position.set(
    oldPosition.x + Math.sin(oldRotation) * 5,
    0,
    oldPosition.z + Math.cos(oldRotation) * 5
  );

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

const socket = window.io({
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
chatHint.textContent = "ENTER: chat  |  ESC: close";

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
}

function openChat() {
  if (!started || paused || garageOpen) return;
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
  chatInput.focus();
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

addChatLine("VICE CITY", "Welcome! Press ENTER to chat.", true);

/* =========================================================
   ROAD HELPERS
   ========================================================= */

const ROAD_HALF = CONFIG.ROAD_WIDTH / 2;
const TRAFFIC_LANE_OFFSET = 4.5;
const SIDEWALK_OFFSET =
  ROAD_HALF + CONFIG.SIDEWALK_WIDTH / 2 + 1.5;

function nearestRoadLine(value) {
  return clamp(
    Math.round(value / CONFIG.ROAD_SPACING) * CONFIG.ROAD_SPACING,
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
function trafficObstacleAhead(t) {
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

  for (const other of traffic) {
    if (other === t) continue;
    if (test(other.mesh.position.x, other.mesh.position.z, 16, 3)) return true;
  }

  for (const p of pedestrians) {
    if (test(p.mesh.position.x, p.mesh.position.z, 14, 2.4)) return true;
  }

  return false;
}

function updateTraffic(dt) {
  for (const t of traffic) {
    if (!t.cruise) t.cruise = t.speed;

    // Slow down for obstacles ahead, then recover to cruising speed
    const blocked = trafficObstacleAhead(t);
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

    const wheels = t.mesh.userData.wheels;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += t.speed * dt * .9;
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
  const lowerGrid = Math.floor(progress / CONFIG.ROAD_SPACING) *
    CONFIG.ROAD_SPACING;

  const nextIntersection = direction > 0
    ? lowerGrid + CONFIG.ROAD_SPACING
    : lowerGrid;

  const p = {
    mesh: person,
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

function updatePedestrians(dt) {
  for (const p of pedestrians) {
    p.mesh.position[p.axis] += p.speed * p.direction * dt;

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

    animateCharacter(p.mesh, dt, true, p.speed * 1.2);
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

    marker.position.set(
      Math.cos(angle) * radius,
      3,
      Math.sin(angle) * radius
    );

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
  boost: false
};

function clearControls() {
  for (const key in keys) keys[key] = false;
  for (const key in controls) controls[key] = false;
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
  if (key === "r" && !event.repeat && started) restartGame();
  if (key === "h" && !event.repeat) playVehicleHorn();
  if (key === "q" && !event.repeat && started) cycleQuality();

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
      showMessage("VEHICLE ENTERED — PRESS START ENGINE");
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

  const locked = chatOpen || garageOpen;
  const forward = !locked && (pressed("w", "arrowup") || controls.accelerate);
  const backward = !locked && (pressed("s", "arrowdown") || controls.brake);
  const left = !locked && (pressed("a", "arrowleft") || controls.left);
  const right = !locked && (pressed("d", "arrowright") || controls.right);
  const wantSprint = !locked && (pressed("shift") || controls.boost);

  // Turning works even while standing still
  const turn = (left ? 1 : 0) - (right ? 1 : 0);
  const turnRate = (forward || backward ? 2.4 : 2.9) * (sprinting ? .75 : 1);
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
  const target = forward
    ? (sprinting ? SPRINT_SPEED : WALK_SPEED)
    : backward ? BACK_SPEED : 0;
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
}

/* =========================================================
   CAR PHYSICS — GRIP, DRIFT, NITRO, WEIGHT TRANSFER
   ========================================================= */

function updateCar(dt) {
  const spec = car.userData.spec;
  const locked = chatOpen || garageOpen;
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
    steer =
      ((pressed("a", "arrowleft") || controls.left) ? 1 : 0) -
      ((pressed("d", "arrowright") || controls.right) ? 1 : 0);
    handbrake = !!keys[" "];
    wantNitro = pressed("shift", "n") || controls.boost;
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

  const nx = car.position.x + carVel.x * dt;
  if (positionBlocked(nx, car.position.z, CAR_RADIUS, opts)) {
    impact = Math.max(impact, Math.abs(carVel.x));
    carVel.x *= -.3;
    carVel.y *= .85;
  } else {
    car.position.x = nx;
  }

  const nz = car.position.z + carVel.y * dt;
  if (positionBlocked(car.position.x, nz, CAR_RADIUS, opts)) {
    impact = Math.max(impact, Math.abs(carVel.y));
    carVel.y *= -.3;
    carVel.x *= .85;
  } else {
    car.position.z = nz;
  }

  if (impact > 4 && driving) {
    camShake = Math.max(camShake, Math.min(1.2, impact / 18));
    showMessage("CRASH");
    playCrashSound(Math.min(1, impact / 25));
  }

  carSpeed = carVel.x * Math.sin(carRotation) + carVel.y * Math.cos(carRotation);

  // ---- Visuals: ground height, body pitch and roll, wheels ----
  const gy = GROUND_HEIGHT[groundType(car.position.x, car.position.z)];
  car.position.y += (gy - car.position.y) * Math.min(1, 14 * dt);
  car.rotation.y = carRotation;

  const longAcc = (carSpeed - prevCarSpeed) / Math.max(dt, .001);
  prevCarSpeed = carSpeed;

  const pitchTarget = -clamp(longAcc * .0035, -.07, .07);
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

function updateCamera(dt) {
  const target = driving ? car : player;
  const rotation = driving ? carRotation : playerRotation;
  const kmh = Math.abs(carSpeed) * 3.6;

  const distance = driving
    ? 14 + Math.min(kmh / 70, 4) + (nitroActive ? 2 : 0)
    : 9.5 + (sprinting ? 1 : 0);
  const height = driving ? 6.6 + Math.min(kmh / 150, 1.2) : 5.2;
  const lookHeight = driving ? 1.6 : 1.8;

  cameraTarget.set(
    target.position.x,
    target.position.y + lookHeight,
    target.position.z
  );

  // Pull the camera in if a building would be in the way
  let px = 0, pz = 0;
  for (const k of [1, .72, .5, .32]) {
    px = target.position.x - Math.sin(rotation) * distance * k;
    pz = target.position.z - Math.cos(rotation) * distance * k;
    if (!circleHitsBuilding(px, pz, 1.4)) break;
  }

  cameraPosition.set(px, target.position.y + height, pz);

  const smoothing = 1 - Math.pow(0.0008, dt);
  camera.position.lerp(cameraPosition, smoothing);

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
  fovCurrent += (targetFov - fovCurrent) * Math.min(1, dt * 4);

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
  sprintButton.style.display =
    isTouchDevice && show && !driving ? "block" : "none";
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

  const size = innerWidth < 700 ? 120 : 180;
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
  closeGarage();
  closeChat();

  car.position.set(0, 0, 0);
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

  player.position.set(0, 0, 30);
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

  scene.fog.near = high ? 260 : mid ? 200 : 130;
  scene.fog.far = camera.far * .95;
  skyDome.scale.setScalar(camera.far * .95 / 1150);

  for (const bird of skyBirds) bird.visible = high;
  for (const cloud of skyClouds) cloud.visible = level > 0;

  pixelRatio = level === 0 ? .75 : Math.min(devicePixelRatio || 1, 1);
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
applyQuality(
  (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4
    ? 1 : 2
);

let minimapTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const raw = clock.getDelta();
  const dt = Math.min(raw, .05);

  monitorPerformance(raw);
  if (quality > 0) updateSky(dt);
  skyDome.position.set(camera.position.x, 0, camera.position.z);

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
    updatePlayer(dt);
    updateJump(dt);
    updateCar(dt);

    updateTraffic(dt);
    updatePedestrians(dt);
    updateRemotePlayers(dt);
    updateCamera(dt);

    updateCheckpoint();
    updateHUD(dt);
    sendPlayerUpdate(dt);

    minimapTimer += dt;

    if (minimapTimer >= .125) {
      drawMinimap();
      minimapTimer = 0;
    }
  }

  renderer.render(scene, camera);
}

updateConnection(false);
updatePlayerCount();
animate();
