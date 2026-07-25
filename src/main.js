import * as THREE from 'three';
import './style.css';
import { THEMES, makeThemeMaterials } from './themes.js';

const CELL = 2, WALL_H = 2.8, WALL_T = .24;
const theme = THEMES.stoneKeep;
const mats = makeThemeMaterials(theme);
const state = { rooms: [], decorations: [], selected: null, tool: 'room', mode: 'build', dragStart: null, dragEnd: null, previewValid: false, nextId: 1, nextDecorId: 1, showcase: true };
const preferences = { quality: 'high', volume: 70, brightness: 125, speed: 100, reduceMotion: false };
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

const world = new THREE.Group(), previewGroup = new THREE.Group(), selectionGroup = new THREE.Group();
scene.add(world, previewGroup, selectionGroup);

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
  const map=new Map(); for(const room of state.rooms) if(room.id!==ignoreId) for(const c of roomCells(room)) map.set(cellKey(c.x,c.z),room.id); return map;
}
function normalizeRect(a,b){return {x:Math.min(a.x,b.x),z:Math.min(a.z,b.z),w:Math.abs(a.x-b.x)+1,d:Math.abs(a.z-b.z)+1};}
function isValidRect(r,ignoreId=null){ if(r.w>12||r.d>12) return false; const occ=occupiedMap(ignoreId); return roomCells(r).every(c=>!occ.has(cellKey(c.x,c.z))); }

function addBox(group, size, pos, material, cast=true) {
  const m=new THREE.Mesh(new THREE.BoxGeometry(...size), material); m.position.set(...pos); m.castShadow=cast; m.receiveShadow=true; group.add(m); return m;
}
function makeTorch(group,x,z,side) {
  const offsets={n:[0,0,-.17],s:[0,0,.17],w:[-.17,0,0],e:[.17,0,0]};
  const [ox,,oz]=offsets[side]; const holder=addBox(group,[.08,.45,.08],[x+ox,1.38,z+oz],mats.trim);
  holder.rotation[side==='n'||side==='s'?'x':'z']=side==='n'||side==='w'?.35:-.35;
  const flame=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),mats.flame); flame.scale.y=1.7; flame.position.set(x+ox*1.8,1.69,z+oz*1.8); group.add(flame);
  const light=new THREE.PointLight(0xff9a42,4.5,11,2); light.position.copy(flame.position); light.castShadow=false; group.add(light);
}
function addCylinder(group,r,depth,pos,material,segments=10){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,depth,segments),material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
}
function addRoomProps(group,room) {
  const cx=(room.x+room.w/2)*CELL,cz=(room.z+room.d/2)*CELL,min=Math.min(room.w,room.d);
  const roomFill=new THREE.PointLight(0xe59a58,2.05,Math.max(room.w,room.d)*CELL*1.5,2);roomFill.position.set(cx,2.25,cz);group.add(roomFill);
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
}
function addPlacedDecoration(group,decor) {
  const x=(decor.x+.5)*CELL,z=(decor.z+.5)*CELL,rot=decor.rotation||0;
  group.position.set(x,0,z);group.rotation.y=rot;
  if(decor.type==='table'){
    addBox(group,[1.45,.13,.7],[0,.78,0],mats.wood);for(const dx of [-.55,.55])for(const dz of [-.22,.22])addBox(group,[.1,.7,.1],[dx,.39,dz],mats.wood);
  } else if(decor.type==='chest'){
    addBox(group,[.9,.43,.55],[0,.3,0],mats.wood);addBox(group,[.96,.07,.59],[0,.55,0],mats.brass);addBox(group,[.07,.38,.6],[0,.31,0],mats.brass);
  } else if(decor.type==='barrel'){
    addCylinder(group,.31,.7,[0,.36,0],mats.wood,12);addCylinder(group,.325,.045,[0,.25,0],mats.brass,12);addCylinder(group,.325,.045,[0,.52,0],mats.brass,12);
  } else if(decor.type==='brazier'){
    addCylinder(group,.26,.5,[0,.28,0],mats.trim,10);const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.38,.22,.18,10),mats.brass);bowl.position.y=.62;group.add(bowl);
    const flame=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),mats.flame);flame.scale.y=1.65;flame.position.y=.83;group.add(flame);const light=new THREE.PointLight(0xff8a32,5.2,9,2);light.position.y=1.1;group.add(light);
  } else if(decor.type==='banner'){
    addCylinder(group,.06,2.2,[0,1.1,0],mats.brass,8);addBox(group,[1.05,.06,.06],[.42,2.05,0],mats.brass);const cloth=new THREE.Mesh(new THREE.PlaneGeometry(.72,1.2),mats.banner);cloth.position.set(.42,1.43,0);group.add(cloth);
  }
}
function buildWorld() {
  world.clear();
  const occ=occupiedMap();
  for(const room of state.rooms) {
    const g=new THREE.Group(); g.userData.roomId=room.id; world.add(g);
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
        } else {
          addBox(g,size,pos,mats.wall);
          const capSize=name==='n'||name==='s'?[CELL+.05,.11,WALL_T+.08]:[WALL_T+.08,.11,CELL+.05];
          addBox(g,capSize,[pos[0],WALL_H+.04,pos[2]],mats.wallTop,false);
          if(Math.abs(c.x*3+c.z*5+(name==='n'?1:0))%theme.props.torchEvery===0) makeTorch(g,pos[0],pos[2],name);
        }
      }
    }
    addRoomProps(g,room);
  }
  for(const decor of state.decorations){
    const dg=new THREE.Group();dg.userData.roomId=decor.roomId;dg.userData.decorId=decor.id;world.add(dg);addPlacedDecoration(dg,decor);
  }
  updateSelection();
  updateHUD();
}
function updatePreview() {
  previewGroup.clear(); if(!state.dragStart||!state.dragEnd)return;
  const r=normalizeRect(state.dragStart,state.dragEnd); state.previewValid=isValidRect(r);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(r.w*CELL-.08,.14,r.d*CELL-.08),state.previewValid?mats.previewValid:mats.previewInvalid);
  mesh.position.set((r.x+r.w/2)*CELL,.18,(r.z+r.d/2)*CELL); previewGroup.add(mesh);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:state.previewValid?0x8ff0bc:0xff7a6b}));
  edges.position.copy(mesh.position); previewGroup.add(edges);
}
function updateSelection() {
  selectionGroup.clear();
  const r=state.rooms.find(x=>x.id===state.selected);
  if(r){const m=new THREE.Mesh(new THREE.BoxGeometry(r.w*CELL+.12,.08,r.d*CELL+.12),mats.selected);m.position.set((r.x+r.w/2)*CELL,.25,(r.z+r.d/2)*CELL);selectionGroup.add(m);}
  document.querySelector('#rotateBtn').disabled=!r; document.querySelector('#deleteBtn').disabled=!r;
  document.querySelector('#selectionInfo').textContent=r?`Room ${r.id} · ${r.w} × ${r.d} tiles`:'Drag across the grid to raise a chamber.';
}
function updateHUD(){document.querySelector('#roomCount').textContent=state.rooms.length;const n=state.rooms.reduce((s,r)=>s+r.w*r.d,0);document.querySelector('#tileCount').textContent=`${n} tile${n===1?'':'s'}`;document.querySelector('#decorCount').textContent=state.decorations.length;}
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
}
function readPreferences() {
  try { Object.assign(preferences,JSON.parse(localStorage.getItem('stonekeep-settings')||'{}')); } catch {}
  applyPreferences();
}
function savePreferences() {
  preferences.quality=document.querySelector('#qualitySetting').value;
  preferences.volume=Number(document.querySelector('#volumeSetting').value);
  preferences.brightness=Number(document.querySelector('#brightnessSetting').value);
  preferences.speed=Number(document.querySelector('#speedSetting').value);
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
renderer.domElement.addEventListener('pointerdown',e=>{
  if(state.mode!=='build') { if(document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock(); return; }
  lastPointer={x:e.clientX,y:e.clientY};
  if(e.button===2){rightDrag=true;return}
  if(e.button===0){
    renderer.domElement.setPointerCapture?.(e.pointerId);
    if(state.tool!=='room'){
      const c=pointerCell(e),roomId=c?occupiedMap().get(cellKey(c.x,c.z)):null;
      if(roomId!=null){
        state.decorations.push({id:state.nextDecorId++,type:state.tool,x:c.x,z:c.z,roomId,rotation:(state.nextDecorId%4)*Math.PI/2});
        buildWorld();toast(`${state.tool[0].toUpperCase()+state.tool.slice(1)} placed`);
      } else toast('Decorations must be placed inside a room');
      return;
    }
    // Existing dungeon geometry takes priority over the construction grid.
    // This keeps a normal click from accidentally starting an invalid room
    // preview on top of the room the player meant to select.
    const roomId=pickRoom(e);
    if(roomId!=null){
      state.selected=roomId;state.dragStart=state.dragEnd=null;previewGroup.clear();updateSelection();return;
    }
    const c=pointerCell(e);if(c){state.dragStart=c;state.dragEnd=c;updatePreview();}
  }
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(state.mode==='explore'&&document.pointerLockElement===renderer.domElement){exploreYaw-=e.movementX*.0022;explorePitch=Math.max(-1.35,Math.min(1.35,explorePitch-e.movementY*.0022));return}
  if(rightDrag){cam.yaw-=(e.clientX-lastPointer.x)*.008;cam.pitch=Math.max(.28,Math.min(1.35,cam.pitch+(e.clientY-lastPointer.y)*.006));lastPointer={x:e.clientX,y:e.clientY};updateBuildCamera();return}
  if(state.dragStart){const c=pointerCell(e);if(c){state.dragEnd=c;updatePreview();}}
});
renderer.domElement.addEventListener('pointerup',e=>{
  if(renderer.domElement.hasPointerCapture?.(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);
  if(e.button===2){rightDrag=false;return}
  if(e.button===0&&state.mode==='build'&&state.dragStart){
    const r=normalizeRect(state.dragStart,state.dragEnd);
    if(state.previewValid){r.id=state.nextId++;state.rooms.push(r);state.selected=r.id;buildWorld();toast('Chamber raised');}
    else {state.selected=pickRoom(e);updateSelection();if(!state.selected)toast('Blocked — choose empty ground');}
    state.dragStart=state.dragEnd=null;previewGroup.clear();
  }
});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('wheel',e=>{if(state.mode==='build'){cam.distance=Math.max(10,Math.min(60,cam.distance+e.deltaY*.025));updateBuildCamera();}},{passive:true});

function deleteSelected(){if(!state.selected)return;state.rooms=state.rooms.filter(r=>r.id!==state.selected);state.decorations=state.decorations.filter(d=>d.roomId!==state.selected);state.selected=null;buildWorld();toast('Room demolished');}
function rotateSelected(){const r=state.rooms.find(x=>x.id===state.selected);if(!r)return;const nr={...r,w:r.d,d:r.w};nr.x=Math.round(r.x+(r.w-nr.w)/2);nr.z=Math.round(r.z+(r.d-nr.d)/2);if(isValidRect(nr,r.id)){Object.assign(r,nr);buildWorld();toast('Room rotated');}else toast('Rotation blocked');}
function save(){localStorage.setItem('stonekeep-save',JSON.stringify({version:2,theme:theme.id,rooms:state.rooms,decorations:state.decorations,nextId:state.nextId,nextDecorId:state.nextDecorId}));toast('Dungeon saved locally');}
function load(){const raw=localStorage.getItem('stonekeep-save');if(!raw){toast('No saved dungeon found');return}try{const data=JSON.parse(raw);state.rooms=data.rooms||[];state.decorations=data.decorations||[];state.nextId=data.nextId||1;state.nextDecorId=data.nextDecorId||1;state.selected=null;state.showcase=false;selectTool('room');buildWorld();toast('Dungeon restored');}catch{toast('Save data could not be read');}}

function setMode(mode){
  state.mode=mode;camera=mode==='build'?buildCamera:exploreCamera;grid.visible=mode==='build';selectionGroup.visible=mode==='build';previewGroup.clear();
  document.querySelector('#buildMode').classList.toggle('active',mode==='build');document.querySelector('#exploreMode').classList.toggle('active',mode==='explore');
  document.querySelector('.palette').style.display=mode==='build'?'block':'none';document.querySelector('.inspector').style.display=mode==='build'?'block':'none';document.querySelector('#crosshair').style.display=mode==='explore'?'block':'none';
  document.querySelector('#hint').textContent=mode==='build'?'LMB DRAG Place room · RMB DRAG Rotate view · WASD/ARROWS Pan · WHEEL Zoom':'CLICK Capture mouse · WASD Move · MOUSE Look · ESC Release · B Return to build';
  if(mode==='explore'&&state.rooms.length){const r=state.rooms[0];exploreCamera.position.set((r.x+.5)*CELL,1.65,(r.z+.5)*CELL);}
  if(mode==='build'&&document.pointerLockElement)document.exitPointerLock();
  toast(mode==='build'?'Build mode':'Explore mode — click to look');
}

const tutorialSteps = [
  { target:'.topbar', kicker:'WELCOME, ARCHITECT', title:'Your keep begins here.', body:'This guided tour follows the real interface. Build and Explore are your two main modes; you can revisit this tutorial anytime with the ? button.' },
  { target:'.palette', kicker:'STEP ONE · CONSTRUCTION', title:'Choose what to build.', body:'The construction palette holds modular room and corridor tools. Stone Room is selected, so you are ready to draw a chamber.' },
  { target:null, kicker:'STEP TWO · PLACE A ROOM', title:'Drag across the grid.', body:'Hold the left mouse button and drag over empty tiles. A green preview is valid; red means the footprint overlaps another room or is too large.' },
  { target:'.palette', kicker:'STEP THREE · EDIT', title:'Select, rotate, demolish.', body:'Click a finished room to select it. Use Rotate or press R to turn its footprint. Use Demolish or Delete to remove it.' },
  { target:'.mode-switch', kicker:'STEP FOUR · EXPLORE', title:'Walk what you build.', body:'Choose Explore after placing a room. Click the 3D view, look with the mouse, and move with WASD. Press B to return to Build mode.' },
  { target:'.actions', kicker:'STEP FIVE · KEEP YOUR WORK', title:'Save and restore.', body:'Save stores the current layout in this browser. Load rebuilds every floor, wall, doorway, torch, and prop from compact room data.' },
  { target:'.inspector', kicker:'TOUR COMPLETE', title:'Raise your Stone Keep.', body:'The ledger tracks rooms and floor area. Start with two touching rooms—the shared wall automatically becomes an opening. Your dungeon is ready.' }
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
  if(state.showcase){state.rooms=[];state.decorations=[];state.nextId=1;state.nextDecorId=1;state.showcase=false;buildWorld();}
  document.body.classList.remove('menu-open');
  document.querySelector('#mainMenu').classList.add('hidden');document.querySelector('#help').classList.add('hidden');document.querySelector('#settings').classList.add('hidden');document.querySelector('#tutorial').classList.remove('hidden');setMode('build');showTutorialStep(0);
}
function endTutorial() {
  document.querySelector('#tutorial').classList.add('hidden');document.querySelectorAll('.tutorial-focus').forEach(e=>e.classList.remove('tutorial-focus'));localStorage.setItem('stonekeep-tutorial-complete','true');toast('Tutorial complete — begin building');
}
function startNewDungeon() {
  state.rooms=[];state.decorations=[];state.selected=null;state.nextId=1;state.nextDecorId=1;state.showcase=false;selectTool('room');buildWorld();document.body.classList.remove('menu-open');document.querySelector('#settings').classList.add('hidden');document.querySelector('#mainMenu').classList.add('hidden');setMode('build');toast('A new keep awaits');
}
function selectTool(tool){
  state.tool=tool;document.querySelector('#roomTool').classList.toggle('active',tool==='room');document.querySelectorAll('.decor-tool').forEach(b=>b.classList.toggle('active',b.dataset.decor===tool));
  document.querySelector('#hint').textContent=tool==='room'?'LMB DRAG Place room · CLICK Select · RMB DRAG Rotate view · WHEEL Zoom':`CLICK inside a room to place ${tool} · Choose Stone Room to resume building`;
}
document.querySelector('#buildMode').onclick=()=>setMode('build');document.querySelector('#exploreMode').onclick=()=>setMode('explore');
document.querySelector('#deleteBtn').onclick=deleteSelected;document.querySelector('#rotateBtn').onclick=rotateSelected;document.querySelector('#saveBtn').onclick=save;document.querySelector('#loadBtn').onclick=load;
const help=document.querySelector('#help'),settings=document.querySelector('#settings');
document.querySelector('#helpBtn').onclick=()=>help.classList.remove('hidden');document.querySelector('#closeHelp').onclick=()=>help.classList.add('hidden');document.querySelector('#startTutorialFromHelp').onclick=startTutorial;
document.querySelector('#newGameBtn').onclick=startNewDungeon;document.querySelector('#tutorialBtn').onclick=startTutorial;
document.querySelector('#roomTool').onclick=()=>selectTool('room');document.querySelectorAll('.decor-tool').forEach(b=>b.onclick=()=>selectTool(b.dataset.decor));
const continueBtn=document.querySelector('#continueBtn');continueBtn.disabled=!localStorage.getItem('stonekeep-save');continueBtn.onclick=()=>{load();document.body.classList.remove('menu-open');document.querySelector('#mainMenu').classList.add('hidden');setMode('build');};
function openSettings(){settings.classList.remove('hidden');applyPreferences();}
document.querySelector('#settingsBtn').onclick=openSettings;document.querySelector('#menuSettingsBtn').onclick=openSettings;document.querySelector('#closeSettings').onclick=()=>settings.classList.add('hidden');document.querySelector('#applySettings').onclick=savePreferences;
document.querySelector('#resetSettings').onclick=()=>{Object.assign(preferences,{quality:'high',volume:70,brightness:125,speed:100,reduceMotion:false});applyPreferences();};
document.querySelector('#tutorialExit').onclick=endTutorial;document.querySelector('#tutorialBack').onclick=()=>showTutorialStep(tutorialIndex-1);document.querySelector('#tutorialNext').onclick=()=>tutorialIndex===tutorialSteps.length-1?endTutorial():showTutorialStep(tutorialIndex+1);
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Delete')deleteSelected();if(e.code==='KeyR'&&state.mode==='build')rotateSelected();if(e.code==='KeyB')setMode('build');if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();save();}});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);for(const c of [buildCamera,exploreCamera]){c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix();}});

const clock=new THREE.Clock();
function tick(){
  const dt=Math.min(clock.getDelta(),.04),speed=(state.mode==='build'?12:4)*(preferences.speed/100);
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
  {id:1,x:-4,z:-3,w:4,d:4},
  {id:2,x:0,z:-2,w:3,d:2},
  {id:3,x:-3,z:1,w:3,d:3},
  {id:4,x:3,z:-2,w:2,d:4}
];state.nextId=5;cam.target.set(0,0,-1);cam.distance=27;cam.yaw=.82;cam.pitch=.66;updateBuildCamera();
buildWorld();grid.visible=false;tick();
