import * as THREE from "https://esm.sh/three@0.160.0";

/* =========================================================
   VICE CITY — UPDATE 24
   Complete replacement game.js
   Part 1: Core, city, characters and vehicles
   ========================================================= */

const CONFIG = {
  CITY_LIMIT: 900,
  ROAD_SPACING: 200,
  ROAD_WIDTH: 26,
  SIDEWALK_WIDTH: 6,
  MAX_TRAFFIC: 9,
  MAX_PEDESTRIANS: 8,
  NETWORK_RATE: 50,
  PLAYER_SPEED: 12,
  CAR_SPEED: 48
};

const COLORS = {
  asphalt: 0x30343a,
  sidewalk: 0x9b9b9b,
  grass: 0x477b45,
  building: 0x777b84,
  blue: 0x1976d2,
  dark: 0x101820,
  white: 0xffffff
};

const STREET_BLUE = 0x1769aa;

const VEHICLES = {
  sport: {
    name: "Street Sport",
    color: 0xe53935,
    speed: 58,
    acceleration: 24,
    handling: 2.4,
    size: [2.2, 1.0, 4.4]
  },
  supercar: {
    name: "Supercar",
    color: 0xffc107,
    speed: 78,
    acceleration: 30,
    handling: 2.8,
    size: [2.3, 1.0, 4.8]
  },
  suv: {
    name: "SUV",
    color: 0x1565c0,
    speed: 44,
    acceleration: 17,
    handling: 1.7,
    size: [2.5, 1.65, 4.6]
  },
  sedan: {
    name: "Sedan",
    color: 0xf5f5f5,
    speed: 49,
    acceleration: 19,
    handling: 2.0,
    size: [2.2, 1.2, 4.5]
  },
  jeep: {
    name: "Off-road Jeep",
    color: 0x388e3c,
    speed: 43,
    acceleration: 18,
    handling: 2.1,
    size: [2.4, 1.55, 4.2]
  }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87bce3);
scene.fog = new THREE.Fog(0x87bce3, 180, 1050);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1800
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();

const ambientLight = new THREE.HemisphereLight(
  0xddeeff,
  0x46513e,
  2.0
);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(-250, 400, 180);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -500;
sun.shadow.camera.right = 500;
sun.shadow.camera.top = 500;
sun.shadow.camera.bottom = -500;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);

const cityObjects = [];
const traffic = [];
const pedestrians = [];
const remotePlayers = [];
const vehicles = [];

let player;
let playerName = "Player";
let playerGender = "male";
let myPlayerId = null;
let currentVehicle = null;
let selectedVehicle = "sport";
let gameStarted = false;
let gamePaused = false;
let requestedStart = false;
let garageOpen = false;
let activeMission = 0;
let playerScore = 0;
let networkTimer = 0;
let lastNetworkSend = 0;
let cameraMode = 0;
let jumpVelocity = 0;
let isJumping = false;
let playerVerticalOffset = 0;
let chatOpen = false;
let minimapCanvas;
let minimapContext;
let hudSpeed = 0;
let collisionMessageTimer = 0;

const keys = {};
const touchControls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false
};

const socket = window.io
  ? window.io({ transports: ["websocket", "polling"] })
  : null;

function random(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(random(min, max + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function makeMaterial(color, extra = {}) {
  return new THREE.MeshLambertMaterial({
    color,
    ...extra
  });
}

function makeBox(
  parent,
  width,
  height,
  depth,
  material,
  x,
  y,
  z
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/* =========================================================
   PROCEDURAL ROAD TEXTURE
   ========================================================= */

function createAsphaltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#30343a";
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6500; i++) {
    const shade = randomInt(35, 65);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.16)`;
    ctx.fillRect(
      randomInt(0, 511),
      randomInt(0, 511),
      randomInt(1, 3),
      randomInt(1, 3)
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBuildingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;

  const ctx = canvas.getContext("2d");
  const base = ["#666b75", "#77736d", "#8a8178", "#596775"];
  ctx.fillStyle = base[randomInt(0, base.length - 1)];
  ctx.fillRect(0, 0, 256, 512);

  for (let y = 18; y < 500; y += 42) {
    for (let x = 15; x < 250; x += 38) {
      ctx.fillStyle = Math.random() > 0.2 ? "#9bc6d9" : "#292f38";
      ctx.fillRect(x, y, 22, 27);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x + 2, y + 2, 3, 23);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const asphaltTexture = createAsphaltTexture();
const buildingTexture = createBuildingTexture();

const materials = {
  road: new THREE.MeshLambertMaterial({
    color: COLORS.asphalt,
    map: asphaltTexture
  }),
  sidewalk: makeMaterial(COLORS.sidewalk),
  grass: makeMaterial(COLORS.grass),
  white: makeMaterial(0xffffff),
  yellow: makeMaterial(0xffd54f),
  building: new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: buildingTexture
  }),
  dark: makeMaterial(0x252a31),
  glass: new THREE.MeshPhongMaterial({
    color: 0x6ba6c7,
    transparent: true,
    opacity: 0.72,
    shininess: 90
  })
};

/* =========================================================
   CITY GROUND AND ROADS
   ========================================================= */

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(
    CONFIG.CITY_LIMIT * 2,
    CONFIG.CITY_LIMIT * 2
  ),
  materials.grass
);

ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.08;
ground.receiveShadow = true;
world.add(ground);

function addRoad(x, z, horizontal = true) {
  const length = CONFIG.CITY_LIMIT * 2;

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(
      horizontal ? length : CONFIG.ROAD_WIDTH,
      horizontal ? CONFIG.ROAD_WIDTH : length
    ),
    materials.road
  );

  road.rotation.x = -Math.PI / 2;
  if (!horizontal) road.rotation.z = Math.PI / 2;
  road.position.set(x, 0.015, z);
  road.receiveShadow = true;
  world.add(road);

  const lineLength = length;

  for (let offset of [-CONFIG.ROAD_WIDTH / 2 + 2, CONFIG.ROAD_WIDTH / 2 - 2]) {
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(
        horizontal ? lineLength : 0.22,
        horizontal ? 0.22 : lineLength
      ),
      materials.white
    );

    edge.rotation.x = -Math.PI / 2;
    if (!horizontal) edge.rotation.z = Math.PI / 2;

    edge.position.set(
      horizontal ? x : x + offset,
      0.04,
      horizontal ? z + offset : z
    );

    world.add(edge);
  }

  const centerLine = new THREE.Mesh(
    new THREE.PlaneGeometry(
      horizontal ? lineLength : 0.16,
      horizontal ? 0.16 : lineLength
    ),
    materials.yellow
  );

  centerLine.rotation.x = -Math.PI / 2;
  if (!horizontal) centerLine.rotation.z = Math.PI / 2;
  centerLine.position.set(x, 0.045, z);
  world.add(centerLine);
}

function addSidewalks(x, z, horizontal = true) {
  const length = CONFIG.CITY_LIMIT * 2;
  const offset = CONFIG.ROAD_WIDTH / 2 + CONFIG.SIDEWALK_WIDTH / 2;

  for (const side of [-1, 1]) {
    const sidewalk = new THREE.Mesh(
      new THREE.PlaneGeometry(
        horizontal ? length : CONFIG.SIDEWALK_WIDTH,
        horizontal ? CONFIG.SIDEWALK_WIDTH : length
      ),
      materials.sidewalk
    );

    sidewalk.rotation.x = -Math.PI / 2;
    if (!horizontal) sidewalk.rotation.z = Math.PI / 2;

    sidewalk.position.set(
      horizontal ? x : x + offset * side,
      0.025,
      horizontal ? z + offset * side : z
    );

    sidewalk.receiveShadow = true;
    world.add(sidewalk);
  }
}

function createRoadNetwork() {
  for (
    let p = -CONFIG.CITY_LIMIT;
    p <= CONFIG.CITY_LIMIT;
    p += CONFIG.ROAD_SPACING
  ) {
    addRoad(0, p, true);
    addRoad(p, 0, false);
    addSidewalks(0, p, true);
    addSidewalks(p, 0, false);
  }
}

function addCrosswalk(x, z, horizontal = true) {
  const stripeCount = 7;

  for (let i = 0; i < stripeCount; i++) {
    const offset = (i - (stripeCount - 1) / 2) * 2.3;

    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(
        horizontal ? 1.3 : 15,
        horizontal ? 15 : 1.3
      ),
      materials.white
    );

    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(
      horizontal ? x + offset : x,
      0.055,
      horizontal ? z : z + offset
    );

    world.add(stripe);
  }
}

function createCrosswalks() {
  for (
    let p = -CONFIG.CITY_LIMIT + CONFIG.ROAD_SPACING;
    p < CONFIG.CITY_LIMIT;
    p += CONFIG.ROAD_SPACING
  ) {
    addCrosswalk(p, 0, true);
    addCrosswalk(0, p, false);
  }
}

/* =========================================================
   CITY BUILDINGS, PARKS AND STREET DETAILS
   ========================================================= */

function addBuilding(x, z, width, depth, height) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    materials.building
  );

  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.5, 0.6, depth + 0.5),
    materials.dark
  );

  roof.position.y = height + 0.3;
  group.add(roof);

  const door = makeBox(
    group,
    Math.min(2.2, width * 0.2),
    3,
    0.15,
    materials.dark,
    0,
    1.5,
    depth / 2 + 0.08
  );

  door.castShadow = false;

  world.add(group);

  cityObjects.push({
    x,
    z,
    halfX: width / 2,
    halfZ: depth / 2,
    height
  });

  return group;
}

function addPark(x, z, width, depth) {
  const park = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    makeMaterial(0x4d914b)
  );

  park.rotation.x = -Math.PI / 2;
  park.position.set(x, 0.02, z);
  world.add(park);

  for (let i = 0; i < 8; i++) {
    addTree(
      x + random(-width / 2 + 5, width / 2 - 5),
      z + random(-depth / 2 + 5, depth / 2 - 5)
    );
  }
}

function addTree(x, z) {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 4, 7),
    makeMaterial(0x68452d)
  );

  trunk.position.y = 2;
  trunk.castShadow = true;
  tree.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 9, 7),
    makeMaterial(0x28783b)
  );

  leaves.position.y = 5;
  leaves.castShadow = true;
  tree.add(leaves);

  tree.position.set(x, 0, z);
  world.add(tree);
}

function createCity() {
  createRoadNetwork();
  createCrosswalks();

  for (
    let x = -CONFIG.CITY_LIMIT + 65;
    x < CONFIG.CITY_LIMIT;
    x += 100
  ) {
    for (
      let z = -CONFIG.CITY_LIMIT + 65;
      z < CONFIG.CITY_LIMIT;
      z += 100
    ) {
      const nearRoadX =
        Math.abs(x - Math.round(x / CONFIG.ROAD_SPACING) *
          CONFIG.ROAD_SPACING) < 38;

      const nearRoadZ =
        Math.abs(z - Math.round(z / CONFIG.ROAD_SPACING) *
          CONFIG.ROAD_SPACING) < 38;

      if (nearRoadX || nearRoadZ) continue;

      if (Math.random() < 0.13) {
        addPark(x, z, 65, 65);
      } else {
        addBuilding(
          x + random(-8, 8),
          z + random(-8, 8),
          random(22, 43),
          random(22, 43),
          random(12, 75)
        );
      }
    }
  }

  for (let i = 0; i < 38; i++) {
    const x = random(-CONFIG.CITY_LIMIT + 20, CONFIG.CITY_LIMIT - 20);
    const z = random(-CONFIG.CITY_LIMIT + 20, CONFIG.CITY_LIMIT - 20);
    addTree(x, z);
  }
}

createCity();

/* =========================================================
   CHARACTER CREATION
   ========================================================= */

function createNameTag(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");

  function draw(value) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#111111";
    ctx.fillStyle = "#ffffff";
    ctx.strokeText(value, 256, 78);
    ctx.fillText(value, 256, 78);
  }

  draw(name);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    })
  );

  sprite.scale.set(5, 1.25, 1);
  sprite.position.y = 3.5;

  sprite.userData.setName = value => {
    draw(value);
    texture.needsUpdate = true;
  };

  return sprite;
}

function createCharacter(color = STREET_BLUE, gender = "male") {
  const group = new THREE.Group();

  const skin = makeMaterial(0xc58d65);
  const shirt = makeMaterial(color);
  const pants = makeMaterial(0x202a3a);
  const shoes = makeMaterial(0x171717);
  const hair = makeMaterial(gender === "female" ? 0x25170f : 0x17120e);

  const body = makeBox(
    group, 0.9, 1.1, 0.48, shirt, 0, 1.45, 0
  );

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 10),
    skin
  );

  head.position.y = 2.3;
  group.add(head);

  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(
      gender === "female" ? 0.36 : 0.33,
      12,
      8,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.55
    ),
    hair
  );

  hairMesh.position.y = 2.43;
  group.add(hairMesh);

  if (gender === "female") {
    const hairBack = makeBox(
      group, 0.5, 0.75, 0.25, hair, 0, 1.95, -0.18
    );
    hairBack.rotation.x = -0.12;
  }

  const leftArm = makeBox(
    group, 0.25, 0.9, 0.28, shirt, -0.62, 1.45, 0
  );

  const rightArm = makeBox(
    group, 0.25, 0.9, 0.28, shirt, 0.62, 1.45, 0
  );

  const leftHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 8),
    skin
  );
  leftHand.position.set(-0.62, 0.95, 0);
  group.add(leftHand);

  const rightHand = leftHand.clone();
  rightHand.position.x = 0.62;
  group.add(rightHand);

  const leftLeg = makeBox(
    group, 0.34, 0.85, 0.38, pants, -0.23, 0.52, 0
  );

  const rightLeg = makeBox(
    group, 0.34, 0.85, 0.38, pants, 0.23, 0.52, 0
  );

  makeBox(
    group, 0.36, 0.18, 0.55, shoes, -0.23, 0.08, 0.06
  );

  makeBox(
    group, 0.36, 0.18, 0.55, shoes, 0.23, 0.08, 0.06
  );

  group.userData.parts = {
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    body
  };

  group.userData.nameTag = createNameTag(playerName);
  group.add(group.userData.nameTag);

  return group;
}

player = createCharacter(STREET_BLUE, playerGender);
player.position.set(0, 0, 12);
scene.add(player);

/* =========================================================
   VEHICLE CREATION
   ========================================================= */

function createWheel(parent, x, y, z) {
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 0.28, 16),
    makeMaterial(0x151515)
  );

  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, y, z);
  wheel.castShadow = true;
  parent.add(wheel);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.3, 12),
    makeMaterial(0xbfc4c9)
  );

  hub.rotation.z = Math.PI / 2;
  hub.position.copy(wheel.position);
  parent.add(hub);

  return wheel;
}

function createVehicleModel(type, color) {
  const spec = VEHICLES[type] || VEHICLES.sport;
  const group = new THREE.Group();

  const paint = makeMaterial(color);
  const glass = materials.glass;
  const dark = materials.dark;

  const [width, height, length] = spec.size;

  makeBox(
    group,
    width,
    height * 0.55,
    length,
    paint,
    0,
    0.75,
    0
  );

  const cabinWidth = width * 0.78;
  const cabinHeight = type === "suv" || type === "jeep" ? 1.0 : 0.75;
  const cabinLength = length * 0.48;

  makeBox(
    group,
    cabinWidth,
    cabinHeight,
    cabinLength,
    glass,
    0,
    0.75 + height * 0.35,
    -0.12
  );

  makeBox(
    group,
    width * 0.85,
    0.12,
    length * 0.12,
    dark,
    0,
    0.28,
    length * 0.44
  );

  makeBox(
    group,
    width * 0.85,
    0.12,
    length * 0.12,
    dark,
    0,
    0.28,
    -length * 0.44
  );

  const wheels = [];

  for (const x of [-width * 0.48, width * 0.48]) {
    for (const z of [-length * 0.32, length * 0.32]) {
      wheels.push(createWheel(group, x, 0.42, z));
    }
  }

  const headlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff5d6
  });

  for (const x of [-width * 0.32, width * 0.32]) {
    makeBox(
      group,
      0.35,
      0.2,
      0.08,
      headlightMaterial,
      x,
      0.78,
      length / 2 + 0.04
    );
  }

  const tailMaterial = new THREE.MeshBasicMaterial({
    color: 0xe53935
  });

  for (const x of [-width * 0.32, width * 0.32]) {
    makeBox(
      group,
      0.35,
      0.2,
      0.08,
      tailMaterial,
      x,
      0.78,
      -length / 2 - 0.04
    );
  }

  group.userData = {
    type,
    color,
    spec,
    wheels,
    speed: 0,
    heading: 0,
    occupied: false
  };

  return group;
}

function spawnVehicle(type, position, color) {
  const spec = VEHICLES[type] || VEHICLES.sport;
  const vehicleColor = color ?? spec.color;

  const model = createVehicleModel(type, vehicleColor);

  model.position.copy(position);
  model.position.y = 0;
  model.rotation.y = 0;

  world.add(model);
  vehicles.push(model);

  return model;
}

function createInitialVehicles() {
  spawnVehicle("sport", new THREE.Vector3(12, 0, 20));
  spawnVehicle("supercar", new THREE.Vector3(20, 0, 20));
  spawnVehicle("suv", new THREE.Vector3(28, 0, 20));
  spawnVehicle("sedan", new THREE.Vector3(36, 0, 20));
  spawnVehicle("jeep", new THREE.Vector3(44, 0, 20));
}

createInitialVehicles();

/* =========================================================
   PART 1 ENDS HERE — APPEND PART 2 BELOW THIS LINE
   ========================================================= */
/* =========================================================
   VICE CITY — UPDATE 24
   Part 2: Traffic, pedestrians, collisions, multiplayer, UI
   ========================================================= */

/* =========================================================
   COLLISION SYSTEM
   ========================================================= */

const PLAYER_RADIUS = 0.65;
const CAR_RADIUS = 2.25;
const TRAFFIC_RADIUS = 2.0;
const PEDESTRIAN_RADIUS = 0.65;

function circleHitsBuilding(x, z, radius) {
  for (const b of cityObjects) {
    const closestX = clamp(x, b.x - b.halfX, b.x + b.halfX);
    const closestZ = clamp(z, b.z - b.halfZ, b.z + b.halfZ);

    const dx = x - closestX;
    const dz = z - closestZ;

    if (dx * dx + dz * dz < radius * radius) {
      return true;
    }
  }

  return false;
}

function circleHitsTraffic(x, z, radius, ignore = null) {
  for (const t of traffic) {
    if (t === ignore) continue;

    if (distanceXZ({ x, z }, t.position) < radius + TRAFFIC_RADIUS) {
      return true;
    }
  }

  return false;
}

function circleHitsPedestrians(x, z, radius) {
  for (const p of pedestrians) {
    if (!p.visible) continue;

    if (distanceXZ({ x, z }, p.position) < radius + PEDESTRIAN_RADIUS) {
      return true;
    }
  }

  return false;
}

function circleHitsVehicles(x, z, radius, ignore = null) {
  for (const v of vehicles) {
    if (v === ignore || v === currentVehicle) continue;

    if (distanceXZ({ x, z }, v.position) < radius + CAR_RADIUS) {
      return true;
    }
  }

  return false;
}

function positionBlocked(x, z, radius, options = {}) {
  if (
    Math.abs(x) > CONFIG.CITY_LIMIT - 8 ||
    Math.abs(z) > CONFIG.CITY_LIMIT - 8
  ) {
    return true;
  }

  if (circleHitsBuilding(x, z, radius)) return true;

  if (options.traffic && circleHitsTraffic(x, z, radius, options.ignore)) {
    return true;
  }

  if (options.pedestrians && circleHitsPedestrians(x, z, radius)) {
    return true;
  }

  if (options.vehicles && circleHitsVehicles(x, z, radius, options.ignore)) {
    return true;
  }

  return false;
}

function moveWithCollision(object, dx, dz, radius, options = {}) {
  let moved = false;

  const nextX = object.position.x + dx;

  if (!positionBlocked(nextX, object.position.z, radius, options)) {
    object.position.x = nextX;
    moved = true;
  }

  const nextZ = object.position.z + dz;

  if (!positionBlocked(object.position.x, nextZ, radius, options)) {
    object.position.z = nextZ;
    moved = true;
  }

  return moved;
}

function showCollisionMessage() {
  collisionMessageTimer = 1.0;

  const message = document.getElementById("vc-message");
  if (message) {
    message.textContent = "COLLISION";
    message.style.opacity = "1";
  }
}

/* =========================================================
   TRAFFIC VEHICLES
   ========================================================= */

function nearestRoadCoordinate(value) {
  return Math.round(value / CONFIG.ROAD_SPACING) * CONFIG.ROAD_SPACING;
}

function createTrafficCar(index) {
  const typeList = ["sedan", "sport", "suv", "jeep"];
  const type = typeList[index % typeList.length];
  const model = createVehicleModel(type, randomInt(0x333333, 0xdddddd));

  const horizontal = Math.random() > 0.5;
  const road = randomInt(-4, 4) * CONFIG.ROAD_SPACING;
  const lane = Math.random() > 0.5 ? 5 : -5;
  const direction = Math.random() > 0.5 ? 1 : -1;

  if (horizontal) {
    model.position.set(
      random(-CONFIG.CITY_LIMIT, CONFIG.CITY_LIMIT),
      0,
      road + lane
    );
    model.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    model.position.set(
      road + lane,
      0,
      random(-CONFIG.CITY_LIMIT, CONFIG.CITY_LIMIT)
    );
    model.rotation.y = direction > 0 ? Math.PI : 0;
  }

  model.userData.traffic = true;
  model.userData.horizontal = horizontal;
  model.userData.direction = direction;
  model.userData.lane = lane;
  model.userData.road = road;
  model.userData.speed = random(10, 19);
  model.userData.turnTimer = random(2, 6);

  world.add(model);
  traffic.push(model);
}

function createTraffic() {
  for (let i = 0; i < CONFIG.MAX_TRAFFIC; i++) {
    createTrafficCar(i);
  }
}

function updateTraffic(delta) {
  for (const t of traffic) {
    const data = t.userData;
    const speed = data.speed;

    data.turnTimer -= delta;

    if (data.horizontal) {
      t.position.x += data.direction * speed * delta;
    } else {
      t.position.z += data.direction * speed * delta;
    }

    if (
      Math.abs(t.position.x) > CONFIG.CITY_LIMIT ||
      Math.abs(t.position.z) > CONFIG.CITY_LIMIT
    ) {
      if (data.horizontal) {
        t.position.x = -data.direction * CONFIG.CITY_LIMIT;
      } else {
        t.position.z = -data.direction * CONFIG.CITY_LIMIT;
      }
    }

    if (data.turnTimer <= 0) {
      data.turnTimer = random(4, 9);

      if (Math.random() < 0.18) {
        data.horizontal = !data.horizontal;
        data.direction = Math.random() > 0.5 ? 1 : -1;

        const road = nearestRoadCoordinate(
          data.horizontal ? t.position.z : t.position.x
        );

        if (data.horizontal) {
          t.position.z = road + (Math.random() > 0.5 ? 5 : -5);
          t.rotation.y = data.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          t.position.x = road + (Math.random() > 0.5 ? 5 : -5);
          t.rotation.y = data.direction > 0 ? Math.PI : 0;
        }
      }
    }

    if (currentVehicle) {
      const d = distanceXZ(t.position, currentVehicle.position);

      if (d < 9) {
        data.speed = Math.max(0, data.speed - 24 * delta);
      } else {
        data.speed = Math.min(data.speed + 8 * delta, 17);
      }
    }
  }
}

function updateTrafficCollisions() {
  if (!currentVehicle) return;

  for (const t of traffic) {
    const d = distanceXZ(t.position, currentVehicle.position);

    if (d < CAR_RADIUS + TRAFFIC_RADIUS + 0.3) {
      currentVehicle.userData.speed *= 0.94;
      t.userData.speed = Math.max(0, t.userData.speed * 0.75);
    }
  }
}

/* =========================================================
   PEDESTRIANS
   ========================================================= */

function createPedestrian(index) {
  const gender = index % 2 === 0 ? "male" : "female";
  const colors = [
    0x1976d2,
    0xe65100,
    0x7b1fa2,
    0x388e3c,
    0x37474f,
    0xc2185b
  ];

  const person = createCharacter(
    colors[index % colors.length],
    gender
  );

  const horizontal = Math.random() > 0.5;
  const road = randomInt(-4, 4) * CONFIG.ROAD_SPACING;
  const sidewalkSide = Math.random() > 0.5 ? 1 : -1;
  const direction = Math.random() > 0.5 ? 1 : -1;

  if (horizontal) {
    person.position.set(
      random(-CONFIG.CITY_LIMIT, CONFIG.CITY_LIMIT),
      0,
      road + sidewalkSide * (CONFIG.ROAD_WIDTH / 2 + 3)
    );
    person.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    person.position.set(
      road + sidewalkSide * (CONFIG.ROAD_WIDTH / 2 + 3),
      0,
      random(-CONFIG.CITY_LIMIT, CONFIG.CITY_LIMIT)
    );
    person.rotation.y = direction > 0 ? Math.PI : 0;
  }

  person.userData.pedestrian = true;
  person.userData.horizontal = horizontal;
  person.userData.direction = direction;
  person.userData.speed = random(1.0, 2.0);
  person.userData.walkTimer = random(2, 5);
  person.userData.walkPhase = random(0, Math.PI * 2);

  world.add(person);
  pedestrians.push(person);
}

function createPedestrians() {
  for (let i = 0; i < CONFIG.MAX_PEDESTRIANS; i++) {
    createPedestrian(i);
  }
}

function updatePedestrians(delta) {
  for (const p of pedestrians) {
    const data = p.userData;

    data.walkTimer -= delta;
    data.walkPhase += delta * 6;

    if (data.horizontal) {
      p.position.x += data.direction * data.speed * delta;
    } else {
      p.position.z += data.direction * data.speed * delta;
    }

    const parts = p.userData.parts;

    if (parts) {
      parts.leftArm.rotation.x = Math.sin(data.walkPhase) * 0.35;
      parts.rightArm.rotation.x = -Math.sin(data.walkPhase) * 0.35;
      parts.leftLeg.rotation.x = -Math.sin(data.walkPhase) * 0.4;
      parts.rightLeg.rotation.x = Math.sin(data.walkPhase) * 0.4;
    }

    if (
      Math.abs(p.position.x) > CONFIG.CITY_LIMIT - 5 ||
      Math.abs(p.position.z) > CONFIG.CITY_LIMIT - 5
    ) {
      data.direction *= -1;
    }

    if (data.walkTimer <= 0) {
      data.walkTimer = random(2, 5);
      data.direction *= -1;

      if (data.horizontal) {
        p.rotation.y = data.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        p.rotation.y = data.direction > 0 ? Math.PI : 0;
      }
    }
  }
}

/* =========================================================
   MISSIONS
   ========================================================= */

const missionLocations = [
  [100, 100], [-100, 100], [200, -100], [-200, -100],
  [300, 200], [-300, 200], [400, -200], [-400, -200],
  [500, 100], [-500, 100], [600, -300], [-600, -300],
  [700, 200], [-700, 200], [100, -500], [-100, -500],
  [300, 500], [-300, 500], [500, -600], [-500, -600]
];

const missionMarkers = [];

function createMissionMarkers() {
  for (let i = 0; i < missionLocations.length; i++) {
    const [x, z] = missionLocations[i];

    const marker = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4, 0.35, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff })
    );

    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    marker.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.35
      })
    );

    beam.position.y = 4;
    marker.add(beam);

    marker.position.set(x, 0, z);
    marker.visible = i === 0;
    world.add(marker);

    missionMarkers.push(marker);
  }
}

function updateMissions(delta) {
  if (!gameStarted || missionMarkers.length === 0) return;

  const marker = missionMarkers[activeMission];
  if (!marker) return;

  marker.rotation.y += delta * 0.8;

  const target = marker.position;
  const playerPosition = currentVehicle
    ? currentVehicle.position
    : player.position;

  if (distanceXZ(target, playerPosition) < 7) {
    marker.visible = false;
    playerScore += 100;
    activeMission++;

    if (activeMission >= missionMarkers.length) {
      activeMission = 0;
      playerScore += 500;
    }

    missionMarkers[activeMission].visible = true;
    updateHUD();
  }
}

createMissions();

function createMissions() {
  createMissionMarkers();
}

/* =========================================================
   UI BASE STYLES AND ELEMENTS
   ========================================================= */

const style = document.createElement("style");
style.textContent = `
  #vc-ui {
    position: fixed;
    inset: 0;
    pointer-events: none;
    font-family: Arial, sans-serif;
    color: white;
    z-index: 10;
  }

  #vc-ui * {
    box-sizing: border-box;
  }

  .vc-panel {
    background: rgba(8, 15, 25, 0.84);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 10px;
    padding: 12px;
    box-shadow: 0 5px 20px rgba(0,0,0,0.3);
  }

  .vc-button {
    pointer-events: auto;
    border: 0;
    border-radius: 7px;
    background: #1976d2;
    color: white;
    padding: 10px 14px;
    margin: 3px;
    font-weight: bold;
    cursor: pointer;
  }

  .vc-button:hover {
    background: #0d47a1;
  }

  .vc-input {
    pointer-events: auto;
    width: 100%;
    padding: 11px;
    border: 1px solid #8795a5;
    border-radius: 7px;
    margin: 5px 0;
    font-size: 15px;
  }

  #vc-start {
    pointer-events: auto;
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(5,12,28,.95), rgba(10,40,65,.88));
  }

  #vc-start-card {
    width: min(420px, 92vw);
    padding: 25px;
    text-align: center;
  }

  #vc-start h1 {
    font-size: clamp(32px, 7vw, 52px);
    margin: 4px 0;
    letter-spacing: 3px;
    color: #58c8ff;
  }

  #vc-hud {
    position: absolute;
    top: 12px;
    left: 12px;
    min-width: 180px;
    font-size: 14px;
    line-height: 1.6;
  }

  #vc-minimap {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 150px;
    height: 150px;
    border: 2px solid white;
    border-radius: 8px;
    background: #18252b;
  }

  #vc-message {
    position: absolute;
    top: 45%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 26px;
    font-weight: bold;
    color: #ffeb3b;
    opacity: 0;
    text-shadow: 0 2px 6px black;
  }

  #vc-garage {
    pointer-events: auto;
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: 220px;
    max-height: 55vh;
    overflow-y: auto;
    display: none;
  }

  #vc-chat {
    pointer-events: auto;
    position: absolute;
    left: 12px;
    bottom: 12px;
    width: min(300px, 65vw);
  }

  #vc-chat-log {
    height: 110px;
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  #vc-chat-row {
    display: flex;
    gap: 4px;
  }

  #vc-chat-input {
    min-width: 0;
    flex: 1;
    pointer-events: auto;
  }

  #vc-mobile {
    pointer-events: auto;
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    display: none;
    justify-content: space-between;
    align-items: end;
  }

  .vc-pad {
    display: grid;
    grid-template-columns: repeat(3, 48px);
    grid-template-rows: repeat(2, 48px);
    gap: 4px;
  }

  .vc-pad button {
    pointer-events: auto;
    border: 1px solid rgba(255,255,255,.5);
    border-radius: 10px;
    background: rgba(5,15,30,.65);
    color: white;
    font-size: 19px;
    touch-action: none;
  }

  #vc-pause {
    pointer-events: auto;
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.72);
  }

  @media (max-width: 700px) {
    #vc-minimap {
      width: 110px;
      height: 110px;
    }

    #vc-chat {
      bottom: 135px;
      width: 210px;
    }

    #vc-mobile {
      display: flex;
    }

    #vc-garage {
      bottom: 140px;
      width: 175px;
    }
  }
`;
document.head.appendChild(style);

const ui = document.createElement("div");
ui.id = "vc-ui";
document.body.appendChild(ui);

ui.innerHTML = `
  <div id="vc-start">
    <div id="vc-start-card" class="vc-panel">
      <h1>VICE CITY</h1>
      <p>OPEN WORLD ONLINE</p>
      <input id="vc-name" class="vc-input" maxlength="18"
        placeholder="Enter your player name" value="Player">

      <p>Choose your character</p>
      <button class="vc-button" id="vc-male">MALE</button>
      <button class="vc-button" id="vc-female">FEMALE</button>
      <p id="vc-gender-label">Selected: Male</p>
      <button class="vc-button" id="vc-start-button"
        style="width:100%;padding:14px">START GAME</button>
      <p id="vc-connect-label">Connecting...</p>
    </div>
  </div>

  <div id="vc-hud" class="vc-panel">
    <b>VICE CITY</b><br>
    <span id="vc-player-label">Player</span><br>
    <span id="vc-player-count">Players: 1</span><br>
    <span id="vc-speed">Speed: 0 km/h</span><br>
    <span id="vc-score">Score: 0</span><br>
    <span id="vc-mission">Mission: 1 / 20</span><br>
    <button class="vc-button" id="vc-pause-button">PAUSE</button>
    <button class="vc-button" id="vc-garage-button">GARAGE (V)</button>
  </div>

  <canvas id="vc-minimap" width="300" height="300"></canvas>
  <div id="vc-message"></div>

  <div id="vc-garage" class="vc-panel">
    <b>VEHICLE GARAGE</b>
    <div id="vc-vehicle-list"></div>
    <button class="vc-button" id="vc-close-garage">CLOSE</button>
  </div>

  <div id="vc-chat" class="vc-panel">
    <b>LIVE CHAT</b>
    <div id="vc-chat-log"></div>
    <div id="vc-chat-row">
      <input id="vc-chat-input" class="vc-input"
        placeholder="Type a message..." maxlength="120">
      <button class="vc-button" id="vc-chat-send">SEND</button>
    </div>
  </div>

  <div id="vc-mobile">
    <div class="vc-pad">
      <span></span>
      <button data-control="forward">▲</button>
      <span></span>
      <button data-control="left">◀</button>
      <button data-control="backward">▼</button>
      <button data-control="right">▶</button>
    </div>
    <div class="vc-pad">
      <button data-control="jump">JUMP</button>
      <button id="vc-mobile-enter">E</button>
    </div>
  </div>

  <div id="vc-pause">
    <div class="vc-panel" style="text-align:center;width:min(320px,90vw)">
      <h2>GAME PAUSED</h2>
      <button class="vc-button" id="vc-resume">RESUME</button>
      <button class="vc-button" id="vc-restart">RESTART</button>
      <button class="vc-button" id="vc-menu">MAIN MENU</button>
    </div>
  </div>
`;

function $(id) {
  return document.getElementById(id);
}

minimapCanvas = $("vc-minimap");
minimapContext = minimapCanvas.getContext("2d");

function updateHUD() {
  $("vc-player-label").textContent = playerName;
  $("vc-speed").textContent =
    `Speed: ${Math.round(Math.abs(hudSpeed) * 3.6)} km/h`;
  $("vc-score").textContent = `Score: ${playerScore}`;
  $("vc-mission").textContent =
    `Mission: ${Math.min(activeMission + 1, 20)} / 20`;
}

function updatePlayerCount(count) {
  $("vc-player-count").textContent =
    `Players: ${Number.isFinite(count) ? count : remotePlayers.length + 1}`;
}

/* =========================================================
   GARAGE
   ========================================================= */

function buildGarage() {
  const list = $("vc-vehicle-list");
  list.innerHTML = "";

  for (const [type, spec] of Object.entries(VEHICLES)) {
    const button = document.createElement("button");
    button.className = "vc-button";
    button.style.width = "100%";
    button.textContent = `${spec.name} — ${spec.speed} km/h`;

    button.addEventListener("click", () => {
      selectedVehicle = type;
      enterSelectedVehicle(type);
    });

    list.appendChild(button);
  }
}

function toggleGarage(force) {
  garageOpen = typeof force === "boolean" ? force : !garageOpen;
  $("vc-garage").style.display = garageOpen ? "block" : "none";
}

function enterSelectedVehicle(type) {
  if (!gameStarted) return;

  if (currentVehicle) {
    exitVehicle();
  }

  let nearest = null;
  let nearestDistance = 15;

  for (const v of vehicles) {
    if (v.userData.occupied) continue;

    const d = distanceXZ(player.position, v.position);
    if (d < nearestDistance) {
      nearest = v;
      nearestDistance = d;
    }
  }

  if (!nearest) {
    nearest = spawnVehicle(
      type,
      new THREE.Vector3(
        player.position.x + 4,
        0,
        player.position.z
      )
    );
  }

  if (nearest.userData.type !== type) {
    world.remove(nearest);
    const index = vehicles.indexOf(nearest);
    if (index >= 0) vehicles.splice(index, 1);

    nearest = spawnVehicle(
      type,
      new THREE.Vector3(
        player.position.x + 4,
        0,
        player.position.z
      )
    );
  }

  currentVehicle = nearest;
  currentVehicle.userData.occupied = true;
  player.visible = false;
  toggleGarage(false);

  hudSpeed = currentVehicle.userData.speed;
  emitVehicleState();
}

function exitVehicle() {
  if (!currentVehicle) return;

  const v = currentVehicle;
  const side = new THREE.Vector3(3, 0, 0)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), v.rotation.y);

  const candidate = v.position.clone().add(side);

  if (positionBlocked(candidate.x, candidate.z, PLAYER_RADIUS, {
    traffic: true,
    pedestrians: true,
    vehicles: true,
    ignore: v
  })) {
    candidate.set(v.position.x - side.x, 0, v.position.z - side.z);
  }

  player.position.copy(candidate);
  player.position.y = 0;
  player.visible = true;

  v.userData.occupied = false;
  v.userData.speed = 0;
  currentVehicle = null;
  hudSpeed = 0;

  emitVehicleState();
}

buildGarage();

/* =========================================================
   CHAT
   ========================================================= */

function addChatMessage(name, message) {
  const log = $("vc-chat-log");
  const line = document.createElement("div");

  const nameSpan = document.createElement("b");
  nameSpan.textContent = `${name}: `;

  const messageSpan = document.createElement("span");
  messageSpan.textContent = message;

  line.append(nameSpan, messageSpan);
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;

  while (log.children.length > 60) {
    log.removeChild(log.firstChild);
  }
}

function sendChat() {
  const input = $("vc-chat-input");
  const message = input.value.trim().slice(0, 120);

  if (!message) return;

  if (socket && socket.connected) {
    socket.emit("chatMessage", {
      name: playerName,
      message
    });
  } else {
    addChatMessage(playerName, message);
  }

  input.value = "";
}

$("vc-chat-send").addEventListener("click", sendChat);

$("vc-chat-input").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendChat();
  }
});

/* =========================================================
   MULTIPLAYER PLAYER REPRESENTATION
   ========================================================= */

function createRemotePlayer(data) {
  const avatar = createCharacter(
    STREET_BLUE,
    data.gender === "female" ? "female" : "male"
  );

  avatar.userData.remoteId = data.id;
  avatar.userData.nameTag.userData.setName(
    data.name || "Player"
  );

  scene.add(avatar);

  remotePlayers.push({
    id: data.id,
    avatar,
    targetPosition: new THREE.Vector3(
      data.x || 0,
      0,
      data.z || 0
    ),
    targetRotation: data.rotation || 0,
    vehicle: null,
    vehicleType: null,
    vehicleColor: null
  });

  return remotePlayers[remotePlayers.length - 1];
}

function removeRemotePlayer(id) {
  const index = remotePlayers.findIndex(p => p.id === id);
  if (index < 0) return;

  const remote = remotePlayers[index];

  scene.remove(remote.avatar);

  if (remote.vehicle) {
    world.remove(remote.vehicle);
  }

  remotePlayers.splice(index, 1);
  updatePlayerCount();
}

function updateRemotePlayers(delta) {
  for (const remote of remotePlayers) {
    const avatar = remote.avatar;

    avatar.position.lerp(remote.targetPosition, Math.min(1, delta * 8));

    const angleDifference = Math.atan2(
      Math.sin(remote.targetRotation - avatar.rotation.y),
      Math.cos(remote.targetRotation - avatar.rotation.y)
    );

    avatar.rotation.y += angleDifference * Math.min(1, delta * 8);
  }
}

function emitPlayerState() {
  if (!socket || !socket.connected || !gameStarted) return;

  const position = currentVehicle
    ? currentVehicle.position
    : player.position;

  socket.emit("playerMove", {
    x: position.x,
    z: position.z,
    rotation: currentVehicle
      ? currentVehicle.rotation.y
      : player.rotation.y,
    name: playerName,
    gender: playerGender,
    inVehicle: Boolean(currentVehicle),
    vehicleType: currentVehicle
      ? currentVehicle.userData.type
      : null,
    vehicleColor: currentVehicle
      ? currentVehicle.userData.color
      : null
  });
}

function emitVehicleState() {
  emitPlayerState();
}

function setupNetworking() {
  if (!socket) {
    $("vc-connect-label").textContent = "Offline mode";
    updatePlayerCount(1);
    return;
  }

  socket.on("connect", () => {
    myPlayerId = socket.id;
    $("vc-connect-label").textContent = "ONLINE";
    updatePlayerCount(remotePlayers.length + 1);

    if (requestedStart) {
      socket.emit("joinGame", {
        name: playerName,
        gender: playerGender
      });
    }
  });

  socket.on("disconnect", () => {
    $("vc-connect-label").textContent = "Reconnecting...";
    updatePlayerCount(1);
  });

  socket.on("playerCount", count => {
    updatePlayerCount(count);
  });

  socket.on("currentPlayers", players => {
    if (!Array.isArray(players)) return;

    for (const data of players) {
      if (!data || data.id === socket.id) continue;

      const existing = remotePlayers.find(p => p.id === data.id);
      if (!existing) {
        createRemotePlayer(data);
      }
    }

    updatePlayerCount(remotePlayers.length + 1);
  });

  socket.on("newPlayer", data => {
    if (!data || data.id === socket.id) return;

    if (!remotePlayers.some(p => p.id === data.id)) {
      createRemotePlayer(data);
      updatePlayerCount(remotePlayers.length + 1);
    }
  });

  socket.on("playerMoved", data => {
    if (!data || data.id === socket.id) return;

    let remote = remotePlayers.find(p => p.id === data.id);

    if (!remote) {
      remote = createRemotePlayer(data);
    }

    remote.targetPosition.set(
      Number(data.x) || 0,
      0,
      Number(data.z) || 0
    );

    remote.targetRotation = Number(data.rotation) || 0;

    if (data.name) {
      remote.avatar.userData.nameTag.userData.setName(data.name);
    }

    if (data.inVehicle && data.vehicleType) {
      if (
        !remote.vehicle ||
        remote.vehicleType !== data.vehicleType
      ) {
        if (remote.vehicle) world.remove(remote.vehicle);

        remote.vehicle = createVehicleModel(
          data.vehicleType,
          data.vehicleColor ?? VEHICLES[data.vehicleType]?.color ?? 0x777777
        );

        world.add(remote.vehicle);
        remote.vehicleType = data.vehicleType;
      }

      remote.vehicle.position.copy(remote.targetPosition);
      remote.vehicle.rotation.y = remote.targetRotation;
      remote.avatar.visible = false;
    } else {
      if (remote.vehicle) {
        world.remove(remote.vehicle);
        remote.vehicle = null;
        remote.vehicleType = null;
      }

      remote.avatar.visible = true;
    }
  });

  socket.on("playerDisconnected", id => {
    removeRemotePlayer(id);
  });

  socket.on("chatMessage", data => {
    if (!data) return;

    addChatMessage(
      String(data.name || "Player").slice(0, 18),
      String(data.message || "").slice(0, 120)
    );
  });
}

setupNetworking();

/* =========================================================
   PART 2 ENDS HERE — APPEND PART 3 BELOW THIS LINE
   ========================================================= */
/* =========================================================
   VICE CITY — UPDATE 24
   Part 3: Controls, movement, camera, start and game loop
   ========================================================= */

/* =========================================================
   CHARACTER SELECTION
   ========================================================= */

function selectGender(gender) {
  playerGender = gender === "female" ? "female" : "male";

  const oldPosition = player.position.clone();
  const oldRotation = player.rotation.y;

  scene.remove(player);

  player = createCharacter(STREET_BLUE, playerGender);
  player.position.copy(oldPosition);
  player.rotation.y = oldRotation;

  scene.add(player);

  $("vc-gender-label").textContent =
    `Selected: ${playerGender === "female" ? "Female" : "Male"}`;
}

$("vc-male").addEventListener("click", () => {
  selectGender("male");
});

$("vc-female").addEventListener("click", () => {
  selectGender("female");
});

/* =========================================================
   PLAYER MOVEMENT
   ========================================================= */

function getControlState() {
  return {
    forward: keys.KeyW || keys.ArrowUp || touchControls.forward,
    backward: keys.KeyS || keys.ArrowDown || touchControls.backward,
    left: keys.KeyA || keys.ArrowLeft || touchControls.left,
    right: keys.KeyD || keys.ArrowRight || touchControls.right,
    jump: keys.Space || touchControls.jump
  };
}

function updatePlayer(delta) {
  if (!gameStarted || gamePaused || currentVehicle) return;

  const controls = getControlState();

  const forward = controls.forward ? 1 : 0;
  const backward = controls.backward ? 1 : 0;
  const left = controls.left ? 1 : 0;
  const right = controls.right ? 1 : 0;

  const steeringInput = (left ? 1 : 0) - (right ? 1 : 0);

  if (steeringInput !== 0) {
    player.rotation.y += steeringInput * 2.5 * delta;
  }

  const movement = forward - backward;

  if (movement !== 0) {
    const speed = CONFIG.PLAYER_SPEED;
    const dx = Math.sin(player.rotation.y) * movement * speed * delta;
    const dz = Math.cos(player.rotation.y) * movement * speed * delta;

    const moved = moveWithCollision(
      player,
      dx,
      dz,
      PLAYER_RADIUS,
      {
        traffic: true,
        pedestrians: true,
        vehicles: true
      }
    );

    if (!moved && Math.abs(movement) > 0) {
      showCollisionMessage();
    }
  }

  if (controls.jump && !isJumping) {
    isJumping = true;
    jumpVelocity = 7.5;
  }

  if (isJumping) {
    jumpVelocity -= 18 * delta;
    playerVerticalOffset += jumpVelocity * delta;

    if (playerVerticalOffset <= 0) {
      playerVerticalOffset = 0;
      jumpVelocity = 0;
      isJumping = false;
    }
  }

  player.position.y = playerVerticalOffset;

  const parts = player.userData.parts;

  if (parts && movement !== 0) {
    const walk = performance.now() * 0.009;
    parts.leftArm.rotation.x = Math.sin(walk) * 0.5;
    parts.rightArm.rotation.x = -Math.sin(walk) * 0.5;
    parts.leftLeg.rotation.x = -Math.sin(walk) * 0.5;
    parts.rightLeg.rotation.x = Math.sin(walk) * 0.5;
  } else if (parts) {
    parts.leftArm.rotation.x = 0;
    parts.rightArm.rotation.x = 0;
    parts.leftLeg.rotation.x = 0;
    parts.rightLeg.rotation.x = 0;
  }

  hudSpeed = movement * CONFIG.PLAYER_SPEED;
}

/* =========================================================
   VEHICLE MOVEMENT
   ========================================================= */

function updateCar(delta) {
  if (!gameStarted || gamePaused || !currentVehicle) return;

  const controls = getControlState();
  const data = currentVehicle.userData;
  const spec = data.spec;

  const forward = controls.forward ? 1 : 0;
  const backward = controls.backward ? 1 : 0;
  const left = controls.left ? 1 : 0;
  const right = controls.right ? 1 : 0;

  const steeringInput = (left ? 1 : 0) - (right ? 1 : 0);

  const acceleration = spec.acceleration;
  const maxSpeed = spec.speed;

  if (forward) {
    data.speed += acceleration * delta;
  } else if (backward) {
    data.speed -= acceleration * delta;
  } else {
    data.speed *= Math.pow(0.96, delta * 60);
  }

  data.speed = clamp(data.speed, -maxSpeed * 0.35, maxSpeed);

  const speedRatio = Math.min(1, Math.abs(data.speed) / 15);

  if (steeringInput !== 0 && Math.abs(data.speed) > 0.5) {
    const reverseDirection = data.speed >= 0 ? 1 : -1;

    currentVehicle.rotation.y +=
      steeringInput *
      spec.handling *
      speedRatio *
      reverseDirection *
      delta;
  }

  const dx =
    Math.sin(currentVehicle.rotation.y) * data.speed * delta;

  const dz =
    Math.cos(currentVehicle.rotation.y) * data.speed * delta;

  const moved = moveWithCollision(
    currentVehicle,
    dx,
    dz,
    CAR_RADIUS,
    {
      traffic: true,
      pedestrians: true,
      vehicles: true,
      ignore: currentVehicle
    }
  );

  if (!moved && Math.abs(data.speed) > 1) {
    data.speed *= -0.12;
    showCollisionMessage();
  }

  for (const wheel of data.wheels) {
    wheel.rotation.x += data.speed * delta * 0.8;
  }

  hudSpeed = data.speed;
}

/* =========================================================
   VEHICLE ENTRY AND EXIT
   ========================================================= */

function toggleVehicle() {
  if (!gameStarted || gamePaused) return;

  if (currentVehicle) {
    exitVehicle();
    return;
  }

  let nearest = null;
  let nearestDistance = 12;

  for (const vehicle of vehicles) {
    if (vehicle.userData.occupied) continue;

    const d = distanceXZ(player.position, vehicle.position);

    if (d < nearestDistance) {
      nearest = vehicle;
      nearestDistance = d;
    }
  }

  if (nearest) {
    currentVehicle = nearest;
    currentVehicle.userData.occupied = true;
    player.visible = false;
    selectedVehicle = currentVehicle.userData.type;
    emitVehicleState();
  } else {
    showMessage("NO VEHICLE NEARBY");
  }
}

/* =========================================================
   MESSAGE DISPLAY
   ========================================================= */

let messageTimer = 0;

function showMessage(message, duration = 1.8) {
  const element = $("vc-message");
  element.textContent = message;
  element.style.opacity = "1";
  messageTimer = duration;
}

/* =========================================================
   CAMERA
   ========================================================= */

const cameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();

function updateCamera(delta) {
  const target = currentVehicle || player;

  const distance = currentVehicle ? 12 : 8;
  const height = currentVehicle ? 6 : 4.5;

  const behind = new THREE.Vector3(
    0,
    height,
    -distance
  );

  behind.applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    target.rotation.y
  );

  desiredCameraPosition.copy(target.position).add(behind);

  camera.position.lerp(
    desiredCameraPosition,
    Math.min(1, delta * 5)
  );

  cameraTarget.copy(target.position);
  cameraTarget.y += currentVehicle ? 1.6 : 1.7;

  camera.lookAt(cameraTarget);
}

/* =========================================================
   MINIMAP
   ========================================================= */

function drawMinimap() {
  if (!minimapContext) return;

  const ctx = minimapContext;
  const width = minimapCanvas.width;
  const height = minimapCanvas.height;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#29452f";
  ctx.fillRect(0, 0, width, height);

  const scale = width / (CONFIG.CITY_LIMIT * 2);
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.strokeStyle = "#92999e";
  ctx.lineWidth = CONFIG.ROAD_WIDTH * scale;

  for (
    let p = -CONFIG.CITY_LIMIT;
    p <= CONFIG.CITY_LIMIT;
    p += CONFIG.ROAD_SPACING
  ) {
    const px = centerX + p * scale;
    const py = centerY + p * scale;

    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }

  for (const remote of remotePlayers) {
    const x = centerX + remote.targetPosition.x * scale;
    const y = centerY + remote.targetPosition.z * scale;

    ctx.fillStyle = "#ffca28";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const target = currentVehicle || player;

  const px = centerX + target.position.x * scale;
  const py = centerY + target.position.z * scale;

  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(
    px + Math.sin(target.rotation.y) * 12,
    py + Math.cos(target.rotation.y) * 12
  );
  ctx.stroke();
}

/* =========================================================
   PAUSE, RESTART AND MAIN MENU
   ========================================================= */

function pauseGame(force) {
  gamePaused = typeof force === "boolean" ? force : !gamePaused;
  $("vc-pause").style.display = gamePaused ? "flex" : "none";
}

function restartGame() {
  if (currentVehicle) {
    currentVehicle.userData.occupied = false;
    currentVehicle.userData.speed = 0;
    currentVehicle = null;
  }

  player.visible = true;
  player.position.set(0, 0, 12);
  player.rotation.set(0, 0, 0);

  playerVerticalOffset = 0;
  jumpVelocity = 0;
  isJumping = false;

  activeMission = 0;
  playerScore = 0;
  hudSpeed = 0;

  for (let i = 0; i < missionMarkers.length; i++) {
    missionMarkers[i].visible = i === 0;
  }

  for (const vehicle of vehicles) {
    vehicle.userData.speed = 0;
    vehicle.userData.occupied = false;
  }

  gamePaused = false;
  $("vc-pause").style.display = "none";

  updateHUD();
  showMessage("GAME RESTARTED");
}

function returnToMenu() {
  gameStarted = false;
  gamePaused = false;
  requestedStart = false;

  $("vc-pause").style.display = "none";
  $("vc-start").style.display = "flex";

  if (currentVehicle) {
    currentVehicle.userData.occupied = false;
    currentVehicle.userData.speed = 0;
    currentVehicle = null;
  }

  player.visible = true;
  player.position.set(0, 0, 12);

  if (socket && socket.connected) {
    socket.emit("leaveGame");
  }
}

$("vc-pause-button").addEventListener("click", () => pauseGame());
$("vc-resume").addEventListener("click", () => pauseGame(false));
$("vc-restart").addEventListener("click", restartGame);
$("vc-menu").addEventListener("click", returnToMenu);

$("vc-garage-button").addEventListener("click", () => {
  toggleGarage();
});

$("vc-close-garage").addEventListener("click", () => {
  toggleGarage(false);
});

/* =========================================================
   START GAME
   ========================================================= */

function startGame() {
  if (gameStarted) return;

  playerName = $("vc-name").value.trim().slice(0, 18) || "Player";

  if (!/^[a-zA-Z0-9 _.-]+$/.test(playerName)) {
    showMessage("USE LETTERS AND NUMBERS IN YOUR NAME");
    return;
  }

  player.userData.nameTag.userData.setName(playerName);

  gameStarted = true;
  requestedStart = true;

  $("vc-start").style.display = "none";

  updateHUD();
  showMessage("WELCOME TO VICE CITY");

  if (socket && socket.connected) {
    socket.emit("joinGame", {
      name: playerName,
      gender: playerGender
    });
  }
}

$("vc-start-button").addEventListener("click", startGame);

$("vc-name").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    startGame();
  }
});

/* =========================================================
   KEYBOARD INPUT
   ========================================================= */

window.addEventListener("keydown", event => {
  keys[event.code] = true;

  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]
      .includes(event.code)
  ) {
    event.preventDefault();
  }

  if (event.repeat) return;

  if (event.code === "KeyV" && gameStarted) {
    toggleGarage();
  }

  if (event.code === "KeyE" && gameStarted) {
    toggleVehicle();
  }

  if (event.code === "Escape" && gameStarted) {
    pauseGame();
  }

  if (event.code === "KeyC" && gameStarted && currentVehicle) {
    const types = Object.keys(VEHICLES);
    const index = types.indexOf(currentVehicle.userData.type);
    const nextType = types[(index + 1) % types.length];

    const position = currentVehicle.position.clone();
    const rotation = currentVehicle.rotation.y;

    world.remove(currentVehicle);

    const oldIndex = vehicles.indexOf(currentVehicle);
    if (oldIndex >= 0) vehicles.splice(oldIndex, 1);

    const replacement = spawnVehicle(
      nextType,
      position,
      VEHICLES[nextType].color
    );

    replacement.rotation.y = rotation;
    replacement.userData.occupied = true;
    currentVehicle = replacement;

    selectedVehicle = nextType;
    emitVehicleState();
    showMessage(VEHICLES[nextType].name);
  }
});

window.addEventListener("keyup", event => {
  keys[event.code] = false;
});

window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) {
    keys[key] = false;
  }

  for (const key of Object.keys(touchControls)) {
    touchControls[key] = false;
  }
});

/* =========================================================
   MOBILE CONTROLS
   ========================================================= */

document.querySelectorAll("[data-control]").forEach(button => {
  const control = button.dataset.control;

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    touchControls[control] = true;

    if (button.setPointerCapture) {
      button.setPointerCapture(event.pointerId);
    }
  });

  const release = event => {
    event.preventDefault();
    touchControls[control] = false;
  };

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

$("vc-mobile-enter").addEventListener("click", toggleVehicle);

/* =========================================================
   GAME UPDATE
   ========================================================= */

function updateGame(delta) {
  if (!gameStarted || gamePaused) return;

  updatePlayer(delta);
  updateCar(delta);
  updateTraffic(delta);
  updatePedestrians(delta);
  updateTrafficCollisions();
  updateMissions(delta);
  updateRemotePlayers(delta);
  updateCamera(delta);

  networkTimer += delta;

  if (networkTimer >= CONFIG.NETWORK_RATE / 1000) {
    networkTimer = 0;

    if (socket && socket.connected) {
      emitPlayerState();
    }
  }

  if (collisionMessageTimer > 0) {
    collisionMessageTimer -= delta;

    if (collisionMessageTimer <= 0) {
      $("vc-message").style.opacity = "0";
    }
  }

  if (messageTimer > 0) {
    messageTimer -= delta;

    if (messageTimer <= 0 && collisionMessageTimer <= 0) {
      $("vc-message").style.opacity = "0";
    }
  }

  updateHUD();
  drawMinimap();
}

/* =========================================================
   ANIMATION LOOP
   ========================================================= */

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  if (gameStarted && !gamePaused) {
    updateGame(delta);
  } else {
    updateRemotePlayers(delta);
  }

  renderer.render(scene, camera);
}

/* =========================================================
   WINDOW RESIZE
   ========================================================= */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
});

/* =========================================================
   INITIAL CONNECTION STATUS AND STARTUP
   ========================================================= */

if (socket) {
  $("vc-connect-label").textContent = socket.connected
    ? "ONLINE"
    : "CONNECTING...";
} else {
  $("vc-connect-label").textContent = "OFFLINE MODE";
}

updatePlayerCount(1);
updateHUD();

camera.position.set(0, 8, -12);
camera.lookAt(player.position);

animate();

/* =========================================================
   END OF VICE CITY — UPDATE 24
   ========================================================= */
