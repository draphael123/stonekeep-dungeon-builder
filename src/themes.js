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
      torchEvery: 7,
      torchHeight: 1.6,
      bannerColor: 0x592a24
    }
  }
};

export function makeThemeMaterials(theme) {
  const result = {};
  for (const [key, values] of Object.entries(theme.materials)) {
    result[key] = new THREE.MeshStandardMaterial(values);
  }
  result.previewValid = new THREE.MeshBasicMaterial({ color: 0x50c792, transparent: true, opacity: 0.38, depthWrite: false });
  result.previewInvalid = new THREE.MeshBasicMaterial({ color: 0xd24e43, transparent: true, opacity: 0.42, depthWrite: false });
  result.selected = new THREE.MeshBasicMaterial({ color: 0xd9b35f, transparent: true, opacity: 0.18, depthWrite: false });
  return result;
}
