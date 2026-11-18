// =====================================================================
//  HALAY OYUNU AYARLARI — buradaki değerleri değiştirip sayfayı yenile.
//  "jeton" = hediyenin TikTok jeton değeri (Gül = 1 jeton).
// =====================================================================
window.HALAY_CONFIG = {
  title: 'HALAY ZAMANI',

  // ---------------- müzik kategorileri
  // Yorumda kelimesi en çok geçen kategoriden bir sonraki şarkı çalar.
  // Şarkılar: public/music/<id>/ klasörüne mp3 koy. Klasör boşsa otomatik ezgi çalar.
  // Dosya adına "120bpm" yazarsan dans o tempoya uyar (ör. "davul-zurna 118bpm.mp3").
  categories: [
    // bpm: tempo bulunamazsa kullanılır. bpmRange: otomatik tempo analizinin kabul aralığı
    { id: 'halay',  name: 'HALAY',  emoji: '🥁', keywords: ['halay'],             bpm: 106, bpmRange: [80, 160],  color: '#ff8a3d' },
    { id: 'horon',  name: 'HORON',  emoji: '🌊', keywords: ['horon', 'karadeniz'], bpm: 150, bpmRange: [110, 220], color: '#3dc2ff' },
    { id: 'zeybek', name: 'ZEYBEK', emoji: '🦅', keywords: ['zeybek', 'efe'],      bpm: 66,  bpmRange: [45, 90],   color: '#c77dff' },
    { id: 'parti',  name: 'PARTİ',  emoji: '🎉', keywords: ['parti'],             bpm: 124, bpmRange: [95, 140],  color: '#ff3df0' },
  ],
  startCategory: 'halay',
  voteCooldownSeconds: 2,   // aynı kişinin oyları arasında en az kaç saniye
  maxSongSeconds: 150,      // dosyadan çalan şarkı en fazla kaç saniye (0 = sonuna kadar)
  synthSongSeconds: 75,     // otomatik ezgi kaç saniye

  // ---------------- katılım
  // Herhangi bir yorum yazan (ya da takip eden / paylaşan) halaya katılır. Süre yoktur.
  // Hediye atan halayda süresiz kalır. Halay doluyken yeni biri gelince yorumla girmiş en eski kişi çıkar.

  // Toplam puana (jeton) göre seviye: kıyafet rengi + ayağının altında parlayan halka
  tiers: [
    { min: 0,   name: 'Halaycı' },
    { min: 10,  name: 'Renkli Yelek', vest: '#d62f62', ring: '#ff5c8a' },
    { min: 50,  name: 'Altın Yelek',  vest: '#e8b130', ring: '#ffd34d' },
    { min: 200, name: 'Elmas Yelek',  vest: '#39c6f0', ring: '#9ff3ff', sparkle: true },
  ],

  // ---------------- hediyeye özel roller
  // Hediyenin adı (names) ya da TikTok hediye numarası (ids) eşleşirse o rol verilir. O hediyeyi en son atan rolü alır.
  // role: damat · gelin · davul · zurna · leader (halaybaşı)
  // TikTok hediye adını bazen İngilizce gönderir. Emin olmak için hediyeyi bir kez at, yönetim panelinde
  // ve terminalde görünen adı ya da #numarayı buraya ekle (ör. ids: [5655]). Büyük/küçük harf fark etmez.
  giftRoles: [
    { role: 'damat',  label: 'Taç',          names: ['Taç', 'Crown'],                             ids: [] },
    { role: 'gelin',  label: 'Çiçekten Taç', names: ['Çiçekten Taç', 'Çiçek Taç', 'Flower Crown'], ids: [] },
    { role: 'davul',  label: 'Çay',          names: ['Çay', 'Tea'],                               ids: [] },
    { role: 'zurna',  label: 'Donut',        names: ['Donut', 'Doughnut'],                        ids: [] },
    { role: 'leader', label: 'Kalp',         names: ['Kalp', 'Heart'],                            ids: [] },
  ],
  musicianSeconds: 180,     // davulcu / zurnacı kaç saniye kalır (aynı hediyeyi tekrar atınca yenilenir)
  coupleSeconds: 300,       // damat / gelin kaç saniye kalır
  // halaybaşı: başka biri o hediyeyi atana ya da halaydan çıkana kadar kalır
  // Rol hediyesi olmayan, tek seferde bu kadar (ve üstü) jetonluk hediye atan gelin ya da damat olur (takı takmaz).
  // Yorumunda "kız" yazmışsa gelin, "erkek" yazmışsa damat; bilinmiyorsa boş koltuk, ikisi de doluysa
  // daha az jeton atmış olanın koltuğu. 0 = kapalı.
  coupleGift: 199,
  confettiGift: 20,

  // ---------------- coşku
  likeEnergy: 0.0025,
  giftEnergy: 0.004,
  energyDecay: 0.012,
  coskuSeconds: 20,

  // ---------------- 3D sahne
  ringRadius: 4.6,          // iç halkanın yarıçapı (metre)
  // Halay sıraları: iç halka dolunca dışta 2. sıra açılır. Kapasiteyi artırmak bilgisayarı yorar.
  rings: [
    { radius: 4.6, capacity: 30 },
    { radius: 6.0, capacity: 40 },
  ],
  camera: {
    fov: 34, pitch: 27, margin: 0.55, screenY: 1090,
    closeScreenY: 880,          // yakın çekimde hedefin ekrandaki yüksekliği
    director: true,             // kamera ara sıra kendiliğinden açı değiştirsin ve olaylarda yakınlaşsın
    autoShotEvery: [18, 30],    // kendiliğinden açı değişimi kaç saniyede bir (en az, en çok)
    tierShotSeconds: 2,         // yelek değişiminde kamera o kişide kaç saniye kalsın
    joinShotSeconds: 2.5,       // halaya yeni girene kaç saniye yaklaşsın (0 = kapalı)
    joinShotCooldown: 8,        // iki "yeni giren" çekimi arasında en az kaç saniye olsun
    takiShotSeconds: 3,         // biri gelin/damada takı takarken kamera çifte kaç saniye yaklaşsın (0 = kapalı)
    takiShotCooldown: 6,        // iki takı çekimi arasında en az kaç saniye olsun
  },
  // Karakter modelleri (Mixamo iskeletli .glb veya .fbx). Kendi modellerini public/models/ klasörüne koyup buraya ekle.
  // tint: kıyafet renginin değişeceği malzeme adları. musician: davulcu/zurnacı için bu model kullanılsın.
  models: [
    // groom: damat için, bride: gelin için kullanılacak model
    // gender: yorumunda "kız" / "erkek" yazana bu modeller verilir
    { file: 'models/readyplayer.me.glb', height: 1.78, tint: ['Outfit_Top'], musician: true, groom: true, gender: 'male' },
    { file: 'models/Michelle.glb', height: 1.68, bride: true, gender: 'female' },
  ],

  // ---------------- ses
  sound: true,
  musicVolume: 0.7,
  sfxVolume: 0.6,
  chatBubbles: true,

  // Yorumda bu kelimelerden biri tek kelime olarak geçerse karakteri kız / erkek olur
  femaleKeywords: ['kız'],
  maleKeywords: ['erkek'],
};

// Ekrandaki kurallar kartı. **yıldızlı** kısımlar vurgulu yazılır. Ekranda jeton miktarı yazılmaz.
// Satır ekleyip çıkarabilirsin; az satır olunca yazı büyür.
(() => {
  const C = window.HALAY_CONFIG;
  C.maxDancers = C.rings.reduce((a, r) => a + r.capacity, 0);
  C.rules = [
    `💬 **Yorum yaz** → halaya katıl`,
    `🎵 **halay/horon/zeybek/parti** → şarkı seç`,
    `❤️ **Beğeni at** → tempo artar`,
  ];
})();
