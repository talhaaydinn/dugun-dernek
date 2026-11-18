// Test için sahte izleyici ve olay üretici (oyun ekranı ve test paneli ortak kullanır)
window.HalaySim = (() => {
  const first = ['Ayşe', 'Mehmet', 'Zeynep', 'Ahmet', 'Elif', 'Mustafa', 'Fatma', 'Emre', 'Merve', 'Burak',
    'Hatice', 'Yusuf', 'Esra', 'Kerem', 'Selin', 'Hasan', 'Büşra', 'Ömer', 'Derya', 'Can', 'Gül', 'Murat',
    'Ece', 'Serkan', 'Sevgi', 'Oğuz', 'Nur', 'Tolga', 'Melek', 'İbrahim', 'Rojda', 'Baran', 'Dilan', 'Şükrü'];
  const tags = ['34', '06', '27', '21', '61', '44', '35', '63', '01', '42', '_halayci', '.antep', '_tr', '.official'];
  const comments = ['Oley! 🔥', 'Çek halayı!', 'Davulcu abi hızlan!', 'Selam Antep\'ten 👋', 'Bu ne coşku!',
    'Halaybaşı kim?', '❤️❤️❤️', 'Mendili bana ver!', 'Hadi bakalım 💃', 'Düğün var sanki 😂'];
  const gifts = {
    1: 'Gül', 5: 'Parmak Kalp', 10: 'Kahve', 30: 'Dondurma', 100: 'Kalp Eller', 199: 'Gökkuşağı', 300: 'Düğün Pastası', 500: 'Hazine Sandığı',
  };

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const pool = [];
  let seq = 0;

  function newUser(name) {
    const n = name || pick(first);
    const base = n.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '');
    const u = { id: name ? `test_${base}` : `${base}${pick(tags)}_${++seq}`, name: n, avatar: '' };
    if (!pool.find((p) => p.id === u.id)) pool.push(u);
    if (pool.length > 80) pool.shift();
    return u;
  }

  function user(reuse = 0.35, name) {
    if (name) return pool.find((p) => p.id.startsWith('test_') && p.name === name) || newUser(name);
    if (pool.length && Math.random() < reuse) return pick(pool);
    return newUser();
  }

  function make(kind, opts = {}) {
    const u = opts.user || user(opts.reuse ?? 0.35, opts.name);
    switch (kind) {
      case 'join': return { type: 'chat', user: u, text: pick(['halay 🕺', 'halay', 'horon!', 'zeybek 🦅', 'katıl', 'horon horon']) };
      case 'vote': {
        const cat = opts.cat || pick(['halay', 'halay', 'horon', 'horon', 'zeybek', 'parti']);
        const text = { halay: ['halay çalsın', 'halay!!', 'HALAY 🥁'], horon: ['horon olsun', 'horon 🌊', 'karadeniz horonu'], zeybek: ['zeybek', 'zeybek oynayalım 🦅', 'efe zeybek'], parti: ['parti!', 'parti olsun 🎉', 'PARTİ'] }[cat] || [cat];
        return { type: 'chat', user: opts.user || user(opts.reuse ?? 0.6, opts.name), text: pick(text) };
      }
      case 'skip': return { type: 'skip' };
      case 'comment': return { type: 'chat', user: opts.user || user(1, opts.name), text: opts.text || pick(comments) };
      case 'gift': {
        const coins = opts.coins || 1;
        return { type: 'gift', user: u, giftName: opts.giftName || gifts[coins] || 'Hediye', diamonds: coins, count: opts.count || 1 };
      }
      case 'like': return { type: 'like', user: opts.user || user(0.8, opts.name), count: opts.count || 15 };
      case 'follow': return { type: 'follow', user: u };
      case 'share': return { type: 'share', user: u };
      case 'reset': return { type: 'reset' };
      default: return null;
    }
  }

  return { make, user, pool, gifts };
})();
