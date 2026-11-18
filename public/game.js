// =====================================================================
//  TikTok Halay — oyun mantığı + arayüz (1080x1920 dikey)
//  3D sahne: scene3d.js · müzik: music.js · ses: audio.js
// =====================================================================
import { Stage } from './scene3d.js';
import { MusicManager } from './music.js';
import { audio, sfx } from './audio.js';

const C = window.HALAY_CONFIG;
const W = 1080, H = 1920, TAU = Math.PI * 2;
const params = new URLSearchParams(location.search);
const TRANSPARENT = params.has('transparent');
if (TRANSPARENT) document.body.classList.add('transparent');

const sceneCanvas = document.getElementById('scene');
const ui = document.getElementById('ui');
const ctx = ui.getContext('2d');
ui.width = W; ui.height = H;
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  for (const c of [sceneCanvas, ui]) { c.style.width = `${W * s}px`; c.style.height = `${H * s}px`; }
}
addEventListener('resize', fit); fit();

const FONT = '"Baloo 2", "Segoe UI", system-ui, sans-serif';
const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
const font = (px, w = 800) => `${w} ${Math.round(px)}px ${FONT}, ${EMOJI}`;

// ---------------------------------------------------------------- yardımcılar
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hashHue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 360; };
const short = (s, n) => { const a = [...String(s || '')]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function pill(text, cx, cy, { size = 30, bg = 'rgba(0,0,0,.55)', fg = '#fff', padX = 18, alpha = 1, stroke = null } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = font(size);
  const w = ctx.measureText(text).width + padX * 2, hh = size * 1.45;
  rrect(ctx, cx - w / 2, cy - hh / 2, w, hh, hh / 2);
  ctx.fillStyle = bg; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + size * 0.06);
  ctx.restore();
  return w;
}

const imgCache = new Map();
function getImg(url) {
  if (!url) return null;
  let im = imgCache.get(url);
  if (!im) {
    im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = url; imgCache.set(url, im);
    if (imgCache.size > 400) imgCache.delete(imgCache.keys().next().value);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

function drawAvatar(u, x, y, r, ring = 'rgba(255,255,255,.9)') {
  const g = ctx, img = getImg(u.avatar);
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.closePath();
  if (img) { g.clip(); g.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else {
    g.fillStyle = `hsl(${u.hue} 65% 50%)`; g.fill();
    g.fillStyle = '#fff'; g.font = font(r * 1.15); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText([...(u.name || '?')][0].toLocaleUpperCase('tr'), x, y + r * 0.08);
  }
  g.restore();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = Math.max(2.5, r * 0.12); g.strokeStyle = ring; g.stroke();
}

// ---------------------------------------------------------------- 3D sahnenin arka planı (gökyüzü, ay, tepeler)
function makeBackground() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const HZ = 860;
  const sky = g.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, '#0b031a'); sky.addColorStop(0.55, '#260b3d'); sky.addColorStop(1, '#5e2142');
  g.fillStyle = sky; g.fillRect(0, 0, W, HZ);
  for (let i = 0; i < 170; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.7})`; const sz = rnd() < 0.15 ? 3 : 2; g.fillRect(rnd() * W, rnd() * (HZ - 160), sz, sz); }
  const moon = g.createRadialGradient(780, 760, 40, 780, 760, 300);
  moon.addColorStop(0, 'rgba(255,214,150,.5)'); moon.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = moon; g.fillRect(0, 400, W, HZ - 400);
  g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(780, 790, 95, 0, TAU); g.fill();
  g.fillStyle = '#1a0922'; g.beginPath(); g.moveTo(0, HZ + 40);
  for (let x = 0; x <= W; x += 30) g.lineTo(x, HZ - 40 + Math.sin(x / 130) * 26 + Math.sin(x / 47) * 9);
  g.lineTo(W, HZ + 40); g.closePath(); g.fill();
  for (const [hx, hw, hh] of [[60, 70, 46], [160, 48, 34], [880, 76, 50], [985, 52, 38]]) {
    const hy = HZ - 18;
    g.fillStyle = '#13061a'; g.fillRect(hx, hy - hh, hw, hh);
    g.beginPath(); g.moveTo(hx - 8, hy - hh); g.lineTo(hx + hw / 2, hy - hh - 24); g.lineTo(hx + hw + 8, hy - hh); g.fill();
    g.fillStyle = '#ffc46b'; g.fillRect(hx + hw * 0.3, hy - hh * 0.62, 10, 12);
  }
  const ground = g.createLinearGradient(0, HZ, 0, H);
  ground.addColorStop(0, '#231019'); ground.addColorStop(1, '#0e0609');
  g.fillStyle = ground; g.fillRect(0, HZ + 20, W, H - HZ - 20);
  return c;
}

// ---------------------------------------------------------------- oyun durumu
const users = new Map();
const dancers = [];
const musicians = { davul: { u: null, timeLeft: 0 }, zurna: { u: null, timeLeft: 0 } };
const emptySeat = () => ({ u: null, timeLeft: 0, coins: 0 });
const couple = { damat: emptySeat(), gelin: emptySeat() };
const particles = [], toasts = [], banners = [];
let energy = 0, coskuTime = 0, leaderId = null, beat = 0, outerOpen = false;
let status = { connected: false, message: 'Sunucuya bağlanılıyor…' };
const votes = Object.fromEntries(C.categories.map((c) => [c.id, 0]));
const voteFlash = Object.fromEntries(C.categories.map((c) => [c.id, 0]));
const lastVote = new Map();
let stage = null, stageError = null;
const music = new MusicManager();


function touchUser(u) {
  let r = users.get(u.id);
  if (!r) { r = { id: u.id, name: u.name || u.id, avatar: u.avatar || '', score: 0, hue: hashHue(u.id) }; users.set(u.id, r); }
  else { if (u.name) r.name = u.name; if (u.avatar) r.avatar = u.avatar; }
  return r;
}
const findDancer = (id) => dancers.find((d) => d.u.id === id && !d.leaving);
const tierOf = (score) => { let t = C.tiers[0]; for (const x of C.tiers) if (score >= x.min) t = x; return t; };

// Halay sırası:
//  • Hediye atan (puanı olan) halayda süresiz kalır.
//  • Yorumla / takip / paylaşımla giren de süresiz kalır, ama halay doluyken yeni biri katılınca
//    yorumla girmiş en eski kişi halaydan çıkar ve yeni gelen onun yerine girer.
//  • Halay tamamen hediyelilerle doluysa yorumla katılım olmaz; hediye atan yine girer (dış sıra sıkışır).
let joinSeq = 0;
const isKept = (d) => d.u.score > 0 || d.kept; // hediyeli ya da panelden korunan
const oldestFree = () => dancers.filter((d) => !d.leaving && !isKept(d)).reduce((a, d) => (!a || d.joined < a.joined ? d : a), null);

function joinHalay(user, { kept = false } = {}) {
  const u = touchUser(user);
  const d = findDancer(u.id);
  if (d) { if (kept) d.kept = true; d.pop = 1; return { dancer: d, isNew: false }; }
  const gifted = kept || u.score > 0;
  if (dancers.filter((x) => !x.leaving).length >= C.maxDancers) {
    const out = oldestFree();
    if (out) { out.leaving = 0.001; const a = anchorOf(out.u.id); sparkle(a.x, a.y, 10, '#ffffff'); }
    else if (!gifted) return { dancer: null, full: true };
  }
  const nd = { u, kept, joined: ++joinSeq, pos: dancers.length + 1.5, pop: 1, enter: 0, bubble: '', bubbleT: 0, leaving: 0 };
  dancers.push(nd);
  joinShot(u.id);
  return { dancer: nd, isNew: true };
}

// Halaya yeni girene kısa yakın çekim. Düşük öncelikli: gelin/damat, davulcu/zurnacı, halaybaşı ve
// yelek çekimleri sürüyorsa ya da sıradaysa çekilmez; onlar gelince bu çekimi keser.
// Arka arkaya çok kişi girince kamera zıplamasın diye iki giriş çekimi arasında bekleme var.
let lastJoinShot = -99;
function joinShot(id) {
  const dur = C.camera.joinShotSeconds ?? 2.5, cooldown = C.camera.joinShotCooldown ?? 8;
  if (!dur) return;
  setTimeout(() => { // karakter sahnede belirsin diye biraz bekle
    const now = performance.now() / 1000;
    if (now - lastJoinShot < cooldown || !findDancer(id)) return;
    if (stage?.focus('dancer', id, dur, 0.5, { queue: false })) lastJoinShot = now;
  }, 700);
}

function anchorOf(id) { return stage?.anchors.get(id) || { x: W / 2, y: 1000, ppm: 120, scale: 1 }; }

// ---------------------------------------------------------------- efektler
const CONFETTI = ['#ff4d6d', '#ffd34d', '#4dd2ff', '#7dff6b', '#c77dff', '#ff9f43', '#ffffff'];
function confetti(n) {
  for (let i = 0; i < n; i++) particles.push({ kind: 'confetti', x: rand(0, W), y: rand(-200, -10), vx: rand(-80, 80), vy: rand(150, 420),
    r: rand(0, TAU), vr: rand(-8, 8), w: rand(10, 20), h: rand(6, 12), c: CONFETTI[i % CONFETTI.length], life: rand(3, 5) });
}
function sparkle(x, y, n = 14, color = '#ffd34d') {
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), sp = rand(120, 360);
    particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, c: color, life: rand(0.6, 1.1), max: 1.1, size: rand(5, 10) }); }
}
function toast(text, color = 'rgba(0,0,0,.72)') { toasts.unshift({ text, color, t: 0 }); if (toasts.length > 3) toasts.length = 3; }
function banner(title, sub = '', color = '#ffd34d') { if (banners.length > 4) banners.splice(1, 1); banners.push({ title, sub, color, t: 0, dur: 3 }); }

// ---------------------------------------------------------------- müzik ve oylama
const catDef = (id) => C.categories.find((c) => c.id === id) || C.categories[0];

function nextCategory() {
  const cur = music.cat;
  const max = Math.max(...Object.values(votes));
  if (max <= 0) return cur;
  const top = C.categories.filter((c) => votes[c.id] === max).map((c) => c.id);
  return top.includes(cur) && top.length === 1 ? cur : (top.find((id) => id !== cur) || top[0]);
}

function startSong(cat) {
  for (const k in votes) votes[k] = 0;
  lastVote.clear();
  music.start(cat);
  const c = catDef(cat);
  banner(`${c.emoji} ${c.name}`, short(music.title, 26), c.color);
}
music.onEnd = () => startSong(nextCategory());

function countVote(user, low) {
  const now = performance.now() / 1000;
  const prev = lastVote.get(user.id) || -99;
  if (now - prev < C.voteCooldownSeconds) return;
  for (const c of C.categories) {
    if (c.keywords.some((k) => low.includes(k))) {
      votes[c.id]++; voteFlash[c.id] = 1; lastVote.set(user.id, now);
      return;
    }
  }
}

// ---------------------------------------------------------------- olaylar
function onEvent(e) {
  switch (e.type) {
    case 'status': status = e; break;
    case 'chat': onChat(e); break;
    case 'gift': onGift(e); break;
    case 'like': onLike(e); break;
    case 'follow': onFollow(e); break;
    case 'share': onShare(e); break;
    case 'skip': music.skip(); break;
    case 'camera': if (e.shot === 'wide') stage?.focus('wide', null, 0, 9); else stage?.focus(e.shot || 'orbit', null, 8, 4); break;
    case 'reset': resetGame(); break;
    case 'admin': adminAction(e); break;
  }
}

// Yönetim panelinden gelen elle müdahaleler
function adminAction(e) {
  const u = e.user?.id ? touchUser(e.user) : null;
  const name = u ? short(u.name, 16) : '';
  switch (e.action) {
    case 'join': {
      if (!u) return;
      const r = joinHalay(u);
      if (r.isNew) { toast(`🕺 ${name} halaya katıldı!`); sfx.pop(); }
      break;
    }
    case 'keep': { const d = u && (findDancer(u.id) || joinHalay(u).dancer); if (d) { d.kept = !e.off; toast(e.off ? `${name} artık sırayla çıkabilir` : `📌 ${name} halayda sabitlendi`); } break; }
    case 'kick': { const d = u && findDancer(u.id); if (d) { d.leaving = 0.001; const a = anchorOf(u.id); sparkle(a.x, a.y, 10, '#ffffff'); } break; }
    case 'score': {
      if (!u) return;
      const before = tierOf(u.score);
      u.score = Math.max(0, u.score + (e.delta || 0));
      const after = tierOf(u.score);
      if (after !== before && after.min > before.min) banner(`✨ ${after.name.toUpperCase()}`, `@${name}`, after.ring);
      break;
    }
    case 'role':
      if (!u) return;
      if (e.role === 'damat' || e.role === 'gelin') seatCouple(e.role, u, e.coins || 0);
      else if (e.role === 'leader') setLeader(u);
      else if (e.role === 'davul' || e.role === 'zurna') setMusician(e.role, u);
      break;
    case 'unrole':
      if (couple[e.role]?.u) { toast(`💍 ${short(couple[e.role].u.name, 14)} ${e.role} koltuğundan kalktı`); couple[e.role] = emptySeat(); }
      else if (musicians[e.role]?.u) musicians[e.role] = { u: null, timeLeft: 0 };
      else if (e.role === 'leader') leaderId = null;
      break;
    case 'category': if (C.categories.some((c) => c.id === e.cat)) startSong(e.cat); break;
    case 'music': setMusicOff(!!e.off); break;
  }
}

function onChat(e) {
  if (!e.user) return;
  const text = String(e.text || ''), low = text.toLocaleLowerCase('tr');
  const name = short(e.user.name, 16);
  countVote(e.user, low);
  // "kız" / "erkek" yazan o modelle oynar
  const words = low.split(/[^a-zçğıöşüâîû0-9]+/);
  const gender = C.femaleKeywords?.some((k) => words.includes(k)) ? 'female' : C.maleKeywords?.some((k) => words.includes(k)) ? 'male' : null;
  if (gender) {
    const ur = touchUser(e.user);
    if (ur.gender !== gender) {
      ur.gender = gender;
      if (findDancer(ur.id)) { const a = anchorOf(ur.id); sparkle(a.x, a.y, 16, gender === 'female' ? '#ff7aa8' : '#5ec8ff'); }
    }
  }
  // Herhangi bir yorum halaya sokar (oy sayımı yukarıda, halayda olup olmamaktan bağımsız)
  let d = findDancer(e.user.id);
  if (!d) {
    const r = joinHalay(e.user);
    if (r.isNew) { d = r.dancer; toast(`🕺 ${name} halaya katıldı!`); sfx.pop(); }
  }
  if (d && C.chatBubbles) { d.bubble = short(text, 26); d.bubbleT = 4.5; }
}

function onGift(e) {
  if (!e.user) return;
  const coins = Math.max(1, Number(e.diamonds) || 1) * Math.max(1, Number(e.count) || 1);
  const u = touchUser(e.user);
  const before = tierOf(u.score);
  u.score += coins;
  const r = joinHalay(u);
  const name = short(u.name, 16);
  if (r.isNew) sfx.pop();
  sfx.chime(coins >= 100 ? 3 : coins >= 10 ? 2 : 1);
  energy = clamp(energy + coins * C.giftEnergy, 0, 1);
  const after = tierOf(u.score);
  if (after !== before && after.min > 0) {
    banner(`✨ ${after.name.toUpperCase()}`, `@${name}`, after.ring);
    if (r.dancer) stage?.focus('dancer', u.id, C.camera.tierShotSeconds ?? 2, 1); // kısa, düşük öncelik
  }
  const role = giftRole(e);
  if (role === 'damat' || role === 'gelin') assignCouple(role, u, coins);
  else if (role === 'davul' || role === 'zurna') setMusician(role, u);
  else if (role === 'leader') setLeader(u);
  else if (C.coupleGift && coins >= C.coupleGift) assignCouple(bigGiftSeat(u), u, coins); // büyük hediye: gelin/damat
  else takiFor(u); // rol vermeyen küçük hediye: gelin ve damada takı takar
  if (coins >= C.confettiGift) confetti(Math.min(220, 30 + coins));
  if (r.dancer) { const a = anchorOf(u.id); sparkle(a.x, a.y - 30, 12 + Math.min(30, coins), after.ring || '#ffd34d'); }
}

// Hediye adı / numarası config.giftRoles içindeki bir rolle eşleşiyor mu?
const normGift = (x) => String(x ?? '').toLocaleLowerCase('tr').normalize('NFC').replace(/\s+/g, ' ').trim();
function giftRole(e) {
  const roles = C.giftRoles || [];
  const byId = roles.find((r) => (r.ids || []).some((id) => String(id) === String(e.giftId)));
  if (byId) return byId.role;
  const n = normGift(e.giftName);
  return roles.find((r) => (r.names || []).some((x) => normGift(x) === n))?.role || null;
}

// Hediye atan halaydan çıkıp gelin ya da damada altın takar, sonra yerine döner.
// Atan kişi zaten gelin/damatsa yürümez, takı doğrudan partnerine takılır.
function takiFor(u) {
  if (!stage) return;
  const own = coupleRoleOf(u.id);
  if (own) { const other = own === 'damat' ? 'gelin' : 'damat'; stage.addTaki(other); onTakiPinned(other); return; }
  stage.takiTak(u.id);
}
function onTakiPinned(role) {
  const a = anchorOf(`@${role}`);
  sparkle(a.x, a.y + a.ppm * 0.55, 18, '#ffd34d');
  sfx.chime(2);
}

function setMusician(role, u) {
  if (musicians[role].u?.id === u.id) { musicians[role].timeLeft = C.musicianSeconds; return; }
  musicians[role] = { u, timeLeft: C.musicianSeconds };
  banner(role === 'davul' ? '🥁 YENİ DAVULCU' : '🎺 YENİ ZURNACI', `@${short(u.name, 16)}`, '#ff8a3d');
  stage?.focus(role, null, 4.5, 2);
  sfx.fanfare();
}

// Damat/gelin: o hediyeyi en son atan koltuğa oturur. Koltuktaki kişi tekrar atarsa süresi yenilenir.
// Büyük hediye atan hangi koltuğa oturur: zaten oturuyorsa kendi koltuğu; "kız"/"erkek" yazdıysa gelin/damat;
// değilse boş koltuk; ikisi de doluysa daha az jeton atmış (eşitse süresi daha az kalmış) olanın koltuğu
function bigGiftSeat(u) {
  const own = coupleRoleOf(u.id);
  if (own) return own;
  if (u.gender === 'female') return 'gelin';
  if (u.gender === 'male') return 'damat';
  const empty = ['damat', 'gelin'].find((r) => !couple[r].u);
  if (empty) return empty;
  const [d, g] = [couple.damat, couple.gelin];
  return d.coins !== g.coins ? (d.coins < g.coins ? 'damat' : 'gelin') : (d.timeLeft <= g.timeLeft ? 'damat' : 'gelin');
}

function assignCouple(role, u, coins) {
  if (couple[role].u?.id === u.id) { couple[role].timeLeft = C.coupleSeconds; couple[role].coins += coins; return; }
  seatCouple(role, u, coins);
}

// Halaybaşı: rol hediyesini (giftRoles → leader) atan halaybaşı olur, başka biri atana ya da halaydan çıkana kadar kalır
function setLeader(u) {
  if (leaderId === u.id) return;
  joinHalay(u, { kept: true });
  leaderId = u.id;
  banner('👑 YENİ HALAYBAŞI', `@${short(u.name, 16)}`, '#ffd34d');
  stage?.focus('dancer', u.id, 4.5, 2);
  sfx.fanfare();
}

function seatCouple(role, u, coins) {
  const name = `@${short(u.name, 16)}`;
  const other = role === 'damat' ? 'gelin' : 'damat';
  if (couple[other].u?.id === u.id) couple[other] = emptySeat(); // aynı kişi iki koltukta olamaz
  const prev = couple[role].u;
  couple[role] = { u, timeLeft: C.coupleSeconds, coins };
  stage?.clearTaki(role);
  stage?.coupleArrive(role);
  stage?.focus('couple', null, 7, 3);
  banner(role === 'damat' ? '🤵 YENİ DAMAT' : '👰 YENİ GELİN', prev ? `${name} koltuğu kaptı!` : name, '#ff7aa8');
  sfx.fanfare();
  confetti(200);
  petals(60);
  if (couple.damat.u && couple.gelin.u) setTimeout(() => {
    banner('💍 MAŞALLAH!', `${short(couple.damat.u?.name, 12)} & ${short(couple.gelin.u?.name, 12)}`, '#ffd34d');
  }, 600);
}

function petals(n) {
  const a = anchorOf('@gelin'), b = anchorOf('@damat');
  const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y);
  for (let i = 0; i < n; i++) particles.push({ kind: 'petal', x: cx + rand(-260, 260), y: cy - rand(80, 420), vx: rand(-20, 20), vy: rand(40, 110),
    r: rand(0, TAU), vr: rand(-3, 3), wob: rand(0, TAU), life: rand(3, 5), max: 5, size: rand(7, 12), c: ['#ff4d6d', '#ff9fb8', '#ffffff', '#ff2e55'][i % 4] });
}

function onLike(e) {
  const n = Math.max(1, Number(e.count) || 1);
  energy = clamp(energy + n * C.likeEnergy, 0, 1);
  const d = e.user && findDancer(e.user.id);
}

function onFollow(e) {
  if (!e.user) return;
  const r = joinHalay(e.user);
  toast(`➕ ${short(e.user.name, 16)} takip etti${r.isNew ? ', halaya katıldı!' : '!'}`, 'rgba(20,90,140,.8)');
  sfx.pop();
}

function onShare(e) {
  if (!e.user) return;
  joinHalay(e.user);
  toast(`↗️ ${short(e.user.name, 16)} yayını paylaştı!`, 'rgba(30,110,60,.8)');
  energy = clamp(energy + 0.05, 0, 1);
  confetti(40);
}

function resetGame() {
  users.clear(); dancers.length = 0; particles.length = 0; toasts.length = 0; banners.length = 0;
  musicians.davul = { u: null, timeLeft: 0 }; musicians.zurna = { u: null, timeLeft: 0 };
  couple.damat = emptySeat(); couple.gelin = emptySeat(); stage?.clearTaki('damat'); stage?.clearTaki('gelin');
  energy = 0; coskuTime = 0; leaderId = null;
  for (const k in votes) votes[k] = 0;
  toast('🔄 Yeni tur başladı!');
}

// ---------------------------------------------------------------- güncelleme
function update(dt, t) {
  if (coskuTime > 0) {
    coskuTime -= dt;
    if (coskuTime <= 0) { coskuTime = 0; energy = 0.55; }
  } else {
    energy = clamp(energy - C.energyDecay * dt, 0, 1);
    if (energy >= 1) { coskuTime = C.coskuSeconds; banner('🔥 COŞKU MODU 🔥', 'Tempo yükseliyor!', '#ff4d6d'); confetti(160); sfx.fanfare(); stage?.focus('orbit', null, 9, 1); }
  }
  const cosku = coskuTime > 0;
  music.update(energy, cosku);
  beat = music.beat();

  for (let i = dancers.length - 1; i >= 0; i--) {
    const d = dancers[i];
    d.enter += dt;
    if (d.leaving) { d.leaving += dt; if (d.leaving > 0.7) dancers.splice(i, 1); continue; }
    d.pop = Math.max(0, d.pop - dt * 2.5);
    d.bubbleT = Math.max(0, d.bubbleT - dt);
  }
  dancers.forEach((d, i) => { d.pos += (i - d.pos) * Math.min(1, dt * 2.5); });
  const outerNow = dancers.filter((d) => !d.leaving).length > C.rings[0].capacity;
  if (outerNow && !outerOpen) { banner('🎉 2. SIRA AÇILDI', 'Halay büyüyor!', '#7dff6b'); confetti(80); }
  outerOpen = outerNow;
  updateLeader();

  for (const k of ['davul', 'zurna']) {
    const m = musicians[k];
    if (m.u) { m.timeLeft -= dt; if (m.timeLeft <= 0) musicians[k] = { u: null, timeLeft: 0 }; }
  }
  for (const r of ['damat', 'gelin']) {
    const c = couple[r];
    if (c.u) { c.timeLeft -= dt; if (c.timeLeft <= 0) { toast(`💍 ${short(c.u.name, 14)} ${r} koltuğundan kalktı`); couple[r] = emptySeat(); stage?.clearTaki(r); } }
  }
  if (couple.damat.u && couple.gelin.u && Math.random() < dt * 1.5) petals(2);
  for (const k in voteFlash) voteFlash[k] = Math.max(0, voteFlash[k] - dt * 3);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0 || p.y > H + 50) { particles.splice(i, 1); continue; }
    if (p.kind === 'confetti') { p.vy += 60 * dt; p.x += (p.vx + Math.sin(p.life * 3) * 40) * dt; p.y += p.vy * dt; p.r += p.vr * dt; }
    else if (p.kind === 'spark') { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    else if (p.kind === 'petal') { p.wob += dt * 3; p.x += (p.vx + Math.sin(p.wob) * 35) * dt; p.y += p.vy * dt; p.r += p.vr * dt; }
  }
  for (const tt of toasts) tt.t += dt;
  while (toasts.length && toasts[toasts.length - 1].t > 5) toasts.pop();
  if (banners.length) { banners[0].t += dt; if (banners[0].t > banners[0].dur) banners.shift(); }

  if (stage) {
    stage.setStyle(music.cat);
    stage.update(dt, {
      beat, t, energy, cosku,
      hitD: music.hitAge('D'), hitT: music.hitAge('T'),
      dancers: dancers.map((d, i) => {
        const tier = tierOf(d.u.score);
        return {
          id: d.u.id, pos: d.pos, leaving: d.leaving, enter: d.enter, gender: d.u.gender || null,
          isLeader: i === 0 && leaderId === d.u.id,
          tint: tier.vest || `hsl(${d.u.hue}, 55%, 52%)`,
          auraColor: tier.ring || null,
        };
      }),
    });
    // elmas seviyesindekilerin etrafında parıltı
    dancers.forEach((d) => {
      if (tierOf(d.u.score).sparkle && Math.random() < 0.15) {
        const a = anchorOf(d.u.id);
        particles.push({ kind: 'spark', x: a.x + rand(-40, 40), y: a.y + rand(0, a.ppm * 1.4), vx: 0, vy: -50, c: '#9ff3ff', life: 0.7, max: 0.7, size: rand(3, 7) });
      }
    });
  }
}

// Kullanıcı şu an damat/gelin koltuğundaysa rolünü döndürür
function coupleRoleOf(id) { return couple.damat.u?.id === id ? 'damat' : couple.gelin.u?.id === id ? 'gelin' : null; }

// Halaybaşı halkanın başında durur; halaydan çıkarsa unvan düşer
function updateLeader() {
  if (!leaderId) return;
  const d = findDancer(leaderId);
  if (!d) { leaderId = null; return; }
  if (dancers[0] !== d) { dancers.splice(dancers.indexOf(d), 1); dancers.unshift(d); }
}

// ---------------------------------------------------------------- arayüz
// Panel arka planı (gölge + degrade + ince kenar) bir kez çizilip önbellekte tutulur
const panelCache = new Map();
function panel(x, y, w, h, accent = '#ffd34d') {
  const key = `${w}x${h}${accent}`, pad = 30;
  let c = panelCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2;
    const g = c.getContext('2d');
    g.save();
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 26; g.shadowOffsetY = 8;
    rrect(g, pad, pad, w, h, 28);
    const bg = g.createLinearGradient(0, pad, 0, pad + h);
    bg.addColorStop(0, 'rgba(48,20,78,.92)'); bg.addColorStop(1, 'rgba(18,7,34,.94)');
    g.fillStyle = bg; g.fill();
    g.restore();
    const br = g.createLinearGradient(0, pad, 0, pad + h);
    br.addColorStop(0, accent); br.addColorStop(0.5, 'rgba(255,255,255,.12)'); br.addColorStop(1, 'rgba(255,255,255,.05)');
    rrect(g, pad + 1, pad + 1, w - 2, h - 2, 27); g.strokeStyle = br; g.lineWidth = 2; g.stroke();
    const shine = g.createLinearGradient(0, pad, 0, pad + 60); // üstte hafif parlama
    shine.addColorStop(0, 'rgba(255,255,255,.10)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); rrect(g, pad, pad, w, h, 28); g.clip(); g.fillStyle = shine; g.fillRect(pad, pad, w, 60); g.restore();
    panelCache.set(key, c);
  }
  ctx.drawImage(c, x - pad, y - pad);
}

function panelTitle(text, x, y, accent) {
  const g = ctx;
  g.fillStyle = accent; rrect(g, x, y - 13, 6, 26, 3); g.fill();
  g.font = font(27); g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(text, x + 16, y + 1);
}

// **vurgulu** kısımları renkli yazan basit zengin metin
function richText(str, x, y, size, color = '#fff', hi = '#ffd34d', weight = 600) {
  const g = ctx; let cx = x;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  String(str).split('**').forEach((part, i) => {
    if (!part) return;
    const bold = i % 2 === 1;
    g.font = font(size, bold ? 800 : weight); g.fillStyle = bold ? hi : color;
    g.fillText(part, cx, y); cx += g.measureText(part).width;
  });
  return cx - x;
}


const RULE_TINT = ['#7c4dff', '#3dc2ff', '#ff6fb1', '#ffb52e', '#ffd34d', '#ff8a3d', '#ff4d8d', '#ff4d6d'];
function drawRulesCard(t) {
  const x = 30, y = 248, w = 500, h = 282, g = ctx;
  panel(x, y, w, h, '#ffd34d');
  panelTitle('NASIL OYNANIR?', x + 22, y + 34, '#ffd34d');
  const rows = C.rules.map((r) => ({ text: r }));
  // az satır varsa satırlar büyür ve karta eşit yayılır
  const avail = h - 60, rh = Math.min(64, avail / rows.length);
  const big = clamp((rh - 30) / 34, 0, 1); // 0 = sık liste, 1 = 3 satırlık geniş görünüm
  const box = 30 + big * 18, fs = Math.min(20.5 + big * 7.5, rh * 0.82);
  const top = y + 52 + (avail - rh * rows.length) / 2;
  rows.forEach((row, i) => {
    const yy = top + rh * (i + 0.5);
    const sp = row.text.indexOf(' ');
    const icon = row.text.slice(0, sp), rest = row.text.slice(sp + 1);
    g.save();
    g.globalAlpha *= row.hot ? 0.45 + 0.3 * Math.sin(t * 5) : 0.3;
    const bh = Math.min(box - 4, rh - 3);
    rrect(g, x + 20, yy - bh / 2, box, bh, 8 + big * 4); g.fillStyle = row.hot ? '#ff4d8d' : RULE_TINT[i % RULE_TINT.length]; g.fill();
    g.restore();
    g.font = font(17 + big * 9); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText(icon, x + 20 + box / 2, yy + 1);
    const maxW = w - (34 + box) - 20; // satır karta sığmazsa yazı küçülür
    g.font = font(fs); const tw = g.measureText(rest.replace(/\*\*/g, '')).width;
    richText(rest, x + 34 + box, yy + 1, tw > maxW ? fs * maxW / tw : fs, row.hot ? '#ffd6e6' : '#f1e9ff', row.hot ? '#ff7aa8' : '#ffd34d');
  });
}

function drawLeaderCard() {
  const x = 550, y = 248, w = 500, h = 282, g = ctx;
  panel(x, y, w, h, '#ffb52e');
  panelTitle('🏆 EN ÇOK COŞTURANLAR', x + 22, y + 34, '#ffb52e');
  const top = [...users.values()].filter((u) => u.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  if (!top.length) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(64); g.fillText('🏆', x + w / 2, y + 160);
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  top.forEach((u, i) => {
    const yy = y + 62 + i * 43, rx = x + 16, rw = w - 32;
    rrect(g, rx, yy, rw, 38, 19);
    if (i === 0) { const gr = g.createLinearGradient(rx, 0, rx + rw, 0); gr.addColorStop(0, 'rgba(255,196,64,.45)'); gr.addColorStop(1, 'rgba(255,196,64,.06)'); g.fillStyle = gr; }
    else g.fillStyle = 'rgba(255,255,255,.06)';
    g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (i < 3) { g.font = font(24); g.fillStyle = '#fff'; g.fillText(medals[i], rx + 22, yy + 20); }
    else { g.font = font(18); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText(String(i + 1), rx + 22, yy + 20); }
    const tier = tierOf(u.score);
    drawAvatar(u, rx + 58, yy + 19, 15, tier.ring || 'rgba(255,255,255,.6)');
    g.textAlign = 'left'; g.font = font(21, 800); g.fillStyle = i === 0 ? '#ffe08a' : '#fff';
    const role = coupleRoleOf(u.id);
    const label = role === 'damat' ? ['🤵 DAMAT', '#ff9fb8'] : role === 'gelin' ? ['👰 GELİN', '#ff9fb8']
      : u.id === leaderId ? ['👑 HALAYBAŞI', '#ffd34d'] : tier.min ? [tier.name.toLocaleUpperCase('tr'), tier.ring] : null;
    g.fillText(short(u.name, 13), rx + 82, yy + (label ? 13 : 20));
    if (label) { g.font = font(14, 700); g.fillStyle = label[1]; g.fillText(label[0], rx + 82, yy + 29); }
    const sc = `💰 ${u.score}`;
    g.font = font(19, 800);
    const sw = g.measureText(sc).width + 20;
    rrect(g, rx + rw - sw - 6, yy + 6, sw, 26, 13); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    g.fillStyle = '#ffd34d'; g.textAlign = 'center'; g.fillText(sc, rx + rw - 6 - sw / 2, yy + 20);
  });
}

function drawMusicCard(cur) {
  const x = 30, y = 248, w = 1020, h = 126, g = ctx;
  panel(x, y, w, h, cur.color);
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = font(15, 800); g.fillStyle = cur.color;
  g.fillText('♪ ŞİMDİ ÇALIYOR', x + 24, y + 22);
  const title = music.mode === 'idle' ? 'Müzik hazırlanıyor…' : `${cur.emoji} ${cur.name} · ${short(music.title, 34)}`;
  g.font = font(24); g.fillStyle = '#fff'; g.fillText(title, x + 24, y + 47);
  g.textAlign = 'right'; g.font = font(17, 700); g.fillStyle = 'rgba(255,255,255,.7)';
  g.fillText('💬 yorumla oy ver', x + w - 24, y + 22);
  g.font = font(20, 800); g.fillStyle = '#fff'; g.fillText(`⏱ ${mmss(music.remaining())}`, x + w - 24, y + 47);
  // şarkı ilerlemesi
  const px = x + 24, pw = w - 48, py = y + 64, prog = clamp(music.elapsed() / Math.max(1, music.duration()), 0, 1);
  rrect(g, px, py, pw, 5, 2.5); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill();
  rrect(g, px, py, Math.max(5, pw * prog), 5, 2.5); g.fillStyle = cur.color; g.fill();
  // oy çubukları
  const totalV = Math.max(1, ...Object.values(votes)), lead = nextCategory();
  const nc = C.categories.length, cw = (w - 48 - 12 * (nc - 1)) / nc, cy = y + 78, chh = 38;
  C.categories.forEach((c, i) => {
    const cx = x + 24 + i * (cw + 12), v = votes[c.id];
    rrect(g, cx, cy, cw, chh, chh / 2); g.fillStyle = 'rgba(255,255,255,.07)'; g.fill();
    if (v > 0) {
      g.save(); rrect(g, cx, cy, cw, chh, chh / 2); g.clip();
      const gr = g.createLinearGradient(cx, 0, cx + cw, 0); gr.addColorStop(0, c.color); gr.addColorStop(1, 'rgba(255,255,255,.35)');
      g.globalAlpha *= 0.6 + 0.4 * voteFlash[c.id]; g.fillStyle = gr; g.fillRect(cx, cy, (cw * v) / totalV, chh); g.restore();
    }
    if (c.id === lead && v > 0) { rrect(g, cx, cy, cw, chh, chh / 2); g.strokeStyle = c.color; g.lineWidth = 3; g.stroke(); }
    g.textAlign = 'left'; g.font = font(20); g.fillStyle = '#fff';
    g.fillText(`${c.emoji} ${c.name}${c.id === music.cat ? ' ♪' : ''}`, cx + 14, cy + chh / 2 + 1);
    const bw = 40; rrect(g, cx + cw - bw - 6, cy + 6, bw, chh - 12, (chh - 12) / 2); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill();
    g.textAlign = 'center'; g.font = font(18, 800); g.fillStyle = v > 0 ? '#fff' : 'rgba(255,255,255,.5)';
    g.fillText(String(v), cx + cw - 6 - bw / 2, cy + chh / 2 + 1);
  });
}

function drawEnergyBar(t, cosku) {
  const g = ctx, bx = 30, by = 388, bw = 1020, bh = 40;
  rrect(g, bx, by, bw, bh, bh / 2); g.fillStyle = 'rgba(18,7,34,.85)'; g.fill();
  const fill = cosku ? coskuTime / C.coskuSeconds : energy;
  if (fill > 0.005) {
    const eg = g.createLinearGradient(bx, 0, bx + bw, 0);
    if (cosku) { const h0 = (t * 200) % 360; eg.addColorStop(0, `hsl(${h0} 90% 60%)`); eg.addColorStop(0.5, `hsl(${(h0 + 120) % 360} 90% 60%)`); eg.addColorStop(1, `hsl(${(h0 + 240) % 360} 90% 60%)`); }
    else { eg.addColorStop(0, '#ff9f43'); eg.addColorStop(0.55, '#ff4d6d'); eg.addColorStop(1, '#ff3df0'); }
    g.save(); rrect(g, bx, by, bw, bh, bh / 2); g.clip();
    g.fillStyle = eg; g.fillRect(bx, by, bw * fill, bh);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(bx, by + 3, bw * fill, bh * 0.35); // parlama
    g.restore();
  }
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
  for (const q of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(bx + bw * q, by + 8); g.lineTo(bx + bw * q, by + bh - 8); g.stroke(); }
  rrect(g, bx, by, bw, bh, bh / 2); g.strokeStyle = 'rgba(255,255,255,.3)'; g.stroke();
  g.font = font(19, 800); const lw = g.measureText('❤️ COŞKU').width + 26;
  rrect(g, bx + 5, by + 5, lw, bh - 10, (bh - 10) / 2); g.fillStyle = 'rgba(160,20,70,.9)'; g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('❤️ COŞKU', bx + 5 + lw / 2, by + bh / 2 + 1);
  g.font = font(21, 800);
  g.fillText(cosku ? `🔥 COŞKU MODU · ${Math.ceil(coskuTime)} sn 🔥` : `%${Math.round(energy * 100)}`, bx + bw / 2 + lw / 2, by + bh / 2 + 1);
}

function bubble(text, x, y, size) {
  const g = ctx;
  g.save();
  g.font = font(size, 600);
  const w = g.measureText(text).width + size * 1.2, h = size * 1.9;
  const bx = clamp(x - w / 2, 10, W - w - 10), by = y - h - size * 0.6;
  rrect(g, bx, by, w, h, h / 2.4); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.moveTo(x - size * 0.4, by + h - 1); g.lineTo(x + size * 0.4, by + h - 1); g.lineTo(x, by + h + size * 0.55); g.closePath(); g.fill();
  g.fillStyle = '#1c1030'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, bx + w / 2, by + h / 2 + 1);
  g.restore();
}

function drawTags(t) {
  const items = dancers.map((d, i) => ({ d, i, a: stage?.anchors.get(d.u.id) })).filter((x) => x.a);
  items.sort((p, q) => q.a.depth - p.a.depth);
  for (const { d, i, a } of items) {
    const isLeader = i === 0 && leaderId === d.u.id;
    const tier = tierOf(d.u.score);
    const sc = clamp(a.ppm / 95, 0.62, 1.5) * clamp(a.scale, 0, 1) * (1 + d.pop * 0.15);
    if (sc < 0.05) continue;
    const r = 23 * sc, fs = 19 * sc;
    const low = false;
    const ax = a.x, ay = a.y - r - 6 * sc;
    ctx.save();
    ctx.globalAlpha = d.leaving ? clamp(1 - d.leaving / 0.6, 0, 1) : 1;
    pill(`${short(d.u.name, 12)}${low ? ' ⏳' : ''}`, ax, a.y + 4 * sc, {
      size: fs, padX: 10 * sc,
      bg: isLeader ? 'rgba(150,100,0,.85)' : low ? 'rgba(160,20,40,.8)' : 'rgba(0,0,0,.6)',
      alpha: low ? 0.55 + 0.45 * Math.sin(t * 10) : 1,
    });
    drawAvatar(d.u, ax, ay, r, isLeader ? '#ffd34d' : tier.ring || 'rgba(255,255,255,.9)');
    if (isLeader) { ctx.font = font(34 * sc); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('👑', ax, ay - r + 8 * sc); }
    ctx.restore();
    if (d.bubbleT > 0) { ctx.save(); ctx.globalAlpha = clamp(d.bubbleT / 0.4, 0, 1); bubble(d.bubble, ax, ay - r - (isLeader ? 26 : 2) * sc, 20 * sc); ctx.restore(); }
  }
  for (const role of ['damat', 'gelin']) {
    const a = stage?.anchors.get(`@${role}`), c = couple[role];
    if (!a) continue;
    const sc = clamp(a.ppm / 95, 0.8, 1.5);
    const icon = role === 'damat' ? '🤵' : '👰';
    const x = a.x + (role === 'damat' ? 1 : -1) * 48 * sc; // etiketler iki yana açılsın
    if (c.u) {
      drawAvatar(c.u, x, a.y - 40 * sc, 25 * sc, '#ff7aa8');
      pill(`${icon} ${short(c.u.name, 10)}`, x, a.y - 2 * sc, { size: 19 * sc, bg: 'rgba(170,20,60,.9)', padX: 10 * sc, stroke: '#ffd34d' });
      pill(`⏱ ${mmss(c.timeLeft)}`, x, a.y + 26 * sc, { size: 15 * sc, bg: 'rgba(0,0,0,.6)', padX: 8 * sc });
    }
  }
  for (const role of ['davul', 'zurna']) {
    const a = stage?.anchors.get(`@${role}`), m = musicians[role];
    if (!a) continue;
    const sc = clamp(a.ppm / 95, 0.75, 1.4);
    if (m.u) {
      pill(`${role === 'davul' ? '🥁' : '🎺'} ${short(m.u.name, 10)} · ${Math.ceil(m.timeLeft)}s`, a.x, a.y + 4 * sc, { size: 18 * sc, bg: 'rgba(190,80,10,.88)', padX: 10 * sc });
      drawAvatar(m.u, a.x, a.y - 30 * sc, 23 * sc, '#ff8a3d');
    } else {
      pill(role === 'davul' ? '🥁 Davulcu' : '🎺 Zurnacı', a.x, a.y + 4 * sc, { size: 17 * sc, bg: 'rgba(0,0,0,.45)', padX: 10 * sc });
    }
  }
}

function drawUI(t) {
  const g = ctx, cosku = coskuTime > 0;
  // başlık
  const bounce = Math.abs(Math.sin(Math.PI * beat)) * 6;
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(88);
  const grad = g.createLinearGradient(0, 140, 0, 230);
  grad.addColorStop(0, '#fff3c4'); grad.addColorStop(1, '#ffb52e');
  const cur = catDef(music.cat);
  const title = `${cur.emoji} ${C.title} ${cur.emoji}`;
  g.lineWidth = 12; g.strokeStyle = '#4a0f2c'; g.strokeText(title, W / 2, 185 - bounce);
  g.fillStyle = grad; g.fillText(title, W / 2, 185 - bounce);
  g.restore();

  // kartlar (yakın çekimde gizlenir)
  const uiA = 1 - (stage?.closeness || 0);
  if (uiA > 0.02) {
  g.save(); g.globalAlpha = uiA;
  drawMusicCard(cur);
  drawEnergyBar(t, cosku);

  g.restore();
  }

  // isimler ve avatarlar
  drawTags(t);

  // bildirimler
  toasts.forEach((tt, i) => {
    const a = clamp(tt.t / 0.25, 0, 1) * clamp((5 - tt.t) / 0.6, 0, 1);
    pill(tt.text, W / 2, 272 + (182 * uiA) + i * 46, { size: 26, bg: tt.color, alpha: a });
  });

  const active = dancers.filter((d) => !d.leaving).length;
  const cap0 = C.rings[0].capacity;
  const countText = !active ? '🕺 Halay boş, bir yorum yaz ilk sen gir!'
    : active <= cap0 ? `🕺 Halayda ${active}/${cap0} kişi`
    : active < C.maxDancers ? `🕺 1. sıra ${cap0}/${cap0} · 2. sıra ${active - cap0}/${C.maxDancers - cap0}`
    : `🕺 Halay dolu ${active}/${C.maxDancers}`;
  pill(countText, W / 2, C.camera.screenY + 300, { size: 27, bg: 'rgba(0,0,0,.55)' });

  // büyük duyuru
  const bn = banners[0];
  if (bn) {
    const p = bn.t, inA = clamp(p / 0.25, 0, 1), outA = clamp((bn.dur - p) / 0.4, 0, 1);
    const sc = 0.6 + 0.4 * (1 - (1 - inA) ** 3);
    g.save(); g.globalAlpha = outA; g.translate(W / 2, 830 - 360 * (1 - uiA)); g.scale(sc, sc); // yakın çekimde yüzleri kapatmasın
    const band = g.createLinearGradient(-W / 2, 0, W / 2, 0);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.2, 'rgba(10,0,20,.82)'); band.addColorStop(0.8, 'rgba(10,0,20,.82)'); band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band; g.fillRect(-W / 2, -95, W, 190);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(76); g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(bn.title, 0, -24);
    g.fillStyle = bn.color; g.fillText(bn.title, 0, -24);
    if (bn.sub) { g.font = font(46); g.fillStyle = '#fff'; g.fillText(bn.sub, 0, 46); }
    g.restore();
  }

  if (!stage) {
    pill(stageError ? `⚠️ ${short(stageError, 60)}` : '⏳ 3D karakterler yükleniyor…', W / 2, 1050, { size: 28, bg: stageError ? 'rgba(160,20,40,.85)' : 'rgba(0,0,0,.6)' });
  }

  g.font = font(22, 600); g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = status.connected ? '#7dff6b' : '#ffd34d';
  g.fillText(`${status.connected ? '●' : '○'} ${status.message || ''}`, 20, H - 24);
}

function drawParticles() {
  const g = ctx;
  for (const p of particles) {
    if (p.kind === 'confetti') {
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = clamp(p.life, 0, 1);
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.3)) + 2); g.restore();
    } else if (p.kind === 'spark') {
      g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.c;
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill(); g.globalAlpha = 1;
    } else if (p.kind === 'petal') {
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = clamp(p.life / 0.8, 0, 1);
      g.fillStyle = p.c; g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, TAU); g.fill(); g.restore();
    }
  }
}

// ---------------------------------------------------------------- döngü
let last = performance.now();
const perf = { update: 0 };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  try {
    const t0 = performance.now();
    update(dt, t);
    perf.update = perf.update * 0.9 + (performance.now() - t0) * 0.1;
    if (stage) stage.render();
    ctx.clearRect(0, 0, W, H);
    drawUI(t);
    drawParticles();
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- başlat
const hint = document.getElementById('hint');
const musicBtn = document.getElementById('musicBtn');
function setMusicOff(off) {
  audio.setMusicMuted(off);
  musicBtn.textContent = off ? '🔇 Müzik kapalı' : '🎵 Müzik açık';
  musicBtn.classList.toggle('off', off);
}
musicBtn.addEventListener('click', () => setMusicOff(!audio.musicMuted));
setMusicOff(audio.musicMuted);
const unlock = () => { audio.ensure(); };
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
audio.ensure();
setInterval(() => { hint.style.display = (C.sound && !audio.muted && !audio.running) ? 'block' : 'none'; }, 700);

(async () => {
  try {
    const st = new Stage(sceneCanvas, W, H, makeBackground(), TRANSPARENT);
    await st.load();
    if (st.loadErrors.length) console.warn('Yüklenemeyen modeller:', st.loadErrors);
    st.style = st.prevStyle = music.cat; st.blend = 1;
    stage = st;
    stage.onTaki = (role) => onTakiPinned(role);
  } catch (err) {
    console.error(err);
    stageError = `3D yüklenemedi: ${err.message || err}`;
  }
})();
requestAnimationFrame(frame);

// ---------------------------------------------------------------- sunucu bağlantısı
let ws = null;
function connectWS() {
  if (location.protocol === 'file:') { status = { connected: false, message: 'Sayfayı sunucudan aç: npm start → http://localhost:3000' }; return; }
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'game' }));
  ws.onmessage = (m) => {
    try {
      const e = JSON.parse(m.data);
      onEvent(e);
      if (e.eid) ws.send(JSON.stringify({ type: 'ack', eid: e.eid })); // yönetim paneline "işlendi" bilgisi
    } catch (err) { console.error(err); }
  };
  ws.onclose = () => { status = { connected: false, message: 'Sunucu bağlantısı yok, tekrar deneniyor…' }; setTimeout(connectWS, 2000); };
}
connectWS();

// Yönetim paneli için oyunun anlık durumu (saniyede bir)
function snapshot() {
  const seat = (s) => (s.u ? { id: s.u.id, name: s.u.name, avatar: s.u.avatar, timeLeft: Math.round(s.timeLeft), coins: s.coins || 0 } : null);
  return {
    dancers: dancers.filter((d) => !d.leaving).map((d) => ({ id: d.u.id, name: d.u.name, avatar: d.u.avatar, score: d.u.score,
      kept: isKept(d), gifted: d.u.score > 0, joined: d.joined, tier: tierOf(d.u.score).name, role: coupleRoleOf(d.u.id) })),
    leaderId, capacity: C.maxDancers, full: dancers.filter((d) => !d.leaving).length >= C.maxDancers, rings: C.rings.map((r) => r.capacity),
    couple: { damat: seat(couple.damat), gelin: seat(couple.gelin) },
    musicians: { davul: seat(musicians.davul), zurna: seat(musicians.zurna) },
    top: [...users.values()].filter((u) => u.score > 0).sort((a, b) => b.score - a.score).slice(0, 15)
      .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, score: u.score })),
    music: { cat: music.cat, title: music.title, left: Math.round(music.remaining()) },
    categories: C.categories.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji })),
    musicOff: audio.musicMuted, votes: { ...votes }, energy: Math.round(energy * 100), cosku: coskuTime > 0,
    rules: { giftRoles: C.giftRoles || [], coupleGift: C.coupleGift || 0 },
  };
}
setInterval(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'state', state: snapshot() })); }, 1000);

function sendSim(evt) {
  if (!evt) return;
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'sim', event: evt }));
  else onEvent(evt);
}
window.Halay = { sendSim, onEvent, music, get stage() { return stage; }, get dancers() { return dancers; } };

// ---------------------------------------------------------------- demo (test olayları yönetim panelinden gönderilir)
const S = window.HalaySim;

if (params.has('demo')) {
  for (let i = 0; i < 14; i++) onEvent(S.make('join', { reuse: 0 }));
  onEvent(S.make('gift', { user: S.pool[3], coins: 30 }));
  onEvent(S.make('gift', { user: S.pool[7], coins: 100 }));
  onEvent(S.make('gift', { user: S.pool[5], coins: 300 })); // demo: damat dolu, gelin koltuğu boş
  setInterval(() => {
    const r = Math.random();
    if (r < 0.25) onEvent(S.make('join', { reuse: 0.2 }));
    else if (r < 0.45) onEvent(S.make('like', { count: 20 }));
    else if (r < 0.65) { const d = dancers[Math.floor(Math.random() * dancers.length)]; onEvent(S.make('comment', d ? { user: d.u } : {})); }
    else if (r < 0.8) onEvent(S.make('vote'));
    else if (r < 0.96) onEvent(S.make('gift', { coins: [1, 1, 5, 10, 30][Math.floor(Math.random() * 5)], reuse: 0.6 }));
    else onEvent(S.make('follow'));
  }, 1500);
}
const style = params.get('style');
music.loadLibrary().then(() => startSong(style && catDef(style).id === style ? style : catDef(C.startCategory).id));

if (params.has('debug')) setInterval(() => console.log('DBG', JSON.stringify({ cat: music.cat, mode: music.mode, beat: beat.toFixed(2), style: stage?.style, prev: stage?.prevStyle, blend: stage?.blend?.toFixed(2), n: dancers.length, updMs: perf.update.toFixed(1) })), 2000);
