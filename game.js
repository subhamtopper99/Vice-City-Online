import * as THREE from "https://esm.sh/three@0.160.0";

/* VICE CITY — UPDATE 20
   Multiplayer + live chat below missions + expanded missions
   + detailed sports cars + traffic variety + stability fixes.
   Controls: WASD/arrows, SPACE jump, E enter/exit, ENTER chat,
   ESC pause/close chat, R restart, C cycle nearby vehicle paint.
*/

const CONFIG = {
  CITY_LIMIT: 900, ROAD_SPACING: 200, ROAD_WIDTH: 24,
  MAX_TRAFFIC: 9, MAX_PEDESTRIANS: 8, NETWORK_RATE: 50
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91c4df);
scene.fog = new THREE.Fog(0x91c4df, 180, 950);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1200);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

const mat = {
  road: new THREE.MeshLambertMaterial({color:0x30343a}),
  sidewalk: new THREE.MeshLambertMaterial({color:0xaaa9a2}),
  grass: new THREE.MeshLambertMaterial({color:0x477b43}),
  concrete: new THREE.MeshLambertMaterial({color:0xb5b3ad}),
  white: new THREE.MeshLambertMaterial({color:0xece9df}),
  yellow: new THREE.MeshLambertMaterial({color:0xf5c84c}),
  tree: new THREE.MeshLambertMaterial({color:0x28613a}),
  trunk: new THREE.MeshLambertMaterial({color:0x755238})
};
const buildingMaterials = [0x9b9b91,0xc3b8a5,0x777e82,0xb6a18b,0x6c7c86,0xd0c5b1,0x8d8d83,0x77736c]
  .map(c => new THREE.MeshLambertMaterial({color:c}));
const boxGeo = new THREE.BoxGeometry(1,1,1);
const cylinderGeo = new THREE.CylinderGeometry(1,1,1,12);
const sphereGeo = new THREE.SphereGeometry(1,10,8);
const rand = (a,b) => a + Math.random()*(b-a);
const pick = a => a[Math.floor(Math.random()*a.length)];

function box(parent,x,y,z,sx,sy,sz,material) {
  const m = new THREE.Mesh(boxGeo,material);
  m.position.set(x,y,z); m.scale.set(sx,sy,sz); parent.add(m); return m;
}
function cylinder(parent,x,y,z,r,h,material,segments=12) {
  const m = new THREE.Mesh(segments===12?cylinderGeo:new THREE.CylinderGeometry(1,1,1,segments),material);
  m.position.set(x,y,z); m.scale.set(r,h,r); parent.add(m); return m;
}

scene.add(new THREE.HemisphereLight(0xcceaff,0x596044,2));
const sun = new THREE.DirectionalLight(0xffedcf,1.4);
sun.position.set(-250,500,200); scene.add(sun);
box(world,0,-1.2,0,CONFIG.CITY_LIMIT*2.3,1,CONFIG.CITY_LIMIT*2.3,mat.grass);

const roadLines = [];
function createRoads() {
  const L=CONFIG.CITY_LIMIT,S=CONFIG.ROAD_SPACING,W=CONFIG.ROAD_WIDTH;
  for(let p=-L;p<=L;p+=S) {
    roadLines.push(p);
    box(world,p,-.55,0,W,.12,L*2.1,mat.road);
    box(world,0,-.55,p,L*2.1,.12,W,mat.road);
    for(const side of [-1,1]) {
      box(world,p+side*(W/2+3),-.38,0,5,.35,L*2.1,mat.sidewalk);
      box(world,0,-.38,p+side*(W/2+3),L*2.1,.35,5,mat.sidewalk);
    }
    box(world,p,-.475,0,.22,.025,L*2,mat.yellow);
    box(world,0,-.475,p,L*2,.025,.22,mat.yellow);
  }
}
function createCrosswalks() {
  for(const x of roadLines) for(const z of roadLines) {
    box(world,x,-.465,z+21,24,.025,5,mat.white);
    box(world,x+21,-.465,z,5,.025,24,mat.white);
  }
}
function createPark(x,z) {
  box(world,x,-.35,z,125,.4,125,mat.grass);
  box(world,x,-.12,z,8,.08,105,mat.sidewalk);
  box(world,x,-.11,z,105,.08,8,mat.sidewalk);
  for(let i=0;i<8;i++) {
    const tx=x+rand(-48,48),tz=z+rand(-48,48);
    cylinder(world,tx,4,tz,1.2,8,mat.trunk);
    const crown=new THREE.Mesh(sphereGeo,mat.tree);
    crown.position.set(tx,9,tz); crown.scale.set(5,5,5); world.add(crown);
  }
}
const buildings=[];
function createBuilding(x,z,w,d,h,material) {
  box(world,x,h/2-.25,z,w,h,d,material);
  buildings.push({x,z,width:w,depth:d,height:h});
  if(h>55&&Math.random()>.5) box(world,x,h+1,z,w*.25,2,d*.25,mat.concrete);
}
function createCity() {
  const S=CONFIG.ROAD_SPACING,L=CONFIG.CITY_LIMIT;
  for(let gx=-L+100;gx<L;gx+=S) for(let gz=-L+100;gz<L;gz+=S) {
    const n=Math.abs(Math.floor(gx/S)*7+Math.floor(gz/S)*11);
    if(n%13===0){createPark(gx,gz);continue;}
    const downtown=Math.abs(gx)<300&&Math.abs(gz)<300;
    for(let i=0;i<(downtown?3:2);i++)
      createBuilding(gx+rand(-48,48),gz+rand(-48,48),rand(35,65),rand(35,65),
        downtown?rand(90,210):rand(22,75),pick(buildingMaterials));
  }
}
function createWindows() {
  const inst=new THREE.InstancedMesh(boxGeo,new THREE.MeshLambertMaterial({color:0x7eafc1}),1800);
  const dummy=new THREE.Object3D(); let index=0;
  for(const b of buildings) {
    if(index>=1770) break;
    const rows=Math.min(7,Math.floor(b.height/14));
    for(let r=0;r<rows&&index<1800;r++) for(let c=0;c<2&&index<1800;c++) {
      dummy.position.set(b.x-b.width*.25+c*b.width*.5,5+r*12,b.z+b.depth/2+.12);
      dummy.scale.set(3.5,4.5,.15); dummy.updateMatrix(); inst.setMatrixAt(index++,dummy.matrix);
    }
  }
  inst.count=index; inst.instanceMatrix.needsUpdate=true; world.add(inst);
}
function createStreetlights() {
  const pos=[];
  for(let p=-900;p<=900;p+=200) for(let q=-900;q<=900;q+=200) {
    pos.push([p+17,q+17],[p-17,q-17]);
  }
  const poles=new THREE.InstancedMesh(cylinderGeo,new THREE.MeshLambertMaterial({color:0x343b40}),pos.length);
  const lamps=new THREE.InstancedMesh(sphereGeo,new THREE.MeshBasicMaterial({color:0xffe5a1}),pos.length);
  const d=new THREE.Object3D();
  pos.forEach(([x,z],i)=>{
    d.position.set(x,5,z);d.scale.set(.25,10,.25);d.updateMatrix();poles.setMatrixAt(i,d.matrix);
    d.position.set(x,10.2,z);d.scale.set(.9,.45,.9);d.updateMatrix();lamps.setMatrixAt(i,d.matrix);
  });
  world.add(poles,lamps);
}
function createPalms() {
  for(let i=0;i<55;i++) {
    const x=rand(-900,900),z=rand(-900,900);
    cylinder(world,x,4,z,.65,8,mat.trunk);
    const crown=new THREE.Mesh(sphereGeo,mat.tree);
    crown.position.set(x,8.5,z);crown.scale.set(3.5,1.4,3.5);world.add(crown);
  }
}

/* PLAYER AVATARS */
let selectedGender="male";
const STREET_BLUE=0x315d9b;
function createCharacter(color=STREET_BLUE,gender="male") {
  const root=new THREE.Group(),female=gender==="female";
  const shirt=new THREE.MeshLambertMaterial({color:STREET_BLUE});
  const pants=new THREE.MeshLambertMaterial({color:0x26364a});
  const skin=new THREE.MeshLambertMaterial({color:0xc88e68});
  const hair=new THREE.MeshLambertMaterial({color:0x241914});
  const shoeMat=new THREE.MeshLambertMaterial({color:0x17191d});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.31,.48,4,8),shirt);
  torso.position.y=1.42;torso.scale.set(female?.88:1,1,.72);root.add(torso);
  const waist=new THREE.Mesh(new THREE.BoxGeometry(.48,.22,.32),pants);waist.position.y=1.02;root.add(waist);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.105,.12,.2,8),skin);neck.position.y=1.86;root.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.27,14,12),skin);
  head.position.y=2.15;head.scale.set(.92,1.18,.92);root.add(head);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(.285,12,10),hair);
  cap.position.set(0,2.3,-.025);cap.scale.set(1,.58,1);root.add(cap);
  if(female) {
    const back=new THREE.Mesh(new THREE.SphereGeometry(.25,10,8),hair);
    back.position.set(0,2.03,-.16);back.scale.set(1.05,1.35,.65);root.add(back);
    for(const s of [-1,1]) {
      const lock=new THREE.Mesh(new THREE.CapsuleGeometry(.075,.35,3,6),hair);
      lock.position.set(s*.23,2.02,.015);root.add(lock);
    }
  }
  for(const s of [-1,1]) {
    const ear=new THREE.Mesh(new THREE.SphereGeometry(.065,8,6),skin);
    ear.position.set(s*.255,2.13,0);ear.scale.set(.65,1,.7);root.add(ear);
  }
  const eyeMat=new THREE.MeshBasicMaterial({color:0x171717});
  for(const x of [-.095,.095]) {
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),eyeMat);
    eye.position.set(x,2.17,.245);root.add(eye);
  }
  const nose=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),skin);
  nose.position.set(0,2.1,.27);root.add(nose);
  box(root,0,1.48,.224,.055,.38,.018,new THREE.MeshLambertMaterial({color:0x172f50}));
  const arms=[],legs=[];
  for(const s of [-1,1]) {
    const pivot=new THREE.Group();pivot.position.set(s*.34,1.68,0);root.add(pivot);
    const upper=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.27,4,7),shirt);upper.position.y=-.19;pivot.add(upper);
    const fore=new THREE.Mesh(new THREE.CapsuleGeometry(.075,.22,4,7),skin);fore.position.y=-.48;pivot.add(fore);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.09,8,7),skin);hand.position.set(0,-.66,.015);pivot.add(hand);arms.push(pivot);
    const leg=new THREE.Group();leg.position.set(s*.16,.96,0);root.add(leg);
    const thigh=new THREE.Mesh(new THREE.CapsuleGeometry(.115,.28,4,7),pants);thigh.position.y=-.2;leg.add(thigh);
    const lower=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.26,4,7),pants);lower.position.y=-.48;leg.add(lower);
    const shoe=new THREE.Mesh(new THREE.BoxGeometry(.23,.14,.36),shoeMat);shoe.position.set(0,-.7,.09);leg.add(shoe);legs.push(leg);
  }
  root.userData={arms,legs,walkTime:0,gender};return root;
}
function animateCharacter(c,dt,moving,speed=1) {
  const d=c.userData;if(!d.arms||!d.legs)return;
  d.walkTime=moving?d.walkTime+dt*Math.min(13,5+speed*2):d.walkTime*.82;
  const swing=moving?Math.sin(d.walkTime)*.65:0;
  d.arms[0].rotation.x=swing;d.arms[1].rotation.x=-swing;
  d.legs[0].rotation.x=-swing;d.legs[1].rotation.x=swing;
}
function createNameTag(name) {
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext("2d");
  function draw(v) {
    ctx.clearRect(0,0,512,128);ctx.fillStyle="rgba(0,0,0,.78)";
    ctx.beginPath();ctx.roundRect(12,12,488,104,20);ctx.fill();
    ctx.strokeStyle="#f5c84c";ctx.lineWidth=5;ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="bold 48px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(String(v||"Driver").slice(0,16).toUpperCase(),256,64);
  }
  draw(name);const texture=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
  sprite.scale.set(6,1.5,1);sprite.position.y=3.65;
  sprite.userData.setName=v=>{draw(v);texture.needsUpdate=true;};return sprite;
}
/* DETAILED VEHICLES — car faces +Z */
const carPaints=[0xe33b2e,0x2467a6,0xf0c33c,0x252a32,0xe8e8e3,0x21835b,0x713c91];
function createCar(color=0xe33b2e,style="sport") {
  const car=new THREE.Group();
  const paint=new THREE.MeshStandardMaterial({color,roughness:.34,metalness:.28});
  const darkPaint=new THREE.MeshStandardMaterial({color:0x171c22,roughness:.48,metalness:.12});
  const glass=new THREE.MeshStandardMaterial({color:0x203b4a,roughness:.18,metalness:.2});
  const rubber=new THREE.MeshStandardMaterial({color:0x111315,roughness:.92});
  const alloy=new THREE.MeshStandardMaterial({color:0xb9c2c8,metalness:.82,roughness:.25});
  const lamp=new THREE.MeshBasicMaterial({color:0xfff1cf});
  const redLamp=new THREE.MeshBasicMaterial({color:0xf22b20});
  const grille=new THREE.MeshStandardMaterial({color:0x111417,metalness:.25,roughness:.65});
  const sedan=style==="sedan",scale=sedan?1.06:1;
  // Lower body, tapered bonnet and rear deck.
  box(car,0,.82,0,2.42,.55,4.55*scale,paint);
  box(car,0,1.02,1.42,2.34,.34,1.45,paint);
  box(car,0,1.02,-1.58,2.32,.34,1.18,paint);
  // Cabin with sloped windscreen and rear glass.
  const cabin=box(car,0,1.55,-.22,1.82,.86,2.12,glass);
  cabin.scale.set(1,.82,1);
  box(car,0,1.94,-.22,1.72,.12,1.98,darkPaint);
 // Hood ridges and side skirts.
  for(const s of [-1,1]) {
    box(car,s*1.02,.99,.95,.055,.055,1.05,darkPaint);
    box(car,s*1.17,.62,0,.13,.18,3.05,darkPaint);
    // Mirrors
    box(car,s*1.08,1.48,.55,.24,.12,.22,paint);
    // Door handles
    box(car,s*1.225,1.12,-.25,.035,.055,.22,alloy);
  }
  // Front/rear bumpers, grille and splitter.
  box(car,0,.69,2.29,2.48,.24,.22,darkPaint);
  box(car,0,.71,-2.29,2.46,.24,.22,darkPaint);
  box(car,0,.79,2.415,.86,.28,.025,grille);
  box(car,0,.53,2.39,2.35,.08,.28,darkPaint);
  // Headlights and tail lights.
  for(const s of [-1,1]) {
    box(car,s*.83,1.04,2.18,.52,.16,.12,lamp);
    box(car,s*.87,1.02,-2.18,.52,.16,.12,redLamp);
    box(car,s*.68,.76,2.43,.1,.08,.035,alloy);
  }
  // Rear spoiler for sporty silhouettes.
  if(!sedan) {
    box(car,0,1.48,-2.02,1.65,.08,.22,darkPaint);
    box(car,-.72,1.34,-2.02,.08,.22,.1,darkPaint);
    box(car,.72,1.34,-2.02,.08,.22,.1,darkPaint);
  }
  const wheels=[];
  for(const x of [-1.2,1.2]) for(const z of [-1.48,1.48]) {
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.28,16),rubber);
    tire.rotation.z=Math.PI/2;tire.position.set(x,.52,z);car.add(tire);
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,.30,12),alloy);
    rim.rotation.z=Math.PI/2;rim.position.set(x*1.006,.52,z);car.add(rim);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.315,10),darkPaint);
    hub.rotation.z=Math.PI/2;hub.position.set(x*1.01,.52,z);car.add(hub);
    wheels.push(tire,rim,hub);
  }
  car.userData.wheels=wheels;car.userData.paint=paint;car.userData.style=style;
  return car;
}

/* LOCAL PLAYER */
const player=createCharacter(STREET_BLUE,selectedGender);scene.add(player);player.position.set(0,0,30);
const localNameTag=createNameTag("Driver");player.add(localNameTag);
function rebuildLocalCharacter(gender) {
  const pos=player.position.clone(),rot=player.rotation.y;
  const replacement=createCharacter(STREET_BLUE,gender);
  player.clear();while(replacement.children.length)player.add(replacement.children[0]);
  player.userData=replacement.userData;player.position.copy(pos);player.rotation.y=rot;player.add(localNameTag);
}
let car=createCar(0xe33b2e);scene.add(car);
let driving=false,carSpeed=0,carRotation=0,playerRotation=0;
const MAX_SPEED=75,REVERSE_SPEED=28,ACCELERATION=35,BRAKING=55,FRICTION=16,STEERING_SPEED=1.65;
const JUMP_FORCE=9.5,GRAVITY=24;
let verticalVelocity=0,jumping=false,paused=false,started=false,chatOpen=false;
let messageTimer=0;
const hud={
  speed:document.getElementById("speed"),cash:document.getElementById("cash"),
  mode:document.getElementById("mode"),mission:document.getElementById("mission"),
  progress:document.getElementById("progress"),message:document.getElementById("message")
};
function showMessage(message) {
  hud.message.textContent=message;hud.message.style.opacity="1";messageTimer=2.2;
}
function jump() {
  if(!started||paused||driving||chatOpen||jumping||player.position.y>.02)return;
  jumping=true;verticalVelocity=JUMP_FORCE;showMessage("JUMP!");
}
function updateJump(dt) {
  if(driving){player.position.y=0;verticalVelocity=0;jumping=false;return;}
  if(jumping||player.position.y>0) {
    verticalVelocity-=GRAVITY*dt;player.position.y+=verticalVelocity*dt;
    if(player.position.y<=0){player.position.y=0;verticalVelocity=0;jumping=false;}
  }
}

/* MULTIPLAYER — server event names and payloads retained */
const socket=window.io({
  autoConnect:true,transports:["websocket","polling"],reconnection:true,
  reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:5000,timeout:20000
});
let myPlayerId=null,myPlayerName="Driver",multiplayerJoined=false,requestedStart=false;
const remotePlayers=new Map();
const connectionElement=document.getElementById("connection");
const playerCountElement=document.getElementById("player-count");
function updateConnection(online) {
  connectionElement.textContent=online?"ONLINE":"DISCONNECTED";
  connectionElement.classList.toggle("online",online);connectionElement.classList.toggle("offline",!online);
}
function updatePlayerCount(){playerCountElement.textContent="PLAYERS: "+(remotePlayers.size+(myPlayerId?1:0));}
function joinGame() {
  if(!socket.connected||multiplayerJoined||!requestedStart)return;
  socket.emit("player:join",{name:myPlayerName,gender:selectedGender,skin:"street-blue"});
  multiplayerJoined=true;
}
socket.on("connect",()=>{updateConnection(true);joinGame();});
socket.on("disconnect",()=>{
  updateConnection(false);multiplayerJoined=false;myPlayerId=null;updatePlayerCount();
});
socket.on("connect_error",()=>updateConnection(false));
socket.on("player:assigned",data=>{
  if(!data||!data.id)return;
  myPlayerId=data.id;myPlayerName=data.name||myPlayerName;
  const g=data.gender==="female"?"female":"male";
  if(g!==selectedGender){selectedGender=g;rebuildLocalCharacter(g);updateGenderButtons();}
  localNameTag.userData.setName(myPlayerName);showMessage("WELCOME "+myPlayerName.toUpperCase());
  updatePlayerCount();if(requestedStart)startGame();
});
function addRemotePlayer(data) {
  if(!data||!data.id||data.id===myPlayerId||remotePlayers.has(data.id))return;
  const gender=data.gender==="female"?"female":"male";
  const root=new THREE.Group(),avatar=createCharacter(STREET_BLUE,gender);
  const vehicle=createCar(data.color||0x2874bb);
  const nameTag=createNameTag(data.name||"Driver");
  root.add(avatar,vehicle,nameTag);scene.add(root);
  const remote={
    id:data.id,root,avatar,vehicle,nameTag,gender,
    targetPosition:new THREE.Vector3(data.x||0,data.y||0,data.z||0),
    targetRotation:Number.isFinite(data.rotation)?data.rotation:0,
    driving:data.driving===true,jumping:data.jumping===true,speed:data.speed||0
  };
  avatar.visible=!remote.driving;vehicle.visible=remote.driving;
  root.position.copy(remote.targetPosition);root.rotation.y=remote.targetRotation;
  remotePlayers.set(data.id,remote);
}
socket.on("players:init",players=>{if(Array.isArray(players))players.forEach(addRemotePlayer);updatePlayerCount();});
socket.on("player:joined",data=>{addRemotePlayer(data);if(data?.name)showMessage(data.name+" JOINED THE CITY");updatePlayerCount();});
socket.on("player:update",data=>{
  if(!data||!data.id||data.id===myPlayerId)return;
  if(!remotePlayers.has(data.id))addRemotePlayer(data);
  const r=remotePlayers.get(data.id);if(!r)return;
  if(![data.x,data.y,data.z,data.rotation].every(Number.isFinite))return;
  r.targetPosition.set(THREE.MathUtils.clamp(data.x,-950,950),THREE.MathUtils.clamp(data.y,0,12),THREE.MathUtils.clamp(data.z,-950,950));
  r.targetRotation=data.rotation;r.driving=data.driving===true;r.jumping=data.jumping===true;r.speed=data.speed||0;
  const g=data.gender==="female"?"female":"male";
  if(g!==r.gender){r.root.remove(r.avatar);r.avatar=createCharacter(STREET_BLUE,g);r.root.add(r.avatar);r.gender=g;}
  r.avatar.visible=!r.driving;r.vehicle.visible=r.driving;
});
socket.on("player:left",id=>{
  const r=remotePlayers.get(id);if(!r)return;
  scene.remove(r.root);r.root.traverse(o=>{if(o.isSprite&&o.material.map)o.material.map.dispose();});
  remotePlayers.delete(id);updatePlayerCount();
});
function updateRemotePlayers(dt) {
  const smoothing=1-Math.pow(.002,dt);
  for(const r of remotePlayers.values()) {
    r.root.position.lerp(r.targetPosition,smoothing);
    const diff=Math.atan2(Math.sin(r.targetRotation-r.root.rotation.y),Math.cos(r.targetRotation-r.root.rotation.y));
    r.root.rotation.y+=diff*smoothing;
    if(!r.driving)animateCharacter(r.avatar,dt,r.speed>.5||r.jumping,r.speed/10);
    else r.vehicle.userData.wheels.forEach(w=>{w.rotation.x+=r.speed*dt*.15;});
  }
}
let networkTimer=0;
function sendPlayerUpdate(dt) {
  if(!socket.connected||!multiplayerJoined||!myPlayerId)return;
  networkTimer+=dt*1000;if(networkTimer<CONFIG.NETWORK_RATE)return;networkTimer=0;
  const current=driving?car:player;
  socket.emit("player:update",{
    x:current.position.x,y:driving?0:player.position.y,z:current.position.z,
    rotation:driving?carRotation:playerRotation,driving,jumping:!driving&&jumping,
    speed:driving?carSpeed:0,gender:selectedGender
  });
}

/* CHAT — mounted directly under the mission panel */
const chatStyle=document.createElement("style");
chatStyle.textContent=`
#vice-chat{position:relative;width:100%;max-width:340px;margin-top:10px;color:#fff;font-family:Arial,sans-serif;pointer-events:auto;z-index:10001}
#vice-chat-log{height:125px;overflow-y:auto;padding:9px;margin-bottom:7px;border:1px solid rgba(255,255,255,.25);border-radius:9px;background:rgba(8,16,24,.88);font-size:12px;line-height:1.4;overflow-wrap:anywhere}
#vice-chat-entry{display:flex;gap:6px}
#vice-chat-input{min-width:0;flex:1;padding:9px;border:1px solid #d5b34d;border-radius:7px;background:#17232e;color:white;outline:none}
#vice-chat-send{padding:9px 12px;border:0;border-radius:7px;background:#d6a62e;color:#171717;font-weight:bold;cursor:pointer}
#vice-chat-hint{margin-top:4px;color:#eee;font-size:10px;text-shadow:0 1px 2px #000}
.vice-chat-line{margin-bottom:4px}.vice-chat-name{color:#ffd65b;font-weight:bold}.vice-chat-system{color:#8fd7ff;font-style:italic}
#mission-panel #vice-chat{display:block}
`;
document.head.appendChild(chatStyle);
const chatPanel=document.createElement("div");chatPanel.id="vice-chat";
const chatLog=document.createElement("div");chatLog.id="vice-chat-log";
const chatEntry=document.createElement("div");chatEntry.id="vice-chat-entry";
const chatInput=document.createElement("input");chatInput.id="vice-chat-input";chatInput.type="text";
chatInput.maxLength=180;chatInput.placeholder="Press Enter to chat...";chatInput.autocomplete="off";
const chatSend=document.createElement("button");chatSend.id="vice-chat-send";chatSend.type="button";chatSend.textContent="SEND";
const chatHint=document.createElement("div");chatHint.id="vice-chat-hint";chatHint.textContent="ENTER: chat  |  ESC: close";
chatEntry.append(chatInput,chatSend);chatPanel.append(chatLog,chatEntry,chatHint);
const missionPanel=document.getElementById("mission-panel");
if(missionPanel)missionPanel.appendChild(chatPanel);else document.body.appendChild(chatPanel);
function addChatLine(name,message,system=false) {
  const line=document.createElement("div");line.className="vice-chat-line";
  if(system){const t=document.createElement("span");t.className="vice-chat-system";t.textContent=message;line.appendChild(t);}
  else {const n=document.createElement("span");n.className="vice-chat-name";n.textContent=name+": ";
    const b=document.createElement("span");b.textContent=message;line.append(n,b);}
  chatLog.appendChild(line);while(chatLog.children.length>45)chatLog.removeChild(chatLog.firstChild);
  chatLog.scrollTop=chatLog.scrollHeight;
}
function openChat(){if(!started||paused)return;chatOpen=true;chatInput.placeholder="Write a message...";chatInput.focus();}
function closeChat(){chatOpen=false;chatInput.blur();chatInput.value="";}
function sendChatMessage(){
  const message=chatInput.value.trim();if(!message||!socket.connected||!myPlayerId)return;
  socket.emit("chat:message",message);chatInput.value="";chatInput.focus();
}
chatSend.addEventListener("click",sendChatMessage);
chatInput.addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();sendChatMessage();}
  if(e.key==="Escape"){e.preventDefault();closeChat();}
});
socket.on("chat:message",data=>{if(data?.message)addChatLine(data.name||"Driver",String(data.message).slice(0,180));});
addChatLine("VICE CITY","Welcome! Press ENTER to chat.",true);
/* TRAFFIC — several body styles and paint colours */
const traffic=[];
function createTraffic() {
  const styles=["sport","sedan","sport","sedan","sport"];
  for(let i=0;i<CONFIG.MAX_TRAFFIC;i++) {
    const vehicle=createCar(pick(carPaints),pick(styles));
    const axis=Math.random()>.5?"x":"z",lane=Math.round(rand(-4,4))*200,dir=Math.random()>.5?1:-1;
    vehicle.position.set(axis==="x"?rand(-850,850):lane,0,axis==="z"?rand(-850,850):lane);
    vehicle.rotation.y=axis==="x"?(dir>0?Math.PI/2:-Math.PI/2):(dir>0?0:Math.PI);
    scene.add(vehicle);traffic.push({mesh:vehicle,axis,direction:dir,speed:rand(12,23)});
  }
}
function updateTraffic(dt) {
  for(const t of traffic) {
    t.mesh.position[t.axis]+=t.speed*t.direction*dt;
    if(Math.abs(t.mesh.position[t.axis])>920)t.mesh.position[t.axis]=-t.mesh.position[t.axis];
    t.mesh.userData.wheels.forEach(w=>{w.rotation.x+=t.speed*dt*.15;});
  }
}

/* PEDESTRIANS */
const pedestrians=[],pedestrianColors=[0x315caa,0xb34d35,0x3b874e,0x9b6ab2,0xd5a43c,0xeeeeee];
function createPedestrian() {
  const gender=Math.random()>.5?"male":"female",person=createCharacter(pick(pedestrianColors),gender);
  const axis=Math.random()>.5?"x":"z";person.position.set(rand(-850,850),0,rand(-850,850));scene.add(person);
  pedestrians.push({mesh:person,axis,direction:Math.random()>.5?1:-1,speed:rand(1,2.5)});
}
function updatePedestrians(dt) {
  for(const p of pedestrians) {
    p.mesh.position[p.axis]+=p.speed*p.direction*dt;
    p.mesh.rotation.y=p.axis==="x"?(p.direction>0?Math.PI/2:-Math.PI/2):(p.direction>0?0:Math.PI);
    if(Math.abs(p.mesh.position[p.axis])>880)p.direction*=-1;
    animateCharacter(p.mesh,dt,true,1);
  }
}

/* EXPANDED MISSION ROUTE — 20 checkpoints */
const checkpoints=[];let checkpointIndex=0,cash=0;
const missionNames=[
  "FIRST STEPS","DOWNTOWN RUN","PARKSIDE ROUTE","SUNSET BOULEVARD","NORTH DISTRICT",
  "THE LONG DRIVE","COASTAL LOOP","CITY CENTRE","EASTSIDE CHECKPOINT","WEST END RUN",
  "THE GRAND LOOP","HARBOR ROAD","UPTOWN VISIT","CROSS-CITY TRIP","PALM AVENUE",
  "FINAL STRETCH","SOUTH DISTRICT","SKYLINE ROUTE","LAST CHALLENGE","VICE CITY LEGEND"
];
function createCheckpoints() {
  const material=new THREE.MeshBasicMaterial({color:0xffd34d,wireframe:true});
  for(let i=0;i<20;i++) {
    const angle=i/20*Math.PI*2,radius=220+(i%4)*125;
    const marker=new THREE.Mesh(new THREE.TorusGeometry(7,.8,6,18),material);
    marker.position.set(Math.cos(angle)*radius,3,Math.sin(angle)*radius);
    marker.rotation.x=Math.PI/2;scene.add(marker);checkpoints.push(marker);
  }
}
function updateCheckpoint() {
  const target=checkpoints[checkpointIndex];if(!target)return;
  const position=driving?car.position:player.position;
  if(position.distanceTo(target.position)<13) {
    const completed=checkpointIndex+1;cash+=150;
    if(completed===checkpoints.length) {
      checkpointIndex=0;cash+=1000;showMessage("MISSION ROUTE COMPLETE +$1,150");
    } else {checkpointIndex++;showMessage("MISSION COMPLETE +$150");}
  }
}

/* INPUT AND MOBILE CONTROLS */
const keys=Object.create(null);
const controls={accelerate:false,brake:false,left:false,right:false};
function clearControls(){for(const k in keys)keys[k]=false;for(const k in controls)controls[k]=false;}
function pressed(...names){return names.some(n=>keys[n]);}
window.addEventListener("keydown",event=>{
  if(chatOpen) {
    if(event.key==="Escape"){event.preventDefault();closeChat();}
    return;
  }
  const key=event.key.toLowerCase();
  if(["arrowup","arrowdown","arrowleft","arrowright"," ","spacebar"].includes(key))event.preventDefault();
  if(key==="enter"&&started&&!paused){event.preventDefault();openChat();return;}
  keys[key]=true;
  if(key===" "&&!event.repeat)jump();
  if(key==="e"&&!event.repeat)toggleVehicle();
  if(key==="escape"&&!event.repeat)togglePause();
  if(key==="r"&&!event.repeat)restartGame();
  if(key==="c"&&!event.repeat&&driving){car.userData.paint.color.setHex(pick(carPaints));showMessage("NEW VEHICLE COLOUR");}
});
window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;});
window.addEventListener("blur",clearControls);
function bindMobileControl(id,name) {
  const el=document.getElementById(id);if(!el)return;
  el.addEventListener("pointerdown",e=>{e.preventDefault();controls[name]=true;el.setPointerCapture?.(e.pointerId);});
  const release=()=>controls[name]=false;
  el.addEventListener("pointerup",release);el.addEventListener("pointercancel",release);el.addEventListener("lostpointercapture",release);
}
bindMobileControl("accelerate","accelerate");bindMobileControl("brake","brake");
bindMobileControl("left","left");bindMobileControl("right","right");

/* ENTER / EXIT VEHICLE */
function toggleVehicle() {
  if(!started||paused||chatOpen)return;
  if(!driving) {
    if(player.position.distanceTo(car.position)<9) {
      driving=true;jumping=false;verticalVelocity=0;player.position.y=0;player.visible=false;showMessage("VEHICLE ENTERED");
    } else showMessage("MOVE CLOSER TO YOUR CAR");
  } else {
    driving=false;player.visible=true;
    player.position.set(car.position.x+Math.sin(carRotation)*4,0,car.position.z+Math.cos(carRotation)*4);
    playerRotation=carRotation;showMessage("VEHICLE EXITED");
  }
}

/* MOVEMENT — preserve confirmed steering direction */
function updatePlayer(dt) {
  if(driving)return;
  const f=pressed("w","arrowup")||controls.accelerate,b=pressed("s","arrowdown")||controls.brake;
  const l=pressed("a","arrowleft")||controls.left,r=pressed("d","arrowright")||controls.right;
  const steeringInput=(l?1:0)-(r?1:0);
  if(f||b)playerRotation+=steeringInput*2.2*dt;
  const dir=new THREE.Vector3(Math.sin(playerRotation),0,Math.cos(playerRotation));
  const speed=f?15:b?10:0;
  if(f)player.position.addScaledVector(dir,speed*dt);
  if(b)player.position.addScaledVector(dir,-speed*dt);
  player.rotation.y=playerRotation;
  player.position.x=THREE.MathUtils.clamp(player.position.x,-900,900);
  player.position.z=THREE.MathUtils.clamp(player.position.z,-900,900);
  animateCharacter(player,dt,f||b,speed/5);
}
function updateCar(dt) {
  if(!driving){carSpeed*=Math.max(0,1-2.5*dt);return;}
  const f=pressed("w","arrowup")||controls.accelerate,b=pressed("s","arrowdown")||controls.brake;
  const l=pressed("a","arrowleft")||controls.left,r=pressed("d","arrowright")||controls.right;
  const steeringInput=(l?1:0)-(r?1:0);
  if(f)carSpeed+=ACCELERATION*dt;else if(b)carSpeed-=BRAKING*dt;
  else if(carSpeed>0)carSpeed=Math.max(0,carSpeed-FRICTION*dt);
  else if(carSpeed<0)carSpeed=Math.min(0,carSpeed+FRICTION*dt);
  carSpeed=THREE.MathUtils.clamp(carSpeed,-REVERSE_SPEED,MAX_SPEED);
  const factor=Math.min(Math.abs(carSpeed)/25,1),reverse=carSpeed>=0?1:-1;
  carRotation+=steeringInput*STEERING_SPEED*factor*reverse*dt;
  car.position.x+=Math.sin(carRotation)*carSpeed*dt;
  car.position.z+=Math.cos(carRotation)*carSpeed*dt;
  car.position.x=THREE.MathUtils.clamp(car.position.x,-900,900);
  car.position.z=THREE.MathUtils.clamp(car.position.z,-900,900);
  car.rotation.y=carRotation;car.userData.wheels.forEach(w=>{w.rotation.x+=carSpeed*dt*.15;});
}

/* CAMERA */
const cameraTarget=new THREE.Vector3(),cameraPosition=new THREE.Vector3();
function updateCamera(dt) {
  const target=driving?car:player,rotation=driving?carRotation:playerRotation;
  const distance=driving?13:9,height=driving?7:5;
  cameraTarget.set(target.position.x,target.position.y+2,target.position.z);
  cameraPosition.set(target.position.x-Math.sin(rotation)*distance,target.position.y+height,target.position.z-Math.cos(rotation)*distance);
  const smoothing=1-Math.pow(.001,dt);camera.position.lerp(cameraPosition,smoothing);camera.lookAt(cameraTarget);
}

/* HUD */
function updateHUD(dt) {
  hud.speed.textContent=Math.round(Math.abs(carSpeed)*3.6);
  hud.cash.textContent="$"+cash;
  hud.mode.textContent=driving?"DRIVING":jumping?"JUMPING":"ON FOOT";
  hud.mission.textContent=missionNames[checkpointIndex]||"ROUTE COMPLETE";
  hud.progress.textContent=`${checkpointIndex+1} / ${checkpoints.length}`;
  if(messageTimer>0){messageTimer-=dt;if(messageTimer<=0)hud.message.style.opacity="0";}
}

/* MINIMAP */
const minimap=document.getElementById("minimap"),mapContext=minimap.getContext("2d");
function drawMinimap() {
  const w=minimap.width,h=minimap.height,scale=w/1800,center=w/2;
  mapContext.clearRect(0,0,w,h);mapContext.fillStyle="#263c32";mapContext.fillRect(0,0,w,h);
  mapContext.strokeStyle="#687176";mapContext.lineWidth=Math.max(1,24*scale);
  for(const p of roadLines) {
    const pos=center+p*scale;mapContext.beginPath();mapContext.moveTo(pos,0);mapContext.lineTo(pos,h);mapContext.stroke();
    mapContext.beginPath();mapContext.moveTo(0,pos);mapContext.lineTo(w,pos);mapContext.stroke();
  }
  mapContext.fillStyle="#ffcf45";
  for(const p of checkpoints){mapContext.beginPath();mapContext.arc(center+p.position.x*scale,center+p.position.z*scale,2.2,0,Math.PI*2);mapContext.fill();}
  for(const r of remotePlayers.values()) {
    mapContext.fillStyle="#55d9ff";mapContext.beginPath();
    mapContext.arc(center+r.root.position.x*scale,center+r.root.position.z*scale,3,0,Math.PI*2);mapContext.fill();
  }
  const pos=driving?car.position:player.position;
  mapContext.fillStyle="#ff4136";mapContext.beginPath();mapContext.arc(center+pos.x*scale,center+pos.z*scale,4,0,Math.PI*2);mapContext.fill();
}

/* START / PAUSE / GENDER */
const pauseScreen=document.getElementById("pause-screen"),startScreen=document.getElementById("start-screen");
const genderSelector=document.createElement("div");genderSelector.id="gender-selector";
genderSelector.style.cssText="display:flex;justify-content:center;gap:12px;margin:14px auto;flex-wrap:wrap";
function makeGenderButton(gender,label) {
  const b=document.createElement("button");b.type="button";b.textContent=label;b.dataset.gender=gender;
  b.style.cssText="min-width:120px;padding:12px 20px;border:2px solid #f5c84c;border-radius:10px;background:#18232d;color:white;font-weight:bold;cursor:pointer";
  b.addEventListener("click",()=>{if(requestedStart)return;selectedGender=gender;rebuildLocalCharacter(gender);updateGenderButtons();});
  return b;
}
const maleButton=makeGenderButton("male","MALE"),femaleButton=makeGenderButton("female","FEMALE");
genderSelector.append(maleButton,femaleButton);
const nameInput=document.getElementById("player-name"),startButton=document.getElementById("start");
nameInput.insertAdjacentElement("afterend",genderSelector);
function updateGenderButtons() {
  for(const b of [maleButton,femaleButton]) {
    const selected=b.dataset.gender===selectedGender;
    b.style.background=selected?"#b7831c":"#18232d";b.style.borderColor=selected?"#fff0a8":"#f5c84c";
    b.setAttribute("aria-pressed",String(selected));
  }
}
updateGenderButtons();
function startGame() {
  if(started||!myPlayerId){if(!myPlayerId)showMessage("WAITING FOR SERVER IDENTITY");return;}
  started=true;paused=false;startScreen.classList.add("hidden");pauseScreen.classList.add("hidden");showMessage("WELCOME TO VICE CITY");
}
function togglePause() {
  if(!started||chatOpen)return;paused=!paused;pauseScreen.classList.toggle("hidden",!paused);if(paused)clearControls();
}
function restartGame() {
  car.position.set(0,0,0);carSpeed=0;carRotation=0;car.rotation.y=0;
  player.position.set(0,0,30);playerRotation=0;player.rotation.y=0;player.visible=true;
  driving=false;jumping=false;verticalVelocity=0;cash=0;checkpointIndex=0;
  clearControls();startGame();
}
startButton.addEventListener("click",()=>{
  const entered=nameInput.value.trim();
  if(!entered){showMessage("ENTER YOUR PLAYER NAME");nameInput.focus();return;}
  if(!socket.connected){showMessage("SERVER NOT CONNECTED");return;}
  myPlayerName=entered.slice(0,16);requestedStart=true;
  maleButton.disabled=true;femaleButton.disabled=true;maleButton.style.opacity=".55";femaleButton.style.opacity=".55";
  joinGame();showMessage("CONNECTING AS "+myPlayerName.toUpperCase());
});
nameInput.addEventListener("keydown",e=>{if(e.key==="Enter")startButton.click();});
document.getElementById("resume-button").addEventListener("click",()=>{if(paused)togglePause();});
document.getElementById("restart-button").addEventListener("click",restartGame);
document.getElementById("menu-button").addEventListener("click",()=>{
  paused=false;started=false;requestedStart=false;multiplayerJoined=false;
  socket.disconnect();myPlayerId=null;
  maleButton.disabled=false;femaleButton.disabled=false;maleButton.style.opacity="1";femaleButton.style.opacity="1";
  pauseScreen.classList.add("hidden");startScreen.classList.remove("hidden");closeChat();clearControls();
  setTimeout(()=>socket.connect(),300);
});

/* RESIZE */
window.addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1));
});

/* WORLD + LOOP */
createRoads();createCrosswalks();createCity();createWindows();createStreetlights();createPalms();
createTraffic();createCheckpoints();
for(let i=0;i<CONFIG.MAX_PEDESTRIANS;i++)createPedestrian();
camera.position.set(0,8,15);camera.lookAt(0,0,0);
let minimapTimer=0;
function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  if(started&&!paused) {
    if(!chatOpen){updatePlayer(dt);updateJump(dt);updateCar(dt);}
    updateTraffic(dt);updatePedestrians(dt);updateRemotePlayers(dt);updateCamera(dt);
    updateCheckpoint();updateHUD(dt);sendPlayerUpdate(dt);
    minimapTimer+=dt;if(minimapTimer>=.125){drawMinimap();minimapTimer=0;}
  }
  renderer.render(scene,camera);
}
updateConnection(false);updatePlayerCount();animate();
