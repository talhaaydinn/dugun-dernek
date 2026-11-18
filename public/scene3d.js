// =====================================================================
//  3D sahne: karakterler (Mixamo iskeletli GLB/FBX), halka, müzisyenler.
//  Dans hareketleri hazır animasyon değil; kemikler her karede ters
//  kinematik (IK) ile hesaplanır. Böylece eller gerçekten komşunun eline
//  bağlanır ve halay / horon / zeybek için farklı figürler yapılabilir.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const C = window.HALAY_CONFIG;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const UP = new THREE.Vector3(0, 1, 0);
const COUPLE_Z = 0.15; // gelin-damadın halka merkezine göre konumu (ileri/geri)
const TAKI_SLOTS = 10, TAKI_MAX = 30; // kurdeledeki altın yeri / en fazla altın (fazlası en eskinin yerine)

// p noktasını hedefe doğru en fazla 'step' kadar ilerletir; vardıysa true
function moveTo(p, target, step) {
  const d = target.clone().sub(p); d.y = 0;
  const len = d.length();
  if (len <= step) { p.x = target.x; p.z = target.z; return true; }
  p.addScaledVector(d, step / len);
  return false;
}
const angleLerp = (a, b, t) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a))) * t;

// yürüyüş pozu (halkadan çıkıp takı takmaya giderken)
function walkPose(m, t, walking) {
  const P = basePose(m);
  const st = Math.sin(t * 9), A = m.ankleY;
  P.link = 0; P.lean = 0.06;
  P.rootY = -0.02 * Math.abs(st) * walking;
  P.lf = [m.hipX, A + Math.max(0, st) * 0.12 * walking, st * 0.2 * walking, 0];
  P.rf = [-m.hipX, A + Math.max(0, -st) * 0.12 * walking, -st * 0.2 * walking, 0];
  P.lh = [m.shoulderX + 0.1, m.hipY - 0.03, 0.05 - st * 0.12 * walking];
  P.rh = [-m.shoulderX - 0.1, m.hipY - 0.03, 0.05 + st * 0.12 * walking];
  return P;
}

const BONE_NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const normName = (n) => n.replace(/^mixamorig\d*[:_]?/i, '');

// ---------------------------------------------------------------- kemik yardımcıları
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

// Hız için: dünya matrisleri her seferinde baştan hesaplanmaz. Sadece değişen kemik ve
// ihtiyaç duyulan zincir güncellenir. Parmak gibi kalan kemikler çizimden hemen önce three.js'te güncellenir.
const _dp = new THREE.Vector3(), _ds = new THREE.Vector3();
const wpos = (o, out) => out.setFromMatrixPosition(o.matrixWorld);
const wquat = (o, out) => { o.matrixWorld.decompose(_dp, out, _ds); return out; };
function refreshSelf(bone) { bone.updateMatrix(); bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix); }
// 'from' (güncel) kemiğinden 'bone'a kadar aradaki tüm kemikleri yukarıdan aşağı güncelle
function refreshTo(bone, from) {
  if (!bone) return;
  const chain = [];
  for (let o = bone; o && o !== from && o.parent; o = o.parent) chain.push(o);
  for (let i = chain.length - 1; i >= 0; i--) refreshSelf(chain[i]);
}

// Kemiği, çocuğu hedef noktaya bakacak şekilde döndür (eksen bağımsız)
function aimBone(bone, child, target) {
  refreshTo(child, bone); // çocuk kemik güncel olsun
  const bp = wpos(bone, _a);
  const cur = wpos(child, _b).sub(bp);
  const want = _c.copy(target).sub(bp);
  if (cur.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) return;
  cur.normalize(); want.normalize();
  _q1.setFromUnitVectors(cur, want);
  wquat(bone, _q2);
  wquat(bone.parent, _q3);
  bone.quaternion.copy(_q3.invert().multiply(_q1.multiply(_q2)));
  refreshSelf(bone);
  refreshTo(child, bone);
}

function rotateWorld(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  wquat(bone, _q2);
  wquat(bone.parent, _q3);
  _q1.setFromAxisAngle(axis, angle);
  bone.quaternion.copy(_q3.invert().multiply(_q1.multiply(_q2)));
  refreshSelf(bone);
}

const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _T = new THREE.Vector3(), _D = new THREE.Vector3(), _P = new THREE.Vector3();
// İki kemikli IK: omuz-dirsek-el veya kalça-diz-ayak
function solveIK(upper, lower, end, target, pole) {
  wpos(upper, _S);
  const la = _S.distanceTo(wpos(lower, _E));
  const lb = _E.distanceTo(wpos(end, _T));
  _D.copy(target).sub(_S);
  let d = _D.length();
  if (d < 1e-6) return;
  _D.divideScalar(d);
  d = clamp(d, Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
  const x = (la * la - lb * lb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, la * la - x * x));
  _P.copy(pole).addScaledVector(_D, -pole.dot(_D));
  if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0).addScaledVector(_D, -_D.y);
  _P.normalize();
  const elbow = new THREE.Vector3().copy(_S).addScaledVector(_D, x).addScaledVector(_P, h);
  aimBone(upper, lower, elbow);
  aimBone(lower, end, target);
}

// ---------------------------------------------------------------- dokular
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function groundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(512, 512, 0, 512, 512, 512);
  gr.addColorStop(0, '#a8714a'); gr.addColorStop(0.45, '#8a5a3c'); gr.addColorStop(0.8, '#4a2c22'); gr.addColorStop(1, 'rgba(40,20,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
  let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) { // taş döşeme hissi
    const a = r() * TAU, d = Math.sqrt(r()) * 470, x = 512 + Math.cos(a) * d, y = 512 + Math.sin(a) * d;
    g.fillStyle = `rgba(${r() < 0.5 ? '255,220,180' : '40,20,10'},${0.04 + r() * 0.06})`;
    g.beginPath(); g.ellipse(x, y, 10 + r() * 26, 8 + r() * 18, r() * 3, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture(), BLOB = blobTexture();

// ---------------------------------------------------------------- model şablonları
async function loadTemplate(def) {
  let root;
  if (/\.fbx$/i.test(def.file)) root = await new FBXLoader().loadAsync(def.file);
  else root = (await new GLTFLoader().loadAsync(def.file)).scene;
  const bones = {};
  root.traverse((o) => { if (o.isBone) { const n = normName(o.name); if (!bones[n]) bones[n] = o; } });
  for (const need of ['Hips', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'Head']) {
    if (!bones[need]) throw new Error(`${def.file}: Mixamo iskeleti bulunamadı (${need} yok)`);
  }
  // boyu ölç ve hedef boya ölçekle, ayakları zemine oturt
  const measure = () => {
    root.updateMatrixWorld(true);
    const top = (bones.HeadTop_End || bones.Head).getWorldPosition(new THREE.Vector3()).y + (bones.HeadTop_End ? 0 : 0.12);
    const toes = [bones.LeftToeBase, bones.RightToeBase, bones.LeftFoot, bones.RightFoot].filter(Boolean).map((b) => b.getWorldPosition(new THREE.Vector3()).y);
    const bottom = Math.min(...toes);
    return { top, bottom: bottom - (top - bottom) * 0.012 };
  };
  let m = measure();
  root.scale.multiplyScalar((def.height || 1.75) / (m.top - m.bottom));
  m = measure();
  root.position.y -= m.bottom;
  root.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mt) => { if (mt.map) mt.map.anisotropy = 4; if ('roughness' in mt) mt.roughness = Math.max(mt.roughness, 0.55); });
    }
  });
  return { def, root };
}

// ---------------------------------------------------------------- karakter
class Character {
  constructor(tpl, { tint } = {}) {
    this.tpl = tpl;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(tpl.root);
    this.root.add(this.model);
    this.b = {};
    this.model.traverse((o) => {
      if (o.isBone) { const n = normName(o.name); if (BONE_NAMES.includes(n) && !this.b[n]) this.b[n] = o; }
      if (o.isMesh) o.frustumCulled = false;
    });
    this.rest = [...Object.values(this.b)].map((bone) => [bone, bone.quaternion.clone()]);
    this.tintMats = [];
    const names = tpl.def.tint || [];
    if (names.length) {
      this.model.traverse((o) => {
        if (!o.isMesh) return;
        const one = (mt) => {
          if (!names.some((n) => (mt.name || '').toLowerCase().includes(n.toLowerCase()))) return mt;
          const c = mt.clone(); this.tintMats.push(c); return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
      });
    }
    if (tint) this.setTint(tint);

    // zemin gölgesi + seviye halkası
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; this.root.add(blob);
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.47, 48), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.aura.rotation.x = -Math.PI / 2; this.aura.position.y = 0.02; this.root.add(this.aura);

    // ölçüler (dinlenme pozunda)
    this.root.updateMatrixWorld(true);
    const wp = (n) => this.b[n].getWorldPosition(new THREE.Vector3());
    const la = wp('LeftArm'), lf = wp('LeftFoot');
    this.m = {
      shoulderY: la.y, shoulderX: Math.abs(la.x),
      hipY: wp('LeftUpLeg').y, hipX: Math.abs(wp('LeftUpLeg').x),
      ankleY: lf.y,
      toe: this.b.LeftToeBase ? wp('LeftToeBase').sub(lf) : new THREE.Vector3(0, -lf.y * 0.6, 0.13),
      headTop: (this.b.HeadTop_End ? wp('HeadTop_End') : wp('Head').add(new THREE.Vector3(0, 0.15, 0))).y,
    };
    this.m.toe.x = 0;
  }

  setTint(color) { this.tintMats.forEach((mt) => mt.color.set(color)); }

  resetPose() { for (const [bone, q] of this.rest) bone.quaternion.copy(q); }

  local(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.ground); }
  localDir(x, y, z) { return new THREE.Vector3(x, y, z).applyQuaternion(this.groundQ).normalize(); }

  // P: poz, place: { pos, yaw }, hands: { L, R } dünya hedefleri (varsa)
  apply(P, place, hands) {
    this.resetPose();
    // "zemin" çerçevesi: halkadaki yer + yön (zıplama/sallanma hariç)
    this.groundQ = new THREE.Quaternion().setFromAxisAngle(UP, place.yaw + (P.yaw || 0));
    this.ground = new THREE.Matrix4().compose(place.pos, this.groundQ, new THREE.Vector3(1, 1, 1));
    const fwd = this.localDir(0, 0, 1), right = this.localDir(1, 0, 0);
    this.root.position.copy(place.pos).addScaledVector(right, P.sway || 0);
    this.root.position.y += P.rootY || 0;
    this.root.quaternion.copy(this.groundQ);
    this.root.updateMatrixWorld(true);

    const b = this.b;
    rotateWorld(b.Spine, right, (P.lean || 0) * 0.5);
    rotateWorld(b.Spine, fwd, P.roll || 0);
    refreshTo(b.Spine1, b.Spine); rotateWorld(b.Spine1, right, (P.lean || 0) * 0.5);
    refreshTo(b.Spine2, b.Spine1); rotateWorld(b.Spine2, UP, P.shimmy || 0);
    refreshTo(b.Head, b.Spine2); rotateWorld(b.Head, right, P.nod || 0);
    refreshTo(b.LeftHand, b.Spine2); refreshTo(b.RightHand, b.Spine2);

    const lh = hands.L || this.local(...P.lh), rh = hands.R || this.local(...P.rh);
    solveIK(b.LeftArm, b.LeftForeArm, b.LeftHand, lh, this.localDir(...P.elbowL));
    solveIK(b.RightArm, b.RightForeArm, b.RightHand, rh, this.localDir(...P.elbowR));
    // eli kolun devamı gibi hafifçe düzle
    for (const [leg, side] of [['Left', 1], ['Right', -1]]) {
      const f = side > 0 ? P.lf : P.rf;
      const foot = this.local(f[0], f[1], f[2]);
      solveIK(b[`${leg}UpLeg`], b[`${leg}Leg`], b[`${leg}Foot`], foot, this.localDir(side * 0.15, 0, 1));
      const toeBone = b[`${leg}ToeBase`];
      if (toeBone) {
        const toe = this.local(f[0], f[1] + this.m.toe.y - (f[3] || 0), f[2] + this.m.toe.z);
        aimBone(b[`${leg}Foot`], toeBone, toe);
      }
    }
  }

  worldOf(name, out = new THREE.Vector3()) { return this.b[name].getWorldPosition(out); }
}

// ---------------------------------------------------------------- dans stilleri
// Koordinatlar karakterin yerel ekseninde: x = karakterin solu, y = yukarı, z = ileri (dışarı)
function basePose(m) {
  return {
    rootY: 0, sway: 0, yaw: 0, lean: 0.05, roll: 0, shimmy: 0, nod: 0,
    lf: [m.hipX + 0.02, m.ankleY, 0, 0], rf: [-m.hipX - 0.02, m.ankleY, 0, 0],
    lh: [m.shoulderX + 0.12, m.hipY - 0.05, 0.05], rh: [-m.shoulderX - 0.12, m.hipY - 0.05, 0.05],
    elbowL: [0.4, -1, -0.5], elbowR: [-0.4, -1, -0.5],
    holdH: m.shoulderY, holdF: 0.25, link: 1,
  };
}

const STYLES = {
  // Halay: el ele omuz hizası, sağa iki adım, sağ ayak tekme, sağ ayak vuruş
  halay: { spacing: 0.82, move: (b) => (b % 4 < 2 ? Math.sin(Math.PI * (b % 1)) ** 2 * 0.62 : 0.04),
    pose(m, k) {
      const P = basePose(m), ph = k.b % 4, f = ph % 1, lift = Math.sin(Math.PI * f), A = m.ankleY;
      if (ph < 1) P.rf = [-m.hipX - 0.04 - 0.1 * lift, A + 0.1 * lift, 0.03, 0];
      else if (ph < 2) P.lf = [m.hipX - 0.06 * lift, A + 0.1 * lift, 0, 0];
      else if (ph < 3) P.rf = [-m.hipX - 0.02, A + 0.3 * lift, 0.36 * lift, 0.05 * lift];
      else P.rf = [-m.hipX - 0.02, A + 0.07 * lift, -0.1 * lift, 0];
      P.rootY = -0.05 + 0.035 * lift;
      P.lean = 0.07 + (ph >= 2 && ph < 3 ? -0.05 * lift : 0);
      P.shimmy = k.cosku ? Math.sin(k.t * 32 + k.i) * 0.14 : 0.04 * Math.sin(Math.PI * k.b);
      P.nod = 0.05 * lift;
      P.holdH = m.shoulderY - 0.02 + (k.cosku ? 0.5 : 0.04 * lift);
      P.holdF = k.cosku ? 0.12 : 0.27;
      P.elbowL = [0.5, -1, -0.6]; P.elbowR = [-0.5, -1, -0.6];
      // boşta kalan eller: halaybaşı mendili havada sallar, sondaki el aşağıda
      P.rh = k.isLeader ? [-m.shoulderX - 0.32, m.shoulderY + 0.48 + 0.06 * Math.sin(k.t * 6), 0.18] : [-m.shoulderX - 0.18, m.hipY - 0.02, 0.08];
      P.lh = [m.shoulderX + 0.18, m.hipY - 0.02, 0.08];
      return P;
    } },
  // Horon: omuz omuza, eller aşağıda kenetli, sürekli titreme, küçük hızlı adımlar
  horon: { spacing: 0.6, move: () => 0.22,
    pose(m, k) {
      const P = basePose(m), f = k.b % 1, lift = Math.abs(Math.sin(Math.PI * f)), A = m.ankleY;
      const shake = Math.sin(k.t * 46 + k.i * 0.7);
      if (Math.floor(k.b) % 2 === 0) P.rf = [-m.hipX - 0.02, A + 0.07 * lift, 0.05 * lift, 0];
      else P.lf = [m.hipX + 0.02, A + 0.07 * lift, 0.05 * lift, 0];
      P.rootY = -0.09 - 0.035 * lift + 0.012 * shake;
      P.lean = 0.16;
      P.shimmy = shake * 0.09 * (k.cosku ? 1.6 : 1);
      P.roll = Math.sin(Math.PI * k.b) * 0.03;
      const armsUp = k.cosku || Math.floor(k.b / 12) % 4 === 3;
      P.holdH = armsUp ? m.shoulderY + 0.42 + 0.03 * shake : m.hipY - 0.02 + 0.04 * shake;
      P.holdF = armsUp ? 0.1 : 0.16;
      P.elbowL = armsUp ? [0.6, -1, -0.3] : [0.3, -0.4, -1]; P.elbowR = armsUp ? [-0.6, -1, -0.3] : [-0.3, -0.4, -1];
      P.rh = k.isLeader ? [-m.shoulderX - 0.25, m.shoulderY + 0.45 + 0.05 * shake, 0.15] : [-m.shoulderX - 0.15, m.hipY - 0.05 + 0.04 * shake, 0.1];
      P.lh = [m.shoulderX + 0.15, m.hipY - 0.05 + 0.04 * shake, 0.1];
      return P;
    } },
  // Zeybek: tek tek, kollar iki yana açık ve yukarıda, ağır adımlar, dönüş ve diz çökme
  zeybek: { spacing: 1.45, move: () => 0.05,
    pose(m, k) {
      const P = basePose(m), c = ((k.b % 12) + 12) % 12, f = c % 1, lift = Math.sin(Math.PI * f), A = m.ankleY;
      const kneel = smooth((c - 7.5) / 0.8) * (1 - smooth((c - 10) / 1.2));
      P.yaw = 0.55 * Math.sin((TAU * k.b) / 12);
      if (Math.floor(c) % 2 === 0) P.rf = [-m.hipX - 0.05, A + 0.16 * lift * (1 - kneel), 0.12 * lift, 0];
      else P.lf = [m.hipX + 0.05, A + 0.16 * lift * (1 - kneel), 0.12 * lift, 0];
      P.rf = [P.rf[0], lerp(P.rf[1], A + 0.02, kneel), lerp(P.rf[2], -0.42, kneel), 0];
      P.lf = [P.lf[0], P.lf[1], lerp(P.lf[2], 0.18, kneel), 0];
      P.rootY = -0.06 - 0.02 * lift - kneel * 0.48;
      P.lean = 0.02 + kneel * 0.18;
      P.nod = -0.08 + kneel * 0.2;
      P.link = 0;
      const wave = 0.06 * Math.sin((Math.PI * k.b) / 2);
      // kalabalıkta kollar komşuya çarpmasın: açıklık aralığa göre daralır, kollar daha yukarı kalkar
      const reach = clamp((k.spacing ?? 1.45) * 0.5 - m.shoulderX + 0.05, 0.18, 0.62);
      const hy = m.shoulderY + 0.38 + (0.62 - reach) * 0.5 + wave - kneel * 0.25;
      P.lh = [m.shoulderX + reach, hy, 0.12]; P.rh = [-m.shoulderX - reach, hy - wave * 2, 0.12];
      P.elbowL = [0.2, -1, -0.2]; P.elbowR = [-0.2, -1, -0.2];
      return P;
    } },
  // Parti: el ele tutuşma yok, herkes yerinde zıplar, sağa sola adım atar, kollar havada.
  // Her 8 vuruşta figür değişir; komşular farklı figürde olsun diye sıra kişiye göre kayar.
  parti: { spacing: 1.05, move: () => 0.03,
    pose(m, k) {
      const P = basePose(m), A = m.ankleY, b = k.b;
      const bounce = Math.abs(Math.sin(Math.PI * b)), half = Math.sin((Math.PI * b) / 2);
      const fig = k.cosku ? 1 : (Math.floor(b / 8) + k.i) % 3;
      P.link = 0;
      P.rootY = -0.07 + 0.07 * bounce * (k.cosku ? 1.7 : 1);
      P.lean = 0.03; P.nod = 0.08 * bounce;
      P.sway = 0.07 * half;
      P.shimmy = 0.14 * half;
      // sağa-sola adım (step touch)
      if (Math.floor(b) % 2 === 0) P.rf = [-m.hipX - 0.14, A + 0.07 * bounce, 0.02, 0];
      else P.lf = [m.hipX + 0.14, A + 0.07 * bounce, 0.02, 0];
      const top = m.shoulderY + 0.48;
      if (fig === 0) { // tek kol havada yumruk pompalar
        P.rh = [-m.shoulderX - 0.06, top + 0.12 * bounce, 0.16]; P.elbowR = [-0.5, -1, -0.2];
        P.lh = [m.shoulderX + 0.05, m.hipY + 0.28, 0.22]; P.elbowL = [0.7, -1, -0.4];
      } else if (fig === 1) { // iki el havada sağa sola
        const s = 0.2 * half;
        P.lh = [m.shoulderX + 0.14 + s, top + 0.05 * bounce, 0.1]; P.rh = [-m.shoulderX - 0.14 + s, top + 0.05 * bounce, 0.1];
        P.elbowL = [0.5, -1, -0.2]; P.elbowR = [-0.5, -1, -0.2];
      } else { // kollar bükük, omuz dansı
        const s = Math.sin(Math.PI * b);
        P.lh = [m.shoulderX + 0.08, m.shoulderY - 0.12 + 0.1 * s, 0.26]; P.rh = [-m.shoulderX - 0.08, m.shoulderY - 0.12 - 0.1 * s, 0.26];
        P.elbowL = [1, -0.6, -0.3]; P.elbowR = [-1, -0.6, -0.3];
        P.roll = 0.07 * s;
      }
      return P;
    } },
};

function lerpPose(A, B, t) {
  if (t <= 0) return A; if (t >= 1) return B;
  const out = {};
  for (const k in B) out[k] = Array.isArray(B[k]) ? B[k].map((v, i) => lerp(A[k][i], v, t)) : lerp(A[k], B[k], t);
  return out;
}

// ---------------------------------------------------------------- sahne
export class Stage {
  constructor(canvas, width, height, bgCanvas, transparent) {
    this.W = width; this.H = height;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const scene = this.scene = new THREE.Scene();
    if (bgCanvas && !transparent) { const t = new THREE.CanvasTexture(bgCanvas); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }

    this.R = C.rings?.[0]?.radius ?? C.ringRadius;
    this.setupCamera();

    scene.add(new THREE.HemisphereLight(0xb79cff, 0x4a2418, 1.1));
    const key = new THREE.DirectionalLight(0xffd2a0, 2.2); key.position.set(3, 9, 12); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.4); rim.position.set(-6, 7, -10); scene.add(rim);
    const fire = new THREE.PointLight(0xff9a4a, 25, 14, 1.6); fire.position.set(0, 2.2, 0); scene.add(fire);
    this.fire = fire;

    const ground = new THREE.Mesh(new THREE.CircleGeometry(this.R + 9, 96), new THREE.MeshStandardMaterial({ map: groundTexture(), transparent: true, roughness: 1, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const outerR = C.rings.at(-1).radius;
    for (const [r, o] of [[this.R + 0.75, 0.25], [this.R - 0.75, 0.18], ...(outerR > this.R ? [[outerR + 0.75, 0.14]] : [])]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.04, r + 0.04, 128), new THREE.MeshBasicMaterial({ color: 0xffdcaa, transparent: true, opacity: o, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
    }
    this.buildLights();

    this.templates = [];
    this.chars = new Map();
    this.musicians = {};
    // takı: hediye atan halaydan çıkıp gelin/damada altın takar, sonra yerine döner
    this.visits = new Map();   // id -> { role, phase: go|pin|back, t, pos, yaw }
    this.visitQueue = [];
    this.lastTakiShot = -99;
    this.taki = { damat: [], gelin: [] }; // takılan altınlar (mesh)
    this.lineAngle = Math.PI / 2;
    this.style = 'halay'; this.prevStyle = 'halay'; this.blend = 1;
    this.anchors = new Map();
    this.buildProps();
  }

  setupCamera() {
    const fov = C.camera.fov, aspect = this.W / this.H;
    const cam = this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 400);
    const halfW = this.R + C.camera.margin;
    const dist = halfW / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect);
    const pitch = THREE.MathUtils.degToRad(C.camera.pitch);
    cam.position.set(0, 0.9 + dist * Math.sin(pitch), dist * Math.cos(pitch));
    cam.lookAt(0, 0.9, 0);
    cam.updateMatrixWorld();
    // halka merkezini ekranda istenen yüksekliğe getir
    const p = new THREE.Vector3(0, 0.9, 0).project(cam);
    const sy = (1 - p.y) / 2 * this.H;
    cam.setViewOffset(this.W, this.H, 0, sy - C.camera.screenY, this.W, this.H);
    this.centerY = sy;
    this.viewY = C.camera.screenY; // hedefin ekrandaki yüksekliği (yakın çekimde yukarı kayar)
    this.closeness = 0;            // 0 = geniş açı, 1 = yakın çekim (arayüz kartları gizlenir)
    this.baseCam = cam.position.clone();
    this.baseCamInner = cam.position.clone();
    const outerR = C.rings.at(-1).radius;
    const distO = (outerR + C.camera.margin) / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect);
    this.baseCamOuter = new THREE.Vector3(0, 0.9 + distO * Math.sin(pitch), distO * Math.cos(pitch));
    this.outerMix = 0;
    this.cam = { pos: cam.position.clone(), target: new THREE.Vector3(0, 0.9, 0), fov };
    this.shot = { kind: 'wide', t: 0, dur: Infinity, prio: -1, seed: 0.5 };
    this.shotQueue = [];
    this.autoT = 0;
    this.nextAuto = this.randAuto();
  }

  // ---------------------------------------------------------------- kamera yönetmeni
  randAuto() { const [a, b] = C.camera.autoShotEvery || [20, 32]; return a + Math.random() * (b - a); }

  // kind: wide | orbit | sweep | couple | musicians | davul | zurna | dancer (id ile)
  // queue: false -> o an daha önemli bir çekim varsa beklemez, hiç çekilmez (ör. halaya yeni giren)
  // Dönüş: çekim hemen başladıysa true
  focus(kind, id = null, dur = 5, prio = 1, { queue = true } = {}) {
    if (C.camera.director === false && prio < 4) return false; // panelden elle verilen komut her zaman çalışır
    const shot = { kind, id, dur, prio, t: 0, seed: Math.random() };
    const cur = this.shot;
    if (cur.kind !== 'wide' && (cur.prio > prio || (cur.prio === prio && cur.t < 2.5))) {
      if (queue && this.shotQueue.length < 3) this.shotQueue.push(shot);
      return false;
    }
    if (!queue && this.shotQueue.length) return false; // sırada önemli çekim bekliyorsa araya girme
    this.shot = shot;
    return true;
  }

  shotPose(shot, k) {
    const V = THREE.Vector3, t = shot.t, base = C.camera.fov;
    switch (shot.kind) {
      case 'wide':
        return { pos: this.baseCam.clone().add(new V(Math.sin(k.t * 0.15) * 0.6, Math.sin(k.t * 0.21) * 0.15, 0)), target: new V(0, 0.9, 0), fov: base };
      case 'orbit': { // halkanın etrafında dönerek
        const dir = shot.seed > 0.5 ? 1 : -1, a = (shot.seed - 0.5) * 1.4 + t * 0.14 * dir;
        return { pos: new V(Math.sin(a) * 14.5, 6.8, Math.cos(a) * 14.5), target: new V(0, 0.9, 0), fov: base };
      }
      case 'sweep': { // alçaktan süzülen
        const dir = shot.seed > 0.5 ? 1 : -1, a = dir * (0.7 - t * 0.17);
        return { pos: new V(Math.sin(a) * 10.5, 2.2, Math.cos(a) * 10.5), target: new V(0, 1.0, 0), fov: 38, close: true };
      }
      case 'couple':
        return { pos: new V(Math.sin(t * 0.35 + shot.seed * 3) * 1.3, 5.6, COUPLE_Z + 8.2 - t * 0.2), target: new V(0, 1.0, COUPLE_Z), fov: 30, close: true };
      case 'musicians':
        return { pos: new V(Math.sin(t * 0.3) * 1.5, 6.2, -1.45 + 10.5), target: new V(0, 1.0, -1.45), fov: base, close: true };
      case 'davul': case 'zurna': {
        const p = this.musicians[shot.kind]?.place.pos;
        if (!p) return null;
        return { pos: new V(p.x * 1.4 + Math.sin(t * 0.4) * 0.6, 5.4, p.z + 7.2), target: new V(p.x, 1.0, p.z), fov: 30, close: true };
      }
      case 'dancer': { // dansçının yüzüne, halkanın içinden
        const ch = this.chars.get(shot.id);
        if (!ch?.groundQ || ch.root.scale.x < 0.3) return null;
        const p = ch.root.position, f = new V(0, 0, 1).applyQuaternion(ch.groundQ), side = new V(1, 0, 0).applyQuaternion(ch.groundQ);
        // halkanın ortasının üstünden, yukarıdan yüzüne bakar (ortadakiler kadraja girmez)
        const pos = new V(p.x, 0, p.z).addScaledVector(f, 4.3 - t * 0.12).addScaledVector(side, Math.sin(t * 0.45 + shot.seed * 4) * 0.7);
        pos.y = 5.0;
        return { pos, target: new V(p.x, 1.15, p.z), fov: 34, close: true };
      }
      default: return null;
    }
  }

  updateDirector(dt, k) {
    const cam = this.camera;
    // 2. sıra doluysa geniş açı geri çekilir
    const outerOn = (this.ringCounts?.slice(1).reduce((a, b) => a + b, 0) || 0) > 0 ? 1 : 0;
    this.outerMix += (outerOn - this.outerMix) * (1 - Math.exp(-dt * 0.8));
    this.baseCam = this.baseCamInner.clone().lerp(this.baseCamOuter, this.outerMix);
    this.shot.t += dt;
    let want = this.shotPose(this.shot, k);
    if (!want || this.shot.t > this.shot.dur) { // çekim bitti: sıradakine ya da geniş açıya
      let next = null;
      while (this.shotQueue.length && !next) { const q = this.shotQueue.shift(); if (this.shotPose(q, k)) next = q; }
      this.shot = next || { kind: 'wide', t: 0, dur: Infinity, prio: -1, seed: 0.5 };
      if (!next) this.nextAuto = this.randAuto();
      want = this.shotPose(this.shot, k);
    }
    if (this.shot.kind === 'wide' && C.camera.director !== false) { // ara sıra kendiliğinden açı değiştir
      this.autoT += dt;
      if (this.autoT > this.nextAuto) {
        this.autoT = 0;
        const kinds = ['orbit', 'sweep', 'couple', 'musicians'];
        if (this.chars.size) kinds.push('dancer', 'dancer');
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const ids = [...this.chars.keys()];
        const id = kind === 'dancer' ? (k.dancers.find((d) => d.isLeader)?.id || ids[Math.floor(Math.random() * ids.length)]) : null;
        this.focus(kind, id, 6 + Math.random() * 3, 0);
        want = this.shotPose(this.shot, k) || want;
      }
    } else this.autoT = 0;

    // uzak geçişlerde kesme (kamera dansçıların içinden geçmesin), yakınsa yumuşak kayma
    const fresh = !this.shot.started; this.shot.started = true;
    if (fresh && this.cam.pos.distanceTo(want.pos) > 4) {
      this.cam.pos.copy(want.pos); this.cam.target.copy(want.target); this.cam.fov = want.fov;
    } else {
      const a = 1 - Math.exp(-dt * 1.8);
      this.cam.pos.lerp(want.pos, a); this.cam.target.lerp(want.target, a); this.cam.fov += (want.fov - this.cam.fov) * a;
    }
    // yakın çekimde görüntü yukarı kayar, arayüz kartları gizlenir
    const wantClose = want.close ? 1 : 0;
    this.closeness += (wantClose - this.closeness) * (1 - Math.exp(-dt * 3));
    const vy = C.camera.screenY + (C.camera.closeScreenY - C.camera.screenY) * this.closeness;
    if (Math.abs(vy - this.viewY) > 0.5) { this.viewY = vy; cam.setViewOffset(this.W, this.H, 0, this.centerY - vy, this.W, this.H); }
    cam.position.copy(this.cam.pos);
    cam.lookAt(this.cam.target);
    if (Math.abs(cam.fov - this.cam.fov) > 0.01) { cam.fov = this.cam.fov; cam.updateProjectionMatrix(); }
  }

  buildLights() {
    // halkanın arkasında direkler ve aralarında ampul dizileri
    const poles = [];
    const R = this.R + 2.6;
    for (let i = 0; i <= 6; i++) { const a = Math.PI + 0.12 + (i / 6) * (Math.PI - 0.24); poles.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); }
    poles.unshift(new THREE.Vector3(-R - 0.6, 0, 1.8)); poles.push(new THREE.Vector3(R + 0.6, 0, 1.8));
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b1a14, roughness: 0.9 });
    for (const p of poles) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8), poleMat);
      m.position.set(p.x, 1.8, p.z); this.scene.add(m);
    }
    const pts = [], cols = [];
    const palette = [0xffd36b, 0xff6b6b, 0x6bd3ff, 0x9bff6b, 0xff9bf0].map((c) => new THREE.Color(c));
    const wire = [];
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i], b = poles[i + 1];
      for (let j = 0; j < 12; j++) {
        const u = j / 12;
        const p = new THREE.Vector3().lerpVectors(a, b, u); p.y = 3.5 - Math.sin(Math.PI * u) * 0.55;
        pts.push(p.x, p.y - 0.06, p.z); const c = palette[(i * 12 + j) % palette.length]; cols.push(c.r, c.g, c.b);
        wire.push(p.clone());
      }
    }
    wire.push(new THREE.Vector3(poles.at(-1).x, 3.5, poles.at(-1).z));
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x1a0d0a })));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.bulbBase = cols.slice();
    this.bulbs = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.55, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.bulbs);
  }

  buildProps() {
    // davul
    const drum = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.3, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x9b1c1c, roughness: 0.6, side: THREE.DoubleSide }));
    shell.rotation.z = Math.PI / 2; drum.add(shell);
    for (const s of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), new THREE.MeshStandardMaterial({ color: 0xf1e4c6, roughness: 0.8 }));
      head.position.x = s * 0.15; head.rotation.y = s * Math.PI / 2; drum.add(head);
      const rimM = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.018, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: 0.6, roughness: 0.35 }));
      rimM.position.x = s * 0.15; rimM.rotation.y = Math.PI / 2; drum.add(rimM);
    }
    const rope = new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.5 });
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 4), rope);
      const a = (i / 10) * TAU; r.position.set(0, Math.cos(a) * 0.275, Math.sin(a) * 0.275); r.rotation.z = Math.PI / 2 + (i % 2 ? 0.5 : -0.5); drum.add(r);
    }
    this.drum = drum; this.scene.add(drum);
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3412, roughness: 0.7 });
    const tokmak = new THREE.Group();
    const tk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.34, 8), wood); tk1.rotation.x = Math.PI / 2; tk1.position.z = 0.17; tokmak.add(tk1);
    const tk2 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), wood); tk2.position.z = 0.34; tokmak.add(tk2);
    const cubuk = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.42, 6), wood); cb.rotation.x = Math.PI / 2; cb.position.z = 0.21; cubuk.add(cb);
    this.tokmak = tokmak; this.cubuk = cubuk; this.scene.add(tokmak, cubuk);
    // zurna
    const zurna = new THREE.Group();
    const zb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.07, 0.56, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x7a4a1f, roughness: 0.5, side: THREE.DoubleSide }));
    zb.rotation.x = Math.PI / 2; zb.position.z = 0.28; zurna.add(zb);
    const zr = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: 0.6, roughness: 0.35 }));
    zr.position.z = 0.56; zurna.add(zr);
    this.zurna = zurna; this.scene.add(zurna);
    // mendil (halaybaşı)
    const mg = new THREE.PlaneGeometry(0.42, 0.42, 8, 8); mg.translate(0.21, -0.21, 0);
    this.mendilBase = mg.attributes.position.array.slice();
    this.mendil = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: 0xe3122c, side: THREE.DoubleSide, roughness: 0.7, emissive: 0x3a0008 }));
    this.mendil.visible = false; this.scene.add(this.mendil);
  }

  async load() {
    const results = await Promise.allSettled(C.models.map(loadTemplate));
    this.templates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    this.loadErrors = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message || String(r.reason));
    if (!this.templates.length) throw new Error(this.loadErrors.join('; ') || 'Model yok');
    const pick = (flag) => this.templates.find((t) => t.def[flag]) || this.templates[0];
    for (const [role, x, tint] of [['davul', -1.6, '#f3eee2'], ['zurna', 1.6, '#2f4f8f']]) {
      const ch = new Character(pick('musician'), { tint });
      ch.place = { pos: new THREE.Vector3(x, 0, -1.45), yaw: x < 0 ? 0.3 : -0.3 };
      this.scene.add(ch.root);
      this.musicians[role] = ch;
    }
    // gelin ve damat (merkezde, kameraya dönük)
    const damat = new Character(pick('groom'), { tint: '#16161c' });
    const gelin = new Character(pick('bride'), { tint: '#ffffff' });
    damat.place = { pos: new THREE.Vector3(0.42, 0, COUPLE_Z), yaw: -0.12 };
    gelin.place = { pos: new THREE.Vector3(-0.42, 0, COUPLE_Z), yaw: 0.12 };
    this.scene.add(damat.root, gelin.root);
    this.couple = { damat, gelin };
    this.buildWeddingProps(gelin);
    return this;
  }

  buildWeddingProps(gelin) {
    const m = gelin.m;
    // kırmızı halı
    const carpet = new THREE.Mesh(new THREE.CircleGeometry(1.25, 64), new THREE.MeshStandardMaterial({ color: 0x9b1426, roughness: 0.9 }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.008, COUPLE_Z); this.scene.add(carpet);
    const trim = new THREE.Mesh(new THREE.RingGeometry(1.18, 1.25, 64), new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: 0.5, roughness: 0.4 }));
    trim.rotation.x = -Math.PI / 2; trim.position.set(0, 0.012, COUPLE_Z); this.scene.add(trim);

    const white = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.55, side: THREE.DoubleSide });
    const waist = m.hipY + 0.1;
    // kabarık etek (belden yere)
    const skirtPts = [[0.135, 0], [0.16, -0.08], [0.24, -0.3], [0.36, -0.58], [0.47, -0.85], [0.53, -(waist - 0.01)]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const skirt = new THREE.Mesh(new THREE.LatheGeometry(skirtPts, 40), white);
    skirt.scale.z = 0.92;
    // korse (belden göğse)
    const top = m.shoulderY - 0.1 - waist;
    const bodPts = [[0.135, 0], [0.15, top * 0.35], [0.165, top * 0.7], [0.16, top]].map(([r, y]) => new THREE.Vector2(r, y));
    const bodice = new THREE.Mesh(new THREE.LatheGeometry(bodPts, 32), white);
    bodice.scale.z = 0.78;
    // kırmızı kuşak
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.022, 10, 40), new THREE.MeshStandardMaterial({ color: 0xd0102a, roughness: 0.5 }));
    belt.rotation.x = Math.PI / 2; belt.scale.y = 0.78;
    // duvak (başın arkasından sırta inen tül)
    const veilPts = [[0.1, 0], [0.13, -0.15], [0.2, -0.45], [0.27, -0.8], [0.3, -0.95]].map(([r, y]) => new THREE.Vector2(r, y));
    const veil = new THREE.Mesh(new THREE.LatheGeometry(veilPts, 28, Math.PI / 2 - 0.35, Math.PI + 0.7),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 32, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.8, roughness: 0.25, emissive: 0x332200 }));
    // damadın yaka gülü
    const rose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd0102a, roughness: 0.6 }));
    this.wedding = { skirt, bodice, belt, veil, tiara, rose, waistOff: waist - m.hipY };
    this.scene.add(skirt, bodice, belt, veil, tiara, rose);

    // takı: göğüste çapraz kırmızı kurdele + üstüne takılan altınlar
    this.coinGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.007, 20).rotateX(Math.PI / 2);
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.85, roughness: 0.25, emissive: 0x3a2600 });
    this.ribbons = {};
    for (const role of ['damat', 'gelin']) {
      const ch = this.couple[role], mm = ch.m, side = role === 'gelin' ? 1 : -1;
      const z = role === 'gelin' ? 0.15 : 0.14;
      // kurdele bir omuzdan karşı kalçaya iner (yerel: x = karakterin solu, y = kalçadan yukarı)
      const a = new THREE.Vector3(side * 0.13, mm.shoulderY - mm.hipY - 0.07, z);
      const b = new THREE.Vector3(-side * 0.12, 0.05, z);
      const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
      const xAxis = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, dir);
      const qLocal = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, dir, zAxis));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.065, len + 0.06, 0.006), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.55 }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.ribbons[role] = { a, b, mid: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0, -0.006)), qLocal, mesh };
    }
  }

  // j. altının kurdeledeki yeri (dünya koordinatı)
  takiSlot(role, j, out = new THREE.Vector3()) {
    const ch = this.couple[role], r = this.ribbons[role];
    const layer = Math.floor(j / TAKI_SLOTS) % 3, k = j % TAKI_SLOTS;
    const t = (k + 0.5 + layer * 0.33) / (TAKI_SLOTS + 0.5);
    const local = r.a.clone().lerp(r.b, t); local.z += 0.004 + layer * 0.006;
    return out.copy(local).applyQuaternion(ch.groundQ).add(ch.worldOf('Hips'));
  }

  // Hediye atan kişiyi takı takmaya gönderir (sıraya alır). Zaten gidiyorsa false.
  takiTak(id) {
    if (!this.couple || this.visits.has(id) || this.visitQueue.includes(id) || this.visitQueue.length >= 12) return false;
    this.visitQueue.push(id);
    return true;
  }

  addTaki(role) {
    const list = this.taki[role];
    if (list.length >= TAKI_MAX) { const old = list.shift(); this.scene.remove(old); }
    const coin = new THREE.Mesh(this.coinGeo, this.coinMat);
    coin.userData.slot = (list.at(-1)?.userData.slot ?? -1) + 1;
    coin.userData.spin = (Math.random() - 0.5) * 0.6;
    this.scene.add(coin);
    list.push(coin);
  }

  // koltuğa yeni biri oturunca (ya da koltuk boşalınca) takılar sıfırlanır
  clearTaki(role) {
    for (const c of this.taki[role] || []) this.scene.remove(c);
    if (this.taki[role]) this.taki[role].length = 0;
  }

  updateTaki() {
    for (const role of ['damat', 'gelin']) {
      const ch = this.couple[role], r = this.ribbons?.[role], list = this.taki[role];
      if (!r) continue;
      r.mesh.visible = list.length > 0;
      if (!list.length) continue;
      r.mesh.position.copy(r.mid).applyQuaternion(ch.groundQ).add(ch.worldOf('Hips'));
      r.mesh.quaternion.copy(ch.groundQ).multiply(r.qLocal);
      for (const coin of list) {
        this.takiSlot(role, coin.userData.slot, coin.position);
        coin.quaternion.copy(ch.groundQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), coin.userData.spin));
      }
    }
  }

  // takı ziyaretleri: aynı anda en fazla iki kişi (biri damada, biri geline)
  updateVisits(k, places, dt) {
    const V = THREE.Vector3;
    const idx = new Map(k.dancers.map((d, i) => [d.id, i]));
    for (const id of [...this.visits.keys()]) { const i = idx.get(id); if (i === undefined || k.dancers[i].leaving) this.visits.delete(id); }
    // halkada sağ yarıda olan damada, sol yarıda olan geline gider (çiftin önünden geçmesin);
    // o taraf meşgulse sırada bekler, arkasındaki diğer taraftan biri önce gidebilir
    this.visitQueue = this.visitQueue.filter((id) => { const i = idx.get(id); return i !== undefined && !k.dancers[i].leaving; });
    const busy = new Set([...this.visits.values()].map((v) => v.role));
    for (let qi = 0; this.couple && qi < this.visitQueue.length && busy.size < 2; qi++) {
      const id = this.visitQueue[qi], i = idx.get(id), ch = this.chars.get(id);
      if (!ch?.gpos || k.dancers[i].enter < 0.6) continue; // önce halkada belirsin
      const role = ch.gpos.x >= 0 ? 'damat' : 'gelin';
      if (busy.has(role)) continue;
      busy.add(role);
      this.visitQueue.splice(qi--, 1);
      this.visits.set(id, { role, phase: 'go', t: 0, pos: ch.gpos.clone(), yaw: places[i].yaw, walking: 0 });
    }
    const speed = Math.min(3, 1.7 * (1 + this.visitQueue.length * 0.2)); // sıra uzarsa hızlanır
    for (const [id, v] of this.visits) {
      const i = idx.get(id), ch = this.chars.get(id), partner = this.couple[v.role];
      const side = v.role === 'damat' ? 1 : -1;
      const stand = partner.place.pos.clone().add(new V(side * 0.68, 0, 0.3)); // partnerin dış yanında (gelinliğe girmesin)
      v.t += dt;
      let target = null;
      if (v.phase === 'go') {
        target = this.detour(v.pos, stand);
        if (moveTo(v.pos, target, speed * dt) && target === stand) { v.phase = 'pin'; v.t = 0; this.takiArrive(v.role); }
      } else if (v.phase === 'pin') {
        if (v.t > 0.8 && !v.pinned) { v.pinned = true; this.addTaki(v.role); this.onTaki?.(v.role, id); }
        if (v.t > 1.6) { v.phase = 'back'; v.t = 0; }
      } else {
        const home = places[i].pos; // halka dönmeye devam ettiği için yeri her an değişir
        target = this.detour(v.pos, home);
        if (moveTo(v.pos, target, speed * dt) && target === home) { ch.gpos.copy(v.pos); this.visits.delete(id); continue; }
      }
      const moving = v.phase !== 'pin';
      v.walking = lerp(v.walking, moving ? 1 : 0, Math.min(1, dt * 8));
      const look = moving ? target.clone().sub(v.pos) : partner.place.pos.clone().sub(v.pos);
      if (look.lengthSq() > 1e-4) v.yaw = angleLerp(v.yaw, Math.atan2(look.x, look.z), Math.min(1, dt * 10));
      const pl = { pos: v.pos.clone(), yaw: v.yaw, visit: v };
      if (v.phase === 'pin') { // eli uzatıp kurdeleye altını tak
        const reach = smooth(v.t / 0.6) * (1 - smooth((v.t - 1.15) / 0.4));
        const slot = this.takiSlot(v.role, (this.taki[v.role].at(-1)?.userData.slot ?? -1) + (v.pinned ? 0 : 1));
        pl.reach = { hand: side > 0 ? 'L' : 'R', slot, reach };
      }
      places[i] = pl;
    }
  }

  // Gelin-damadın üstünden / önünden geçmesin: düz yol çiftin etrafındaki alandan geçiyorsa
  // alanın kenarından dolaşan bir ara noktaya yönel
  detour(pos, target) {
    const cx = 0, cz = COUPLE_Z, r = 1.0;
    const dx = target.x - pos.x, dz = target.z - pos.z, len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return target;
    const t = clamp(((cx - pos.x) * dx + (cz - pos.z) * dz) / len2, 0, 1);
    const qx = pos.x + dx * t - cx, qz = pos.z + dz * t - cz;
    if (qx * qx + qz * qz >= r * r) return target;
    const a0 = Math.atan2(pos.z - cz, pos.x - cx), a1 = Math.atan2(target.z - cz, target.x - cx);
    let da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    // kamera önde: çiftin önünden geçecekse ters yönden, arkalarından dolaş
    if (Math.sin(a0 + da / 2) > 0) da -= Math.sign(da) * TAU;
    const step = Math.sign(da) * Math.min(Math.abs(da), 0.6);
    const rr = Math.max(r + 0.2, Math.hypot(pos.x - cx, pos.z - cz));
    return new THREE.Vector3(cx + Math.cos(a0 + step) * rr, 0, cz + Math.sin(a0 + step) * rr);
  }

  // takı takan partnerin yanına varınca kısa çift çekimi (sık sık değil)
  takiArrive() {
    const now = performance.now() / 1000, cd = C.camera.takiShotCooldown ?? 6;
    if (!(C.camera.takiShotSeconds ?? 3) || now - this.lastTakiShot < cd) return;
    if (this.focus('couple', null, C.camera.takiShotSeconds ?? 3, 1, { queue: false })) this.lastTakiShot = now;
  }

  // yeni gelin/damat kenardan yürüyerek gelip partnerinin elini tutar
  coupleArrive(role) {
    const ch = this.couple?.[role];
    if (ch) ch.walk = 2.2;
  }

  updateCouple(k) {
    if (!this.couple) return;
    const { damat, gelin } = this.couple, b = k.beat, sw = Math.sin((Math.PI * b) / 2);
    const style = this.style;
    const bounce = (k.cosku ? 0.05 : 0.03) * Math.abs(Math.sin(Math.PI * b));
    const turn = style === 'zeybek' ? 0.35 * Math.sin((TAU * b) / 12) : 0.06 * sw;
    const joinY = (style === 'horon' ? 1.0 : 1.25) + 0.18 * Math.max(0, sw) + (k.cosku ? 0.25 : 0);
    const join = new THREE.Vector3(0.02 * sw, joinY, COUPLE_Z + 0.2);
    const dt = this.dt || 0.016;
    for (const [ch, side] of [[damat, 1], [gelin, -1]]) {
      ch.walk = Math.max(0, (ch.walk || 0) - dt * 0.75); // kenardan partnerine doğru yürüyüş (m)
      const walking = smooth(ch.walk / 0.3), link = 1 - smooth((ch.walk - 0.05) / 0.3);
      const pos = ch.place.pos.clone().add(new THREE.Vector3(side * ch.walk, 0, 0));
      const P = basePose(ch.m);
      P.rootY = -0.03 - bounce * (1 - walking);
      P.sway = 0.04 * sw * side * (1 - walking);
      P.yaw = turn * (1 - walking) - side * 0.9 * walking; // yürürken partnerine döner
      P.lean = 0.03;
      P.shimmy = style === 'horon' ? Math.sin(k.t * 40) * 0.07 : 0.06 * sw;
      P.nod = 0.04 * Math.sin(Math.PI * b);
      // boştaki kol havada (düğün oyunu), zeybekte iki yana açık
      const up = style === 'zeybek' ? 0.3 : 0.42 + 0.08 * Math.sin(Math.PI * b);
      const out = side * (ch.m.shoulderX + (style === 'zeybek' ? 0.55 : 0.3));
      if (side > 0) { P.lh = [out, ch.m.shoulderY + up, 0.15]; P.elbowL = [0.6, -1, -0.3]; P.elbowR = [-0.3, -1, -0.5]; }
      else { P.rh = [out, ch.m.shoulderY + up, 0.15]; P.elbowR = [-0.6, -1, -0.3]; P.elbowL = [0.3, -1, -0.5]; }
      if (walking > 0.01) { // adım at
        const st = Math.sin(k.t * 9), A = ch.m.ankleY;
        P.lf = [ch.m.hipX, A + Math.max(0, st) * 0.12 * walking, st * 0.18 * walking, 0];
        P.rf = [-ch.m.hipX, A + Math.max(0, -st) * 0.12 * walking, -st * 0.18 * walking, 0];
      }
      const place = { pos, yaw: ch.place.yaw };
      ch.groundQ = new THREE.Quaternion().setFromAxisAngle(UP, place.yaw + P.yaw);
      ch.ground = new THREE.Matrix4().compose(pos, ch.groundQ, new THREE.Vector3(1, 1, 1));
      // damadın sağ eli ile gelinin sol eli tutuşur (yürürken eli yanında)
      const free = ch.local(-side * (ch.m.shoulderX + 0.12), ch.m.hipY - 0.03, 0.06);
      const hand = free.lerp(join, link);
      ch.apply(P, place, side > 0 ? { R: hand } : { L: hand });
    }
    // gelinlik parçalarını kemiklere bağla
    const w = this.wedding, hips = gelin.worldOf('Hips');
    const q = gelin.groundQ;
    w.skirt.position.set(hips.x, hips.y + w.waistOff, hips.z); w.skirt.quaternion.copy(q);
    w.belt.position.copy(w.skirt.position); w.belt.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    const spineDir = gelin.worldOf('Neck').sub(gelin.worldOf('Spine')).normalize();
    const tilt = new THREE.Quaternion().setFromUnitVectors(UP, spineDir);
    w.bodice.position.copy(w.skirt.position); w.bodice.quaternion.copy(tilt).multiply(q);
    const head = gelin.worldOf('Head'), headTop = gelin.b.HeadTop_End ? gelin.worldOf('HeadTop_End') : head.clone().add(new THREE.Vector3(0, 0.18, 0));
    const headDir = headTop.clone().sub(head).normalize();
    const hq = new THREE.Quaternion().setFromUnitVectors(UP, headDir).multiply(q);
    w.veil.position.copy(head).lerp(headTop, 0.75); w.veil.quaternion.copy(hq);
    w.tiara.position.copy(head).lerp(headTop, 0.88);
    w.tiara.quaternion.copy(hq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.35, 0, -Math.PI * 0.1)));
    const chest = damat.worldOf('Spine2');
    w.rose.position.copy(chest).addScaledVector(damat.localDir(0, 0, 1), 0.13).addScaledVector(damat.localDir(1, 0, 0), 0.1).add(new THREE.Vector3(0, 0.1, 0));
  }

  setStyle(name) {
    if (name === this.style || !STYLES[name]) return;
    this.prevStyle = this.style; this.style = name; this.blend = 0;
  }

  templateFor(id, hue, gender) {
    let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    let list = this.templates.filter((t) => !t.def.musicianOnly);
    if (gender) { const g = list.filter((t) => t.def.gender === gender); if (g.length) list = g; }
    return list[Math.abs(h) % list.length];
  }

  // dancers: [{ id, pos, leaving, enter, hue, tierColor, tierLevel, isLeader }]
  update(dt, k) {
    this.dt = dt;
    if (!this.templates.length) return;
    this.blend = Math.min(1, this.blend + dt / 1.6);
    const w = smooth(this.blend);
    const SA = STYLES[this.prevStyle], SB = STYLES[this.style];
    const n = k.dancers.length;

    // halay sıraları: ilk 'capacity' kişi iç halkada, sonrakiler dış halkada
    const rings = C.rings;
    const ringOf = (i) => { let acc = 0; for (let r = 0; r < rings.length; r++) { acc += rings[r].capacity; if (i < acc) return r; } return rings.length - 1; };
    const ringStart = (r) => rings.slice(0, r).reduce((a, x) => a + x.capacity, 0);
    const counts = rings.map(() => 0);
    k.dancers.forEach((d, i) => { counts[ringOf(i)]++; });
    this.ringCounts = counts;

    // halka hareketi (her sıra aynı yürüme hızıyla döner)
    const mv = lerp(SA.move(k.beat), SB.move(k.beat), w);
    const dBeat = Math.max(0, k.beat - (this.lastBeat ?? k.beat)); this.lastBeat = k.beat;
    this.lineAngles ||= rings.map((r, i) => Math.PI / 2 + i * 0.9);
    rings.forEach((r, ri) => { this.lineAngles[ri] -= (mv * Math.min(dBeat, 0.5)) / r.radius; });
    const styleSpacing = lerp(SA.spacing, SB.spacing, w);
    const spacings = rings.map((r, ri) => Math.min(styleSpacing, (TAU * r.radius * 0.94) / Math.max(counts[ri], 1)));
    const spacing = spacings[0];

    // karakterleri eşitle
    const alive = new Set();
    for (const d of k.dancers) {
      alive.add(d.id);
      let ch = this.chars.get(d.id);
      const tpl = this.templateFor(d.id, d.hue, d.gender);
      if (ch && ch.tpl !== tpl) { // kız/erkek değişti: aynı yerde yeni modelle değiştir
        const old = ch; this.scene.remove(old.root);
        ch = new Character(tpl); ch.gpos = old.gpos; this.chars.set(d.id, ch); this.scene.add(ch.root);
      }
      if (!ch) { ch = new Character(tpl); this.chars.set(d.id, ch); this.scene.add(ch.root); }
      if (d.tint) ch.setTint(d.tint);
    }
    for (const [id, ch] of this.chars) if (!alive.has(id)) { this.scene.remove(ch.root); this.chars.delete(id); }

    // yerleşim: sıra değiştiren kişi (ör. dıştan içe geçen) yeni yerine yürüyerek gider
    const smoothA = 1 - Math.exp(-dt * 6);
    const ringIdx = k.dancers.map((d, i) => ringOf(i));
    const places = k.dancers.map((d, i) => {
      const ri = ringIdx[i], R = rings[ri].radius;
      const th = this.lineAngles[ri] + ((d.pos - ringStart(ri)) * spacings[ri]) / R;
      const target = new THREE.Vector3(Math.cos(th) * R, 0, Math.sin(th) * R);
      const ch = this.chars.get(d.id);
      if (!ch.gpos) ch.gpos = target.clone(); else ch.gpos.lerp(target, smoothA);
      const pos = ch.gpos.clone();
      return { pos, yaw: Math.atan2(-pos.x, -pos.z), th }; // yüzü merkeze dönük
    });
    this.updateVisits(k, places, dt);

    // pozlar
    const poses = k.dancers.map((d, i) => {
      const ch = this.chars.get(d.id);
      const kk = { b: k.beat, t: k.t, cosku: k.cosku, i, n, isLeader: d.isLeader, spacing: spacings[ringIdx[i]] };
      if (places[i].visit) return walkPose(ch.m, k.t, places[i].visit.walking);
      return lerpPose(SA.pose(ch.m, kk), SB.pose(ch.m, kk), w);
    });

    // el ele tutuşma noktaları (i ile i+1 arası)
    const holds = [];
    for (let i = 0; i < n - 1; i++) {
      if (ringIdx[i] !== ringIdx[i + 1]) { holds.push(null); continue; } // farklı sıralar el tutuşmaz
      const a = places[i], b = places[i + 1], P = poses[i];
      const mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
      const out = mid.clone().setY(0).normalize();
      holds.push(mid.addScaledVector(out, -P.holdF).setY(P.holdH)); // eller halkanın içine doğru
    }
    // takı takmaya giden kişinin iki yanındaki el tutuşma kopar
    places.forEach((p, i) => { if (p.visit) { if (i > 0) holds[i - 1] = null; if (i < n - 1) holds[i] = null; } });

    this.mendil.visible = false;
    k.dancers.forEach((d, i) => {
      const ch = this.chars.get(d.id), P = poses[i];
      // giriş/çıkış ölçeği
      const s = d.leaving ? Math.max(0.001, 1 - d.leaving / 0.7) : easeOutBack(clamp(d.enter / 0.6, 0, 1));
      ch.root.scale.setScalar(Math.max(0.001, s));
      const hands = {};
      if (P.link > 0.01) {
        if (i > 0 && holds[i - 1]) hands.R = holds[i - 1];
        if (i < n - 1 && holds[i]) hands.L = holds[i];
        if (P.link < 0.99) { // geçişte serbest kola doğru karıştır
          ch.apply(P, places[i], {});
          const fl = ch.worldOf('LeftHand'), fr = ch.worldOf('RightHand');
          if (hands.L) hands.L = fl.clone().lerp(hands.L, P.link);
          if (hands.R) hands.R = fr.clone().lerp(hands.R, P.link);
        }
      }
      const rc = places[i].reach;
      if (rc) { // takı takan el: serbest konumdan kurdeleye uzanır
        const free = ch.local(...(rc.hand === 'L' ? P.lh : P.rh));
        hands[rc.hand] = free.lerp(rc.slot, rc.reach);
      }
      ch.apply(P, places[i], hands);
      // seviye halkası
      ch.aura.material.color.set(d.isLeader ? '#ffd34d' : (d.auraColor || '#ffffff'));
      ch.aura.material.opacity = d.isLeader ? 0.85 : d.auraColor ? 0.55 + 0.25 * Math.sin(k.t * 4 + i) : 0;
      ch.aura.scale.setScalar(d.isLeader ? 1.25 : 1);
      // halaybaşının mendili
      if (d.isLeader && i === 0 && !d.leaving && (P.link > 0.5 || n === 1)) this.placeMendil(ch, k.t);
    });

    this.updateMusicians(k);
    this.updateCouple(k);
    this.updateTaki();
    this.updateLights(k);

    // kamera hafif nefes alsın
    this.updateDirector(dt, k);

    // ekrandaki baş noktaları (isim/avatar için)
    this.anchors.clear();
    this.camera.updateMatrixWorld();
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const anchor = (id, ch) => {
      const head = (ch.b.HeadTop_End ? ch.worldOf('HeadTop_End') : ch.worldOf('Head').add(new THREE.Vector3(0, 0.15, 0)));
      head.y += 0.12 * ch.root.scale.y;
      const depth = -head.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
      if (depth < 0.5) return; // kameranın arkasında
      const p = head.clone().project(this.camera);
      this.anchors.set(id, { x: (p.x + 1) / 2 * this.W, y: (1 - p.y) / 2 * this.H, depth, ppm: this.H / (2 * tanHalf * depth), scale: ch.root.scale.x });
    };
    for (const [id, ch] of this.chars) anchor(id, ch);
    for (const role in this.musicians) anchor(`@${role}`, this.musicians[role]);
    if (this.couple) { anchor('@damat', this.couple.damat); anchor('@gelin', this.couple.gelin); }
  }

  placeMendil(ch, t) {
    const hand = ch.worldOf('RightHand');
    this.mendil.visible = true;
    this.mendil.position.copy(hand);
    this.mendil.rotation.set(0.3 * Math.sin(t * 5), t * 7, 0.4);
    const pos = this.mendil.geometry.attributes.position, base = this.mendilBase;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const d = Math.hypot(x, y);
      pos.setZ(i, Math.sin(d * 14 - t * 16) * 0.05 * d * 3);
    }
    pos.needsUpdate = true;
  }

  updateMusicians(k) {
    const dv = this.musicians.davul, zr = this.musicians.zurna;
    if (!dv || !zr) return;
    const bob = -0.02 * Math.abs(Math.sin(Math.PI * k.beat));
    // davulcu
    const P = basePose(dv.m);
    P.rootY = bob - 0.02; P.lean = 0.04;
    dv.groundQ = new THREE.Quaternion().setFromAxisAngle(UP, dv.place.yaw);
    dv.ground = new THREE.Matrix4().compose(dv.place.pos, dv.groundQ, new THREE.Vector3(1, 1, 1));
    const drumY = dv.m.shoulderY - 0.42;
    const drumC = dv.local(0, drumY + bob, 0.3);
    const hD = clamp(k.hitD / 0.12, 0, 1), hT = clamp(k.hitT / 0.1, 0, 1);
    const rHand = dv.local(-0.3, drumY + 0.05 + 0.3 * smooth(hD), 0.42 - 0.1 * smooth(hD));
    const lHand = dv.local(0.28, drumY + 0.05 + 0.22 * smooth(hT), 0.4);
    P.elbowL = [1, -0.6, -0.3]; P.elbowR = [-1, -0.6, -0.3];
    dv.apply(P, dv.place, { L: lHand, R: rHand });
    this.drum.position.copy(drumC); this.drum.quaternion.copy(dv.groundQ);
    const rh = dv.worldOf('RightHand'), lh = dv.worldOf('LeftHand');
    this.tokmak.position.copy(rh); this.tokmak.lookAt(dv.local(-0.16, drumY + bob, 0.3));
    this.cubuk.position.copy(lh); this.cubuk.lookAt(dv.local(0.16, drumY - 0.05 + bob, 0.3));

    // zurnacı
    const Z = basePose(zr.m);
    Z.rootY = bob - 0.02; Z.lean = -0.04 + 0.04 * Math.sin(k.t * 1.3); Z.yaw = 0.12 * Math.sin(k.t * 0.9);
    zr.groundQ = new THREE.Quaternion().setFromAxisAngle(UP, zr.place.yaw + Z.yaw);
    zr.ground = new THREE.Matrix4().compose(zr.place.pos, zr.groundQ, new THREE.Vector3(1, 1, 1));
    zr.apply(Z, zr.place, {}); // önce baş konumu için
    const head = zr.worldOf('Head');
    const fwd = zr.localDir(0, 0, 1);
    const dir = fwd.clone().multiplyScalar(Math.cos(0.75)).add(new THREE.Vector3(0, -Math.sin(0.75), 0)).normalize();
    const mouth = head.clone().addScaledVector(fwd, 0.11).add(new THREE.Vector3(0, -0.02, 0));
    const zL = mouth.clone().addScaledVector(dir, 0.25), zRr = mouth.clone().addScaledVector(dir, 0.38);
    Z.elbowL = [1, -0.8, 0]; Z.elbowR = [-1, -0.8, 0];
    zr.apply(Z, zr.place, { L: zL, R: zRr });
    this.zurna.position.copy(mouth); this.zurna.lookAt(mouth.clone().add(dir));
  }

  updateLights(k) {
    const col = this.bulbs.geometry.attributes.color, base = this.bulbBase;
    for (let i = 0; i < col.count; i++) {
      const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(k.t * (2 + (i % 3)) + i * 1.7 + k.energy * 6));
      col.setXYZ(i, base[i * 3] * a, base[i * 3 + 1] * a, base[i * 3 + 2] * a);
    }
    col.needsUpdate = true;
    this.fire.intensity = 22 + 6 * Math.sin(k.t * 7) + 4 * Math.sin(k.t * 13) + (k.cosku ? 12 : 0);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; }
