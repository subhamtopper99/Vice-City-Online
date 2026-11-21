
import * as THREE from "https://esm.sh/three@0.160.0";

/* =====================================================
   VICE CITY — UPDATE 19
   REAL-TIME MULTIPLAYER + LIVE CHAT + IMPROVED AVATARS

   W / UP       Accelerate
   S / DOWN     Reverse
   A / LEFT     Turn left
   D / RIGHT    Turn right
   SPACE        Jump
   E            Enter / Exit car
   ENTER        Open chat / Send message
   ESC          Pause / Close chat
   R            Restart
   ===================================================== */

const CONFIG = {
  CITY_LIMIT: 900,
  ROAD_SPACING: 200,
  ROAD_WIDTH: 24,
  MAX_TRAFFIC: 7,
  MAX_PEDESTRIANS: 8,
  NETWORK_RATE: 50
};

/* THREE.JS */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91c4df);
scene.fog = new THREE.Fog(0x91c4df, 180, 950);

const camera = new THREE.PerspectiveCamera(
  65, innerWidth / innerHeight, 0.1, 1200
);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance"
});

renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

/* MATERIALS */

const mat = {
  road: new THREE.MeshLambertMaterial({ color: 0x30343a }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0xaaa9a2 }),
  grass: new THREE.MeshLambertMaterial({ color: 0x477b43 }),
  concrete: new THREE.MeshLambertMaterial({ color: 0xb5b3ad }),
  white: new THREE.MeshLambertMaterial({ color: 0xece9df }),
  yellow: new THREE.MeshLambertMaterial({ color: 0xf5c84c }),
  tree: new THREE.MeshLambertMaterial({ color: 0x28613a }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x755238 })
};

const buildingMaterials = [
  0x9b9b91, 0xc3b8a5, 0x777e82, 0xb6a18b,
  0x6c7c86, 0xd0c5b1, 0x8d8d83, 0x77736c
].map(c => new THREE.MeshLambertMaterial({ color: c }));

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
const capsuleGeo = new THREE.CapsuleGeometry(0.16, 0.45, 4, 8);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

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

/* LIGHTING AND GROUND */

scene.add(new THREE.HemisphereLight(0xcceaff, 0x596044, 2));

const sun = new THREE.DirectionalLight(0xffedcf, 1.4);
sun.position.set(-250, 500, 200);
scene.add(sun);

box(world, 0, -1.2, 0,
  CONFIG.CITY_LIMIT * 2.3, 1,
  CONFIG.CITY_LIMIT * 2.3, mat.grass);

/* ROADS */

const roadLines = [];

function createRoads() {
  const limit = CONFIG.CITY_LIMIT;
  const spacing = CONFIG.ROAD_SPACING;
  const width = CONFIG.ROAD_WIDTH;

  for (let p = -limit; p <= limit; p += spacing) {
    roadLines.push(p);

    box(world, p, -0.55, 0, width, 0.12,
      limit * 2.1, mat.road);

    box(world, 0, -0.55, p,
      limit * 2.1, 0.12, width, mat.road);

    for (const side of [-1, 1]) {
      box(world, p + side * (width / 2 + 3),
        -0.38, 0, 5, 0.35, limit * 2.1, mat.sidewalk);

      box(world, 0, -0.38,
        p + side * (width / 2 + 3),
        limit * 2.1, 0.35, 5, mat.sidewalk);
    }

    box(world, p, -0.475, 0,
      0.22, 0.025, limit * 2, mat.yellow);

    box(world, 0, -0.475, p,
      limit * 2, 0.025, 0.22, mat.yellow);
  }
}

function createCrosswalks() {
  for (const x of roadLines) {
    for (const z of roadLines) {
      box(world, x, -0.465, z + 21,
        24, 0.025, 5, mat.white);

      box(world, x + 21, -0.465, z,
        5, 0.025, 24, mat.white);
    }
  }
}

/* PARKS */

function createPark(x, z) {
  box(world, x, -0.35, z, 125, 0.4, 125, mat.grass);
  box(world, x, -0.12, z, 8, 0.08, 105, mat.sidewalk);
  box(world, x, -0.11, z, 105, 0.08, 8, mat.sidewalk);

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

/* BUILDINGS */

const buildings = [];

function createBuilding(x, z, width, depth, height, material) {
  box(world, x, height / 2 - 0.25, z,
    width, height, depth, material);

  buildings.push({ x, z, width, depth, height });

  if (height > 55 && Math.random() > 0.5) {
    box(world, x, height + 1, z,
      width * 0.25, 2, depth * 0.25, mat.concrete);
  }
}

function createCity() {
  const spacing = CONFIG.ROAD_SPACING;
  const limit = CONFIG.CITY_LIMIT;

  for (let gx = -limit + 100; gx < limit; gx += spacing) {
    for (let gz = -limit + 100; gz < limit; gz += spacing) {
      const number = Math.abs(
        Math.floor(gx / spacing) * 7 +
        Math.floor(gz / spacing) * 11
      );

      if (number % 13 === 0) {
        createPark(gx, gz);
        continue;
      }

      const downtown =
        Math.abs(gx) < 300 && Math.abs(gz) < 300;

      const count = downtown ? 3 : 2;

      for (let i = 0; i < count; i++) {
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

function createWindows() {
  const instanced = new THREE.InstancedMesh(
    boxGeo,
    new THREE.MeshLambertMaterial({ color: 0x7eafc1 }),
    1800
  );

  const dummy = new THREE.Object3D();
  let index = 0;

  for (const b of buildings) {
    if (index >= 1770) break;

    const rows = Math.min(7, Math.floor(b.height / 14));

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 2; col++) {
        if (index >= 1800) break;

        dummy.position.set(
          b.x - b.width * 0.25 + col * b.width * 0.5,
          5 + row * 12,
          b.z + b.depth / 2 + 0.12
        );

        dummy.scale.set(3.5, 4.5, 0.15);
        dummy.updateMatrix();
        instanced.setMatrixAt(index++, dummy.matrix);
      }
    }
  }

  instanced.count = index;
  instanced.instanceMatrix.needsUpdate = true;
  world.add(instanced);
}

/* STREETLIGHTS AND PALMS */

function createStreetlights() {
  const positions = [];

  for (let p = -900; p <= 900; p += 200) {
    for (let q = -900; q <= 900; q += 200) {
      positions.push([p + 17, q + 17]);
      positions.push([p - 17, q - 17]);
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

  const dummy = new THREE.Object3D();

  positions.forEach(([x, z], i) => {
    dummy.position.set(x, 5, z);
    dummy.scale.set(0.25, 10, 0.25);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, 10.2, z);
    dummy.scale.set(0.9, 0.45, 0.9);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
  });

  world.add(poles, lamps);
}

function createPalms() {
  for (let i = 0; i < 55; i++) {
    const x = rand(-900, 900);
    const z = rand(-900, 900);

    cylinder(world, x, 4, z, 0.65, 8, mat.trunk);

    const crown = new THREE.Mesh(sphereGeo, mat.tree);
    crown.position.set(x, 8.5, z);
    crown.scale.set(3.5, 1.4, 3.5);
    world.add(crown);
  }
}

/* =====================================================
   IMPROVED PLAYER CHARACTERS
   Both genders wear Street Blue.
   ===================================================== */

let selectedGender = "male";

const STREET_BLUE = 0x315d9b;

function createCharacter(color = STREET_BLUE, gender = "male") {
  const root = new THREE.Group();
  const isFemale = gender === "female";

  const shirtMat = new THREE.MeshLambertMaterial({
    color: STREET_BLUE
  });

  const pantsMat = new THREE.MeshLambertMaterial({
    color: 0x26364a
  });

  const skinMat = new THREE.MeshLambertMaterial({
    color: 0xc88e68
  });

  const hairMat = new THREE.MeshLambertMaterial({
    color: isFemale ? 0x241914 : 0x211d1a
  });

  const shoeMat = new THREE.MeshLambertMaterial({
    color: 0x17191d
  });

  const detailMat = new THREE.MeshLambertMaterial({
    color: 0x172f50
  });

  // Torso and waist.
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.31, 0.48, 4, 8),
    shirtMat
  );
  torso.position.y = 1.42;
  torso.scale.set(isFemale ? 0.88 : 1, 1, 0.72);
  root.add(torso);

  const waist = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.22, 0.32),
    pantsMat
  );
  waist.position.y = 1.02;
  root.add(waist);

  // Neck and head.
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.12, 0.20, 8),
    skinMat
  );
  neck.position.y = 1.86;
  root.add(neck);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 14, 12),
    skinMat
  );
  head.position.y = 2.15;
  head.scale.set(0.92, 1.18, 0.92);
  root.add(head);

  // Hair cap.
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.285, 12, 10),
    hairMat
  );
  hairCap.position.set(0, 2.30, -0.025);
  hairCap.scale.set(1, 0.58, 1);
  root.add(hairCap);

  if (isFemale) {
    // Longer hairstyle.
    const backHair = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 10, 8),
      hairMat
    );
    backHair.position.set(0, 2.03, -0.16);
    backHair.scale.set(1.05, 1.35, 0.65);
    root.add(backHair);

    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.075, 0.35, 3, 6),
        hairMat
      );
      lock.position.set(side * 0.23, 2.02, 0.015);
      lock.rotation.z = side * -0.10;
      root.add(lock);
    }
  } else {
    // Short hair at the back.
    const backHair = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      hairMat
    );
    backHair.position.set(0, 2.10, -0.13);
    backHair.scale.set(1, 0.8, 0.65);
    root.add(backHair);
  }

  // Ears.
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 8, 6),
      skinMat
    );
    ear.position.set(side * 0.255, 2.13, 0);
    ear.scale.set(0.65, 1, 0.7);
    root.add(ear);
  }

  // Eyes and nose.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x171717 });

  for (const x of [-0.095, 0.095]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 6),
      eyeMat
    );
    eye.position.set(x, 2.17, 0.245);
    root.add(eye);
  }

  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    skinMat
  );
  nose.position.set(0, 2.10, 0.27);
  nose.scale.set(0.8, 1, 1);
  root.add(nose);

  // Shirt front detail.
  box(root, 0, 1.48, 0.224, 0.055, 0.38, 0.018, detailMat);

  // Arms with shoulder, upper arm, forearm and hands.
  const arms = [];

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, 1.68, 0);
    root.add(pivot);

    const upperArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.105, 0.27, 4, 7),
      shirtMat
    );
    upperArm.position.y = -0.19;
    upperArm.rotation.z = side * -0.08;
    pivot.add(upperArm);

    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.075, 0.22, 4, 7),
      skinMat
    );
    forearm.position.set(0, -0.48, 0);
    pivot.add(forearm);

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 7),
      skinMat
    );
    hand.position.set(0, -0.66, 0.015);
    pivot.add(hand);

    arms.push(pivot);
  }

  // Legs and shoes.
  const legs = [];

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16, 0.96, 0);
    root.add(pivot);

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.115, 0.28, 4, 7),
      pantsMat
    );
    thigh.position.y = -0.20;
    pivot.add(thigh);

    const lowerLeg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.26, 4, 7),
      pantsMat
    );
    lowerLeg.position.y = -0.48;
    pivot.add(lowerLeg);

    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.14, 0.36),
      shoeMat
    );
    shoe.position.set(0, -0.70, 0.09);
    pivot.add(shoe);

    legs.push(pivot);
  }

  root.userData = {
    arms,
    legs,
    walkTime: 0,
    gender
  };

  return root;
}

function animateCharacter(character, dt, moving, speed = 1) {
  const data = character.userData;
  if (!data.arms || !data.legs) return;

  if (moving) {
    data.walkTime += dt * Math.min(13, 5 + speed * 2);
  } else {
    data.walkTime *= 0.82;
  }

  const swing = moving ? Math.sin(data.walkTime) * 0.65 : 0;

  data.arms[0].rotation.x = swing;
  data.arms[1].rotation.x = -swing;
  data.legs[0].rotation.x = -swing;
  data.legs[1].rotation.x = swing;
}

/* NAME TAGS */

function createNameTag(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");

  function drawName(value) {
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = "rgba(0,0,0,0.78)";
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

  drawName(name);

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
    drawName(value);
    texture.needsUpdate = true;
  };

  return sprite;
}

/* CAR */

function createCar(color = 0xd52c27) {
  const car = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x233c4a });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17191b });

  box(car, 0, 1, 0, 2.5, 0.75, 4.8, bodyMat);
  box(car, 0, 1.65, -0.25, 1.9, 0.9, 2.4, glassMat);

  const wheels = [];

  for (const x of [-1.25, 1.25]) {
    for (const z of [-1.5, 1.5]) {
      const wheel = new THREE.Mesh(cylinderGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.55, z);
      wheel.scale.set(0.48, 0.25, 0.48);
      car.add(wheel);
      wheels.push(wheel);
    }
  }

  car.userData.wheels = wheels;
  return car;
}

/* LOCAL PLAYER */

const player = createCharacter(STREET_BLUE, selectedGender);
scene.add(player);
player.position.set(0, 0, 30);

const localNameTag = createNameTag("Driver");
player.add(localNameTag);

function rebuildLocalCharacter(gender) {
  const oldPosition = player.position.clone();
  const oldRotation = player.rotation.y;
  const replacement = createCharacter(STREET_BLUE, gender);

  player.clear();

  while (replacement.children.length) {
    player.add(replacement.children[0]);
  }

  player.userData = replacement.userData;
  player.position.copy(oldPosition);
  player.rotation.y = oldRotation;
  player.add(localNameTag);
}

const car = createCar(0xe33b2e);
scene.add(car);

let driving = false;
let carSpeed = 0;
let carRotation = 0;
let playerRotation = 0;

const MAX_SPEED = 75;
const REVERSE_SPEED = 28;
const ACCELERATION = 35;
const BRAKING = 55;
const FRICTION = 16;
const STEERING_SPEED = 1.65;

/* JUMP PHYSICS */

const JUMP_FORCE = 9.5;
const GRAVITY = 24;

let verticalVelocity = 0;
let jumping = false;

function jump() {
  if (!started || paused || driving || chatOpen) return;
  if (jumping || player.position.y > 0.02) return;

  jumping = true;
  verticalVelocity = JUMP_FORCE;
  showMessage("JUMP!");
}

function updateJump(dt) {
  if (driving) {
    player.position.y = 0;
    verticalVelocity = 0;
    jumping = false;
    return;
  }

  if (jumping || player.position.y > 0) {
    verticalVelocity -= GRAVITY * dt;
    player.position.y += verticalVelocity * dt;

    if (player.position.y <= 0) {
      player.position.y = 0;
      verticalVelocity = 0;
      jumping = false;
    }
  }
}

/* MULTIPLAYER CONNECTION */

const socket = window.io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000
});

let myPlayerId = null;
let myPlayerName = "Driver";
let multiplayerJoined = false;
let requestedStart = false;

const remotePlayers = new Map();

const connectionElement = document.getElementById("connection");
const playerCountElement = document.getElementById("player-count");

function updateConnection(online) {
  connectionElement.textContent = online ? "ONLINE" : "DISCONNECTED";
  connectionElement.classList.toggle("online", online);
  connectionElement.classList.toggle("offline", !online);
}

function updatePlayerCount() {
  playerCountElement.textContent =
    "PLAYERS: " + (remotePlayers.size + (myPlayerId ? 1 : 0));
}

function joinGame() {
  if (!socket.connected || multiplayerJoined || !requestedStart) return;

  socket.emit("player:join", {
    name: myPlayerName,
    gender: selectedGender,
    skin: "street-blue"
  });

  multiplayerJoined = true;
}

socket.on("connect", () => {
  updateConnection(true);
  joinGame();
});

socket.on("disconnect", () => {
  updateConnection(false);
  multiplayerJoined = false;
  myPlayerId = null;
  updatePlayerCount();
});

socket.on("connect_error", () => updateConnection(false));

socket.on("player:assigned", data => {
  if (!data || !data.id) return;

  myPlayerId = data.id;
  myPlayerName = data.name || myPlayerName;

  const serverGender =
    data.gender === "female" ? "female" : "male";

  if (serverGender !== selectedGender) {
    selectedGender = serverGender;
    rebuildLocalCharacter(selectedGender);
    updateGenderButtons();
  }

  localNameTag.userData.setName(myPlayerName);
  showMessage("WELCOME " + myPlayerName.toUpperCase());
  updatePlayerCount();

  if (requestedStart) startGame();
});

socket.on("players:init", players => {
  if (!Array.isArray(players)) return;
  players.forEach(addRemotePlayer);
  updatePlayerCount();
});

socket.on("player:joined", data => {
  addRemotePlayer(data);

  if (data?.name) showMessage(data.name + " JOINED THE CITY");
  updatePlayerCount();
});

socket.on("player:update", updateRemotePlayer);

socket.on("player:left", id => {
  const remote = remotePlayers.get(id);
  if (!remote) return;

  scene.remove(remote.root);
  remote.root.traverse(obj => {
    if (obj.isSprite && obj.material.map) {
      obj.material.map.dispose();
    }
  });

  remotePlayers.delete(id);
  updatePlayerCount();
});

function addRemotePlayer(data) {
  if (!data || !data.id || data.id === myPlayerId) return;
  if (remotePlayers.has(data.id)) return;

  const gender = data.gender === "female" ? "female" : "male";
  const root = new THREE.Group();
  const avatar = createCharacter(STREET_BLUE, gender);
  const vehicle = createCar(data.color || 0x2874bb);
  const nameTag = createNameTag(data.name || "Driver");

  root.add(avatar, vehicle, nameTag);
  scene.add(root);

  const remote = {
    id: data.id,
    root,
    avatar,
    vehicle,
    nameTag,
    gender,
    targetPosition: new THREE.Vector3(
      data.x || 0, data.y || 0, data.z || 0
    ),
    targetRotation: data.rotation || 0,
    driving: data.driving === true,
    jumping: data.jumping === true,
    speed: data.speed || 0
  };

  avatar.visible = !remote.driving;
  vehicle.visible = remote.driving;

  root.position.copy(remote.targetPosition);
  root.rotation.y = remote.targetRotation;

  remotePlayers.set(data.id, remote);
}

function updateRemotePlayer(data) {
  if (!data || !data.id || data.id === myPlayerId) return;

  if (!remotePlayers.has(data.id)) addRemotePlayer(data);

  const remote = remotePlayers.get(data.id);
  if (!remote) return;

  if (
    !Number.isFinite(data.x) ||
    !Number.isFinite(data.y) ||
    !Number.isFinite(data.z) ||
    !Number.isFinite(data.rotation)
  ) return;

  remote.targetPosition.set(
    THREE.MathUtils.clamp(data.x, -950, 950),
    THREE.MathUtils.clamp(data.y, 0, 12),
    THREE.MathUtils.clamp(data.z, -950, 950)
  );

  remote.targetRotation = data.rotation;
  remote.driving = data.driving === true;
  remote.jumping = data.jumping === true;
  remote.speed = data.speed || 0;

  const newGender = data.gender === "female" ? "female" : "male";

  if (newGender !== remote.gender) {
    remote.root.remove(remote.avatar);
    remote.avatar = createCharacter(STREET_BLUE, newGender);
    remote.avatar.visible = !remote.driving;
    remote.root.add(remote.avatar);
    remote.gender = newGender;
  }

  remote.avatar.visible = !remote.driving;
  remote.vehicle.visible = remote.driving;
}

function updateRemotePlayers(dt) {
  const smoothing = 1 - Math.pow(0.002, dt);

  for (const remote of remotePlayers.values()) {
    remote.root.position.lerp(remote.targetPosition, smoothing);

    const difference = Math.atan2(
      Math.sin(remote.targetRotation - remote.root.rotation.y),
      Math.cos(remote.targetRotation - remote.root.rotation.y)
    );

    remote.root.rotation.y += difference * smoothing;

    if (!remote.driving) {
      animateCharacter(
        remote.avatar,
        dt,
        remote.speed > 0.5 || remote.jumping,
        remote.speed / 10
      );
    }

    if (remote.driving) {
      remote.vehicle.userData.wheels.forEach(wheel => {
        wheel.rotation.x += remote.speed * dt * 0.15;
      });
    }
  }
}

let networkTimer = 0;

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
    speed: driving ? carSpeed : 0,
    gender: selectedGender
  });
}

/* =====================================================
   LIVE CHAT UI
   ===================================================== */

let chatOpen = false;

const chatStyle = document.createElement("style");
chatStyle.textContent = `
  #vice-chat {
    position:fixed;
    left:18px;
    bottom:18px;
    width:min(340px, calc(100vw - 36px));
    z-index:10000;
    color:white;
    font-family:Arial,sans-serif;
    pointer-events:auto;
  }

  #vice-chat-log {
    height:170px;
    overflow-y:auto;
    padding:10px;
    margin-bottom:8px;
    border:1px solid rgba(255,255,255,.22);
    border-radius:10px;
    background:rgba(8,16,24,.78);
    font-size:13px;
    line-height:1.45;
    overflow-wrap:anywhere;
  }

  #vice-chat-entry {
    display:flex;
    gap:6px;
  }

  #vice-chat-input {
    min-width:0;
    flex:1;
    padding:11px;
    border:1px solid #d5b34d;
    border-radius:8px;
    background:#17232e;
    color:white;
    outline:none;
  }

  #vice-chat-send {
    padding:10px 13px;
    border:0;
    border-radius:8px;
    background:#d6a62e;
    color:#171717;
    font-weight:bold;
    cursor:pointer;
  }

  #vice-chat-hint {
    margin-top:5px;
    color:#e5e5e5;
    font-size:11px;
    text-shadow:0 1px 2px #000;
  }

  .vice-chat-line { margin-bottom:5px; }
  .vice-chat-name { color:#ffd65b; font-weight:bold; }
  .vice-chat-system { color:#8fd7ff; font-style:italic; }
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
chatHint.textContent = "ENTER: chat  |  ESC: close chat";

chatEntry.append(chatInput, chatSend);
chatPanel.append(chatLog, chatEntry, chatHint);
document.body.appendChild(chatPanel);

function addChatLine(name, message, system = false) {
  const line = document.createElement("div");
  line.className = "vice-chat-line";

  if (system) {
    const text = document.createElement("span");
    text.className = "vice-chat-system";
    text.textContent = message;
    line.appendChild(text);
  } else {
    const sender = document.createElement("span");
    sender.className = "vice-chat-name";
    sender.textContent = name + ": ";

    const body = document.createElement("span");
    body.textContent = message;

    line.append(sender, body);
  }

  chatLog.appendChild(line);

  while (chatLog.children.length > 45) {
    chatLog.removeChild(chatLog.firstChild);
  }

  chatLog.scrollTop = chatLog.scrollHeight;
}

function openChat() {
  if (!started || paused) return;
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
  if (!data || !data.message) return;
  addChatLine(data.name || "Driver", data.message);
});

addChatLine("VICE CITY", "Welcome! Press ENTER to chat.", true);

/* TRAFFIC */

const traffic = [];

function createTraffic() {
  const colors = [
    0x2874bb, 0xe8c54c, 0xeeeeee,
    0x252525, 0x39a66b, 0xc45a35
  ];

  for (let i = 0; i < CONFIG.MAX_TRAFFIC; i++) {
    const vehicle = createCar(pick(colors));
    const axis = Math.random() > 0.5 ? "x" : "z";
    const lane = Math.round(rand(-4, 4)) * 200;
    const direction = Math.random() > 0.5 ? 1 : -1;

    vehicle.position.set(
      axis === "x" ? rand(-850, 850) : lane,
      0,
      axis === "z" ? rand(-850, 850) : lane
    );

    vehicle.rotation.y = axis === "x"
      ? direction > 0 ? Math.PI / 2 : -Math.PI / 2
      : direction > 0 ? 0 : Math.PI;

    scene.add(vehicle);

    traffic.push({
      mesh: vehicle,
      axis,
      direction,
      speed: rand(12, 23)
    });
  }
}

function updateTraffic(dt) {
  for (const t of traffic) {
    const movement = t.speed * t.direction * dt;

    if (t.axis === "x") {
      t.mesh.position.x += movement;
      if (Math.abs(t.mesh.position.x) > 920) {
        t.mesh.position.x = -t.mesh.position.x;
      }
    } else {
      t.mesh.position.z += movement;
      if (Math.abs(t.mesh.position.z) > 920) {
        t.mesh.position.z = -t.mesh.position.z;
      }
    }
  }
}

/* PEDESTRIANS */

const pedestrians = [];

const pedestrianColors = [
  0x315caa, 0xb34d35, 0x3b874e,
  0x9b6ab2, 0xd5a43c, 0xeeeeee
];

function createPedestrian() {
  const gender = Math.random() > 0.5 ? "male" : "female";
  const person = createCharacter(pick(pedestrianColors), gender);
  const axis = Math.random() > 0.5 ? "x" : "z";

  person.position.set(rand(-850, 850), 0, rand(-850, 850));
  scene.add(person);

  pedestrians.push({
    mesh: person,
    axis,
    direction: Math.random() > 0.5 ? 1 : -1,
    speed: rand(1, 2.5)
  });
}

function updatePedestrians(dt) {
  for (const p of pedestrians) {
    const movement = p.speed * p.direction * dt;

    if (p.axis === "x") {
      p.mesh.position.x += movement;
      p.mesh.rotation.y = p.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (Math.abs(p.mesh.position.x) > 880) p.direction *= -1;
    } else {
      p.mesh.position.z += movement;
      p.mesh.rotation.y = p.direction > 0 ? 0 : Math.PI;
      if (Math.abs(p.mesh.position.z) > 880) p.direction *= -1;
    }

    animateCharacter(p.mesh, dt, true, 1);
  }
}

/* CHECKPOINTS */

const checkpoints = [];
let checkpointIndex = 0;
let cash = 0;

function createCheckpoints() {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd34d,
    wireframe: true
  });

  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2;
    const radius = 250 + (i % 3) * 130;

    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(7, 0.8, 6, 18),
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
    checkpointIndex = (checkpointIndex + 1) % checkpoints.length;
    cash += 100;
    showMessage("CHECKPOINT COMPLETE +$100");
  }
}

/* INPUT */

const keys = Object.create(null);

const controls = {
  accelerate: false,
  brake: false,
  left: false,
  right: false
};

function clearControls() {
  for (const key in keys) keys[key] = false;
  for (const key in controls) controls[key] = false;
}

function pressed(...names) {
  return names.some(name => keys[name]);
}

window.addEventListener("keydown", event => {
  if (chatOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeChat();
    }
    return;
  }

  const key = event.key.toLowerCase();

  if ([
    "arrowup", "arrowdown", "arrowleft",
    "arrowright", " ", "spacebar"
  ].includes(key)) event.preventDefault();

  if (key === "enter" && started && !paused) {
    event.preventDefault();
    openChat();
    return;
  }

  keys[key] = true;

  if (key === " " && !event.repeat) jump();
  if (key === "e" && !event.repeat) toggleVehicle();
  if (key === "escape" && !event.repeat) togglePause();
  if (key === "r" && !event.repeat) restartGame();
});

window.addEventListener("keyup", event => {
  keys[event.key.toLowerCase()] = false;
});

window.addEventListener("blur", clearControls);

function bindMobileControl(id, name) {
  const element = document.getElementById(id);
  if (!element) return;

  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    controls[name] = true;
    element.setPointerCapture?.(event.pointerId);
  });

  const release = () => controls[name] = false;

  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("lostpointercapture", release);
}

bindMobileControl("accelerate", "accelerate");
bindMobileControl("brake", "brake");
bindMobileControl("left", "left");
bindMobileControl("right", "right");

/* ENTER / EXIT VEHICLE */

function toggleVehicle() {
  if (!started || paused || chatOpen) return;

  if (!driving) {
    if (player.position.distanceTo(car.position) < 9) {
      driving = true;
      jumping = false;
      verticalVelocity = 0;
      player.position.y = 0;
      player.visible = false;
      showMessage("VEHICLE ENTERED");
    } else {
      showMessage("MOVE CLOSER TO YOUR CAR");
    }
  } else {
    driving = false;
    player.visible = true;

    player.position.set(
      car.position.x + Math.sin(carRotation) * 4,
      0,
      car.position.z + Math.cos(carRotation) * 4
    );

    playerRotation = carRotation;
    showMessage("VEHICLE EXITED");
  }
}

/* PLAYER MOVEMENT */

function updatePlayer(dt) {
  if (driving) return;

  const forward = pressed("w", "arrowup") || controls.accelerate;
  const backward = pressed("s", "arrowdown") || controls.brake;
  const left = pressed("a", "arrowleft") || controls.left;
  const right = pressed("d", "arrowright") || controls.right;

  // Keep the previously confirmed steering direction.
  const steeringInput = (left ? 1 : 0) - (right ? 1 : 0);

  if (forward || backward) {
    playerRotation += steeringInput * 2.2 * dt;
  }

  const direction = new THREE.Vector3(
    Math.sin(playerRotation), 0, Math.cos(playerRotation)
  );

  const movementSpeed = forward ? 15 : backward ? 10 : 0;

  if (forward) {
    player.position.addScaledVector(direction, movementSpeed * dt);
  }

  if (backward) {
    player.position.addScaledVector(direction, -movementSpeed * dt);
  }

  player.rotation.y = playerRotation;
  player.position.x = THREE.MathUtils.clamp(player.position.x, -900, 900);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -900, 900);

  animateCharacter(player, dt, forward || backward, movementSpeed / 5);
}

/* CAR PHYSICS */

function updateCar(dt) {
  if (!driving) {
    carSpeed *= Math.max(0, 1 - 2.5 * dt);
    return;
  }

  const forward = pressed("w", "arrowup") || controls.accelerate;
  const backward = pressed("s", "arrowdown") || controls.brake;
  const left = pressed("a", "arrowleft") || controls.left;
  const right = pressed("d", "arrowright") || controls.right;

  // Keep the previously confirmed steering direction.
  const steeringInput = (left ? 1 : 0) - (right ? 1 : 0);

  if (forward) carSpeed += ACCELERATION * dt;
  else if (backward) carSpeed -= BRAKING * dt;
  else {
    if (carSpeed > 0) carSpeed = Math.max(0, carSpeed - FRICTION * dt);
    else if (carSpeed < 0) carSpeed = Math.min(0, carSpeed + FRICTION * dt);
  }

  carSpeed = THREE.MathUtils.clamp(
    carSpeed, -REVERSE_SPEED, MAX_SPEED
  );

  const speedFactor = Math.min(Math.abs(carSpeed) / 25, 1);
  const reverseFactor = carSpeed >= 0 ? 1 : -1;

  carRotation += steeringInput * STEERING_SPEED *
    speedFactor * reverseFactor * dt;

  car.position.x += Math.sin(carRotation) * carSpeed * dt;
  car.position.z += Math.cos(carRotation) * carSpeed * dt;

  car.position.x = THREE.MathUtils.clamp(car.position.x, -900, 900);
  car.position.z = THREE.MathUtils.clamp(car.position.z, -900, 900);

  car.rotation.y = carRotation;

  car.userData.wheels.forEach(wheel => {
    wheel.rotation.x += carSpeed * dt * 0.15;
  });
}

/* CAMERA */

const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();

function updateCamera(dt) {
  const target = driving ? car : player;
  const rotation = driving ? carRotation : playerRotation;

  const distance = driving ? 13 : 9;
  const height = driving ? 7 : 5;

  cameraTarget.set(
    target.position.x,
    target.position.y + 2,
    target.position.z
  );

  cameraPosition.set(
    target.position.x - Math.sin(rotation) * distance,
    target.position.y + height,
    target.position.z - Math.cos(rotation) * distance
  );

  const smoothing = 1 - Math.pow(0.001, dt);
  camera.position.lerp(cameraPosition, smoothing);
  camera.lookAt(cameraTarget);
}

/* HUD */

const hud = {
  speed: document.getElementById("speed"),
  cash: document.getElementById("cash"),
  mode: document.getElementById("mode"),
  mission: document.getElementById("mission"),
  progress: document.getElementById("progress"),
  message: document.getElementById("message")
};

let messageTimer = 0;

function showMessage(message) {
  hud.message.textContent = message;
  hud.message.style.opacity = "1";
  messageTimer = 2.2;
}

function updateHUD(dt) {
  hud.speed.textContent = Math.round(Math.abs(carSpeed) * 3.6);
  hud.cash.textContent = "$" + cash;

  hud.mode.textContent = driving
    ? "DRIVING"
    : jumping ? "JUMPING" : "ON FOOT";

  hud.mission.textContent = "REACH THE NEXT CHECKPOINT";
  hud.progress.textContent = `${checkpointIndex + 1} / 12`;

  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) hud.message.style.opacity = "0";
  }
}

/* MINIMAP */

const minimap = document.getElementById("minimap");
const mapContext = minimap.getContext("2d");

function drawMinimap() {
  const width = minimap.width;
  const height = minimap.height;
  const scale = width / 1800;
  const center = width / 2;

  mapContext.clearRect(0, 0, width, height);
  mapContext.fillStyle = "#263c32";
  mapContext.fillRect(0, 0, width, height);

  mapContext.strokeStyle = "#687176";
  mapContext.lineWidth = Math.max(1, 24 * scale);

  for (const p of roadLines) {
    const pos = center + p * scale;

    mapContext.beginPath();
    mapContext.moveTo(pos, 0);
    mapContext.lineTo(pos, height);
    mapContext.stroke();

    mapContext.beginPath();
    mapContext.moveTo(0, pos);
    mapContext.lineTo(width, pos);
    mapContext.stroke();
  }

  mapContext.fillStyle = "#ffcf45";

  for (const point of checkpoints) {
    mapContext.beginPath();
    mapContext.arc(
      center + point.position.x * scale,
      center + point.position.z * scale,
      2.5, 0, Math.PI * 2
    );
    mapContext.fill();
  }

  for (const remote of remotePlayers.values()) {
    mapContext.fillStyle = "#55d9ff";
    mapContext.beginPath();
    mapContext.arc(
      center + remote.root.position.x * scale,
      center + remote.root.position.z * scale,
      3, 0, Math.PI * 2
    );
    mapContext.fill();
  }

  const position = driving ? car.position : player.position;

  mapContext.fillStyle = "#ff4136";
  mapContext.beginPath();
  mapContext.arc(
    center + position.x * scale,
    center + position.z * scale,
    4, 0, Math.PI * 2
  );
  mapContext.fill();
}

/* START / PAUSE */

let paused = false;
let started = false;

const pauseScreen = document.getElementById("pause-screen");
const startScreen = document.getElementById("start-screen");

/* GENDER SELECTOR */

const genderSelector = document.createElement("div");
genderSelector.id = "gender-selector";
genderSelector.style.cssText = `
  display:flex;
  justify-content:center;
  align-items:center;
  gap:12px;
  margin:14px auto;
  width:100%;
  flex-wrap:wrap;
`;

function makeGenderButton(gender, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.gender = gender;

  button.style.cssText = `
    min-width:120px;
    padding:12px 20px;
    border:2px solid #f5c84c;
    border-radius:10px;
    background:#18232d;
    color:white;
    font-size:15px;
    font-weight:bold;
    cursor:pointer;
  `;

  button.addEventListener("click", () => {
    if (requestedStart) return;
    selectedGender = gender;
    rebuildLocalCharacter(selectedGender);
    updateGenderButtons();
  });

  return button;
}

const maleButton = makeGenderButton("male", "MALE");
const femaleButton = makeGenderButton("female", "FEMALE");

genderSelector.append(maleButton, femaleButton);

const nameInput = document.getElementById("player-name");
const startButton = document.getElementById("start");

nameInput.insertAdjacentElement("afterend", genderSelector);

function updateGenderButtons() {
  for (const button of [maleButton, femaleButton]) {
    const selected = button.dataset.gender === selectedGender;
    button.style.background = selected ? "#b7831c" : "#18232d";
    button.style.borderColor = selected ? "#fff0a8" : "#f5c84c";
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

  startScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  showMessage("WELCOME TO VICE CITY");
}

function togglePause() {
  if (!started || chatOpen) return;

  paused = !paused;
  pauseScreen.classList.toggle("hidden", !paused);

  if (paused) clearControls();
}

function restartGame() {
  car.position.set(0, 0, 0);
  carSpeed = 0;
  carRotation = 0;
  car.rotation.y = 0;

  player.position.set(0, 0, 30);
  playerRotation = 0;
  player.rotation.y = 0;
  player.visible = true;

  driving = false;
  jumping = false;
  verticalVelocity = 0;

  cash = 0;
  checkpointIndex = 0;

  clearControls();
  startGame();
}

/* NAME ENTRY */

startButton.addEventListener("click", () => {
  const enteredName = nameInput.value.trim();

  if (!enteredName) {
    showMessage("ENTER YOUR PLAYER NAME");
    nameInput.focus();
    return;
  }

  if (!socket.connected) {
    showMessage("SERVER NOT CONNECTED");
    return;
  }

  myPlayerName = enteredName.slice(0, 16);
  requestedStart = true;

  maleButton.disabled = true;
  femaleButton.disabled = true;
  maleButton.style.opacity = "0.55";
  femaleButton.style.opacity = "0.55";

  joinGame();
  showMessage("CONNECTING AS " + myPlayerName.toUpperCase());
});

nameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") startButton.click();
});

document.getElementById("resume-button").addEventListener("click", () => {
  if (paused) togglePause();
});

document.getElementById("restart-button").addEventListener("click", restartGame);

document.getElementById("menu-button").addEventListener("click", () => {
  paused = false;
  started = false;
  requestedStart = false;
  multiplayerJoined = false;

  // Return to menu and disconnect this player from the session.
  socket.disconnect();
  myPlayerId = null;

  maleButton.disabled = false;
  femaleButton.disabled = false;
  maleButton.style.opacity = "1";
  femaleButton.style.opacity = "1";

  pauseScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");

  closeChat();
  clearControls();

  // Reconnect so the next start can join again.
  setTimeout(() => socket.connect(), 300);
});

/* RESIZE */

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
});

/* WORLD INITIALIZATION */

createRoads();
createCrosswalks();
createCity();
createWindows();
createStreetlights();
createPalms();
createTraffic();
createCheckpoints();

for (let i = 0; i < CONFIG.MAX_PEDESTRIANS; i++) {
  createPedestrian();
}

camera.position.set(0, 8, 15);
camera.lookAt(0, 0, 0);

/* GAME LOOP */

let minimapTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (started && !paused) {
    if (!chatOpen) {
      updatePlayer(dt);
      updateJump(dt);
      updateCar(dt);
    }

    updateTraffic(dt);
    updatePedestrians(dt);
    updateRemotePlayers(dt);
    updateCamera(dt);
    updateCheckpoint();
    updateHUD(dt);
    sendPlayerUpdate(dt);

    minimapTimer += dt;

    if (minimapTimer >= 0.125) {
      drawMinimap();
      minimapTimer = 0;
    }
  }

  renderer.render(scene, camera);
}

updateConnection(false);
updatePlayerCount();
animate();
