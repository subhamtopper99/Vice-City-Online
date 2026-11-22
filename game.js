import * as THREE from "https://esm.sh/three@0.160.0";

/* =========================================================
   VICE CITY — UPDATE 25
   Complete game.js
   Original Update 23 visuals preserved.
   Multiplayer connection and reconnection improvements.
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
    topSpeed: 294, reverseSpeed: 45,
    acceleration: 8, braking: 14,
    friction: 5.5, steering: 1.65,
    color: 0xe33b2e
  },
  supercar: {
    name: "296 SUPERCAR",
    subtitle: "High-performance supercar",
    topSpeed: 330, reverseSpeed: 52,
    acceleration: 10, braking: 16,
    friction: 5.2, steering: 1.85,
    color: 0xd71920
  },
  suv: {
    name: "PERFORMANCE SUV",
    subtitle: "Luxury performance SUV",
    topSpeed: 250, reverseSpeed: 42,
    acceleration: 6.2, braking: 12,
    friction: 6, steering: 1.28,
    color: 0x202a35
  },
  sedan: {
    name: "SPORT SEDAN",
    subtitle: "Four-door performance sedan",
    topSpeed: 230, reverseSpeed: 40,
    acceleration: 4.8, braking: 11,
    friction: 6, steering: 1.45,
    color: 0x2467a6
  },
  jeep: {
    name: "OFF-ROAD JEEP",
    subtitle: "Rugged off-road vehicle",
    topSpeed: 180, reverseSpeed: 35,
    acceleration: 3.8, braking: 9.5,
    friction: 7, steering: 1.12,
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

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = THREE.MathUtils.clamp;

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

const buildingTexture = makeTexture("#a6a092", "building");
buildingTexture.repeat.set(1, 2);

const mat = {
  // A flat dark material avoids stretched UVs and white-looking roads.
  road: new THREE.MeshLambertMaterial({
    color: 0x30343a
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

scene.add(new THREE.HemisphereLight(0xcceaff, 0x596044, 2));

const sun = new THREE.DirectionalLight(0xffedcf, 1.4);
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

function createRoads() {
  const L = CONFIG.CITY_LIMIT;
  const S = CONFIG.ROAD_SPACING;
  const W = CONFIG.ROAD_WIDTH;

  for (let p = -L; p <= L; p += S) {
    roadLines.push(p);

    box(world, p, -.52, 0, W, .16, L * 2.1, mat.road);
    box(world, 0, -.52, p, L * 2.1, .16, W);

    for (const side of [-1, 1]) {
      box(
        world, p + side * (W / 2 + 3), -.38, 0,
        CONFIG.SIDEWALK_WIDTH, .35, L * 2.1, mat.sidewalk
      );

      box(
        world, 0, -.38, p + side * (W / 2 + 3),
        L * 2.1, .35, CONFIG.SIDEWALK_WIDTH, mat.sidewalk
      );
    }

    box(world, p - .18, -.435, 0, .10, .03, L * 2, mat.yellow);
    box(world, p + .18, -.435, 0, .10, .03, L * 2, mat.yellow);
    box(world, 0, -.435, p - .18, L * 2, .03, .10, mat.yellow);
    box(world, 0, -.435, p + .18, L * 2, .03, .10, mat.yellow);
  }
}

function createCrosswalks() {
  for (const x of roadLines) {
    for (const z of roadLines) {
      for (let i = -4; i <= 4; i++) {
        box(world, x + i * 2.3, -.465, z + 17.5, 1.1, .025, 5, mat.white);
        box(world, x + 17.5, -.465, z + i * 2.3, 5, .025, 1.1, mat.white);
      }
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

/* =========================================================
   PLAYER CHARACTERS
   ========================================================= */

let selectedGender = "male";
const STREET_BLUE = 0x315d9b;

function createCharacter(color = STREET_BLUE, gender = "male") {
  const root = new THREE.Group();
  const female = gender === "female";

  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x26364a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc88e68 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x241914 });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x17191d });

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(.31, .48, 4, 8), shirt
  );
  torso.position.y = 1.42;
  torso.scale.set(female ? .88 : 1, 1, .72);
  root.add(torso);

  const waist = new THREE.Mesh(
    new THREE.BoxGeometry(.48, .22, .32), pants
  );
  waist.position.y = 1.02;
  root.add(waist);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(.105, .12, .2, 8), skin
  );
  neck.position.y = 1.86;
  root.add(neck);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(.27, 14, 12), skin
  );
  head.position.y = 2.15;
  head.scale.set(.92, 1.18, .92);
  root.add(head);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(.285, 12, 10), hair
  );
  cap.position.set(0, 2.3, -.025);
  cap.scale.set(1, .58, 1);
  root.add(cap);

  if (female) {
    const back = new THREE.Mesh(
      new THREE.SphereGeometry(.25, 10, 8), hair
    );
    back.position.set(0, 2.03, -.16);
    back.scale.set(1.05, 1.35, .65);
    root.add(back);

    for (const s of [-1, 1]) {
      const lock = new THREE.Mesh(
        new THREE.CapsuleGeometry(.075, .35, 3, 6), hair
      );
      lock.position.set(s * .23, 2.02, .015);
      root.add(lock);
    }
  }

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x171717 });

  for (const x of [-.095, .095]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(.025, 8, 6), eyeMat
    );
    eye.position.set(x, 2.17, .245);
    root.add(eye);
  }

  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(.045, 8, 6), skin
  );
  nose.position.set(0, 2.1, .27);
  root.add(nose);

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

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(.09, 8, 7), skin
    );
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

function createCar(color = 0xe33b2e, style = "sport") {
  const car = new THREE.Group();
  const spec = VEHICLES[style] || VEHICLES.sport;

  const paint = new THREE.MeshStandardMaterial({
    color, roughness: .3, metalness: .35
  });

  const dark = new THREE.MeshStandardMaterial({
    color: 0x171c22, roughness: .45, metalness: .15
  });

  const glass = new THREE.MeshStandardMaterial({
    color: 0x183746, roughness: .16, metalness: .22
  });

  const rubber = new THREE.MeshStandardMaterial({
    color: 0x101214, roughness: .95
  });

  const alloy = new THREE.MeshStandardMaterial({
    color: 0xb9c2c8, metalness: .82, roughness: .25
  });

  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1cf });
  const redLamp = new THREE.MeshBasicMaterial({ color: 0xf22b20 });
  const wheels = [];

  function part(x, y, z, sx, sy, sz, material) {
    return box(car, x, y, z, sx, sy, sz, material);
  }

  function addWheel(x, z, radius = .43, width = .28) {
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 18), rubber
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
      dark
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(tire.position);
    car.add(hub);

    wheels.push(tire, rim, hub);
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
    }
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
        new THREE.CylinderGeometry(.2, .2, .09, 16), lamp
      );
      head.rotation.x = Math.PI / 2;
      head.position.set(s * .85, 1.42, 2.26);
      car.add(head);
    }
    part(0, 1.38, 2.23, 1.05, .48, .07, dark);
    for (let i = -3; i <= 3; i++) {
      part(i * .14, 1.38, 2.28, .055, .37, .025, alloy);
    }
    const spare = new THREE.Mesh(
      new THREE.TorusGeometry(.39, .13, 8, 16), rubber
    );
    spare.position.set(0, 1.45, -2.25);
    car.add(spare);
    for (const x of [-1.3, 1.3]) {
      for (const z of [-1.38, 1.42]) addWheel(x, z, .55, .38);
    }
  }

  car.userData.wheels = wheels;
  car.userData.paint = paint;
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

function setEngineRunning(running) {
  const nextState = !!running;
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

  if (!engineRunning) carSpeed = 0;
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

  const throttle = (keys.w || controls.accelerate) ? 1 : 0;
  const speed = Math.abs(carSpeed);
  const baseRpm = 48 + speed * 7.2 + throttle * 38;
  const rpm = baseRpm * stylePitch;

  const now = audio.context.currentTime;
  audio.low.frequency.setTargetAtTime(rpm * 0.85, now, 0.07);
  audio.mid.frequency.setTargetAtTime(rpm * 1.6, now, 0.07);
  audio.high.frequency.setTargetAtTime(rpm * 2.4, now, 0.07);
  audio.filter.frequency.setTargetAtTime(280 + speed * 32 + throttle * 180, now, 0.09);
  audio.noiseFilter.frequency.setTargetAtTime(140 + speed * 18, now, 0.1);

  // Slight volume variation with throttle
  const vol = 0.38 + throttle * 0.08 + Math.min(speed * 0.004, 0.1);
  audio.engineGain.gain.setTargetAtTime(vol, now, 0.08);
}

const vehicleControlStyle = document.createElement("style");
vehicleControlStyle.textContent = `
#vice-vehicle-controls{position:fixed;right:22px;bottom:28px;z-index:2147483000;display:none;gap:10px;flex-direction:column;align-items:stretch;pointer-events:auto}
#vice-vehicle-controls button{border:2px solid rgba(255,255,255,.8);border-radius:10px;padding:14px 18px;min-width:154px;min-height:48px;background:rgba(12,24,36,.96);color:#fff;font-size:13px;font-weight:900;letter-spacing:.6px;cursor:pointer;box-shadow:0 5px 18px #0009;touch-action:manipulation}
#vice-vehicle-controls button:active{transform:scale(.97)}
#vice-engine-button{background:rgba(25,105,65,.95)!important}
#vice-horn-button{background:rgba(35,75,125,.95)!important}
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
vehicleControls.append(engineButton, hornButton);
document.body.appendChild(vehicleControls);

function updateVehicleButtons() {
  engineButton.textContent = engineRunning ? "STOP ENGINE" : "START ENGINE";
  vehicleControls.style.display = driving && started && !paused ? "flex" : "none";
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

  remote.root.traverse(object => {
    if (object.geometry) object.geometry.dispose();

    if (object.material) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      for (const material of materials) {
        if (material.map) material.map.dispose();
        material.dispose();
      }
    }
  });

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
    clamp(data.y, 0, 12),
    clamp(data.z, -950, 950)
  );

  remote.targetRotation = data.rotation;
  remote.driving = data.driving === true;
  remote.jumping = data.jumping === true;
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
    const closestX = clamp(
      x, b.x - b.width / 2, b.x + b.width / 2
    );

    const closestZ = clamp(
      z, b.z - b.depth / 2, b.z + b.depth / 2
    );

    const dx = x - closestX;
    const dz = z - closestZ;

    if (dx * dx + dz * dz < radius * radius) {
      return true;
    }
  }

  return false;
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

  if (options.traffic && circleHitsTraffic(x, z, radius)) {
    return true;
  }

  if (options.pedestrians && circleHitsPedestrians(x, z, radius)) {
    return true;
  }

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

function updateTraffic(dt) {
  for (const t of traffic) {
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

    t.mesh.userData.wheels.forEach(wheel => {
      wheel.rotation.x += t.speed * dt * .15;
    });
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
  if (key === "h" && !event.repeat) playVehicleHorn();

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
      updateVehicleButtons();
      jumping = false;
      verticalVelocity = 0;
      player.position.y = 0;
      player.visible = false;
      showMessage("VEHICLE ENTERED — PRESS START ENGINE");
    } else {
      showMessage("MOVE CLOSER TO YOUR CAR");
    }
  } else {
    const exitX = car.position.x + Math.sin(carRotation) * 4;
    const exitZ = car.position.z + Math.cos(carRotation) * 4;

    if (positionBlocked(exitX, exitZ, PLAYER_RADIUS, {
      traffic: true,
      pedestrians: true
    })) {
      showMessage("NOT ENOUGH ROOM TO EXIT");
      return;
    }

    driving = false;
    setEngineRunning(false);
    updateVehicleButtons();
    player.visible = true;
    player.position.set(exitX, 0, exitZ);
    playerRotation = carRotation;
    showMessage("VEHICLE EXITED");
  }
}

/* =========================================================
   MOVEMENT WITH COLLISIONS
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

  // A turns left and D turns right.
  const steeringInput = (left ? 1 : 0) - (right ? 1 : 0);

  if (forward || backward) {
    playerRotation += steeringInput * 2.2 * dt;
  }

  const direction = new THREE.Vector3(
    Math.sin(playerRotation), 0, Math.cos(playerRotation)
  );

  const speed = forward ? 15 : backward ? 10 : 0;
  let dx = 0;
  let dz = 0;

  if (forward) {
    dx += direction.x * speed * dt;
    dz += direction.z * speed * dt;
  }

  if (backward) {
    dx -= direction.x * speed * dt;
    dz -= direction.z * speed * dt;
  }

  if (jumping) {
    moveWithCollision(player, dx, dz, PLAYER_RADIUS);
  } else {
    moveWithCollision(player, dx, dz, PLAYER_RADIUS, {
      traffic: true,
      pedestrians: true
    });
  }

  player.rotation.y = playerRotation;
  animateCharacter(player, dt, forward || backward, speed / 5);
}

function updateCar(dt) {
  if (!driving) {
    carSpeed *= Math.max(0, 1 - 2.5 * dt);
    return;
  }

  if (!engineRunning) {
    carSpeed = 0;
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

  // Preserve the corrected A/D steering direction.
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

  carSpeed = clamp(carSpeed, -reverseSpeed, maxSpeed);

  const speedFactor = Math.min(Math.abs(carSpeed) / 25, 1);
  const direction = carSpeed >= 0 ? 1 : -1;

  carRotation +=
    steeringInput * spec.steering * speedFactor * direction * dt;

  const dx = Math.sin(carRotation) * carSpeed * dt;
  const dz = Math.cos(carRotation) * carSpeed * dt;

  const moved = moveWithCollision(car, dx, dz, CAR_RADIUS, {
    traffic: true,
    pedestrians: true
  });

  if (!moved && Math.abs(carSpeed) > .5) {
    carSpeed *= -.12;
    showMessage("COLLISION");
  }

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
  if (hud.speed) {
    hud.speed.textContent = Math.round(Math.abs(carSpeed) * 3.6);
  }

  if (hud.cash) hud.cash.textContent = "$" + cash;

  if (hud.mode) {
    hud.mode.textContent =
      driving ? "DRIVING" : jumping ? "JUMPING" : "ON FOOT";
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
}

/* =========================================================
   MINIMAP
   ========================================================= */

const minimap = document.getElementById("minimap");
const mapContext = minimap ? minimap.getContext("2d") : null;

function drawMinimap() {
  if (!minimap || !mapContext) return;

  const w = minimap.width;
  const h = minimap.height;
  const scale = w / 1800;
  const centerX = w / 2;
  const centerY = h / 2;

  mapContext.clearRect(0, 0, w, h);
  mapContext.fillStyle = "#263c32";
  mapContext.fillRect(0, 0, w, h);

  mapContext.strokeStyle = "#687176";
  mapContext.lineWidth = Math.max(1, 24 * scale);

  for (const p of roadLines) {
    const posX = centerX + p * scale;
    const posY = centerY + p * scale;
         mapContext.beginPath();
    mapContext.moveTo(posX, 0);
    mapContext.lineTo(posX, h);
    mapContext.stroke();

    mapContext.beginPath();
    mapContext.moveTo(0, posY);
    mapContext.lineTo(w, posY);
    mapContext.stroke();
  }

  mapContext.fillStyle = "#ffcf45";

  for (const p of checkpoints) {
    mapContext.beginPath();
    mapContext.arc(
      centerX + p.position.x * scale,
      centerY + p.position.z * scale,
      2.2, 0, Math.PI * 2
    );
    mapContext.fill();
  }

  for (const remote of remotePlayers.values()) {
    mapContext.fillStyle = "#55d9ff";
    mapContext.beginPath();
    mapContext.arc(
      centerX + remote.root.position.x * scale,
      centerY + remote.root.position.z * scale,
      3, 0, Math.PI * 2
    );
    mapContext.fill();
  }

  const position = driving ? car.position : player.position;
  mapContext.fillStyle = "#ff4136";
  mapContext.beginPath();
  mapContext.arc(
    centerX + position.x * scale,
    centerY + position.z * scale,
    4, 0, Math.PI * 2
  );
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
  carSpeed = 0;
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
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
});

/* =========================================================
   BASE GRASS GROUND AND CENTRAL BILLBOARD
   ========================================================= */

function createBaseGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.CITY_LIMIT * 2.35, CONFIG.CITY_LIMIT * 2.35),
    new THREE.MeshLambertMaterial({ color: 0x477b43, map: grassTexture })
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
  gradient.addColorStop(0, "#111b43");
  gradient.addColorStop(.52, "#733a82");
  gradient.addColorStop(1, "#f06a72");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.strokeStyle = "#ffe6a6";
  ctx.lineWidth = 20;
  ctx.strokeRect(16, 16, 992, 480);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#ffb7d5";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#fff5d9";
  ctx.font = "bold 110px Arial";
  ctx.fillText("My love", 512, 185);
  ctx.font = "bold 140px Arial";
  ctx.fillText("Mayuri", 512, 340);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

  const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x252b35 });
  const postMaterial = new THREE.MeshLambertMaterial({ color: 0x515b68 });

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 21),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
  );
  // The requested sign is positioned in the central map area.
  sign.position.set(29, 16.5, -24);
  world.add(sign);

  box(world, 29, 7.8, -24, 1.2, 15.6, 1.2, postMaterial);
  box(world, 29, 27.2, -24, 43.5, .9, 1.4, frameMaterial);
  box(world, 7.5, 16.5, -24, .9, 22, 1.4, frameMaterial);
  box(world, 50.5, 16.5, -24, .9, 22, 1.4, frameMaterial);
  box(world, 29, 8.4, -24, 16, .9, 10, frameMaterial);
}

/* =========================================================
   BUILD WORLD AND START LOOP
   ========================================================= */

createBaseGround();
createRoads();
createCrosswalks();
createCity();
createWindows();
createStreetlights();
createPalms();
createCentralBillboard();

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
  updateSky(dt);
  updateVehicleAudio();

  if (started && !paused) {
    if (!chatOpen && !garageOpen) {
      updatePlayer(dt);
      updateJump(dt);
      updateCar(dt);
    }

    updateTraffic(dt);
    updateTrafficCollisions();
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
