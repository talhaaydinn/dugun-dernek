// =====================================================================
//  Müzik: public/music/<kategori>/ klasöründeki şarkıları çalar.
//  Klasör boşsa o kategorinin ritminde (halay 4/4, horon 7/8, zeybek 9/8, parti 4/4 elektronik)
//  otomatik bir ezgi üretir. Dans temposu (beat) buradan okunur.
// =====================================================================
import { audio, noiseHit, tone } from './audio.js';

const C = window.HALAY_CONFIG;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// units: ölçüdeki vuruş birimi, groups: dans vuruşlarına bölünüşü, unitRate: dakikadaki birim
const STYLES = {
  halay: {
    units: 8, groups: [2, 2, 2, 2], unitRate: 212, tempoBoost: 0.3, tonic: 587.3, instrument: 'zurna', drone: true,
    scale: [0, 1.5, 3, 5, 7, 8, 10, 12, 13.5, 15],
    rhythm: [[1, 5], [2, 3], [0.5, 1.5]],
    drum: ['D', '', 'T', 'T', 'D', '', 'T', ''],
    drumCosku: ['D', 'T', 'T', 'T', 'D', 'T', 'D', 'T'],
  },
  horon: {
    units: 7, groups: [2, 2, 3], unitRate: 520, tempoBoost: 0.18, tonic: 659.3, instrument: 'kemence', drone: false,
    scale: [0, 2, 3.5, 5, 7, 8.5, 10, 12, 14, 15],
    rhythm: [[1, 9], [2, 1], [0.5, 1]],
    drum: ['D', '', 'T', '', 'T', '', 'T'],
    drumCosku: ['D', 'T', 'T', 'T', 'D', 'T', 'T'],
  },
  zeybek: {
    units: 9, groups: [2, 2, 2, 3], unitRate: 150, tempoBoost: 0.1, tonic: 440, instrument: 'zurna', drone: true,
    scale: [0, 1.1, 4, 5, 7, 8, 10, 12, 13.1],
    rhythm: [[1, 2], [2, 4], [3, 2], [0.5, 1.5]],
    drum: ['D', '', 'T', '', 'D', '', 'T', '', 'T'],
    drumCosku: ['D', '', 'T', '', 'D', 'T', 'T', '', 'T'],
  },
  // Parti: 4/4 elektronik, her vuruşta kick (D), aralarda hi-hat + bas (T)
  parti: {
    units: 8, groups: [2, 2, 2, 2], unitRate: 252, tempoBoost: 0.15, tonic: 440, instrument: 'synth', drone: false,
    scale: [0, 3, 5, 7, 10, 12, 15, 17],
    rhythm: [[1, 5], [2, 2], [0.5, 2]],
    drum: ['D', 'T', 'D', 'T', 'D', 'T', 'D', 'T'],
    drumCosku: ['D', 'T', 'D', 'T', 'D', 'T', 'D', 'D'],
  },
};

// ---------------------------------------------------------------- tempo analizi
// Şarkının ilk ~2.5 MB'ını çözer, davulun alçak frekanslı vuruşlarından tempo (BPM) ve
// ilk vuruşun zamanını bulur. Sonuç tarayıcıda saklanır, aynı şarkı tekrar analiz edilmez.
async function analyzeTempo(url, [minBpm, maxBpm]) {
  const key = `tempo:${url}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.bpm) return c; } catch { /* depolama yok */ }
  const res = await fetch(url, { headers: { Range: 'bytes=0-2500000' } });
  const buf = await res.arrayBuffer();
  const ac = new OfflineAudioContext(1, 1, 44100);
  const audioBuf = await ac.decodeAudioData(buf);
  const sr = audioBuf.sampleRate, ch = audioBuf.getChannelData(0);
  const fps = 100, hop = Math.floor(sr / fps);
  const start = Math.min(Math.floor(sr * 10), Math.max(0, ch.length - sr * 30));
  const end = Math.min(ch.length, start + sr * 60);
  // alçak geçiren filtre (~150 Hz) sonrası enerji zarfı -> başlangıç (onset) gücü
  const k = Math.exp((-2 * Math.PI * 150) / sr);
  let lp = 0, prev = 0;
  const onset = [];
  for (let i = start; i + hop <= end; i += hop) {
    let e = 0;
    for (let j = i; j < i + hop; j++) { lp = k * lp + (1 - k) * ch[j]; e += lp * lp; }
    const le = Math.log(1e-9 + e);
    onset.push(Math.max(0, le - prev)); prev = le;
  }
  const n = onset.length;
  if (n < fps * 8) throw new Error('çok kısa');
  const mean = onset.reduce((a, b) => a + b, 0) / n;
  const o = onset.map((v) => Math.max(0, v - mean));
  // otokorelasyon: 50-220 BPM arası gecikmeler
  let bestLag = 0, bestVal = -1;
  const ac2 = (lag) => { let s = 0; for (let i = 0; i + lag < n; i++) s += o[i] * o[i + lag]; return s / (n - lag); };
  const vals = {};
  for (let lag = Math.floor((60 * fps) / 220); lag <= Math.ceil((60 * fps) / 50); lag++) {
    vals[lag] = ac2(lag);
    if (vals[lag] > bestVal) { bestVal = vals[lag]; bestLag = lag; }
  }
  const a0 = vals[bestLag - 1] ?? bestVal, a2 = vals[bestLag + 1] ?? bestVal; // parabolik inceltme
  const lag = bestLag + (a0 - a2) / (2 * (a0 - 2 * bestVal + a2) || 1) * 1;
  let bpm = (60 * fps) / lag;
  while (bpm > maxBpm) bpm /= 2;
  while (bpm < minBpm) bpm *= 2;
  // faz: vuruş ızgarasını en güçlü vuruşlara hizala
  const period = (60 * fps) / bpm;
  let bestPh = 0, bestSum = -1;
  for (let ph = 0; ph < period; ph += 0.5) {
    let s = 0; for (let t = ph; t < n; t += period) s += o[Math.round(t)] || 0;
    if (s > bestSum) { bestSum = s; bestPh = ph; }
  }
  const out = { bpm: Math.round(bpm * 10) / 10, offset: start / sr + bestPh / fps };
  try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* depolama yok */ }
  return out;
}

function rng(seed) { let s = (seed % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function pickW(list, r) { const tot = list.reduce((a, x) => a + x[1], 0); let v = r() * tot; for (const [x, w] of list) { if ((v -= w) <= 0) return x; } return list[0][0]; }

// Basit halk ezgisi besteleyici: iki motif (A, B), tekrar ve karar (tonik) ile biten cümleler
function compose(S, seed) {
  const r = rng(seed), top = S.scale.length - 1;
  const rhythm = () => {
    const out = []; let u = 0;
    while (u < S.units - 1e-6) {
      let d = pickW(S.rhythm, r);
      if (d === 0.5) { if (u + 1 > S.units) d = S.units - u; else { out.push({ u, d: 0.5 }, { u: u + 0.5, d: 0.5 }); u += 1; continue; } }
      d = Math.min(d, S.units - u); out.push({ u, d }); u += d;
    }
    return out;
  };
  const motif = (start) => {
    let p = start; const ms = [];
    for (let m = 0; m < 2; m++) {
      ms.push(rhythm().map((n) => {
        p = clamp(p + pickW([[0, 2], [1, 4], [-1, 4], [2, 1.5], [-2, 1.5], [3, 0.4], [-3, 0.4]], r), 0, top);
        return { ...n, deg: p };
      }));
    }
    return ms;
  };
  const cadence = (mot, target) => mot.map((meas, mi) => meas.map((n, ni) => {
    if (mi === mot.length - 1 && ni === meas.length - 1) return { ...n, deg: target };
    if (mi === mot.length - 1 && ni === meas.length - 2) return { ...n, deg: clamp(target + 1, 0, top) };
    return { ...n };
  }));
  const A = motif(4), B = motif(Math.min(top, 6));
  const B2 = motif(5);
  return [...A, ...cadence(A, 4), ...B, ...cadence(B, 0), ...A, ...cadence(A, 4), ...B2, ...cadence(B2, 0)];
}

export class MusicManager {
  constructor() {
    this.lib = {};
    this.bags = {};
    this.cat = C.categories[0].id;
    this.mode = 'idle';
    this.onEnd = null;
    this.tempoMul = 1;
    this.cosku = false;
    this.songNo = 0;
    this.title = '';
  }

  async loadLibrary() {
    try { this.lib = await (await fetch('/api/music', { cache: 'no-store' })).json(); } catch { this.lib = {}; }
    return this.lib;
  }
  fileCount(cat) { return (this.lib[cat] || []).length; }
  catDef(cat) { return C.categories.find((c) => c.id === cat) || C.categories[0]; }

  clock() { return audio.running ? audio.ctx.currentTime : performance.now() / 1000; }

  start(cat) {
    this.stop();
    this.cat = cat;
    this.songNo++;
    const files = this.lib[cat] || [];
    if (files.length) this.startFile(this.pickFile(cat, files));
    else this.startSynth(cat);
  }

  skip() { this.finish(); }

  stop() {
    if (this.el) { this.el.pause(); this.el.src = ''; this.el = null; }
    if (this.drone) { try { this.drone.forEach((n) => n.stop()); } catch { /* zaten durmuş */ } this.drone = null; }
    this.mode = 'idle';
  }

  finish() {
    if (this.mode === 'idle') return;
    this.stop();
    if (this.onEnd) this.onEnd();
  }

  // ------------------------------------------------ dosyadan çalma
  pickFile(cat, files) {
    let bag = this.bags[cat];
    if (!bag || !bag.length) { bag = this.bags[cat] = [...files].sort(() => Math.random() - 0.5); }
    return bag.pop();
  }

  startFile(url) {
    const el = new Audio(url);
    el.preservesPitch = true;
    el.volume = audio.muted || audio.musicMuted ? 0 : C.musicVolume;
    this.el = el; this.mode = 'file'; this.blocked = false;
    this.virtualStart = performance.now() / 1000;
    const name = decodeURIComponent(url.split('/').pop()).replace(/\.[a-z0-9]+$/i, '');
    const bpm = /(\d{2,3})\s*bpm/i.exec(name);
    this.bpm = bpm ? Number(bpm[1]) : this.catDef(this.cat).bpm;
    this.beatOffset = 0;
    this.tempoInfo = bpm ? 'dosya adı' : 'varsayılan';
    if (!bpm) {
      analyzeTempo(url, this.catDef(this.cat).bpmRange || [60, 200])
        .then((r) => { if (this.el === el) { this.bpm = r.bpm; this.beatOffset = r.offset; this.tempoInfo = 'analiz'; } })
        .catch((err) => console.warn('Tempo bulunamadı:', url, err?.message || err));
    }
    this.title = name.replace(/[_-]+/g, ' ').replace(/\s*\d{2,3}\s*bpm/i, '').trim();
    el.addEventListener('ended', () => this.el === el && this.finish());
    el.addEventListener('error', () => { if (this.el === el) { console.warn('Şarkı çalınamadı:', url); this.el = null; this.startSynth(this.cat); } });
    el.play().catch(() => { this.blocked = true; });
  }

  // ------------------------------------------------ üretilen ezgi
  startSynth(cat) {
    const S = STYLES[cat] || STYLES.halay;
    this.S = S; this.mode = 'synth';
    this.song = compose(S, Math.floor(Math.random() * 1e9));
    this.unit = 0;
    this.clockKind = audio.running ? 'ac' : 'perf';
    this.nextT = this.clock() + 0.08;
    this.startT = this.nextT;
    this.hist = [];
    this.hits = { D: -9, T: -9 };
    this.hitQueue = [];
    this.lastFreq = 0;
    this.drone = null;
    this.title = `${this.catDef(cat).name.charAt(0)}${this.catDef(cat).name.slice(1).toLocaleLowerCase('tr')} ezgisi #${this.songNo}`;
  }

  unitDur() { return 60 / (this.S.unitRate * this.tempoMul); }

  startDrone() {
    if (!this.S.drone || !audio.running || this.drone) return;
    const ac = audio.ctx, f = this.S.tonic / 2, t = ac.currentTime;
    const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f;
    const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 1.003;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 1.5);
    o1.connect(bp); o2.connect(bp); bp.connect(g).connect(audio.musicBus);
    o1.start(t); o2.start(t);
    this.drone = [o1, o2];
  }

  playNote(t, deg, dur) {
    const S = this.S, ac = audio.ctx, out = audio.musicBus;
    const f = S.tonic * 2 ** (S.scale[deg] / 12);
    const from = this.lastFreq || f; this.lastFreq = f;
    if (S.instrument === 'zurna') {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.025);
      g.gain.setValueAtTime(0.16, t + Math.max(0.03, dur - 0.05));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.9;
      const lfo = ac.createOscillator(); lfo.frequency.value = 5.6;
      const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.008, t + Math.min(0.25, dur));
      lfo.connect(lg);
      for (const [type, mul] of [['sawtooth', 1], ['square', 1.002]]) {
        const o = ac.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(from * mul, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.03);
        lg.connect(o.frequency); o.connect(bp); o.start(t); o.stop(t + dur + 0.06);
      }
      bp.connect(g).connect(out); lfo.start(t); lfo.stop(t + dur + 0.06);
    } else if (S.instrument === 'synth') { // parti: parlak synth
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.08, dur * 0.9));
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(900, t + Math.max(0.08, dur * 0.9));
      for (const [type, mul] of [['sawtooth', 1], ['square', 1.006], ['sawtooth', 0.5]]) {
        const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f * mul, t);
        o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
      }
      lp.connect(g).connect(out);
    } else { // kemençe
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
      const bp = ac.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 1200; bp.gain.value = 6;
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.015);
      const lfo = ac.createOscillator(); lfo.frequency.value = 6.5;
      const lg = ac.createGain(); lg.gain.value = f * 0.007; lfo.connect(lg).connect(o.frequency);
      o.connect(lp).connect(bp).connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
      tone(out, t, 'triangle', f * 2, f * 2, 0.025, dur);
    }
  }

  playDrum(t, kind, heavy) {
    const out = audio.musicBus;
    if (this.cat === 'parti') { // kick + hi-hat + pompalayan bas
      if (kind === 'D') { tone(out, t, 'sine', 160, 42, 1.0, 0.28, 0.002); noiseHit(out, t, 'lowpass', 180, 0.18, 0.05); }
      else { noiseHit(out, t, 'highpass', 7500, 0.13, 0.04); tone(out, t, 'sawtooth', this.S.tonic / 4, this.S.tonic / 4, 0.09, 0.14); }
      return;
    }
    if (kind === 'D') {
      tone(out, t, 'sine', heavy ? 105 : 125, heavy ? 38 : 45, heavy ? 1.0 : 0.85, heavy ? 0.6 : 0.42);
      noiseHit(out, t, 'lowpass', 280, 0.3, 0.12);
    } else {
      noiseHit(out, t, 'highpass', 2600, 0.22, 0.06);
      tone(out, t, 'triangle', 820, 620, 0.1, 0.05);
    }
  }

  scheduleUnit(i, t, ud) {
    const S = this.S;
    const meas = this.song[Math.floor(i / S.units) % this.song.length];
    const u = i % S.units;
    const playing = audio.running && this.clockKind === 'ac';
    for (const n of meas) {
      if (n.u >= u && n.u < u + 1 && playing) this.playNote(t + (n.u - u) * ud, n.deg, n.d * ud * 0.96);
    }
    const kind = (this.cosku ? S.drumCosku : S.drum)[u];
    if (kind) {
      if (playing) this.playDrum(t, kind, this.cat === 'zeybek');
      this.hitQueue.push({ kind, t });
    }
    this.hist.push({ i, t, d: ud });
    if (this.hist.length > 48) this.hist.shift();
  }

  // ------------------------------------------------ her karede çağrılır
  update(energy, cosku) {
    this.cosku = cosku;
    if (this.mode === 'file') {
      const boost = 1 + (cosku ? 0.14 : 0.08 * energy);
      if (this.el) {
        this.el.playbackRate = boost;
        this.el.volume = audio.muted || audio.musicMuted ? 0 : C.musicVolume * this.fadeGain();
        if (this.blocked && audio.running) { // tarayıcı otomatik oynatmayı engellemişti, şimdi devam et
          this.blocked = false;
          try { this.el.currentTime = this.elapsed(); } catch { /* yok say */ }
          this.el.play().catch(() => { this.blocked = true; });
        }
      }
      if (C.maxSongSeconds > 0 && this.elapsed() >= C.maxSongSeconds) this.finish();
      else if (this.blocked && this.elapsed() >= (C.maxSongSeconds || 180)) this.finish();
      return;
    }
    if (this.mode !== 'synth') return;
    const S = this.S;
    this.tempoMul = 1 + (cosku ? S.tempoBoost * 1.3 : S.tempoBoost * energy);

    // saat kaynağı değiştiyse (ses kilidi açıldı) zamanlamayı kaydır
    const kind = audio.running ? 'ac' : 'perf';
    if (kind !== this.clockKind) {
      const shift = (kind === 'ac' ? audio.ctx.currentTime : performance.now() / 1000) + 0.06 - this.nextT;
      this.nextT += shift; this.startT += shift;
      this.hist.forEach((h) => { h.t += shift; });
      this.hitQueue.forEach((h) => { h.t += shift; });
      this.clockKind = kind;
    }
    if (audio.running) this.startDrone();

    const now = this.clock();
    const endUnits = Math.ceil((C.synthSongSeconds * S.unitRate) / 60 / S.units) * S.units;
    while (this.nextT < now + 0.15 && this.unit < endUnits) {
      const ud = this.unitDur();
      this.scheduleUnit(this.unit, this.nextT, ud);
      this.nextT += ud; this.unit++;
    }
    while (this.hitQueue.length && this.hitQueue[0].t <= now) { const h = this.hitQueue.shift(); this.hits[h.kind] = h.t; }
    if (this.unit >= endUnits && now > this.nextT + 0.4) this.finish();
  }

  fadeGain() {
    if (!(C.maxSongSeconds > 0)) return 1;
    return clamp((C.maxSongSeconds - this.elapsed()) / 3, 0, 1);
  }

  elapsed() {
    if (this.mode === 'file') return this.blocked || !this.el ? performance.now() / 1000 - this.virtualStart : this.el.currentTime;
    if (this.mode === 'synth') return Math.max(0, this.clock() - this.startT);
    return 0;
  }

  duration() {
    if (this.mode === 'file') {
      const d = this.el && Number.isFinite(this.el.duration) ? this.el.duration : 180;
      return C.maxSongSeconds > 0 ? Math.min(d, C.maxSongSeconds) : d;
    }
    if (this.mode === 'synth') return C.synthSongSeconds;
    return 0;
  }

  remaining() { return Math.max(0, this.duration() - this.elapsed()); }

  // Dans vuruşu: sürekli artan sayı (1 = bir dans adımı)
  beat() {
    if (this.mode === 'file') { // vuruş fazı hizalı, hep pozitif
      const bps = this.bpm / 60;
      return (this.elapsed() - this.beatOffset) * bps + Math.ceil(this.beatOffset * bps);
    }
    if (this.mode !== 'synth' || !this.hist.length) return 0;
    const now = this.clock(), S = this.S;
    let h = this.hist[0];
    for (const x of this.hist) { if (x.t <= now) h = x; else break; }
    const unitPos = h.i + clamp((now - h.t) / h.d, 0, 1.5);
    const m = Math.floor(unitPos / S.units), u = unitPos - m * S.units;
    let acc = 0;
    for (let g = 0; g < S.groups.length; g++) {
      if (u < acc + S.groups[g] || g === S.groups.length - 1) return m * S.groups.length + g + clamp((u - acc) / S.groups[g], 0, 1);
      acc += S.groups[g];
    }
    return 0;
  }

  // Davulcunun tokmak/çubuk vuruşu için: son vuruştan bu yana geçen süre
  hitAge(kind) {
    if (this.mode === 'synth') return this.clock() - this.hits[kind];
    const spb = 60 / (this.bpm || 100), b = this.beat();
    return kind === 'D' ? (b % 2) * spb : ((b + 0.5) % 1) * spb;
  }
}
export { analyzeTempo };
