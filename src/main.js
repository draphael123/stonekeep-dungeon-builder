import * as THREE from 'three';
import './style.css';
import { THEMES, makeThemeMaterials } from './themes.js';

const CELL = 2, WALL_H = 2.8, WALL_T = .24;
const theme = THEMES.stoneKeep;
const mats = makeThemeMaterials(theme);
const roadMaterial=new THREE.MeshStandardMaterial({color:0x5a4b36,roughness:1,metalness:0});
const roadEdgeMaterial=new THREE.MeshStandardMaterial({color:0x71634d,roughness:.95});
const state = { rooms: [], decorations: [], selected: null, selectedDecor: null, tool: 'room', buildRole:'cottage', layer:'surface', mode: 'build', progressionTier:1, choosingExploreStart:false, exploreStart:null, dragStart: null, dragEnd: null, previewValid: false, nextId: 1, nextDecorId: 1, showcase: true, keeperPath:[], keeperPathIndex:0, gold:180, food:60, timeScale:1, simTime:0, simAccumulator:0 };
const ROOM_TYPES={
  unassigned:{name:'Unassigned Chamber',cost:5,purpose:'A flexible chamber with no production. Assign its purpose later.',needs:'No furnishing requirement'},
  treasury:{name:'Treasury',cost:6,purpose:'Stores more gold and generates income while operational.',needs:'Requires a chest or gold pile'},
  barracks:{name:'Barracks',cost:6,purpose:'Lets tired workers and future guards recover their energy.',needs:'Requires a cot or bedroll'},
  kitchen:{name:'Kitchen',cost:6,purpose:'Produces food and feeds hungry inhabitants.',needs:'Requires a cauldron'},
  guard:{name:'Guard Room',cost:6,purpose:'Creates a defensible post beside important passages.',needs:'Requires a weapon rack'},
  library:{name:'Library',cost:7,purpose:'Prepared for research, lore, and magical discoveries.',needs:'Requires a bookshelf'},
  workshop:{name:'Workshop',cost:7,purpose:'Prepared to manufacture doors, traps, and equipment.',needs:'Requires a table or crate'},
  crypt:{name:'Crypt',cost:6,purpose:'Provides quarters for undead inhabitants.',needs:'Requires a statue or sarcophagus'},
  prison:{name:'Prison',cost:7,purpose:'Holds captured heroes behind secure doors.',needs:'Requires a cage'},
  infirmary:{name:'Infirmary',cost:7,purpose:'Prepared to heal injured inhabitants after raids.',needs:'Requires a cot'},
  tavern:{name:'Tavern',cost:6,purpose:'Improves morale and gives inhabitants a social space.',needs:'Requires a table or bench'},
  training:{name:'Training Hall',cost:7,purpose:'Prepared to improve guards and combat units.',needs:'Requires a weapon rack'},
  alchemy:{name:'Alchemy Laboratory',cost:8,purpose:'Prepared to brew potions and volatile defenses.',needs:'Requires a cauldron or table'},
  shrine:{name:'Dark Shrine',cost:8,purpose:'Prepared to generate influence and magical power.',needs:'Requires a statue or brazier'},
  throne:{name:'Throne Room',cost:10,purpose:'A ceremonial seat of power that anchors the keep.',needs:'Requires a banner'}
  ,hall:{name:'Great Hall',cost:8,purpose:'The civic center of the settlement and the first step toward a castle.',needs:'Settlement headquarters'}
  ,cottage:{name:'Cottage',cost:5,purpose:'Provides a warm home for residents and their families.',needs:'Houses two residents'}
  ,forge:{name:'Forge',cost:8,purpose:'Turns raw materials into tools, fittings, and future weapons.',needs:'Requires a blacksmith'}
  ,farm:{name:'Farm Plot',cost:3,purpose:'Produces food outdoors and supports settlement growth.',needs:'Requires a farmer'}
  ,storehouse:{name:'Storehouse',cost:5,purpose:'Raises material capacity and shortens hauling routes.',needs:'Requires a worker'}
  ,lumberyard:{name:'Lumber Yard',cost:4,purpose:'Processes timber for buildings, furniture, and defenses.',needs:'Requires a woodcutter'}
  ,road:{name:'Road',cost:1,purpose:'Connects buildings and prepares faster outdoor travel.',needs:'No worker required'}
  ,watchtower:{name:'Watchtower',cost:9,purpose:'Extends sight and protects the settlement boundary.',needs:'Requires a guard'}
};
const preferences = { quality: 'high', volume: 70, brightness: 125, fog: 55, torch: 110, gridOpacity: 60, fov: 68, speed: 100, sensitivity: 100, showGrid: true, invertLook: false, autosave: true, reduceMotion: false };
const keys = new Set();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.85;
document.querySelector('#game').append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(theme.atmosphere.background);
scene.fog = new THREE.Fog(theme.atmosphere.fogColor, theme.atmosphere.fogNear, theme.atmosphere.fogFar);
scene.add(new THREE.HemisphereLight(theme.atmosphere.ambientColor, 0x17120d, theme.atmosphere.ambientIntensity*1.45));
const sun = new THREE.DirectionalLight(theme.atmosphere.sunColor, theme.atmosphere.sunIntensity);
sun.position.set(-18, 28, 14); sun.intensity*=1.35;sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -35; sun.shadow.camera.right = sun.shadow.camera.top = 35;
scene.add(sun);

const world = new THREE.Group(), previewGroup = new THREE.Group(), selectionGroup = new THREE.Group(), atmosphereGroup=new THREE.Group(), effectsGroup=new THREE.Group(), terrainGroup=new THREE.Group();
scene.add(world, previewGroup, selectionGroup, atmosphereGroup, effectsGroup,terrainGroup);

const grid = new THREE.GridHelper(80, 40, 0x86754f, 0x353b38);
grid.position.y = .012; grid.material.transparent = true; grid.material.opacity = .6; scene.add(grid);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100,100), new THREE.MeshStandardMaterial({color:0x252c29,roughness:1}));
ground.rotation.x = -Math.PI/2; ground.position.y=-.08; ground.receiveShadow=true; scene.add(ground);
const moonGlow=new THREE.PointLight(0x7897a8,2.2,46,2);moonGlow.position.set(-10,13,-15);scene.add(moonGlow);

const buildCamera = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, .1, 150);
const cam = { target: new THREE.Vector3(), yaw: Math.PI/4, pitch: .78, distance: 31 };
const exploreCamera = new THREE.PerspectiveCamera(68, innerWidth/innerHeight, .08, 120);
exploreCamera.position.set(1, 1.72, 1); let exploreYaw = 0, explorePitch = 0;
let camera = buildCamera;
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
let rightDrag = false, lastPointer = {x:0,y:0}, toastTimer;
const animatedFlames=[],floatingMotes=[];
const keeper=new THREE.Group();const keeperBody=addCylinder(keeper,.22,.82,[0,.52,0],mats.leather,10);const keeperHead=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),mats.brass);keeperHead.position.y=1.02;keeper.add(keeperHead);const keeperLight=new THREE.PointLight(0xffa34d,1.8,5,2);keeperLight.position.y=1.25;keeper.add(keeperLight);keeper.visible=false;scene.add(keeper);
const workers=[];
function makeWorker(index){
  const g=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:index?0xc58b67:0xd6a27d,roughness:.9}),hair=new THREE.MeshStandardMaterial({color:index?0x4a2d20:0x80603c,roughness:1}),cloth=new THREE.MeshStandardMaterial({color:index?0x526742:0x7b493b,roughness:1}),shirt=new THREE.MeshStandardMaterial({color:index?0xb59b6c:0x5d7180,roughness:1}),boot=new THREE.MeshStandardMaterial({color:0x30251f,roughness:1});
  const torso=addBox(g,[.4,.5,.24],[0,.68,0],cloth),shirtFront=addBox(g,[.32,.24,.255],[0,.78,-.005],shirt,false);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.18,12,9),skin);head.position.y=1.08;head.castShadow=true;g.add(head);
  const hairCap=new THREE.Mesh(new THREE.SphereGeometry(.185,12,7,0,Math.PI*2,0,Math.PI*.48),hair);hairCap.position.y=1.12;g.add(hairCap);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(.035,7,5),skin);nose.position.set(0,1.08,-.17);g.add(nose);
  for(const x of [-.07,.07]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.014,6,4),mats.soot);eye.position.set(x,1.12,-.166);g.add(eye);}
  const leftArm=new THREE.Group(),rightArm=new THREE.Group();leftArm.position.set(-.25,.86,0);rightArm.position.set(.25,.86,0);g.add(leftArm,rightArm);
  addCylinder(leftArm,.055,.46,[0,-.2,0],shirt,7);addCylinder(rightArm,.055,.46,[0,-.2,0],shirt,7);addCylinder(leftArm,.06,.12,[0,-.46,0],skin,7);addCylinder(rightArm,.06,.12,[0,-.46,0],skin,7);
  const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();leftLeg.position.set(-.1,.46,0);rightLeg.position.set(.1,.46,0);g.add(leftLeg,rightLeg);
  addCylinder(leftLeg,.065,.4,[0,-.2,0],cloth,7);addCylinder(rightLeg,.065,.4,[0,-.2,0],cloth,7);addBox(leftLeg,[.13,.1,.22],[0,-.42,-.04],boot);addBox(rightLeg,[.13,.1,.22],[0,-.42,-.04],boot);
  if(index===0){const hat=addCylinder(g,.23,.045,[0,1.25,0],hair,12);addCylinder(g,.14,.16,[0,1.34,0],hair,10);}
  else{addBox(g,[.34,.42,.05],[0,.69,-.15],new THREE.MeshStandardMaterial({color:0xd1bd8e,roughness:1}),false);const pouch=addBox(g,[.17,.18,.1],[.22,.5,.12],mats.leather);}
  g.scale.setScalar(1.18);g.userData={hunger:100,rest:100,morale:100,path:[],task:'Idle',index,leftArm,rightArm,leftLeg,rightLeg,walkPhase:index*Math.PI};g.visible=false;scene.add(g);workers.push(g);return g;
}
makeWorker(0);makeWorker(1);

function buildAtmosphere(){
  atmosphereGroup.clear();floatingMotes.length=0;
  const positions=new Float32Array(220*3);for(let i=0;i<220;i++){positions[i*3]=(Math.random()-.5)*58;positions[i*3+1]=.25+Math.random()*8;positions[i*3+2]=(Math.random()-.5)*58;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const motes=new THREE.Points(geo,new THREE.PointsMaterial({color:0xd8b66a,size:.035,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending}));
  motes.userData.baseY=positions.slice();atmosphereGroup.add(motes);floatingMotes.push(motes);
}
buildAtmosphere();

function updateBuildCamera() {
  const cp = Math.cos(cam.pitch);
  buildCamera.position.set(
    cam.target.x + Math.sin(cam.yaw)*cp*cam.distance,
    cam.target.y + Math.sin(cam.pitch)*cam.distance,
    cam.target.z + Math.cos(cam.yaw)*cp*cam.distance
  );
  buildCamera.lookAt(cam.target);
}
updateBuildCamera();

function cellKey(x,z){ return `${x},${z}`; }
function roomCells(room) {
  const out=[]; for(let x=room.x;x<room.x+room.w;x++) for(let z=room.z;z<room.z+room.d;z++) out.push({x,z}); return out;
}
function occupiedMap(ignoreId=null) {
  const map=new Map(); for(const room of state.rooms) if(room.id!==ignoreId&&(room.layer||'underground')===state.layer) for(const c of roomCells(room)) map.set(cellKey(c.x,c.z),room.id); return map;
}
function normalizeRect(a,b){return {x:Math.min(a.x,b.x),z:Math.min(a.z,b.z),w:Math.abs(a.x-b.x)+1,d:Math.abs(a.z-b.z)+1};}
function isValidRect(r,ignoreId=null){ if(r.w>12||r.d>12) return false; const occ=occupiedMap(ignoreId); return roomCells(r).every(c=>!occ.has(cellKey(c.x,c.z))); }

function addBox(group, size, pos, material, cast=true) {
  const m=new THREE.Mesh(new THREE.BoxGeometry(...size), material); m.position.set(...pos); m.castShadow=cast; m.receiveShadow=true; group.add(m); return m;
}
function buildSurfaceTerrain(){
  terrainGroup.clear();for(let i=0;i<34;i++){const angle=i*2.399,radius=25+(i%7)*2.2,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;addCylinder(terrainGroup,.17,2.2,[x,1.05,z],mats.wood,8);const crown=new THREE.Mesh(new THREE.ConeGeometry(.85+(i%3)*.18,2.3,8),mats.moss);crown.position.set(x,2.65,z);crown.castShadow=true;terrainGroup.add(crown);}
  for(let i=0;i<18;i++){const angle=i*1.73,radius=15+(i%5)*3,rock=addBox(terrainGroup,[.28+(i%3)*.12,.2+(i%2)*.1,.3+(i%4)*.1],[Math.cos(angle)*radius,.08,Math.sin(angle)*radius],mats.wallTop);rock.rotation.y=i*.58;}
}
buildSurfaceTerrain();
function makeTorch(group,x,z,side) {
  const offsets={n:[0,0,-.17],s:[0,0,.17],w:[-.17,0,0],e:[.17,0,0]};
  const [ox,,oz]=offsets[side]; const holder=addBox(group,[.08,.45,.08],[x+ox,1.38,z+oz],mats.trim);
  holder.rotation[side==='n'||side==='s'?'x':'z']=side==='n'||side==='w'?.35:-.35;
  const flame=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),mats.flame); flame.scale.y=1.7; flame.position.set(x+ox*1.8,1.69,z+oz*1.8); flame.userData.phase=Math.random()*6.28;group.add(flame);animatedFlames.push(flame);
  const light=new THREE.PointLight(0xff9a42,4.5,11,2);light.userData.baseIntensity=4.5;light.position.copy(flame.position);light.castShadow=false;group.add(light);
}
function addConditionProps(group,room){
  const condition=room.condition||'occupied',cx=(room.x+room.w/2)*CELL,cz=(room.z+room.d/2)*CELL;
  if(condition==='pristine')return;
  if(condition==='abandoned'||condition==='battle'){
    const count=condition==='battle'?10:5;for(let i=0;i<count;i++){const rock=addBox(group,[.12+(i%3)*.13,.08+(i%2)*.1,.16+(i%4)*.09],[room.x*CELL+.45+(i*1.37%(room.w*CELL-1)),.14,room.z*CELL+.4+(i*.83%(room.d*CELL-1))],i%2?mats.wallTop:mats.wall);rock.rotation.y=i*.67;}
  }
  if(condition==='battle'){for(let i=0;i<3;i++){const scorch=addCylinder(group,.35+i*.12,.012,[cx+(i-1)*.7,.105,cz+(i%2?-.55:.48)],mats.soot,16);scorch.scale.z=.55;}}
  if(condition==='overgrown'){for(let i=0;i<9;i++){const moss=addCylinder(group,.12+(i%3)*.08,.025,[room.x*CELL+.35+(i*.91%(room.w*CELL-1)),.11,room.z*CELL+.3+(i*1.27%(room.d*CELL-1))],mats.moss,9);moss.scale.z=1.8;}}
  if(condition==='haunted'){
    const glow=new THREE.PointLight(0x63cbd0,3.2,Math.max(room.w,room.d)*CELL*1.2,2);glow.userData.baseIntensity=3.2;glow.position.set(cx,1.8,cz);group.add(glow);
    for(let i=0;i<3;i++){const wisp=new THREE.Mesh(new THREE.SphereGeometry(.11+i*.03,9,7),mats.ghost);wisp.position.set(cx+(i-1)*.65,1.05+i*.32,cz+(i%2?.45:-.35));wisp.userData.phase=i*2.1;group.add(wisp);animatedFlames.push(wisp);}
  }
}
function addCeiling(group,room){
  const cx=(room.x+room.w/2)*CELL,cz=(room.z+room.d/2)*CELL,cg=new THREE.Group();cg.userData.ceiling=true;
  addBox(cg,[room.w*CELL-.18,.16,room.d*CELL-.18],[cx,WALL_H+.55,cz],mats.wallTop);
  const alongX=room.w>=room.d;const bays=Math.max(2,Math.ceil((alongX?room.w:room.d)/2));
  for(let i=0;i<=bays;i++){const t=i/bays-.5;const beam=addBox(cg,alongX?[.16,.28,room.d*CELL-.25]:[room.w*CELL-.25,.28,.16],[alongX?cx+t*(room.w*CELL-.35):cx,WALL_H+.38,alongX?cz:cz+t*(room.d*CELL-.35)],mats.wood);beam.rotation[alongX?'z':'x']=0;}
  cg.visible=state.mode==='explore';group.add(cg);
}
function addSurfaceBuilding(group,room){
  const cx=(room.x+room.w/2)*CELL,cz=(room.z+room.d/2)*CELL,w=room.w*CELL-.18,d=room.d*CELL-.18;
  if(room.role==='road'){
    addBox(group,[room.w*CELL+.08,.055,room.d*CELL+.08],[cx,.005,cz],roadMaterial,false);
    for(let i=0;i<Math.max(2,room.w*room.d*2);i++){const pebble=addCylinder(group,.035+(i%3)*.018,.018,[room.x*CELL+.25+(i*.83%(room.w*CELL-.5)),.045,room.z*CELL+.25+(i*1.17%(room.d*CELL-.5))],roadEdgeMaterial,7);pebble.scale.z=1.7;}
    return;
  }
  if(room.role==='farm'){
    addBox(group,[w,.07,d],[cx,.01,cz],mats.wood,false);for(let z=room.z+.35;z<room.z+room.d;z+=.55)for(let x=room.x+.3;x<room.x+room.w;x+=.5)addCylinder(group,.035,.28,[x*CELL,.18,z*CELL],mats.moss,5);return;
  }
  if(room.role==='lumberyard'){addBox(group,[w,.1,d],[cx,.03,cz],mats.moss,false);for(let i=0;i<8;i++){const log=addCylinder(group,.16,1.4,[cx+(i%4-.5)*.42,.2,cz+(Math.floor(i/4)-.5)*.55],mats.wood,9);log.rotation.z=Math.PI/2;}return;}
  addBox(group,[w,.16,d],[cx,.03,cz],mats.floor);
  const wallH=room.role==='watchtower'?4.2:2.35;
  const wallMat=room.role==='forge'?mats.wall:mats.wood;
  addBox(group,[w,wallH,.18],[cx,wallH/2,room.z*CELL+.1],wallMat);addBox(group,[.18,wallH,d],[room.x*CELL+.1,wallH/2,cz],wallMat);addBox(group,[.18,wallH,d],[(room.x+room.w)*CELL-.1,wallH/2,cz],wallMat);
  const doorway=1.35,sideW=Math.max(.3,(w-doorway)/2);addBox(group,[sideW,wallH,.18],[cx-(doorway+sideW)/2,wallH/2,(room.z+room.d)*CELL-.1],wallMat);addBox(group,[sideW,wallH,.18],[cx+(doorway+sideW)/2,wallH/2,(room.z+room.d)*CELL-.1],wallMat);addBox(group,[doorway,.48,.18],[cx,wallH-.24,(room.z+room.d)*CELL-.1],wallMat);
  const roof=new THREE.Group();roof.userData.surfaceRoof=true;roof.userData.roomId=room.id;const roofMat=room.role==='hall'?mats.banner:mats.rug;
  const left=addBox(roof,[w*.58,.16,d+.35],[cx-w*.22,wallH+.38,cz],roofMat);left.rotation.z=.52;const right=addBox(roof,[w*.58,.16,d+.35],[cx+w*.22,wallH+.38,cz],roofMat);right.rotation.z=-.52;
  roof.visible=state.mode==='explore'||state.selected!==room.id;group.add(roof);
  if(room.role==='forge'){const chimney=addBox(group,[.48,wallH+1,.48],[cx+w*.28,(wallH+1)/2,cz+d*.25],mats.wallTop);const glow=new THREE.PointLight(0xff7428,4,10,2);glow.userData.baseIntensity=4;glow.position.set(cx,1,cz);group.add(glow);}
  if(room.role==='storehouse')for(let i=0;i<4;i++)addBox(group,[.65,.65,.65],[cx+(i%2-.5)*.8,.42,cz+(Math.floor(i/2)-.5)*.8],mats.wood);
  if(room.role==='watchtower'){const top=addBox(group,[w+.5,.22,d+.5],[cx,wallH+.05,cz],mats.wallTop);for(const [x,z] of [[cx-w/2,cz-d/2],[cx+w/2,cz-d/2],[cx-w/2,cz+d/2],[cx+w/2,cz+d/2]])addBox(group,[.35,.7,.35],[x,wallH+.45,z],mats.wall);}
}
function addCylinder(group,r,depth,pos,material,segments=10){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,depth,segments),material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
}
const ROLE_REQUIREMENTS={treasury:['chest','goldpile'],barracks:['cot','bedroll'],guard:['weaponrack'],library:['bookshelf'],kitchen:['cauldron'],workshop:['table','crate'],crypt:['statue'],prison:['cage'],infirmary:['cot'],tavern:['table','bench'],training:['weaponrack'],alchemy:['cauldron','table'],shrine:['statue','brazier'],throne:['banner'],heart:[],hall:[],cottage:[],forge:[],farm:[],storehouse:[],lumberyard:[],road:[],watchtower:[]};
function roomOperational(room){
  if(!room.role||room.role==='unassigned')return false;if(room.condition==='battle'||room.condition==='abandoned')return false;
  const types=new Set(state.decorations.filter(d=>d.roomId===room.id).map(d=>d.type));return (ROLE_REQUIREMENTS[room.role]||[]).some(t=>types.has(t))||(ROLE_REQUIREMENTS[room.role]||[]).length===0;
}
function addRoomProps(group,room) {
  const cx=(room.x+room.w/2)*CELL,cz=(room.z+room.d/2)*CELL,min=Math.min(room.w,room.d);
  const roomFill=new THREE.PointLight(0xe59a58,2.05,Math.max(room.w,room.d)*CELL*1.5,2);roomFill.userData.baseIntensity=2.05;roomFill.position.set(cx,2.25,cz);group.add(roomFill);
  // Corner pillars give every chamber a stronger silhouette.
  if(room.w>1&&room.d>1) for(const [x,z] of [[room.x*CELL+.18,room.z*CELL+.18],[(room.x+room.w)*CELL-.18,room.z*CELL+.18],[room.x*CELL+.18,(room.z+room.d)*CELL-.18],[(room.x+room.w)*CELL-.18,(room.z+room.d)*CELL-.18]]){
    addCylinder(group,.22,WALL_H+.28,[x,(WALL_H+.28)/2,z],mats.wallTop,8);addBox(group,[.62,.12,.62],[x,.06,z],mats.wallTop);addBox(group,[.54,.13,.54],[x,WALL_H+.12,z],mats.wallTop);
  }
  if(min>=3){
    // Worn crimson runner with a brass border.
    addBox(group,[Math.max(1.4,(room.w-1)*CELL),.025,1.18],[cx,.13,cz],mats.rug,false);
    addBox(group,[Math.max(1.25,(room.w-1)*CELL)-.15,.028,.82],[cx,.147,cz],mats.banner,false);
  }
  if(room.w*room.d>=12){
    // Heavy feasting/war table and candles.
    addBox(group,[2.45,.16,.9],[cx,.9,cz],mats.wood);for(const x of [-.9,.9])for(const z of [-.3,.3])addBox(group,[.13,.82,.13],[cx+x,.45,cz+z],mats.wood);
    for(const x of [-.65,.65]){addCylinder(group,.035,.34,[cx+x,1.14,cz],mats.brass,8);const f=new THREE.Mesh(new THREE.SphereGeometry(.055,7,5),mats.flame);f.position.set(cx+x,1.34,cz);group.add(f);}
  } else if(room.w*room.d>=6) {
    // Iron-bound treasure chest.
    addBox(group,[.95,.48,.58],[cx,.38,cz],mats.wood);addBox(group,[1.01,.08,.62],[cx,.63,cz],mats.brass);addBox(group,[.08,.42,.64],[cx,.39,cz],mats.brass);
  }
  // Barrels and loose masonry are deterministic per-room.
  if(room.w>=2){const bx=(room.x+room.w-.48)*CELL,bz=(room.z+.5)*CELL;addCylinder(group,.32,.72,[bx,.38,bz],mats.wood,12);addCylinder(group,.335,.05,[bx,.28,bz],mats.brass,12);addCylinder(group,.335,.05,[bx,.54,bz],mats.brass,12);}
  if(room.id%2===0){for(let i=0;i<3;i++){const rock=addBox(group,[.22+i*.06,.12+i*.03,.18+i*.04],[room.x*CELL+.5+i*.22,.15,(room.z+room.d)*CELL-.48-i*.12],mats.wallTop);rock.rotation.y=i*.7;}}
  // Heraldic banner on the north wall.
  if(room.w>=3){const banner=new THREE.Mesh(new THREE.PlaneGeometry(1.05,1.45),mats.banner);banner.position.set(cx,1.75,room.z*CELL+.14);banner.rotation.y=Math.PI;group.add(banner);addBox(group,[1.3,.07,.07],[cx,2.49,room.z*CELL+.12],mats.brass);}
  if(room.preset==='throne'){
    addBox(group,[3.8,.28,2.15],[cx,.2,(room.z+room.d-1)*CELL],mats.wallTop);
    addBox(group,[1.15,1.45,.2],[cx,1.12,(room.z+room.d-.55)*CELL],mats.wood);
    addBox(group,[1.42,.17,.82],[cx,.53,(room.z+room.d-.78)*CELL],mats.banner);
    for(const dx of [-.58,.58])addCylinder(group,.11,1.9,[cx+dx,1.34,(room.z+room.d-.55)*CELL],mats.brass,8);
    const crown=new THREE.PointLight(0xffc36a,3.8,10,2);crown.userData.baseIntensity=3.8;crown.position.set(cx,2.4,(room.z+room.d-1)*CELL);group.add(crown);
  }
  if(room.role&&room.role!=='unassigned'){
    const operational=roomOperational(room),ring=new THREE.Mesh(new THREE.RingGeometry(.38,.5,24),new THREE.MeshBasicMaterial({color:operational?0x68c998:0xbe684d,transparent:true,opacity:.7,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(cx,.19,cz);group.add(ring);
  }
  if(room.role==='heart'){
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(.62,0),mats.ghost);core.position.set(cx,1.15,cz);core.userData.phase=room.id;group.add(core);animatedFlames.push(core);
    addCylinder(group,.9,.26,[cx,.25,cz],mats.brass,10);const heartLight=new THREE.PointLight(0x55bec5,4.8,13,2);heartLight.userData.baseIntensity=4.8;heartLight.position.set(cx,1.5,cz);group.add(heartLight);
  }
}
function addPlacedDecoration(group,decor) {
  const x=(decor.x+.5)*CELL,z=(decor.z+.5)*CELL,rot=decor.rotation||0;
  group.position.set(x,0,z);group.rotation.y=rot;group.scale.setScalar(decor.scale||1);
  if(decor.type==='table'){
    addBox(group,[1.45,.13,.7],[0,.78,0],mats.wood);for(const dx of [-.55,.55])for(const dz of [-.22,.22])addBox(group,[.1,.7,.1],[dx,.39,dz],mats.wood);
  } else if(decor.type==='chest'){
    addBox(group,[.9,.43,.55],[0,.3,0],mats.wood);addBox(group,[.96,.07,.59],[0,.55,0],mats.brass);addBox(group,[.07,.38,.6],[0,.31,0],mats.brass);
  } else if(decor.type==='barrel'){
    addCylinder(group,.31,.7,[0,.36,0],mats.wood,12);addCylinder(group,.325,.045,[0,.25,0],mats.brass,12);addCylinder(group,.325,.045,[0,.52,0],mats.brass,12);
  } else if(decor.type==='brazier'){
    addCylinder(group,.26,.5,[0,.28,0],mats.trim,10);const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.38,.22,.18,10),mats.brass);bowl.position.y=.62;group.add(bowl);
    const flame=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),mats.flame);flame.scale.y=1.65;flame.position.y=.83;group.add(flame);const light=new THREE.PointLight(0xff8a32,5.2,9,2);light.userData.baseIntensity=5.2;light.position.y=1.1;group.add(light);
  } else if(decor.type==='banner'){
    addCylinder(group,.06,2.2,[0,1.1,0],mats.brass,8);addBox(group,[1.05,.06,.06],[.42,2.05,0],mats.brass);const cloth=new THREE.Mesh(new THREE.PlaneGeometry(.72,1.2),mats.banner);cloth.position.set(.42,1.43,0);group.add(cloth);
  } else if(decor.type==='bench'){
    addBox(group,[1.5,.12,.42],[0,.52,0],mats.wood);for(const dx of [-.58,.58])addBox(group,[.12,.48,.34],[dx,.26,0],mats.wood);if((decor.variant||0)%2)addBox(group,[1.5,.48,.1],[0,.77,.16],mats.wood);
  } else if(decor.type==='bookshelf'){
    addBox(group,[1.35,1.8,.28],[0,.92,0],mats.wood);for(const y of [.35,.9,1.45])addBox(group,[1.22,.08,.38],[0,y,0],mats.trim);
    for(let i=0;i<8;i++)addBox(group,[.09+(i%3)*.025,.32,.19],[-.5+i*.14,.55+(i%2)*.55,-.05],i%3===0?mats.banner:mats.rug);
  } else if(decor.type==='crate'){
    addBox(group,[.82,.72,.82],[0,.38,0],mats.wood);addBox(group,[.9,.09,.09],[0,.4,.43],mats.trim);addBox(group,[.09,.09,.9],[.43,.4,0],mats.trim);
  } else if(decor.type==='bedroll'){
    addBox(group,[.85,.12,1.55],[0,.11,0],(decor.variant||0)%2?mats.banner:mats.rug,false);const pillow=addCylinder(group,.24,.72,[0,.24,-.55],mats.wood,12);pillow.rotation.z=Math.PI/2;
  } else if(decor.type==='statue'){
    addBox(group,[.82,.22,.82],[0,.12,0],mats.wallTop);addCylinder(group,.3,1.2,[0,.82,0],mats.wallTop,8);const head=new THREE.Mesh(new THREE.SphereGeometry(.28,8,7),mats.wall);head.position.y=1.62;group.add(head);
  } else if(decor.type==='cage'){
    addCylinder(group,.72,.09,[0,.05,0],mats.trim,12);addCylinder(group,.72,.09,[0,1.55,0],mats.trim,12);for(let i=0;i<10;i++){const a=i*Math.PI/5;addCylinder(group,.035,1.5,[Math.cos(a)*.67,.8,Math.sin(a)*.67],mats.brass,6);}
  } else if(decor.type==='rubble'){
    for(let i=0;i<7;i++){const rock=addBox(group,[.2+(i%3)*.13,.12+(i%2)*.09,.24+(i%4)*.07],[((i*37)%9-4)*.12,.1+(i%2)*.05,((i*53)%9-4)*.1],i%2?mats.wall:mats.wallTop);rock.rotation.y=i*.91;}
  } else if(decor.type==='weaponrack'){
    addBox(group,[1.45,.12,.42],[0,.72,0],mats.wood);for(const x of [-.48,0,.48]){const shaft=addCylinder(group,.025,1.35,[x,.94,0],mats.brass,6);shaft.rotation.z=x?-.18:.12;}addBox(group,[1.35,.12,.12],[0,.3,0],mats.wood);
  } else if(decor.type==='cot'){
    addBox(group,[.95,.15,1.65],[0,.36,0],mats.wood);addBox(group,[.82,.13,1.48],[0,.47,0],(decor.variant||0)%2?mats.banner:mats.rug,false);for(const x of [-.4,.4])for(const z of [-.72,.72])addBox(group,[.09,.36,.09],[x,.18,z],mats.wood);
  } else if(decor.type==='cauldron'){
    const pot=new THREE.Mesh(new THREE.SphereGeometry(.42,12,8,0,Math.PI*2,Math.PI*.45,Math.PI*.55),mats.trim);pot.position.y=.52;group.add(pot);for(const x of [-.3,.3])addBox(group,[.08,.48,.08],[x,.25,0],mats.brass);const glow=new THREE.PointLight(0xff7c28,3.5,7,2);glow.userData.baseIntensity=3.5;glow.position.y=.35;group.add(glow);
  } else if(decor.type==='goldpile'){
    for(let i=0;i<18;i++){const coin=addCylinder(group,.08,.025,[((i*31)%9-4)*.09,.04+Math.floor(i/9)*.025,((i*47)%9-4)*.07],mats.brass,10);coin.rotation.x=Math.PI/2+(i%3)*.12;}
  }
}
function buildWorld() {
  world.clear();animatedFlames.length=0;
  const occ=occupiedMap();
  for(const room of state.rooms.filter(r=>(r.layer||'underground')===state.layer)) {
    const g=new THREE.Group(); g.userData.roomId=room.id; world.add(g);
    if(state.layer==='surface'){addSurfaceBuilding(g,room);continue;}
    for(const c of roomCells(room)) {
      const px=(c.x+.5)*CELL,pz=(c.z+.5)*CELL;
      addBox(g,[CELL-.07,.16,CELL-.07],[px,.02,pz],((c.x+c.z)&1)?mats.floor:mats.floorAlt);
      const sides=[['n',0,-1,[CELL,WALL_H,WALL_T],[px,WALL_H/2,pz-CELL/2]],['s',0,1,[CELL,WALL_H,WALL_T],[px,WALL_H/2,pz+CELL/2]],['w',-1,0,[WALL_T,WALL_H,CELL],[px-CELL/2,WALL_H/2,pz]],['e',1,0,[WALL_T,WALL_H,CELL],[px+CELL/2,WALL_H/2,pz]]];
      for(const [name,dx,dz,size,pos] of sides) {
        const neighbor=occ.get(cellKey(c.x+dx,c.z+dz));
        if(neighbor===room.id) continue;
        if(neighbor) {
          const lintelSize=name==='n'||name==='s'?[CELL,.65,WALL_T]:[WALL_T,.65,CELL];
          const lintelPos=[pos[0],WALL_H-.325,pos[2]];
          addBox(g,lintelSize,lintelPos,mats.wall);
          const jambSize=name==='n'||name==='s'?[.3,WALL_H-.65,WALL_T]:[WALL_T,WALL_H-.65,.3];
          const off=name==='n'||name==='s'?[CELL/2-.15,0,0]:[0,0,CELL/2-.15];
          addBox(g,jambSize,[pos[0]+off[0],(WALL_H-.65)/2,pos[2]+off[2]],mats.wall);
          addBox(g,jambSize,[pos[0]-off[0],(WALL_H-.65)/2,pos[2]-off[2]],mats.wall);
          if(room.id<neighbor){
            const other=state.rooms.find(r=>r.id===neighbor),closed=room.doorsOpen===false||other?.doorsOpen===false;
            const door=new THREE.Group(),panel=addBox(door,[name==='n'||name==='s'?1.28:.12,1.92,name==='n'||name==='s'?.12:1.28],[0,.96,0],mats.wood);
            addBox(door,[name==='n'||name==='s'?1.34:.15,.08,name==='n'||name==='s'?.15:1.34],[0,1.56,0],mats.brass);
            door.position.set(pos[0],0,pos[2]);if(!closed)door.rotation.y=(name==='n'||name==='s'?1:-1)*Math.PI*.42;door.userData.doorConnection=[room.id,neighbor];g.add(door);
          }
        } else {
          addBox(g,size,pos,mats.wall);
          const capSize=name==='n'||name==='s'?[CELL+.05,.11,WALL_T+.08]:[WALL_T+.08,.11,CELL+.05];
          addBox(g,capSize,[pos[0],WALL_H+.04,pos[2]],mats.wallTop,false);
          if(Math.abs(c.x*3+c.z*5+(name==='n'?1:0))%theme.props.torchEvery===0) makeTorch(g,pos[0],pos[2],name);
        }
      }
    }
    addRoomProps(g,room);addConditionProps(g,room);addCeiling(g,room);
  }
  for(const decor of state.decorations.filter(d=>{const r=state.rooms.find(x=>x.id===d.roomId);return(r?.layer||'underground')===state.layer;})){
    const dg=new THREE.Group();dg.userData.roomId=decor.roomId;dg.userData.decorId=decor.id;world.add(dg);addPlacedDecoration(dg,decor);
  }
  updateSelection();
  updateHUD();
  updateProgression();
}
function getProgression(){
  const surface=state.rooms.filter(r=>r.layer==='surface'),roles=new Set(surface.map(r=>r.role));let tier=1,goal=roles.has('hall')?'Build a cottage and a farm':'Build a Great Hall to found the settlement',reward=roles.has('hall')?'Unlocks lumber yard and storehouse':'Establishes your founding camp',done=roles.has('hall')?((roles.has('cottage')?1:0)+(roles.has('farm')?1:0)):0,total=roles.has('hall')?2:1;
  if(roles.has('hall')&&roles.has('cottage')&&roles.has('farm')){tier=2;goal='Build a lumber yard and storehouse';reward='Unlocks the forge';done=(roles.has('lumberyard')?1:0)+(roles.has('storehouse')?1:0);}
  if(roles.has('lumberyard')&&roles.has('storehouse')){tier=3;goal='Build a forge and grow to 6 buildings';reward='Unlocks underground building and decorations';done=Math.min(2,(roles.has('forge')?1:0)+(surface.length>=6?1:0));}
  if(roles.has('forge')&&surface.length>=6){tier=4;goal='Build a watchtower';reward='Your village becomes a fortified keep';done=roles.has('watchtower')?1:0;total=1;}
  if(roles.has('watchtower')){tier=5;goal='Expand freely above and below';reward='All current blueprints unlocked';done=1;total=1;}
  return{tier,goal,reward,done,total,names:['','I · FOUNDING CAMP','II · HAMLET','III · VILLAGE','IV · STRONGHOLD','V · STONE KEEP']};
}
function updateProgression(){
  if(state.showcase)return;const p=getProgression(),old=state.progressionTier||1;state.progressionTier=p.tier;document.body.dataset.tier=p.tier;
  if(state.layer==='surface')document.querySelector('#styleNote').textContent=p.tier>=4?'Fortified settlement architecture':'Camp architecture · grows with settlement';
  document.querySelector('#stageName').textContent=p.names[p.tier];document.querySelector('#stageCount').textContent=`${p.done} / ${p.total}`;document.querySelector('#stageProgress').style.width=`${Math.round(p.done/p.total*100)}%`;document.querySelector('#nextGoal').textContent=p.goal;document.querySelector('#unlockReward').textContent=p.reward;
  document.querySelectorAll('[data-tier]').forEach(b=>{const locked=Number(b.dataset.tier)>p.tier;b.disabled=locked;b.classList.toggle('locked',locked);b.title=locked?`Unlocks at settlement stage ${b.dataset.tier}`:'';});
  const locked=p.tier<4;document.querySelector('#undergroundLayer').disabled=locked;document.querySelector('#undergroundLock').textContent=locked?'LOCKED':'OPEN';
  if(p.tier>old)toast(`${p.names[p.tier]} reached · new buildings unlocked`);
}
function constructionBurst(room){
  if(preferences.reduceMotion)return;const cx=(room.x+room.w/2)*CELL,cz=(room.z+room.d/2)*CELL;
  for(let i=0;i<24;i++){const material=(i%4?mats.wallTop:mats.flame).clone();material.transparent=true;const p=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.06),material);p.position.set(cx+(Math.random()-.5)*room.w*CELL,.15,cz+(Math.random()-.5)*room.d*CELL);p.userData.velocity=new THREE.Vector3((Math.random()-.5)*1.6,.7+Math.random()*1.8,(Math.random()-.5)*1.6);p.userData.life=.65+Math.random()*.55;effectsGroup.add(p);}
}
function updatePreview() {
  previewGroup.clear(); if(!state.dragStart||!state.dragEnd)return;
  const r=normalizeRect(state.dragStart,state.dragEnd),type=ROOM_TYPES[state.buildRole],cost=r.w*r.d*type.cost,minValid=state.buildRole!=='hall'||(r.w>=3&&r.d>=3); state.previewValid=isValidRect(r)&&state.gold>=cost&&minValid;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(r.w*CELL-.08,.14,r.d*CELL-.08),state.previewValid?mats.previewValid:mats.previewInvalid);
  mesh.position.set((r.x+r.w/2)*CELL,.18,(r.z+r.d/2)*CELL); previewGroup.add(mesh);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:state.previewValid?0x8ff0bc:0xff7a6b}));
  edges.position.copy(mesh.position); previewGroup.add(edges);
  document.querySelector('#buildPurpose span').textContent=`${cost} gold total · ${type.cost} per tile${state.gold<cost?' · INSUFFICIENT GOLD':''}`;
}
function updateSelection() {
  selectionGroup.clear();
  const r=state.rooms.find(x=>x.id===state.selected);
  const d=state.decorations.find(x=>x.id===state.selectedDecor);
  if(d){const ring=new THREE.Mesh(new THREE.RingGeometry(.72,.86,32),new THREE.MeshBasicMaterial({color:0xe1b85b,side:THREE.DoubleSide,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;ring.position.set((d.x+.5)*CELL,.22,(d.z+.5)*CELL);selectionGroup.add(ring);}
  else if(r){const m=new THREE.Mesh(new THREE.BoxGeometry(r.w*CELL+.12,.08,r.d*CELL+.12),mats.selected);m.position.set((r.x+r.w/2)*CELL,.25,(r.z+r.d/2)*CELL);selectionGroup.add(m);}
  document.querySelector('#rotateBtn').disabled=!r&&!d; document.querySelector('#deleteBtn').disabled=!r&&!d;
  document.querySelector('#selectionLabel').textContent=d?'SELECTED DECORATION':'SELECTED ROOM';
  document.querySelector('#decorOptions').classList.toggle('hidden',!d);
  document.querySelector('#rotateBtn span:nth-child(2)').textContent=d?'Turn 90°':'Rotate';
  document.querySelector('#deleteBtn span:nth-child(2)').textContent=d?'Remove':'Demolish';
  const roomType=r?(r.role==='heart'?{name:'Dungeon Heart',purpose:'The indestructible source of your keep.'}:ROOM_TYPES[r.role||'unassigned']):null;
  document.querySelector('#selectionInfo').textContent=d?`${d.type[0].toUpperCase()+d.type.slice(1)} · ${Math.round((d.rotation||0)*180/Math.PI)%360}° · ${Math.round((d.scale||1)*100)}%`:r?`${roomType.name} · ${r.w} × ${r.d} tiles${r.role&&r.role!=='unassigned'?` · ${roomOperational(r)?'Operational':'Inactive'}`:''}. ${roomType.purpose}`:'Choose a room purpose, then drag across the grid.';
  const conditionSelect=document.querySelector('#conditionSelect');conditionSelect.disabled=!r||!!d;if(r)conditionSelect.value=r.condition||'occupied';
  const roleSelect=document.querySelector('#roleSelect');roleSelect.disabled=!r||!!d||r?.role==='heart'||state.layer==='surface';if(r&&ROOM_TYPES[r.role])roleSelect.value=r.role||'unassigned';
  document.querySelector('#dressRoomBtn').disabled=!r||!!d||r?.role==='heart'||r?.role==='road'||r?.role==='farm'||r?.role==='lumberyard';
  document.querySelector('#doorBtn').disabled=!r||!!d||state.layer==='surface';document.querySelector('#pathTestBtn').disabled=!r||!!d;
  document.querySelector('#doorBtn span:nth-child(2)').textContent=r?.doorsOpen===false?'Open room doors':'Close room doors';
  world.traverse(o=>{if(o.userData.surfaceRoof)o.visible=state.mode==='explore'||o.userData.roomId!==r?.id;});
}
function updateHUD(){const activeRooms=state.rooms.filter(r=>(r.layer||'underground')===state.layer);document.querySelector('#roomCount').textContent=activeRooms.length;const n=activeRooms.reduce((s,r)=>s+r.w*r.d,0);document.querySelector('#tileCount').textContent=`${n} tile${n===1?'':'s'}`;document.querySelector('#decorCount').textContent=state.decorations.filter(d=>activeRooms.some(r=>r.id===d.roomId)).length;document.querySelector('#operationalCount').textContent=activeRooms.filter(roomOperational).length;updateSimHUD();}
function updateSimHUD(){
  document.querySelector('#goldValue').textContent=Math.floor(state.gold);document.querySelector('#foodValue').textContent=Math.floor(state.food);document.querySelector('#workerValue').textContent=state.rooms.some(r=>r.layer==='surface'&&r.role==='hall')?workers.length:0;
  const alert=state.food<20?'Food stores are critically low.':state.gold<40?'The treasury cannot fund construction.':state.rooms.some(r=>r.role&&r.role!=='unassigned'&&!roomOperational(r))?'A functional room needs furnishings or repairs.':state.rooms.length<3?'Expand the keep and assign its first rooms.':'The keep is stable and operating.';
  document.querySelector('#alerts strong').textContent=alert;
}
function toast(msg){const e=document.querySelector('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),1800);}

function applyPreferences() {
  renderer.setPixelRatio(preferences.quality==='high'?Math.min(devicePixelRatio,2):preferences.quality==='medium'?Math.min(devicePixelRatio,1.35):1);
  renderer.shadowMap.enabled=preferences.quality!=='low';
  sun.castShadow=preferences.quality==='high';
  document.body.classList.toggle('reduce-motion',preferences.reduceMotion);
  document.querySelector('#qualitySetting').value=preferences.quality;
  document.querySelector('#volumeSetting').value=preferences.volume;
  document.querySelector('#speedSetting').value=preferences.speed;
  document.querySelector('#motionSetting').checked=preferences.reduceMotion;
  document.querySelector('#brightnessSetting').value=preferences.brightness;
  renderer.toneMappingExposure=1.48*(preferences.brightness/100);
  document.querySelector('#fogSetting').value=preferences.fog;
  document.querySelector('#torchSetting').value=preferences.torch;
  document.querySelector('#gridSetting').value=preferences.gridOpacity;
  document.querySelector('#fovSetting').value=preferences.fov;
  document.querySelector('#sensitivitySetting').value=preferences.sensitivity;
  document.querySelector('#showGridSetting').checked=preferences.showGrid;
  document.querySelector('#invertSetting').checked=preferences.invertLook;
  document.querySelector('#autosaveSetting').checked=preferences.autosave;
  scene.fog.near=15+(100-preferences.fog)*.18;scene.fog.far=44+(100-preferences.fog)*.82;
  grid.material.opacity=preferences.gridOpacity/100;
  grid.visible=state.mode==='build'&&preferences.showGrid&&!document.body.classList.contains('menu-open');
  exploreCamera.fov=preferences.fov;exploreCamera.updateProjectionMatrix();
  scene.traverse(o=>{if(o.isLight&&o.userData.baseIntensity)o.intensity=o.userData.baseIntensity*(preferences.torch/100);});
}
function readPreferences() {
  try { Object.assign(preferences,JSON.parse(localStorage.getItem('stonekeep-settings')||'{}')); } catch {}
  applyPreferences();
}
function savePreferences() {
  preferences.quality=document.querySelector('#qualitySetting').value;
  preferences.volume=Number(document.querySelector('#volumeSetting').value);
  preferences.brightness=Number(document.querySelector('#brightnessSetting').value);
  preferences.fog=Number(document.querySelector('#fogSetting').value);
  preferences.torch=Number(document.querySelector('#torchSetting').value);
  preferences.gridOpacity=Number(document.querySelector('#gridSetting').value);
  preferences.fov=Number(document.querySelector('#fovSetting').value);
  preferences.speed=Number(document.querySelector('#speedSetting').value);
  preferences.sensitivity=Number(document.querySelector('#sensitivitySetting').value);
  preferences.showGrid=document.querySelector('#showGridSetting').checked;
  preferences.invertLook=document.querySelector('#invertSetting').checked;
  preferences.autosave=document.querySelector('#autosaveSetting').checked;
  preferences.reduceMotion=document.querySelector('#motionSetting').checked;
  localStorage.setItem('stonekeep-settings',JSON.stringify(preferences));applyPreferences();
  document.querySelector('#settings').classList.add('hidden');toast('Settings applied');
}

function pointerCell(e) {
  const rect=renderer.domElement.getBoundingClientRect(); mouse.x=((e.clientX-rect.left)/rect.width)*2-1; mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse,buildCamera); const p=new THREE.Vector3(); if(!raycaster.ray.intersectPlane(plane,p))return null;
  return {x:Math.floor(p.x/CELL),z:Math.floor(p.z/CELL)};
}
function pickRoom(e){
  const rect=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-rect.left)/rect.width)*2-1;mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse,buildCamera);const hits=raycaster.intersectObjects(world.children,true);if(!hits.length)return null;
  let o=hits[0].object;while(o.parent&&o.userData.roomId==null)o=o.parent;return o.userData.roomId??null;
}
function pickDecoration(e){
  const rect=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-rect.left)/rect.width)*2-1;mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse,buildCamera);const hits=raycaster.intersectObjects(world.children,true);
  for(const hit of hits){let o=hit.object;while(o&&o!==world){if(o.userData.decorId!=null)return o.userData.decorId;o=o.parent;}}return null;
}
renderer.domElement.addEventListener('pointerdown',e=>{
  if(state.mode!=='build') { if(document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock(); return; }
  lastPointer={x:e.clientX,y:e.clientY};
  if(e.button===2){rightDrag=true;return}
  if(e.button===0){
    renderer.domElement.setPointerCapture?.(e.pointerId);
    if(state.choosingExploreStart){
      const c=pointerCell(e),roomId=c?occupiedMap().get(cellKey(c.x,c.z)):null;
      if(roomId!=null){state.exploreStart=c;state.choosingExploreStart=false;document.querySelector('#exploreMode').textContent='EXPLORE';setMode('explore');}
      else toast('Choose a built floor, road, or room');
      return;
    }
    if(state.tool!=='room'){
      const c=pointerCell(e),roomId=c?occupiedMap().get(cellKey(c.x,c.z)):null;
      if(roomId!=null){
        if(state.gold<10){toast('Need 10 gold for this furnishing');return;}state.gold-=10;
        const id=state.nextDecorId++;state.decorations.push({id,type:state.tool,x:c.x,z:c.z,roomId,rotation:(id%4)*Math.PI/2,scale:1,variant:0});
        buildWorld();if(preferences.autosave)save(true);toast(`${state.tool[0].toUpperCase()+state.tool.slice(1)} placed`);
      } else toast('Decorations must be placed inside a room');
      return;
    }
    const decorId=pickDecoration(e);
    if(decorId!=null){state.selectedDecor=decorId;state.selected=null;state.dragStart=state.dragEnd=null;previewGroup.clear();updateSelection();return;}
    // Existing dungeon geometry takes priority over the construction grid.
    // This keeps a normal click from accidentally starting an invalid room
    // preview on top of the room the player meant to select.
    const roomId=pickRoom(e);
    if(roomId!=null){
      state.selected=roomId;state.selectedDecor=null;state.dragStart=state.dragEnd=null;previewGroup.clear();updateSelection();return;
    }
    const c=pointerCell(e);if(c){state.dragStart=c;state.dragEnd=c;updatePreview();}
  }
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(state.mode==='explore'&&document.pointerLockElement===renderer.domElement){const sensitivity=preferences.sensitivity/100;exploreYaw-=e.movementX*.0022*sensitivity;explorePitch=Math.max(-1.35,Math.min(1.35,explorePitch+(preferences.invertLook?1:-1)*e.movementY*.0022*sensitivity));return}
  if(rightDrag){const sensitivity=preferences.sensitivity/100;cam.yaw-=(e.clientX-lastPointer.x)*.008*sensitivity;cam.pitch=Math.max(.28,Math.min(1.35,cam.pitch+(e.clientY-lastPointer.y)*.006*sensitivity));lastPointer={x:e.clientX,y:e.clientY};updateBuildCamera();return}
  if(state.dragStart){const c=pointerCell(e);if(c){state.dragEnd=c;updatePreview();}}
});
renderer.domElement.addEventListener('pointerup',e=>{
  if(renderer.domElement.hasPointerCapture?.(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);
  if(e.button===2){rightDrag=false;return}
  if(e.button===0&&state.mode==='build'&&state.dragStart){
    const r=normalizeRect(state.dragStart,state.dragEnd);
    if(state.previewValid){const type=ROOM_TYPES[state.buildRole],cost=r.w*r.d*type.cost;if(state.gold<cost){toast(`Need ${cost} gold to build this ${type.name.toLowerCase()}`);}else{state.gold-=cost;r.id=state.nextId++;r.condition='occupied';r.role=state.buildRole;r.layer=state.layer;r.doorsOpen=true;state.rooms.push(r);state.selected=r.id;state.selectedDecor=null;buildWorld();if(r.role==='hall'&&r.layer==='surface')spawnWorkers();constructionBurst(r);if(preferences.autosave)save(true);toast(`${type.name} raised · ${cost} gold`);}}
    else {state.selected=pickRoom(e);updateSelection();if(!state.selected){const type=ROOM_TYPES[state.buildRole],cost=r.w*r.d*type.cost;toast(isValidRect(r)&&state.gold<cost?`Need ${cost} gold for this ${type.name.toLowerCase()}`:'Blocked — choose empty ground');}}
    state.dragStart=state.dragEnd=null;previewGroup.clear();
  }
});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('wheel',e=>{if(state.mode==='build'){cam.distance=Math.max(10,Math.min(60,cam.distance+e.deltaY*.025));updateBuildCamera();}},{passive:true});

function editDecor(mutator,message){const d=state.decorations.find(x=>x.id===state.selectedDecor);if(!d)return;mutator(d);buildWorld();if(preferences.autosave)save(true);toast(message);}
function deleteSelected(){if(state.selectedDecor!=null){state.decorations=state.decorations.filter(d=>d.id!==state.selectedDecor);state.selectedDecor=null;buildWorld();if(preferences.autosave)save(true);toast('Decoration removed');return;}if(!state.selected)return;const room=state.rooms.find(r=>r.id===state.selected);if(room?.role==='heart'){toast('The dungeon heart cannot be demolished');return;}state.gold+=Math.floor((room?.w||0)*(room?.d||0)*2.5);state.rooms=state.rooms.filter(r=>r.id!==state.selected);state.decorations=state.decorations.filter(d=>d.roomId!==state.selected);state.selected=null;buildWorld();if(preferences.autosave)save(true);toast('Room demolished · partial refund');}
function rotateSelected(){if(state.selectedDecor!=null){editDecor(d=>d.rotation=(d.rotation||0)+Math.PI/2,'Decoration rotated');return;}const r=state.rooms.find(x=>x.id===state.selected);if(!r)return;const nr={...r,w:r.d,d:r.w};nr.x=Math.round(r.x+(r.w-nr.w)/2);nr.z=Math.round(r.z+(r.d-nr.d)/2);if(isValidRect(nr,r.id)){Object.assign(r,nr);buildWorld();if(preferences.autosave)save(true);toast('Room rotated');}else toast('Rotation blocked');}
function save(silent=false){localStorage.setItem('stonekeep-save',JSON.stringify({version:5,theme:theme.id,rooms:state.rooms,decorations:state.decorations,nextId:state.nextId,nextDecorId:state.nextDecorId,gold:state.gold,food:state.food,activeLayer:state.layer,progressionTier:state.progressionTier}));if(!silent)toast('Stronghold saved locally');}
function load(){const raw=localStorage.getItem('stonekeep-save');if(!raw){toast('No saved stronghold found');return}try{const data=JSON.parse(raw);state.rooms=data.rooms||[];state.decorations=data.decorations||[];state.nextId=data.nextId||1;state.nextDecorId=data.nextDecorId||1;state.gold=data.gold??500;state.food=data.food??100;state.layer=data.activeLayer||(state.rooms.some(r=>r.layer==='surface')?'surface':'underground');state.selected=null;state.selectedDecor=null;state.showcase=false;setLayer(state.layer);spawnWorkers();toast('Stronghold restored');}catch{toast('Save data could not be read');}}

function setMode(mode){
  state.mode=mode;camera=mode==='build'?buildCamera:exploreCamera;grid.visible=mode==='build'&&preferences.showGrid;selectionGroup.visible=mode==='build';previewGroup.clear();
  document.querySelector('#buildMode').classList.toggle('active',mode==='build');document.querySelector('#exploreMode').classList.toggle('active',mode==='explore');
  document.querySelector('.palette').style.display=mode==='build'?'block':'none';document.querySelector('.inspector').style.display=mode==='build'?'block':'none';document.querySelector('#crosshair').style.display=mode==='explore'?'block':'none';
  document.querySelector('#hint').textContent=mode==='build'?'LMB DRAG Place room · RMB DRAG Rotate view · WASD/ARROWS Pan · WHEEL Zoom':'CLICK Capture mouse · WASD Move · MOUSE Look · ESC Release · B Return to build';
  if(mode==='explore'&&state.rooms.length){const active=state.rooms.filter(r=>(r.layer||'underground')===state.layer),r=active.find(x=>x.id===state.selected)||active[0],start=state.exploreStart||roomCenterCell(r);exploreCamera.position.set((start.x+.5)*CELL,1.65,(start.z+.5)*CELL);exploreYaw=r.d>=r.w?Math.PI:Math.PI/2;explorePitch=-.04;state.exploreStart=null;}
  if(mode==='build'&&document.pointerLockElement)document.exitPointerLock();
  world.traverse(o=>{if(o.userData.ceiling)o.visible=mode==='explore';});
  world.traverse(o=>{if(o.userData.surfaceRoof)o.visible=mode==='explore'||o.userData.roomId!==state.selected;});
  toast(mode==='build'?'Build mode':'Explore mode — click to look');
}
function chooseExploreStart(){
  if(!state.rooms.some(r=>(r.layer||'underground')===state.layer)){toast('Build something before exploring');return;}
  setMode('build');state.choosingExploreStart=true;document.querySelector('#exploreMode').textContent='PICK A START';document.querySelector('#hint').textContent='CLICK a built floor, road, or room to begin exploring there';toast('Choose your exploration starting point');
}
function setLayer(layer){
  if(layer==='underground'&&getProgression().tier<4){toast('Grow to a village before excavating underground');return;}
  if(layer==='underground'&&!state.rooms.some(r=>(r.layer||'underground')==='underground')){state.rooms.push({id:state.nextId++,x:-2,z:-2,w:4,d:4,condition:'pristine',role:'heart',layer:'underground',doorsOpen:true,preset:'heart'});toast('The first underground chamber has been excavated');}
  state.layer=layer;state.selected=state.rooms.find(r=>(r.layer||'underground')===layer)?.id||null;state.selectedDecor=null;state.keeperPath=[];
  document.querySelector('#surfaceLayer').classList.toggle('active',layer==='surface');document.querySelector('#undergroundLayer').classList.toggle('active',layer==='underground');
  document.querySelector('#surfaceBlueprints').classList.toggle('hidden',layer!=='surface');document.querySelector('#undergroundBlueprints').classList.toggle('hidden',layer!=='underground');
  const surfaceStyle=layer==='surface';document.querySelector('#styleName').textContent=surfaceStyle?'Frontier Timber':'Stone Keep Masonry';document.querySelector('#styleNote').textContent=surfaceStyle?(getProgression().tier>=4?'Fortified settlement architecture':'Camp architecture · grows with settlement'):'Underground dungeon architecture';document.querySelector('#ledgerStyle').textContent=surfaceStyle?'Frontier Timber':'Keep Masonry';document.querySelector('#styleSwatch').classList.toggle('masonry',!surfaceStyle);
  ground.material.color.set(layer==='surface'?0x334330:0x252c29);scene.background.set(layer==='surface'?0x78908a:theme.atmosphere.background);scene.fog.color.set(layer==='surface'?0x71827b:theme.atmosphere.fogColor);
  workers.forEach(w=>w.visible=layer==='surface'&&state.rooms.some(r=>r.layer==='surface'));
  terrainGroup.visible=layer==='surface';
  selectRoomType(layer==='surface'?'cottage':'unassigned');buildWorld();toast(layer==='surface'?'Surface stronghold':'Underground works');
}

function addDecorToRoom(room,type,rx,rz,rotation=0,scale=1,variant=0){
  state.decorations.push({id:state.nextDecorId++,type,x:room.x+Math.max(0,Math.min(room.w-1,rx)),z:room.z+Math.max(0,Math.min(room.d-1,rz)),roomId:room.id,rotation,scale,variant});
}
function findPath(start,goal){
  const occ=occupiedMap(),queue=[start],came=new Map([[cellKey(start.x,start.z),null]]);
  while(queue.length){const c=queue.shift();if(c.x===goal.x&&c.z===goal.z)break;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const n={x:c.x+dx,z:c.z+dz},nk=cellKey(n.x,n.z),fromId=occ.get(cellKey(c.x,c.z)),toId=occ.get(nk);if(!toId||came.has(nk))continue;if(fromId!==toId){const a=state.rooms.find(r=>r.id===fromId),b=state.rooms.find(r=>r.id===toId);if(a?.doorsOpen===false||b?.doorsOpen===false)continue;}came.set(nk,c);queue.push(n);}}
  const goalKey=cellKey(goal.x,goal.z);if(!came.has(goalKey))return[];const path=[];for(let c=goal;c;c=came.get(cellKey(c.x,c.z)))path.push(c);return path.reverse();
}
function roomCenterCell(room){return{x:room.x+Math.floor(room.w/2),z:room.z+Math.floor(room.d/2)};}
function spawnWorkers(){
  const heart=state.rooms.find(r=>r.role==='heart')||state.rooms[0];if(!heart)return;const c=roomCenterCell(heart);
  workers.forEach((w,i)=>{w.position.set((c.x+.5)*CELL+i*.34,.08,(c.z+.5)*CELL);w.visible=true;w.userData.path=[];w.userData.task='Awaiting orders';});
  updateSimHUD();
}
function assignWorkerTask(worker){
  const u=worker.userData,operational=state.rooms.filter(roomOperational);let target=null,task='Patrolling';
  if(u.hunger<65){target=operational.find(r=>r.role==='kitchen');task='Fetching a meal';}
  if(!target&&u.rest<55){target=operational.find(r=>r.role==='barracks');task='Going to rest';}
  if(!target){const workRooms=operational.filter(r=>['treasury','kitchen','workshop','guard','hall','forge','farm','storehouse','lumberyard','watchtower'].includes(r.role)&&(r.layer||'underground')===state.layer);target=workRooms[(Math.floor(state.simTime/5)+u.index)%Math.max(1,workRooms.length)];task=target?`Working in ${target.role}`:'Waiting for an operational room';}
  if(!target)return;const start={x:Math.floor(worker.position.x/CELL),z:Math.floor(worker.position.z/CELL)},goal=roomCenterCell(target),path=findPath(start,goal);if(path.length){u.path=path.slice(1);u.targetRoom=target.id;u.task=task;}
}
function updateWorker(worker,dt){
  const u=worker.userData;u.hunger=Math.max(0,u.hunger-dt*.42);u.rest=Math.max(0,u.rest-dt*.18);u.morale=Math.max(15,Math.min(100,u.morale+dt*(u.hunger>35?.05:-.18)));
  if(!u.path.length){u.leftArm.rotation.x*=.82;u.rightArm.rotation.x*=.82;u.leftLeg.rotation.x*=.82;u.rightLeg.rotation.x*=.82;const room=state.rooms.find(r=>r.id===u.targetRoom);if(room?.role==='kitchen'&&state.food>=1&&u.hunger<85){state.food-=1;u.hunger=Math.min(100,u.hunger+28);}if(room?.role==='barracks')u.rest=Math.min(100,u.rest+dt*8);if(Math.floor(state.simTime+u.index)%4===0)assignWorkerTask(worker);return;}
  const cell=u.path[0],target=new THREE.Vector3((cell.x+.5)*CELL,.08,(cell.z+.5)*CELL),delta=target.clone().sub(worker.position);if(delta.length()<.07)u.path.shift();else{worker.rotation.y=Math.atan2(delta.x,delta.z);worker.position.addScaledVector(delta.normalize(),Math.min(1.75*dt,delta.length()));worker.position.y=.08+Math.abs(Math.sin(state.simTime*7+u.index))*.035;}
  const swing=Math.sin(state.simTime*8+u.walkPhase)*.55;u.leftArm.rotation.x=swing;u.rightArm.rotation.x=-swing;u.leftLeg.rotation.x=-swing*.65;u.rightLeg.rotation.x=swing*.65;
}
function simulateStep(){
  const operational=state.rooms.filter(roomOperational),treasuries=operational.filter(r=>r.role==='treasury').length,kitchens=operational.filter(r=>r.role==='kitchen').length,farms=operational.filter(r=>r.role==='farm').length,stores=operational.filter(r=>r.role==='storehouse').length,forges=operational.filter(r=>r.role==='forge').length;
  const capacity=500+treasuries*500+stores*250;state.gold=Math.min(capacity,state.gold+treasuries*1.5+forges*.35);state.food=Math.min(300+kitchens*200+farms*150,state.food+kitchens*.65+farms*.85);
  updateSimHUD();
}
function sendKeeper(){
  const room=state.rooms.find(r=>r.id===state.selected);if(!room)return;let start;
  if(!keeper.visible){const first=state.rooms[0];start={x:first.x+Math.floor(first.w/2),z:first.z+Math.floor(first.d/2)};keeper.position.set((start.x+.5)*CELL,.08,(start.z+.5)*CELL);keeper.visible=true;}
  else start={x:Math.floor(keeper.position.x/CELL),z:Math.floor(keeper.position.z/CELL)};
  const goal={x:room.x+Math.floor(room.w/2),z:room.z+Math.floor(room.d/2)},path=findPath(start,goal);if(!path.length){toast('No open route — check the doors');return;}state.keeperPath=path.slice(1);state.keeperPathIndex=0;toast(`Keeper route · ${path.length-1} steps`);
}
function dressRoom(){
  const room=state.rooms.find(r=>r.id===state.selected);if(!room)return;
  if(state.gold<40){toast('Need 40 gold to furnish this room');return;}state.gold-=40;
  state.decorations=state.decorations.filter(d=>d.roomId!==room.id);
  const role=room.role||'unassigned';
  const recipes={
    treasury:[['chest',1,1,0,1,1],['chest',-1,1,0,1,2],['goldpile',0,0,0,1.2,0],['brazier',-1,-1,0,.85,0]],
    barracks:[['cot',0,0,0,.9,0],['cot',-1,0,0,.9,1],['weaponrack',1,-1,Math.PI/2,.9,0],['chest',-1,-1,0,.8,0]],
    guard:[['table',0,0,0,1,0],['weaponrack',1,0,Math.PI/2,.9,1],['cage',-1,-1,0,.8,0],['brazier',-1,1,0,.8,0]],
    library:[['bookshelf',-1,-1,0,.9,0],['bookshelf',1,-1,0,.9,1],['table',0,0,0,1,0],['banner',-1,1,0,.85,0]],
    kitchen:[['table',0,0,0,1,0],['barrel',-1,-1,0,.9,0],['barrel',1,-1,0,.9,1],['cauldron',0,1,0,1,0]],
    workshop:[['table',0,0,0,1.1,2],['crate',-1,-1,0,.9,0],['barrel',1,-1,0,.85,0],['rubble',1,1,0,.8,0]],
    crypt:[['statue',0,1,Math.PI,1.15,0],['cage',-1,-1,0,.85,0],['brazier',1,-1,0,.8,0],['rubble',-1,1,0,.8,0]],
    prison:[['cage',-1,0,0,.9,0],['cage',1,0,0,.9,1],['bench',0,-1,0,.85,0],['brazier',0,1,0,.75,0]],
    infirmary:[['cot',-1,0,0,.9,0],['cot',1,0,0,.9,1],['table',0,-1,0,.8,0],['brazier',0,1,0,.7,0]],
    tavern:[['table',0,0,0,1.1,1],['bench',-1,0,0,.9,1],['bench',1,0,Math.PI,.9,0],['barrel',1,-1,0,.85,0]],
    training:[['weaponrack',-1,-1,0,1,0],['weaponrack',1,-1,0,1,1],['bench',0,1,0,.85,0],['rubble',1,1,0,.65,0]],
    alchemy:[['cauldron',0,0,0,1,0],['table',-1,-1,0,.9,2],['bookshelf',1,-1,0,.85,1],['brazier',1,1,0,.7,0]],
    shrine:[['statue',0,1,Math.PI,1.25,2],['brazier',-1,0,0,.9,0],['brazier',1,0,0,.9,0],['banner',0,-1,0,1,2]],
    throne:[['statue',-1,1,0,1.1,0],['statue',1,1,0,1.1,1],['banner',-1,-1,0,1,0],['banner',1,-1,0,1,1]]
  };
  const recipe=recipes[role]||[['table',0,0,Math.PI/2,1.05,1],['bench',-1,0,0,.9,1],['bookshelf',1,-1,0,.85,0],['chest',1,1,Math.PI/4,.8,1]];
  for(const [type,ox,oz,rot,scale,variant] of recipe)addDecorToRoom(room,type,Math.floor(room.w/2)+ox,Math.floor(room.d/2)+oz,rot,scale,variant);
  buildWorld();constructionBurst(room);if(preferences.autosave)save(true);toast('Room dressed');
}
function buildHeroRoom(){
  let spot=null;for(let z=-12;z<=12&&!spot;z++)for(let x=-12;x<=12;x++){const test={x,z,w:6,d:8};if(isValidRect(test)){spot=test;break;}}
  if(!spot){toast('No space for a 6 × 8 throne hall');return;}
  const room={...spot,id:state.nextId++,condition:'pristine',role:'throne',doorsOpen:true,preset:'throne'};state.rooms.push(room);state.selected=room.id;state.selectedDecor=null;
  for(const [type,rx,rz,rot,scale,variant] of [
    ['statue',0,1,0,1.25,0],['statue',5,1,0,1.25,1],['statue',0,6,Math.PI,1.25,2],['statue',5,6,Math.PI,1.25,0],
    ['brazier',1,1,0,1.05,0],['brazier',4,1,0,1.05,0],['brazier',1,6,0,1.05,0],['brazier',4,6,0,1.05,0],
    ['table',2,5,0,1.18,1],['banner',1,0,0,1.1,0],['banner',4,0,0,1.1,1],['chest',2,1,0,1,2]
  ])addDecorToRoom(room,type,rx,rz,rot,scale,variant);
  buildWorld();constructionBurst(room);cam.target.set((room.x+room.w/2)*CELL,0,(room.z+room.d/2)*CELL);cam.distance=25;updateBuildCamera();if(preferences.autosave)save(true);toast('Throne hall raised');
}

const tutorialSteps = [
  { target:'.inspector', kicker:'WELCOME · FOUNDING CAMP', title:'Begin with one achievable goal.', body:'You are founding a settlement, not managing a finished dungeon. The Growth panel always shows what to build next and what completing it will unlock.' },
  { target:'#surfaceBlueprints', kicker:'STEP ONE · FOUND THE CAMP', title:'Build the Great Hall first.', body:'You begin with open land. Choose Great Hall and drag at least a 3 by 3 footprint. This becomes the settlement center; then add a cottage, farm, and connected packed-earth roads.' },
  { target:null, kicker:'STEP TWO · PLACE A BUILDING', title:'Drag on the surface grid.', body:'Hold the left mouse button and drag over a few tiles. Green means the footprint can be built and afforded; red means it overlaps something or costs too much.' },
  { target:'.resource-bar', kicker:'STEP THREE · PROVIDE', title:'Watch gold, food, and workers.', body:'Every building costs gold. Farms replenish food, while later workshops and storehouses strengthen the settlement economy. Start compactly so resources last.' },
  { target:'.inspector', kicker:'STEP FOUR · GROW', title:'Complete milestones to unlock more.', body:'A cottage and farm advance the camp into a hamlet. Each new stage reveals only the buildings and management tools that now matter.' },
  { target:'.layer-switch', kicker:'STEP FIVE · DELVE LATER', title:'The underground is earned.', body:'Underground construction stays locked while your settlement is fragile. Establish production and grow into a village; then the first dungeon chamber can be excavated.' },
  { target:'.mode-switch', kicker:'STEP SIX · WALK THE SETTLEMENT', title:'Choose exactly where exploration begins.', body:'Choose Explore, then click any built floor, road, or room as your starting point. Click again to capture the mouse, move with WASD, and press B to return to Build mode.' },
  { target:'.actions', kicker:'STEP SEVEN · KEEP YOUR PROGRESS', title:'Save the whole stronghold.', body:'Save preserves the surface, underground, resources, furnishings, and growth stage in this browser. Continue returns to that same settlement.' },
  { target:'.inspector', kicker:'YOUR FIRST TASK', title:'Raise the Great Hall.', body:'Build it at least 3 by 3 tiles. Select a finished building to remove its roof and furnish the interior; deselect it to restore the complete exterior.' }
];
let tutorialIndex=0;
function showTutorialStep(index) {
  tutorialIndex=Math.max(0,Math.min(tutorialSteps.length-1,index));
  document.querySelectorAll('.tutorial-focus').forEach(e=>e.classList.remove('tutorial-focus'));
  const step=tutorialSteps[tutorialIndex],target=step.target?document.querySelector(step.target):null;if(target)target.classList.add('tutorial-focus');
  document.querySelector('#tutorialStepLabel').textContent=`STEP ${tutorialIndex+1} OF ${tutorialSteps.length}`;
  document.querySelector('#tutorialProgress').style.width=`${((tutorialIndex+1)/tutorialSteps.length)*100}%`;
  document.querySelector('#tutorialKicker').textContent=step.kicker;document.querySelector('#tutorialTitle').textContent=step.title;document.querySelector('#tutorialBody').textContent=step.body;
  document.querySelector('#tutorialBack').disabled=tutorialIndex===0;
  document.querySelector('#tutorialNext').textContent=tutorialIndex===tutorialSteps.length-1?'START BUILDING':'NEXT';
}
function startTutorial() {
  if(state.showcase)startNewDungeon();
  document.body.classList.remove('menu-open');
  document.querySelector('#mainMenu').classList.add('hidden');document.querySelector('#help').classList.add('hidden');document.querySelector('#settings').classList.add('hidden');document.querySelector('#tutorial').classList.remove('hidden');setMode('build');showTutorialStep(0);
}
function endTutorial() {
  document.querySelector('#tutorial').classList.add('hidden');document.querySelectorAll('.tutorial-focus').forEach(e=>e.classList.remove('tutorial-focus'));localStorage.setItem('stonekeep-tutorial-complete','true');toast('Tutorial complete — begin building');
}
function startNewDungeon() {
  state.rooms=[];state.decorations=[];state.selected=null;state.selectedDecor=null;state.nextId=1;state.nextDecorId=1;state.gold=260;state.food=60;state.progressionTier=1;state.timeScale=1;state.simTime=0;state.showcase=false;state.layer='surface';setLayer('surface');document.body.classList.remove('menu-open');document.querySelector('#settings').classList.add('hidden');document.querySelector('#mainMenu').classList.add('hidden');setMode('build');selectRoomType('hall');cam.target.set(0,0,0);cam.distance=23;updateBuildCamera();toast('Open land awaits · build a Great Hall');
}
function selectTool(tool){
  state.tool=tool;document.querySelectorAll('.room-type').forEach(b=>b.classList.toggle('active',tool==='room'&&b.dataset.roomRole===state.buildRole));document.querySelectorAll('.decor-tool').forEach(b=>b.classList.toggle('active',b.dataset.decor===tool));
  document.querySelector('#hint').textContent=tool==='room'?`LMB DRAG Build ${ROOM_TYPES[state.buildRole].name} · CLICK Select · RMB DRAG Rotate view`:`CLICK inside a room to place ${tool} · Choose a room type to resume building`;
}
function selectRoomType(role){
  state.buildRole=role;selectTool('room');const type=ROOM_TYPES[role],panel=document.querySelector('#buildPurpose');panel.querySelector('b').textContent=type.name.toUpperCase();panel.querySelector('span').textContent=`${type.cost} gold per tile · ${type.needs}`;panel.querySelector('p').textContent=type.purpose;
}
document.querySelector('#buildMode').onclick=()=>{state.choosingExploreStart=false;document.querySelector('#exploreMode').textContent='EXPLORE';setMode('build');};document.querySelector('#exploreMode').onclick=chooseExploreStart;
document.querySelector('#surfaceLayer').onclick=()=>setLayer('surface');document.querySelector('#undergroundLayer').onclick=()=>setLayer('underground');
document.querySelector('#deleteBtn').onclick=deleteSelected;document.querySelector('#rotateBtn').onclick=rotateSelected;document.querySelector('#saveBtn').onclick=save;document.querySelector('#loadBtn').onclick=load;
document.querySelector('#rotateFineBtn').onclick=()=>editDecor(d=>d.rotation=(d.rotation||0)+Math.PI/12,'Turned 15°');
document.querySelector('#scaleDownBtn').onclick=()=>editDecor(d=>d.scale=Math.max(.65,(d.scale||1)-.1),'Decoration resized');
document.querySelector('#scaleUpBtn').onclick=()=>editDecor(d=>d.scale=Math.min(1.4,(d.scale||1)+.1),'Decoration resized');
document.querySelector('#variantBtn').onclick=()=>editDecor(d=>d.variant=((d.variant||0)+1)%3,'Decoration varied');
document.querySelector('#duplicateBtn').onclick=()=>{const d=state.decorations.find(x=>x.id===state.selectedDecor);if(!d)return;const copy={...d,id:state.nextDecorId++,rotation:(d.rotation||0)+Math.PI/12};state.decorations.push(copy);state.selectedDecor=copy.id;buildWorld();if(preferences.autosave)save(true);toast('Decoration duplicated');};
document.querySelector('#conditionSelect').onchange=e=>{const r=state.rooms.find(x=>x.id===state.selected);if(!r)return;r.condition=e.target.value;buildWorld();if(preferences.autosave)save(true);toast(`${e.target.options[e.target.selectedIndex].text} room applied`);};
document.querySelector('#roleSelect').onchange=e=>{const r=state.rooms.find(x=>x.id===state.selected);if(!r)return;r.role=e.target.value;if(r.role==='throne')r.preset='throne';else if(r.preset==='throne')delete r.preset;buildWorld();if(preferences.autosave)save(true);toast(`${e.target.options[e.target.selectedIndex].text} assigned`);};
document.querySelector('#doorBtn').onclick=()=>{const r=state.rooms.find(x=>x.id===state.selected);if(!r)return;r.doorsOpen=r.doorsOpen===false;state.keeperPath=[];buildWorld();if(preferences.autosave)save(true);toast(r.doorsOpen?'Doors opened':'Doors secured');};
document.querySelector('#pathTestBtn').onclick=sendKeeper;
document.querySelector('#dressRoomBtn').onclick=dressRoom;document.querySelector('#heroRoomBtn').onclick=buildHeroRoom;
function setTimeScale(scale){state.timeScale=scale;document.querySelector('#pauseTime').classList.toggle('active',scale===0);document.querySelector('#normalTime').classList.toggle('active',scale===1);document.querySelector('#fastTime').classList.toggle('active',scale===3);toast(scale===0?'Keep paused':scale===3?'Time accelerated':'Time resumed');}
document.querySelector('#pauseTime').onclick=()=>setTimeScale(0);document.querySelector('#normalTime').onclick=()=>setTimeScale(1);document.querySelector('#fastTime').onclick=()=>setTimeScale(3);
const help=document.querySelector('#help'),settings=document.querySelector('#settings');
document.querySelector('#helpBtn').onclick=()=>help.classList.remove('hidden');document.querySelector('#closeHelp').onclick=()=>help.classList.add('hidden');document.querySelector('#startTutorialFromHelp').onclick=startTutorial;
document.querySelector('#newGameBtn').onclick=startNewDungeon;document.querySelector('#tutorialBtn').onclick=startTutorial;
document.querySelectorAll('.room-type').forEach(b=>b.onclick=()=>{if(!b.disabled)selectRoomType(b.dataset.roomRole);});document.querySelectorAll('.decor-tool').forEach(b=>b.onclick=()=>selectTool(b.dataset.decor));
const continueBtn=document.querySelector('#continueBtn');continueBtn.disabled=!localStorage.getItem('stonekeep-save');continueBtn.onclick=()=>{load();document.body.classList.remove('menu-open');document.querySelector('#mainMenu').classList.add('hidden');setMode('build');};
function openSettings(){settings.classList.remove('hidden');applyPreferences();}
document.querySelector('#settingsBtn').onclick=openSettings;document.querySelector('#menuSettingsBtn').onclick=openSettings;document.querySelector('#closeSettings').onclick=()=>settings.classList.add('hidden');document.querySelector('#applySettings').onclick=savePreferences;
document.querySelector('#resetSettings').onclick=()=>{Object.assign(preferences,{quality:'high',volume:70,brightness:125,fog:55,torch:110,gridOpacity:60,fov:68,speed:100,sensitivity:100,showGrid:true,invertLook:false,autosave:true,reduceMotion:false});applyPreferences();};
document.querySelector('#tutorialExit').onclick=endTutorial;document.querySelector('#tutorialBack').onclick=()=>showTutorialStep(tutorialIndex-1);document.querySelector('#tutorialNext').onclick=()=>tutorialIndex===tutorialSteps.length-1?endTutorial():showTutorialStep(tutorialIndex+1);
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Delete')deleteSelected();if(e.code==='KeyR'&&state.mode==='build')rotateSelected();if(e.code==='KeyO'&&state.mode==='build')document.querySelector('#doorBtn').click();if(e.code==='KeyP'&&state.mode==='build')sendKeeper();if(e.code==='KeyB')setMode('build');if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();save();}});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);for(const c of [buildCamera,exploreCamera]){c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix();}});

const clock=new THREE.Clock();
function tick(){
  const dt=Math.min(clock.getDelta(),.04),elapsed=clock.elapsedTime,speed=(state.mode==='build'?12:4)*(preferences.speed/100);
  const simDt=dt*state.timeScale;state.simTime+=simDt;state.simAccumulator+=simDt;if(state.simAccumulator>=1){state.simAccumulator-=1;simulateStep();}for(const worker of workers)if(worker.visible)updateWorker(worker,simDt);
  for(const flame of animatedFlames){const pulse=1+Math.sin(elapsed*9+(flame.userData.phase||0))*.08;flame.scale.y=(flame.material===mats.ghost?1:1.7)*pulse;flame.position.y+=Math.sin(elapsed*1.7+(flame.userData.phase||0))*.0007;}
  for(const motes of floatingMotes){motes.rotation.y=elapsed*.008;const a=motes.geometry.attributes.position;for(let i=1;i<a.array.length;i+=3){a.array[i]+=.06*dt;if(a.array[i]>8)a.array[i]=.2;}a.needsUpdate=true;}
  for(const p of [...effectsGroup.children]){p.userData.life-=dt;p.position.addScaledVector(p.userData.velocity,dt);p.userData.velocity.y-=3.2*dt;p.rotation.x+=dt*5;p.rotation.z+=dt*3;p.material.transparent=true;p.material.opacity=Math.max(0,p.userData.life);if(p.userData.life<=0)effectsGroup.remove(p);}
  if(keeper.visible&&state.keeperPath.length){const cell=state.keeperPath[0],target=new THREE.Vector3((cell.x+.5)*CELL,.08,(cell.z+.5)*CELL),delta=target.clone().sub(keeper.position);if(delta.length()<.08)state.keeperPath.shift();else{keeper.rotation.y=Math.atan2(delta.x,delta.z);keeper.position.addScaledVector(delta.normalize(),Math.min(2.4*dt,delta.length()));}}
  if(state.mode==='build'){
    const forward=new THREE.Vector3(-Math.sin(cam.yaw),0,-Math.cos(cam.yaw)),right=new THREE.Vector3(forward.z,0,-forward.x),move=new THREE.Vector3();
    if(keys.has('KeyW')||keys.has('ArrowUp'))move.add(forward);if(keys.has('KeyS')||keys.has('ArrowDown'))move.sub(forward);if(keys.has('KeyD')||keys.has('ArrowRight'))move.add(right);if(keys.has('KeyA')||keys.has('ArrowLeft'))move.sub(right);
    if(move.lengthSq()){cam.target.addScaledVector(move.normalize(),speed*dt);updateBuildCamera();}
  }else{
    exploreCamera.rotation.order='YXZ';exploreCamera.rotation.y=exploreYaw;exploreCamera.rotation.x=explorePitch;
    const f=new THREE.Vector3(-Math.sin(exploreYaw),0,-Math.cos(exploreYaw)),r=new THREE.Vector3(-f.z,0,f.x),m=new THREE.Vector3();
    if(keys.has('KeyW'))m.add(f);if(keys.has('KeyS'))m.sub(f);if(keys.has('KeyD'))m.add(r);if(keys.has('KeyA'))m.sub(r);
    if(m.lengthSq()){const next=exploreCamera.position.clone().addScaledVector(m.normalize(),speed*dt);const cx=Math.floor(next.x/CELL),cz=Math.floor(next.z/CELL);if(occupiedMap().has(cellKey(cx,cz)))exploreCamera.position.copy(next);}
    exploreCamera.position.y=1.65;
  }
  renderer.render(scene,camera);requestAnimationFrame(tick);
}
readPreferences();
state.rooms=[
  {id:1,x:-4,z:-3,w:5,d:4,role:'hall',layer:'surface',condition:'pristine'},
  {id:2,x:2,z:-2,w:3,d:3,role:'forge',layer:'surface',condition:'occupied'},
  {id:3,x:-4,z:2,w:3,d:2,role:'cottage',layer:'surface',condition:'occupied'},
  {id:4,x:1,z:2,w:5,d:3,role:'farm',layer:'surface',condition:'occupied'}
];state.nextId=5;cam.target.set(0,0,-1);cam.distance=27;cam.yaw=.82;cam.pitch=.66;updateBuildCamera();
buildWorld();grid.visible=false;tick();
