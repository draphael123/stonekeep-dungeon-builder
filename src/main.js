import * as THREE from 'three';
import './style.css';
import { THEMES, makeThemeMaterials } from './themes.js';

const CELL = 2, WALL_H = 2.8, WALL_T = .24;
const theme = THEMES.stoneKeep;
const mats = makeThemeMaterials(theme);
const state = { rooms: [], selected: null, mode: 'build', dragStart: null, dragEnd: null, previewValid: false, nextId: 1 };
const keys = new Set();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.querySelector('#game').append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(theme.atmosphere.background);
scene.fog = new THREE.Fog(theme.atmosphere.fogColor, theme.atmosphere.fogNear, theme.atmosphere.fogFar);
scene.add(new THREE.HemisphereLight(theme.atmosphere.ambientColor, 0x0b0907, theme.atmosphere.ambientIntensity));
const sun = new THREE.DirectionalLight(theme.atmosphere.sunColor, theme.atmosphere.sunIntensity);
sun.position.set(-18, 28, 14); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -35; sun.shadow.camera.right = sun.shadow.camera.top = 35;
scene.add(sun);

const world = new THREE.Group(), previewGroup = new THREE.Group(), selectionGroup = new THREE.Group();
scene.add(world, previewGroup, selectionGroup);

const grid = new THREE.GridHelper(80, 40, 0x86754f, 0x353b38);
grid.position.y = .012; grid.material.transparent = true; grid.material.opacity = .6; scene.add(grid);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100,100), new THREE.MeshStandardMaterial({color:0x171b19,roughness:1}));
ground.rotation.x = -Math.PI/2; ground.position.y=-.08; ground.receiveShadow=true; scene.add(ground);

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
  const light=new THREE.PointLight(0xff8a32,2.2,8,2); light.position.copy(flame.position); light.castShadow=false; group.add(light);
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
function updateHUD(){document.querySelector('#roomCount').textContent=state.rooms.length;const n=state.rooms.reduce((s,r)=>s+r.w*r.d,0);document.querySelector('#tileCount').textContent=`${n} tile${n===1?'':'s'}`;}
function toast(msg){const e=document.querySelector('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),1800);}

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
  if(e.button===0){const c=pointerCell(e);if(c){state.dragStart=c;state.dragEnd=c;updatePreview();}}
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(state.mode==='explore'&&document.pointerLockElement===renderer.domElement){exploreYaw-=e.movementX*.0022;explorePitch=Math.max(-1.35,Math.min(1.35,explorePitch-e.movementY*.0022));return}
  if(rightDrag){cam.yaw-=(e.clientX-lastPointer.x)*.008;cam.pitch=Math.max(.28,Math.min(1.35,cam.pitch+(e.clientY-lastPointer.y)*.006));lastPointer={x:e.clientX,y:e.clientY};updateBuildCamera();return}
  if(state.dragStart){const c=pointerCell(e);if(c){state.dragEnd=c;updatePreview();}}
});
renderer.domElement.addEventListener('pointerup',e=>{
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

function deleteSelected(){if(!state.selected)return;state.rooms=state.rooms.filter(r=>r.id!==state.selected);state.selected=null;buildWorld();toast('Room demolished');}
function rotateSelected(){const r=state.rooms.find(x=>x.id===state.selected);if(!r)return;const nr={...r,w:r.d,d:r.w};nr.x=Math.round(r.x+(r.w-nr.w)/2);nr.z=Math.round(r.z+(r.d-nr.d)/2);if(isValidRect(nr,r.id)){Object.assign(r,nr);buildWorld();toast('Room rotated');}else toast('Rotation blocked');}
function save(){localStorage.setItem('stonekeep-save',JSON.stringify({version:1,theme:theme.id,rooms:state.rooms,nextId:state.nextId}));toast('Dungeon saved locally');}
function load(){const raw=localStorage.getItem('stonekeep-save');if(!raw){toast('No saved dungeon found');return}try{const data=JSON.parse(raw);state.rooms=data.rooms||[];state.nextId=data.nextId||1;state.selected=null;buildWorld();toast('Dungeon restored');}catch{toast('Save data could not be read');}}

function setMode(mode){
  state.mode=mode;camera=mode==='build'?buildCamera:exploreCamera;grid.visible=mode==='build';selectionGroup.visible=mode==='build';previewGroup.clear();
  document.querySelector('#buildMode').classList.toggle('active',mode==='build');document.querySelector('#exploreMode').classList.toggle('active',mode==='explore');
  document.querySelector('.palette').style.display=mode==='build'?'block':'none';document.querySelector('.inspector').style.display=mode==='build'?'block':'none';document.querySelector('#crosshair').style.display=mode==='explore'?'block':'none';
  document.querySelector('#hint').textContent=mode==='build'?'LMB DRAG Place room · RMB DRAG Rotate view · WASD/ARROWS Pan · WHEEL Zoom':'CLICK Capture mouse · WASD Move · MOUSE Look · ESC Release · B Return to build';
  if(mode==='explore'&&state.rooms.length){const r=state.rooms[0];exploreCamera.position.set((r.x+.5)*CELL,1.65,(r.z+.5)*CELL);}
  if(mode==='build'&&document.pointerLockElement)document.exitPointerLock();
  toast(mode==='build'?'Build mode':'Explore mode — click to look');
}
document.querySelector('#buildMode').onclick=()=>setMode('build');document.querySelector('#exploreMode').onclick=()=>setMode('explore');
document.querySelector('#deleteBtn').onclick=deleteSelected;document.querySelector('#rotateBtn').onclick=rotateSelected;document.querySelector('#saveBtn').onclick=save;document.querySelector('#loadBtn').onclick=load;
const help=document.querySelector('#help');document.querySelector('#helpBtn').onclick=()=>help.classList.remove('hidden');document.querySelector('#closeHelp').onclick=document.querySelector('#beginBtn').onclick=()=>help.classList.add('hidden');
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Delete')deleteSelected();if(e.code==='KeyR'&&state.mode==='build')rotateSelected();if(e.code==='KeyB')setMode('build');if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();save();}});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);for(const c of [buildCamera,exploreCamera]){c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix();}});

const clock=new THREE.Clock();
function tick(){
  const dt=Math.min(clock.getDelta(),.04),speed=state.mode==='build'?12:4;
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
buildWorld();tick();
