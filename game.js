import * as THREE from "https://esm.sh/three@0.160.0";

/* =========================================================
   VICE CITY — UPDATE 21
   GARAGE + FIVE DISTINCT VEHICLES + INDIVIDUAL PERFORMANCE
   Multiplayer, chat, missions, pedestrians, traffic retained.

   WASD / ARROWS = Move or drive
   SPACE         = Jump
   E             = Enter / exit vehicle
   V             = Open / close garage (on foot)
   C             = Change vehicle paint
   ENTER         = Chat
   ESC           = Close garage / chat / pause
   R             = Restart
   ========================================================= */

const CONFIG = {
  CITY_LIMIT: 900,
  ROAD_SPACING: 200,
  ROAD_WIDTH: 24,
  MAX_TRAFFIC: 9,
  MAX_PEDESTRIANS: 8,
  NETWORK_RATE: 50
};

const VEHICLES = {
  sport: {
    name: "911 SPORTS",
    subtitle: "Porsche 911 Carrera inspired",
    topSpeed: 294,
    reverseSpeed: 45,
    acceleration: 8.0,
    braking: 14,
    friction: 5.5,
    steering: 1.65,
    color: 0xe33b2e
  },
  supercar: {
    name: "296 SUPERCAR",
    subtitle: "Ferrari 296 GTB inspired",
    topSpeed: 330,
    reverseSpeed: 52,
    acceleration: 10.0,
    braking: 16,
    friction: 5.2,
    steering: 1.85,
    color: 0xd71920
  },
  suv: {
    name: "PERFORMANCE SUV",
    subtitle: "Luxury performance SUV inspired",
    topSpeed: 250,
    reverseSpeed: 42,
    acceleration: 6.2,
    braking: 12,
    friction: 6,
    steering: 1.28,
    color: 0x202a35
  },
  sedan: {
    name: "SPORT SEDAN",
    subtitle: "Performance four-door sedan inspired",
    topSpeed: 230,
    reverseSpeed: 40,
    acceleration: 4.8,
    braking: 11,
    friction: 6,
    steering: 1.45,
    color: 0x2467a6
  },
  jeep: {
    name: "OFF-ROAD JEEP",
    subtitle: "Jeep Wrangler inspired",
    topSpeed: 180,
    reverseSpeed: 35,
    acceleration: 3.8,
    braking: 9.5,
    friction: 7,
    steering: 1.12,
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
scene.fog = new THREE.Fog(0x91c4df, 180, 950);

const camera = new THREE.PerspectiveCamera(
  65, innerWidth / innerHeight, 0.1, 1200
);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance"
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

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
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const sphereGeo = new THREE.SphereGeometry(1, 10, 8);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

function box(parent, x, y, z, sx, sy, sz, material) {
  const mesh = new THREE.Mesh(boxGeo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, x, y, z, radius, height, material, segments = 12) {
  const geometry = segments === 12
    ? cylinderGeo
    : new THREE.CylinderGeometry(1, 1, 1, segments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(radius, height, radius);
  parent.add(mesh);
  return mesh;
}

/* LIGHTING AND CITY */

scene.add(new THREE.HemisphereLight(0xcceaff, 0x596044, 2));

const sun = new THREE.DirectionalLight(0xffedcf, 1.4);
sun.position.set(-250, 500, 200);
scene.add(sun);

box(
  world, 0, -1.2, 0,
  CONFIG.CITY_LIMIT * 2.3, 1, CONFIG.CITY_LIMIT * 2.3,
  mat.grass
);

const roadLines = [];

function createRoads() {
  const L = CONFIG.CITY_LIMIT;
  const S = CONFIG.ROAD_SPACING;
  const W = CONFIG.ROAD_WIDTH;

  for (let p = -L; p <= L; p += S) {
    roadLines.push(p);

    box(world, p, -.55, 0, W, .12, L * 2.1, mat.road);
    box(world, 0, -.55, p, L * 2.1, .12, W);

    for (const side of [-1, 1]) {
      box(world, p + side * (W / 2 + 3), -.38, 0, 5, .35, L * 2.1, mat.sidewalk);
      box(world, 0, -.38, p + side * (W / 2 + 3), L * 2.1, .35, 5, mat.sidewalk);
    }

    box(world, p, -.475, 0, .22, .025, L * 2, mat.yellow);
    box(world, 0, -.475, p, L * 2, .025, .22, mat.yellow);
  }
}

function createCrosswalks() {
  for (const x of roadLines) {
    for (const z of roadLines) {
      box(world, x, -.465, z + 21, 24, .025, 5, mat.white);
      box(world, x + 21, -.465, z, 5, .025, 24, mat.white);
    }
  }
}

function createPark(x, z) {
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

const buildings = [];

function createBuilding(x, z, w, d, h, material) {
  box(world, x, h / 2 - .25, z, w, h, d, material);
  buildings.push({ x, z, width: w, depth: d, height: h });

  if (h > 55 && Math.random() > .5) {
    box(world, x, h + 1, z, w * .25, 2, d * .25, mat.concrete);
  }
}

function createCity() {
  const S = CONFIG.ROAD_SPACING;
  const L = CONFIG.CITY_LIMIT;

  for (let gx = -L + 100; gx < L; gx += S) {
    for (let gz = -L + 100; gz < L; gz += S) {
      const n = Math.abs(Math.floor(gx / S) * 7 + Math.floor(gz / S) * 11);

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

function createWindows() {
  const inst = new THREE.InstancedMesh(
    boxGeo,
    new THREE.MeshLambertMaterial({ color: 0x7eafc1 }),
    1800
  );

  const dummy = new THREE.Object3D();
  let index = 0;

  for (const b of buildings) {
    if (index >= 1770) break;

    const rows = Math.min(7, Math.floor(b.height / 14));

    for (let r = 0; r < rows && index < 1800; r++) {
      for (let c = 0; c < 2 && index < 1800; c++) {
        dummy.position.set(
          b.x - b.width * .25 + c * b.width * .5,
          5 + r * 12,
          b.z + b.depth / 2 + .12
        );
        dummy.scale.set(3.5, 4.5, .15);
        dummy.updateMatrix();
        inst.setMatrixAt(index++, dummy.matrix);
      }
    }
  }

  inst.count = index;
  inst.instanceMatrix.needsUpdate = true;
  world.add(inst);
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
  for (let i = 0; i < 55; i++) {
    const x = rand(-900, 900);
    const z = rand(-900, 900);

    cylinder(world, x, 4, z, .65, 8, mat.trunk);

    const crown = new THREE.Mesh(sphereGeo, mat.tree);
    crown.position.set(x, 8.5, z);
    crown.scale.set(3.5, 1.4, 3.5);
    world.add(crown);
  }
}

/* PLAYER CHARACTERS */

let selectedGender = "male";
const STREET_BLUE = 0x315d9b;

function createCharacter(color = STREET_BLUE, gender = "male") {
  const root = new THREE.Group();
  const female = gender === "female";

  const shirt = new THREE.MeshLambertMaterial({ color: STREET_BLUE });
  const pants = new THREE.MeshLambertMaterial({ color: 0x26364a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc88e68 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x241914 });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x17191d });

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(.31, .48, 4, 8),
    shirt
  );
  torso.position.y = 1.42;
  torso.scale.set(female ? .88 : 1, 1, .72);
  root.add(torso);

  const waist = new THREE.Mesh(new THREE.BoxGeometry(.48, .22, .32), pants);
  waist.position.y = 1.02;
  root.add(waist);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.105, .12, .2, 8), skin);
  neck.position.y = 1.86;
  root.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.27, 14, 12), skin);
  head.position.y = 2.15;
  head.scale.set(.92, 1.18, .92);
  root.add(head);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(.285, 12, 10), hair);
  cap.position.set(0, 2.3, -.025);
  cap.scale.set(1, .58, 1);
  root.add(cap);

  if (female) {
    const back = new THREE.Mesh(new THREE.SphereGeometry(.25, 10, 8), hair);
    back.position.set(0, 2.03, -.16);
    back.scale.set(1.05, 1.35, .65);
    root.add(back);

    for (const s of [-1, 1]) {
      const lock = new THREE.Mesh(
        new THREE.CapsuleGeometry(.075, .35, 3, 6),
        hair
      );
      lock.position.set(s * .23, 2.02, .015);
      root.add(lock);
    }
  }

  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.065, 8, 6), skin);
    ear.position.set(s * .255, 2.13, 0);
    ear.scale.set(.65, 1, .7);
    root.add(ear);
  }

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x171717 });

  for (const x of [-.095, .095]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), eyeMat);
    eye.position.set(x, 2.17, .245);
    root.add(eye);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), skin);
  nose.position.set(0, 2.1, .27);
  root.add(nose);

  box(
    root, 0, 1.48, .224, .055, .38, .018,
    new THREE.MeshLambertMaterial({ color: 0x172f50 })
  );

  const arms = [];
  const legs = [];

  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * .34, 1.68, 0);
    root.add(pivot);

    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(.105, .27, 4, 7), shirt
    );
    upper.position.y = -.19;
    pivot.add(upper);

    const fore = new THREE.Mesh(
      new THREE.CapsuleGeometry(.075, .22, 4, 7), skin
    );
    fore.position.y = -.48;
    pivot.add(fore);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 7), skin);
    hand.position.set(0, -.66, .015);
    pivot.add(hand);
    arms.push(pivot);

    const leg = new THREE.Group();
    leg.position.set(s * .16, .96, 0);
    root.add(leg);

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(.115, .28, 4, 7), pants
    );
    thigh.position.y = -.2;
    leg.add(thigh);

    const lower = new THREE.Mesh(
      new THREE.CapsuleGeometry(.085, .26, 4, 7), pants
    );
    lower.position.y = -.48;
    leg.add(lower);

    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(.23, .14, .36), shoeMat
    );
    shoe.position.set(0, -.7, .09);
    leg.add(shoe);
    legs.push(leg);
  }

  root.userData = { arms, legs, walkTime: 0, gender };
  return root;
}

function animateCharacter(c, dt, moving, speed = 1) {
  const d = c.userData;
  if (!d.arms || !d.legs) return;

  d.walkTime = moving
    ? d.walkTime + dt * Math.min(13, 5 + speed * 2)
    : d.walkTime * .82;

  const swing = moving ? Math.sin(d.walkTime) * .65 : 0;
  d.arms[0].rotation.x = swing;
  d.arms[1].rotation.x = -swing;
  d.legs[0].rotation.x = -swing;
  d.legs[1].rotation.x = swing;
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
    ctx.fillText(String(value || "Driver").slice(0, 16).toUpperCase(), 256, 64);
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
   VEHICLE MODEL BUILDER
   Every model has a different body, cabin, lights and wheels.
   Vehicles face +Z.
   ========================================================= */

function createCar(color = 0xe33b2e, style = "sport") {
  const car = new THREE.Group();
  const spec = VEHICLES[style] || VEHICLES.sport;

  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: .3,
    metalness: .35
  });

  const darkPaint = new THREE.MeshStandardMaterial({
    color: 0x171c22,
    roughness: .45,
    metalness: .15
  });

  const glass = new THREE.MeshStandardMaterial({
    color: 0x183746,
    roughness: .16,
    metalness: .22
  });

  const rubber = new THREE.MeshStandardMaterial({
    color: 0x101214,
    roughness: .95
  });

  const alloy = new THREE.MeshStandardMaterial({
    color: 0xb9c2c8,
    metalness: .82,
    roughness: .25
  });

  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
  const redLamp = new THREE.MeshBasicMaterial({ color: 0xf22b20 });
  const grille = new THREE.MeshStandardMaterial({
    color: 0x0d1115,
    metalness: .3,
    roughness: .6
  });

  const wheels = [];
  const wheelPositions = [];

  function part(x, y, z, sx, sy, sz, material, rz = 0) {
    const m = box(car, x, y, z, sx, sy, sz, material);
    m.rotation.z = rz;
    return m;
  }

  function addWheel(x, z, radius = .43, width = .28) {
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 18),
      rubber
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, radius + .08, z);
    car.add(tire);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * .62, radius * .62, width * 1.04, 14),
      alloy
    );
    rim.rotation.z = Math.PI / 2;
    rim.position.copy(tire.position);
    car.add(rim);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * .17, radius * .17, width * 1.08, 12),
      darkPaint
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(tire.position);
    car.add(hub);

    wheels.push(tire, rim, hub);
    wheelPositions.push({ x, z });
  }

  function addHeadlights(width = .42, y = 1.05, z = 2.05) {
    for (const s of [-1, 1]) {
      part(s * .78, y, z, width, .14, .09, lamp);
      part(s * .78, .83, z + .035, .12, .045, .06, darkPaint);
    }
  }

  function addTailLights(width = .48, y = 1.02, z = -2.05) {
    for (const s of [-1, 1]) {
      part(s * .82, y, z, width, .15, .09, redLamp);
    }
  }

  function addWindowsAndRoof({
    roofY = 1.85,
    roofLength = 1.45,
    cabinWidth = 1.65,
    frontZ = .65,
    rearZ = -.85
  } = {}) {
    // Side window areas.
    for (const s of [-1, 1]) {
      part(s * (cabinWidth / 2 + .015), roofY - .18,
        (frontZ + rearZ) / 2, .055, .48, roofLength, glass);
      part(s * (cabinWidth / 2 + .045), roofY + .07,
        (frontZ + rearZ) / 2, .075, .09, roofLength + .1, paint);
    }

    // Roof and windshield.
    part(0, roofY + .08, (frontZ + rearZ) / 2,
      cabinWidth, .15, roofLength, paint);

    const windshield = part(
      0, roofY - .16, frontZ + .07,
      cabinWidth * .94, .48, .09, glass, -.20
    );

    windshield.rotation.x = -.13;

    const rearGlass = part(
      0, roofY - .16, rearZ - .04,
      cabinWidth * .9, .42, .09, glass, .18
    );
    rearGlass.rotation.x = .13;
  }

  if (style === "sport") {
    // 911-inspired: rounded, wide rear and sloping roof.
    part(0, .83, 0, 2.38, .55, 4.45, paint);
    part(0, 1.04, 1.35, 2.25, .27, 1.45, paint);
    part(0, 1.00, -1.55, 2.32, .28, 1.18, paint);

    addWindowsAndRoof({
      roofY: 1.73,
      roofLength: 1.72,
      cabinWidth: 1.72,
      frontZ: .62,
      rearZ: -.92
    });

    part(0, .64, 2.26, 2.42, .22, .22, darkPaint);
    part(0, .68, 2.39, .78, .25, .035, grille);
    part(0, .57, 2.37, 2.3, .07, .25, darkPaint);

    // Curved-look front fender details and rear arches.
    for (const s of [-1, 1]) {
      part(s * 1.03, .97, 1.0, .12, .18, 1.55, paint);
      part(s * 1.05, .95, -1.25, .14, .2, 1.45, paint);
      part(s * 1.18, .62, 0, .12, .16, 3.15, darkPaint);
      part(s * 1.1, 1.42, .48, .22, .12, .22, paint);
    }

    addHeadlights(.48, 1.06, 2.15);
    addTailLights(.55, 1.04, -2.13);

    // Full-width rear light bar.
    part(0, 1.12, -2.23, 1.75, .055, .045, redLamp);

    // Rear deck spoiler.
    part(0, 1.48, -1.9, 1.55, .07, .2, darkPaint);
    part(-.68, 1.34, -1.9, .07, .2, .09, darkPaint);
    part(.68, 1.34, -1.9, .07, .2, .09, darkPaint);

    for (const x of [-1.2, 1.2]) {
      for (const z of [-1.45, 1.45]) addWheel(x, z, .46, .3);
    }
  }

  else if (style === "supercar") {
    // 296 GTB-inspired: extremely low nose, sculpted sides,
    // large rear haunches and prominent side air intakes.
    part(0, .68, 0, 2.35, .42, 4.55, paint);
    part(0, .75, 1.45, 2.2, .25, 1.55, paint);
    part(0, .78, -1.62, 2.3, .34, 1.25, paint);

    // Low, compact cockpit.
    addWindowsAndRoof({
      roofY: 1.56,
      roofLength: 1.48,
      cabinWidth: 1.68,
      frontZ: .55,
      rearZ: -.88
    });

    part(0, 1.64, -.12, 1.72, .12, 1.48, paint);

    // Sculpted side air-intake panels.
    for (const s of [-1, 1]) {
      part(s * 1.15, .86, -.62, .13, .43, .72, darkPaint);
      part(s * 1.19, .88, -.62, .045, .22, .48, grille);
      part(s * 1.12, .66, .7, .12, .16, 1.3, paint);
      part(s * 1.1, .93, -1.48, .16, .3, .85, paint);
      part(s * 1.1, 1.31, .35, .2, .1, .22, paint);
    }

    // Sharp, slim headlights.
    for (const s of [-1, 1]) {
      part(s * .78, .96, 2.18, .62, .1, .1, lamp, s * -.08);
    }

    part(0, .62, 2.3, 2.3, .1, .24, darkPaint);
    part(0, .62, 2.43, 1.0, .15, .035, grille);

    // Rear diffuser and thin tail lights.
    part(0, .55, -2.24, 2.25, .2, .24, darkPaint);
    part(0, 1.04, -2.22, 1.85, .07, .06, redLamp);

    for (const s of [-1, 1]) {
      part(s * .9, 1.02, -2.17, .24, .12, .07, redLamp);
    }

    // Central exhausts.
    for (const s of [-1, 1]) {
      cylinder(car, s * .32, .63, -2.36, .105, .13, alloy, 12)
        .rotation.x = Math.PI / 2;
    }

    for (const x of [-1.18, 1.18]) {
      for (const z of [-1.5, 1.48]) addWheel(x, z, .43, .29);
    }
  }

  else if (style === "suv") {
    // Performance SUV: tall cabin, wide grille, broad wheel arches.
    part(0, 1.02, 0, 2.65, .78, 4.75, paint);
    part(0, 1.13, 1.52, 2.58, .42, 1.25, paint);
    part(0, 1.16, -1.68, 2.6, .42, 1.1, paint);

    // Tall cabin.
    part(0, 2.03, -.12, 2.1, 1.25, 2.65, glass);
    part(0, 2.7, -.12, 2.16, .16, 2.72, paint);

    for (const s of [-1, 1]) {
      part(s * 1.08, 2.02, -.12, .13, 1.0, 2.65, paint);
      part(s * 1.13, 1.95, .72, .055, .7, .95, glass);
      part(s * 1.13, 1.95, -.55, .055, .7, .9, glass);
      part(s * 1.13, 1.34, -.05, .1, .08, .22, alloy);
      part(s * 1.28, .94, 1.2, .12, .62, 1.1, darkPaint);
      part(s * 1.28, .94, -1.25, .12, .62, 1.1, darkPaint);
      part(s * 1.33, 1.05, 0, .09, .15, 3.1, darkPaint);
    }

    // Large front grille.
    part(0, 1.12, 2.42, 1.45, .5, .06, grille);
    part(0, .82, 2.4, 2.48, .13, .18, darkPaint);

    for (const s of [-1, 1]) {
      part(s * .91, 1.5, 2.35, .48, .2, .09, lamp);
      part(s * 1.0, .85, 2.35, .35, .12, darkPaint);
    }

    addTailLights(.58, 1.42, -2.4);

    // Roof rails.
    for (const s of [-1, 1]) {
      part(s * .88, 2.82, -.1, .08, .09, 2.2, alloy);
    }

    for (const x of [-1.35, 1.35]) {
      for (const z of [-1.52, 1.5]) addWheel(x, z, .53, .34);
    }
  }

  else if (style === "sedan") {
    // Sports sedan: long bonnet, four doors and separate boot.
    part(0, .88, 0, 2.48, .58, 4.8, paint);
    part(0, 1.05, 1.45, 2.4, .3, 1.55, paint);
    part(0, 1.06, -1.68, 2.4, .3, 1.18, paint);

    // Four-door cabin.
    part(0, 1.72, -.18, 1.9, .95, 2.45, glass);
    part(0, 2.23, -.18, 1.95, .13, 2.5, paint);

    for (const s of [-1, 1]) {
      part(s * .98, 1.7, -.18, .08, .82, 2.45, paint);
      part(s * 1.02, 1.74, .57, .04, .62, .82, glass);
      part(s * 1.02, 1.74, -.48, .04, .62, .82, glass);
      part(s * 1.25, 1.12, .38, .035, .06, .18, alloy);
      part(s * 1.25, 1.12, -.6, .035, .06, .18, alloy);
      part(s * 1.18, .61, 0, .12, .16, 3.3, darkPaint);
      part(s * 1.02, 1.02, .95, .055, .06, .8, darkPaint);
    }

    part(0, .76, 2.43, 2.48, .23, .2, darkPaint);
    part(0, .85, 2.48, 1.2, .3, .05, grille);

    addHeadlights(.48, 1.12, 2.23);
    addTailLights(.55, 1.08, -2.3);

    part(0, .65, -2.42, 2.35, .12, .18, darkPaint);

    for (const x of [-1.23, 1.23]) {
      for (const z of [-1.55, 1.52]) addWheel(x, z, .43, .29);
    }
  }

  else if (style === "jeep") {
    // Wrangler-inspired: upright box body, exposed spare wheel,
    // vertical grille slots, round lights and rugged tyres.
    part(0, 1.0, 0, 2.55, .85, 4.35, paint);
    part(0, 1.22, 1.35, 2.52, .55, 1.25, paint);
    part(0, 1.18, -1.55, 2.5, .5, 1.1, paint);

    // Upright cabin and roof.
    part(0, 2.05, -.18, 2.1, 1.25, 2.55, paint);
    part(0, 2.73, -.18, 2.25, .2, 2.9, darkPaint);

    // Large front windscreen.
    part(0, 2.12, 1.1, 1.95, .83, .1, glass, -.06);

    for (const s of [-1, 1]) {
      part(s * 1.08, 2.04, -.2, .12, 1.1, 2.55, darkPaint);
      part(s * 1.12, 1.96, -.5, .06, .7, .9, glass);
      part(s * 1.12, 1.96, .55, .06, .7, .9, glass);
      part(s * 1.15, 1.18, 0, .12, .12, 3.3, darkPaint);
      part(s * 1.25, 1.36, .35, .12, .1, .2, alloy);
    }

    // Seven-slot grille.
    part(0, 1.38, 2.23, 1.05, .48, .07, darkPaint);

    for (let i = -3; i <= 3; i++) {
      part(i * .14, 1.38, 2.28, .055, .37, .025, alloy);
    }

    // Round headlights.
    for (const s of [-1, 1]) {
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(.2, .2, .09, 16),
        lamp
      );
      head.rotation.x = Math.PI / 2;
      head.position.set(s * .85, 1.42, 2.26);
      car.add(head);
    }

    addTailLights(.22, 1.35, -2.2);

    // Spare tyre mounted on rear.
    const spare = new THREE.Mesh(
      new THREE.TorusGeometry(.39, .13, 8, 16),
      rubber
    );
    spare.position.set(0, 1.45, -2.25);
    car.add(spare);

    const spareHub = new THREE.Mesh(
      new THREE.CylinderGeometry(.2, .2, .12, 12),
      alloy
    );
    spareHub.rotation.x = Math.PI / 2;
    spareHub.position.set(0, 1.45, -2.3);
    car.add(spareHub);

    // Large off-road wheels.
    for (const x of [-1.3, 1.3]) {
      for (const z of [-1.38, 1.42]) addWheel(x, z, .55, .38);
    }

    // Front bumper.
    part(0, .78, 2.32, 2.65, .2, .28, darkPaint);
  }

  car.userData.wheels = wheels;
  car.userData.paint = paint;
  car.userData.style = style;
  car.userData.spec = spec;
  car.userData.vehicleName = spec.name;

  return car;
}

/* LOCAL PLAYER AND CURRENT VEHICLE */

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
let car = createCar(VEHICLES.sport.color, selectedVehicleType);
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

const hud = {
  speed: document.getElementById("speed"),
  cash: document.getElementById("cash"),
  mode: document.getElementById("mode"),
  mission: document.getElementById("mission"),
  progress: document.getElementById("progress"),
  message: document.getElementById("message")
};

function showMessage(message) {
  hud.message.textContent = message;
  hud.message.style.opacity = "1";
  messageTimer = 2.2;
}

function jump() {
  if (
    !started || paused || driving || chatOpen || garageOpen ||
    jumping || player.position.y > .02
  ) return;

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
/* =========================================================
   GARAGE MENU
   ========================================================= */

const garageStyle = document.createElement("style");
garageStyle.textContent = `
#vice-garage{
  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
  width:min(760px,92vw);max-height:85vh;overflow-y:auto;
  padding:22px;background:rgba(8,15,24,.96);
  border:2px solid #e6b93e;border-radius:16px;
  color:#fff;font-family:Arial,sans-serif;z-index:10020;
  box-shadow:0 15px 55px rgba(0,0,0,.65);
}
#vice-garage.hidden{display:none}
#vice-garage h2{margin:0 0 5px;text-align:center;color:#ffd45b;font-size:27px}
#vice-garage .garage-sub{text-align:center;color:#c5d1dc;font-size:12px;margin-bottom:18px}
#vice-garage-grid{
  display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;
}
.vice-vehicle-card{
  text-align:left;padding:14px;border-radius:11px;
  border:1px solid #65717e;background:#172431;color:#fff;
  cursor:pointer;min-width:0;
}
.vice-vehicle-card:hover{background:#293b4c;border-color:#ffd45b}
.vice-vehicle-card.selected{border:2px solid #ffd45b;background:#39402e}
.vice-vehicle-card strong{display:block;color:#ffd45b;font-size:15px;margin-bottom:5px}
.vice-vehicle-card span{display:block;color:#d7e0e8;font-size:11px;line-height:1.45}
.vice-vehicle-card .garage-speed{margin-top:8px;color:#fff;font-weight:bold;font-size:13px}
#vice-garage-footer{display:flex;justify-content:space-between;gap:10px;margin-top:17px;flex-wrap:wrap}
#vice-garage-footer button{
  padding:11px 17px;border:0;border-radius:8px;
  background:#d6a62e;color:#151515;font-weight:bold;cursor:pointer;
}
#vice-garage-footer button:last-child{background:#374657;color:#fff}
#vice-garage-current{text-align:center;color:#9fd9ff;font-size:12px;margin-top:12px}
@media(max-width:520px){
  #vice-garage{padding:14px}
  #vice-garage-grid{grid-template-columns:1fr}
  #vice-garage h2{font-size:22px}
}
`;
document.head.appendChild(garageStyle);

const garagePanel = document.createElement("div");
garagePanel.id = "vice-garage";
garagePanel.className = "hidden";

const garageTitle = document.createElement("h2");
garageTitle.textContent = "VICE CITY VEHICLE GARAGE";

const garageSub = document.createElement("div");
garageSub.className = "garage-sub";
garageSub.textContent = "Choose your ride. Each vehicle has different performance.";

const garageGrid = document.createElement("div");
garageGrid.id = "vice-garage-grid";

const garageFooter = document.createElement("div");
garageFooter.id = "vice-garage-footer";

const garageCurrent = document.createElement("div");
garageCurrent.id = "vice-garage-current";

const garageClose = document.createElement("button");
garageClose.textContent = "CLOSE GARAGE";
garageClose.addEventListener("click", closeGarage);

const garageHelp = document.createElement("button");
garageHelp.textContent = "V OR ESC TO CLOSE";
garageHelp.addEventListener("click", closeGarage);

garageFooter.append(garageClose, garageHelp);
garagePanel.append(garageTitle, garageSub, garageGrid, garageFooter, garageCurrent);
document.body.appendChild(garagePanel);

function updateGarageCurrent() {
  const spec = VEHICLES[selectedVehicleType];
  garageCurrent.textContent =
    `CURRENT VEHICLE: ${spec.name} | TOP SPEED: ${spec.topSpeed} KM/H`;
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
    speed.textContent =
      `TOP SPEED: ${spec.topSpeed} KM/H`;

    const acceleration = document.createElement("span");
    acceleration.textContent =
      `Acceleration rating: ${spec.acceleration.toFixed(1)}`;

    card.append(title, description, speed, acceleration);

    card.addEventListener("click", () => {
      spawnVehicle(type);
      refreshGarageCards();
      updateGarageCurrent();
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
  if (garageOpen) {
    closeGarage();
    return;
  }

  openGarage();
}

/* Replace the current vehicle with the selected garage vehicle. */
function spawnVehicle(type) {
  if (!VEHICLES[type] || driving) return;

  const oldPosition = player.position.clone();
  const oldRotation = playerRotation;

  scene.remove(car);

  car.traverse(object => {
    if (object.geometry && object.geometry !== boxGeo) {
      object.geometry.dispose();
    }
  });

  selectedVehicleType = type;
  const spec = VEHICLES[type];

  car = createCar(spec.color, type);
  car.position.set(
    oldPosition.x + Math.sin(oldRotation) * 5,
    0,
    oldPosition.z + Math.cos(oldRotation) * 5
  );

  carRotation = oldRotation;
  car.rotation.y = carRotation;
  carSpeed = 0;
  scene.add(car);

  showMessage(`${spec.name} SPAWNED`);
  updateGarageCurrent();
}

/* =========================================================
   MULTIPLAYER
   Existing event names retained. Vehicle type and paint are
   also sent as additional fields for servers that relay them.
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
    skin: "street-blue",
    vehicleType: selectedVehicleType,
    color: car.userData.paint.color.getHex()
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

  const gender = data.gender === "female" ? "female" : "male";

  if (gender !== selectedGender) {
    selectedGender = gender;
    rebuildLocalCharacter(gender);
    updateGenderButtons();
  }

  localNameTag.userData.setName(myPlayerName);
  showMessage("WELCOME " + myPlayerName.toUpperCase());
  updatePlayerCount();

  if (requestedStart) startGame();
});

function addRemotePlayer(data) {
  if (!data || !data.id || data.id === myPlayerId || remotePlayers.has(data.id)) {
    return;
  }

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
    id: data.id,
    root,
    avatar,
    vehicle,
    nameTag,
    gender,
    vehicleType: type,
    targetPosition: new THREE.Vector3(
      data.x || 0,
      data.y || 0,
      data.z || 0
    ),
    targetRotation: Number.isFinite(data.rotation) ? data.rotation : 0,
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

socket.on("players:init", players => {
  if (Array.isArray(players)) players.forEach(addRemotePlayer);
  updatePlayerCount();
});

socket.on("player:joined", data => {
  addRemotePlayer(data);
  if (data?.name) showMessage(data.name + " JOINED THE CITY");
  updatePlayerCount();
});

socket.on("player:update", data => {
  if (!data || !data.id || data.id === myPlayerId) return;

  if (!remotePlayers.has(data.id)) addRemotePlayer(data);

  const remote = remotePlayers.get(data.id);
  if (!remote) return;

  if (![data.x, data.y, data.z, data.rotation].every(Number.isFinite)) {
    return;
  }

  remote.targetPosition.set(
    THREE.MathUtils.clamp(data.x, -950, 950),
    THREE.MathUtils.clamp(data.y, 0, 12),
    THREE.MathUtils.clamp(data.z, -950, 950)
  );

  remote.targetRotation = data.rotation;
  remote.driving = data.driving === true;
  remote.jumping = data.jumping === true;
  remote.speed = data.speed || 0;

  const gender = data.gender === "female" ? "female" : "male";

  if (gender !== remote.gender) {
    remote.root.remove(remote.avatar);
    remote.avatar = createCharacter(STREET_BLUE, gender);
    remote.root.add(remote.avatar);
    remote.gender = gender;
  }

  // If the server relays vehicleType, show the correct remote vehicle.
  if (VEHICLES[data.vehicleType] && data.vehicleType !== remote.vehicleType) {
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
  const remote = remotePlayers.get(id);
  if (!remote) return;

  scene.remove(remote.root);

  remote.root.traverse(object => {
    if (object.isSprite && object.material.map) {
      object.material.map.dispose();
    }
  });

  remotePlayers.delete(id);
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
      animateCharacter(
        remote.avatar,
        dt,
        remote.speed > .5 || remote.jumping,
        remote.speed / 10
      );
    } else {
      remote.vehicle.userData.wheels.forEach(wheel => {
        wheel.rotation.x += remote.speed * dt * .15;
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
  color:#fff;font-family:Arial,sans-serif;
  pointer-events:auto;z-index:10001
}
#vice-chat-log{
  height:125px;overflow-y:auto;padding:9px;margin-bottom:7px;
  border:1px solid rgba(255,255,255,.25);border-radius:9px;
  background:rgba(8,16,24,.88);font-size:12px;
  line-height:1.4;overflow-wrap:anywhere
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
#mission-panel #vice-chat{display:block}
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
    addChatLine(data.name || "Driver", String(data.message).slice(0, 180));
  }
});

addChatLine("VICE CITY", "Welcome! Press ENTER to chat.", true);

/* =========================================================
   TRAFFIC
   ========================================================= */

const traffic = [];

function createTraffic() {
  const styles = ["sport", "sedan", "suv", "jeep", "supercar"];

  for (let i = 0; i < CONFIG.MAX_TRAFFIC; i++) {
    const type = pick(styles);
    const vehicle = createCar(pick(carPaints), type);

    const axis = Math.random() > .5 ? "x" : "z";
    const lane = Math.round(rand(-4, 4)) * 200;
    const direction = Math.random() > .5 ? 1 : -1;

    vehicle.position.set(
      axis === "x" ? rand(-850, 850) : lane,
      0,
      axis === "z" ? rand(-850, 850) : lane
    );

    vehicle.rotation.y =
      axis === "x"
        ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (direction > 0 ? 0 : Math.PI);

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
    t.mesh.position[t.axis] += t.speed * t.direction * dt;

    if (Math.abs(t.mesh.position[t.axis]) > 920) {
      t.mesh.position[t.axis] = -t.mesh.position[t.axis];
    }

    t.mesh.userData.wheels.forEach(wheel => {
      wheel.rotation.x += t.speed * dt * .15;
    });
  }
}

/* =========================================================
   PEDESTRIANS
   ========================================================= */

const pedestrians = [];
const pedestrianColors = [
  0x315caa, 0xb34d35, 0x3b874e,
  0x9b6ab2, 0xd5a43c, 0xeeeeee
];

function createPedestrian() {
  const gender = Math.random() > .5 ? "male" : "female";
  const person = createCharacter(pick(pedestrianColors), gender);
  const axis = Math.random() > .5 ? "x" : "z";

  person.position.set(rand(-850, 850), 0, rand(-850, 850));
  scene.add(person);

  pedestrians.push({
    mesh: person,
    axis,
    direction: Math.random() > .5 ? 1 : -1,
    speed: rand(1, 2.5)
  });
}

function updatePedestrians(dt) {
  for (const p of pedestrians) {
    p.mesh.position[p.axis] += p.speed * p.direction * dt;

    p.mesh.rotation.y =
      p.axis === "x"
        ? (p.direction > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (p.direction > 0 ? 0 : Math.PI);

    if (Math.abs(p.mesh.position[p.axis]) > 880) {
      p.direction *= -1;
    }

    animateCharacter(p.mesh, dt, true, 1);
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
  if (key === "r" && !event.repeat) restartGame();

  if (key === "c" && !event.repeat && driving) {
    car.userData.paint.color.setHex(pick(carPaints));
    showMessage("NEW VEHICLE COLOUR");
  }
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

/* =========================================================
   ENTER / EXIT VEHICLE
   ========================================================= */

function toggleVehicle() {
  if (!started || paused || chatOpen || garageOpen) return;

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

/* =========================================================
   MOVEMENT
   Steering direction kept exactly as previously fixed.
   ========================================================= */

function updatePlayer(dt) {
  if (driving) return;

  const forward =
    pressed("w", "arrowup") || controls.accelerate;

  const backward =
    pressed("s", "arrowdown") || controls.brake;

  const left =
    pressed("a", "arrowleft") || controls.left;

  const right =
    pressed("d", "arrowright") || controls.right;

  const steeringInput = (left ? 1 : 0) - (right ? 1 : 0);

  if (forward || backward) {
    playerRotation += steeringInput * 2.2 * dt;
  }

  const direction = new THREE.Vector3(
    Math.sin(playerRotation),
    0,
    Math.cos(playerRotation)
  );

  const speed = forward ? 15 : backward ? 10 : 0;

  if (forward) player.position.addScaledVector(direction, speed * dt);
  if (backward) player.position.addScaledVector(direction, -speed * dt);

  player.rotation.y = playerRotation;

  player.position.x = THREE.MathUtils.clamp(player.position.x, -900, 900);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -900, 900);

  animateCharacter(player, dt, forward || backward, speed / 5);
}

/* Each vehicle uses its own speed and handling settings. */
function updateCar(dt) {
  if (!driving) {
    carSpeed *= Math.max(0, 1 - 2.5 * dt);
    return;
  }

  const spec = car.userData.spec;

  const maxSpeed = spec.topSpeed / 3.6;
  const reverseSpeed = spec.reverseSpeed / 3.6;

  const forward =
    pressed("w", "arrowup") || controls.accelerate;

  const backward =
    pressed("s", "arrowdown") || controls.brake;

  const left =
    pressed("a", "arrowleft") || controls.left;

  const right =
    pressed("d", "arrowright") || controls.right;

  const steeringInput = (left ? 1 : 0) - (right ? 1 : 0);

  if (forward) {
    carSpeed += spec.acceleration * dt;
  } else if (backward) {
    carSpeed -= spec.braking * dt;
  } else if (carSpeed > 0) {
    carSpeed = Math.max(0, carSpeed - spec.friction * dt);
  } else if (carSpeed < 0) {
    carSpeed = Math.min(0, carSpeed + spec.friction * dt);
  }

  carSpeed = THREE.MathUtils.clamp(
    carSpeed,
    -reverseSpeed,
    maxSpeed
  );

  const speedFactor = Math.min(Math.abs(carSpeed) / 25, 1);
  const direction = carSpeed >= 0 ? 1 : -1;

  // Steering is more responsive at speed, but differs by vehicle.
  carRotation +=
    steeringInput * spec.steering * speedFactor * direction * dt;

  car.position.x += Math.sin(carRotation) * carSpeed * dt;
  car.position.z += Math.cos(carRotation) * carSpeed * dt;

  car.position.x = THREE.MathUtils.clamp(car.position.x, -900, 900);
  car.position.z = THREE.MathUtils.clamp(car.position.z, -900, 900);

  car.rotation.y = carRotation;

  car.userData.wheels.forEach(wheel => {
    wheel.rotation.x += carSpeed * dt * .15;
  });
}

/* =========================================================
   CAMERA
   ========================================================= */

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

  const smoothing = 1 - Math.pow(.001, dt);

  camera.position.lerp(cameraPosition, smoothing);
  camera.lookAt(cameraTarget);
}

/* =========================================================
   HUD
   ========================================================= */

function updateHUD(dt) {
  hud.speed.textContent = Math.round(Math.abs(carSpeed) * 3.6);
  hud.cash.textContent = "$" + cash;

  hud.mode.textContent =
    driving
      ? "DRIVING"
      : jumping
        ? "JUMPING"
        : "ON FOOT";

  hud.mission.textContent =
    missionNames[checkpointIndex] || "ROUTE COMPLETE";

  hud.progress.textContent =
    `${checkpointIndex + 1} / ${checkpoints.length}`;

  if (messageTimer > 0) {
    messageTimer -= dt;

    if (messageTimer <= 0) {
      hud.message.style.opacity = "0";
    }
  }
}

/* =========================================================
   MINIMAP
   ========================================================= */

const minimap = document.getElementById("minimap");
const mapContext = minimap.getContext("2d");

function drawMinimap() {
  const w = minimap.width;
  const h = minimap.height;
  const scale = w / 1800;
  const center = w / 2;

  mapContext.clearRect(0, 0, w, h);
  mapContext.fillStyle = "#263c32";
  mapContext.fillRect(0, 0, w, h);

  mapContext.strokeStyle = "#687176";
  mapContext.lineWidth = Math.max(1, 24 * scale);

  for (const p of roadLines) {
    const pos = center + p * scale;

    mapContext.beginPath();
    mapContext.moveTo(pos, 0);
    mapContext.lineTo(pos, h);
    mapContext.stroke();

    mapContext.beginPath();
    mapContext.moveTo(0, pos);
    mapContext.lineTo(w, pos);
    mapContext.stroke();
  }

  mapContext.fillStyle = "#ffcf45";

  for (const p of checkpoints) {
    mapContext.beginPath();
    mapContext.arc(
      center + p.position.x * scale,
      center + p.position.z * scale,
      2.2, 0, Math.PI * 2
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

/* =========================================================
   START / PAUSE / GENDER
   ========================================================= */

const pauseScreen = document.getElementById("pause-screen");
const startScreen = document.getElementById("start-screen");

const genderSelector = document.createElement("div");
genderSelector.id = "gender-selector";
genderSelector.style.cssText =
  "display:flex;justify-content:center;gap:12px;margin:14px auto;flex-wrap:wrap";

function makeGenderButton(gender, label) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.dataset.gender = gender;

  button.style.cssText =
    "min-width:120px;padding:12px 20px;border:2px solid #f5c84c;" +
    "border-radius:10px;background:#18232d;color:white;" +
    "font-weight:bold;cursor:pointer";

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
  if (!started || chatOpen || garageOpen) return;

  paused = !paused;
  pauseScreen.classList.toggle("hidden", !paused);

  if (paused) clearControls();
}

function restartGame() {
  closeGarage();
  closeChat();

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

startButton.addEventListener("click", () => {
  const entered = nameInput.value.trim();

  if (!entered) {
    showMessage("ENTER YOUR PLAYER NAME");
    nameInput.focus();
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
  maleButton.style.opacity = ".55";
  femaleButton.style.opacity = ".55";

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
  closeGarage();
  closeChat();

  paused = false;
  started = false;
  requestedStart = false;
  multiplayerJoined = false;

  socket.disconnect();
  myPlayerId = null;

  maleButton.disabled = false;
  femaleButton.disabled = false;
  maleButton.style.opacity = "1";
  femaleButton.style.opacity = "1";

  pauseScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");

  clearControls();

  setTimeout(() => socket.connect(), 300);
});

/* =========================================================
   RESIZE
   ========================================================= */

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
});

/* =========================================================
   WORLD + MAIN LOOP
   ========================================================= */

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

let minimapTimer = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), .05);

  if (started && !paused) {
    if (!chatOpen && !garageOpen) {
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
