import * as THREE from 'three';

export const THEMES = {
  stoneKeep: {
    id: 'stoneKeep',
    name: 'Stone Keep',
    atmosphere: {
      background: 0x090d0d,
      fogColor: 0x101515,
      fogNear: 24,
      fogFar: 82,
      ambientColor: 0x6f7d83,
      ambientIntensity: 0.52,
      sunColor: 0xa9bac0,
      sunIntensity: 1.1
    },
    materials: {
      floor: { color: 0x4a4b46, roughness: 0.96, metalness: 0.02 },
      floorAlt: { color: 0x3c3f3c, roughness: 1 },
      wall: { color: 0x353a38, roughness: 0.92 },
      wallTop: { color: 0x55564f, roughness: 0.98 },
      trim: { color: 0x201d19, roughness: 0.7, metalness: 0.35 },
      flame: { color: 0xffb347, emissive: 0xff6a16, emissiveIntensity: 4 }
    },
    props: {
      torchEvery: 5,
      torchHeight: 1.6,
      bannerColor: 0x6f2923,
      rugColor: 0x55251f,
      woodColor: 0x3a2417,
      brassColor: 0x80662f
    }
  }
};

function stoneTexture(kind='wall') {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),base=kind==='floor'?[63,65,61]:[57,61,59];
  ctx.fillStyle=`rgb(${base.join(',')})`;ctx.fillRect(0,0,512,512);
  const rows=kind==='floor'?8:10,rowH=512/rows;
  for(let row=0;row<rows;row++){
    const offset=row%2?32:0,brickW=kind==='floor'?64:96;
    for(let x=-brickW;x<512+brickW;x+=brickW){
      const n=((row*31+x*7)%17)-8;
      ctx.fillStyle=`rgb(${base[0]+n},${base[1]+n},${base[2]+n})`;
      ctx.fillRect(x+offset+2,row*rowH+2,brickW-4,rowH-4);
      ctx.strokeStyle='rgba(12,15,14,.55)';ctx.lineWidth=3;ctx.strokeRect(x+offset+1,row*rowH+1,brickW-2,rowH-2);
      for(let i=0;i<12;i++){const px=x+offset+8+((i*37+row*19)%Math.max(10,brickW-16)),py=row*rowH+7+((i*23+x)%Math.max(10,rowH-14));ctx.fillStyle=i%3?'#ffffff09':'#00000012';ctx.fillRect(px,py,2+(i%3),2);}
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
  texture.repeat.set(kind==='floor'?1.7:2.4,kind==='floor'?1.7:1.2);return texture;
}

export function makeThemeMaterials(theme) {
  const result = {};
  for (const [key, values] of Object.entries(theme.materials)) {
    result[key] = new THREE.MeshStandardMaterial(values);
  }
  result.floor.map=stoneTexture('floor');result.floor.needsUpdate=true;
  result.floorAlt.map=result.floor.map;result.floorAlt.needsUpdate=true;
  result.wall.map=stoneTexture('wall');result.wall.needsUpdate=true;
  // Texture maps multiply with material color; these neutral tints keep masonry
  // readable in torchlight without making the dungeon feel washed out.
  result.floor.color.set(0xa4a49b);result.floorAlt.color.set(0x898c86);result.wall.color.set(0x969a94);
  result.wood=new THREE.MeshStandardMaterial({color:theme.props.woodColor,roughness:.72});
  result.brass=new THREE.MeshStandardMaterial({color:theme.props.brassColor,roughness:.35,metalness:.7});
  result.banner=new THREE.MeshStandardMaterial({color:theme.props.bannerColor,roughness:.9,side:THREE.DoubleSide});
  result.rug=new THREE.MeshStandardMaterial({color:theme.props.rugColor,roughness:1});
  result.leather=new THREE.MeshStandardMaterial({color:0x241812,roughness:.88});
  result.previewValid = new THREE.MeshBasicMaterial({ color: 0x50c792, transparent: true, opacity: 0.38, depthWrite: false });
  result.previewInvalid = new THREE.MeshBasicMaterial({ color: 0xd24e43, transparent: true, opacity: 0.42, depthWrite: false });
  result.selected = new THREE.MeshBasicMaterial({ color: 0xd9b35f, transparent: true, opacity: 0.18, depthWrite: false });
  return result;
}
