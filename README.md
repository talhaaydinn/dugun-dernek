# 🥁 TikTok Halay

TikTok canlı yayını için interaktif 3D halay oyunu. İzleyiciler yorum, beğeni, takip ve hediyeyle halkaya katılır. Halay, horon, zeybek oynarlar ya da parti yaparlar. Bir sonraki şarkının hangi kategoriden çalacağına da yorumlarla izleyiciler karar verir.

## Kurulum

[Node.js](https://nodejs.org) 20 veya üstü gerekli.

```bash
npm install
```

## Çalıştırma

```bash
npm start                      # test modu (TikTok'a bağlanmaz)
npm start -- kullaniciadi      # @kullaniciadi canlı yayınına bağlanır
```

| Adres | Ne işe yarar |
|---|---|
| http://localhost:3000/ | Oyun ekranı (OBS / LIVE Studio'ya bu eklenir) |
| http://localhost:3000/?demo | Sahte izleyicilerle kendi kendine oynayan önizleme |
| http://localhost:3000/?style=horon | Belirli bir kategoriyle başlat (halay / horon / zeybek / parti) |
| http://localhost:3000/admin.html | **Yönetim paneli:** gelen hediyeler, işlenmeyeni tekrar uygula, elle hediye/rol/süre ver |
| http://localhost:3000/panel.html | Test paneli: sahte hediye, yorum, oy gönder, şarkıyı geç |
| http://localhost:3000/?transparent | Arka plansız |

## Yayına ekleme

**TikTok LIVE Studio** veya **OBS**'de:
1. Kaynak ekle → **Tarayıcı (Browser Source)**
2. URL `http://localhost:3000/`, genişlik **1080**, yükseklik **1920**
3. "Sesi OBS üzerinden kontrol et" seçeneğini işaretle (müzik bu kaynaktan gelir)
4. OBS ayarlarında **tarayıcı kaynağı donanım hızlandırma** açık olsun (3D için)

## Oyun kuralları

| İzleyici ne yapar | Ne olur |
|---|---|
| **Herhangi bir yorum** yazar (ya da takip eder / paylaşır) | Halkaya katılır |
| Yorumda **halay / horon / zeybek / parti** yazar | O kategoriye **oy** verir (halayda olmasa da sayılır) |
| Halka 30 kişiyle dolar | Dışta **2. sıra** açılır (40 kişi daha, toplam 70). Kamera geri çekilir |
| Halay 70 kişiyle doluyken yeni biri katılır | **Yorumla girmiş en eski kişi** halaydan çıkar, yeni gelen onun yerine girer. Süre yoktur |
| Halaydayken yorum yazar | Yorumu kafasının üstünde balon olarak çıkar |
| Yorumda tek kelime olarak **kız** / **erkek** yazar | Karakteri kız / erkek modeline döner (`config.js` → `femaleKeywords`, `maleKeywords`) |
| Hediye atar | Halkaya girer ve **süresiz** kalır, sırayla çıkarılmaz. Her jeton +1 puan |
| 10 / 50 / 200 puana ulaşır | Kıyafeti renklenir, ayağının altında parlayan halka çıkar |
| **Taç** atar | 5 dk 🤵 **damat** olur. Ortadaki kırmızı halıda gelinle el ele oynar |
| **Çiçekten Taç** atar | 5 dk 👰 **gelin** olur |
| **Çay** atar | 3 dk 🥁 **davulcu** olur (yüzü davulcunun üstünde) |
| **Donut** atar | 3 dk 🎺 **zurnacı** olur |
| **Kalp** atar | 👑 **Halaybaşı** olur, en önde mendil sallar. Başka biri kalp atana ya da halaydan çıkana kadar kalır |
| Rol vermeyen, tek seferde **199+ jetonluk** bir hediye atar | 💍 5 dk **gelin** ya da **damat** olur (takı takmaz). "kız" yazmışsa gelin, "erkek" yazmışsa damat; değilse boş koltuk, ikisi de doluysa daha az jeton atmış olanın koltuğu (`config.js` → `coupleGift`) |
| Rol vermeyen, 199'dan küçük bir hediye atar (ör. Gül) | **Takı takar:** halaydan çıkıp gelinin ya da damadın yanına yürür, göğsündeki kırmızı kurdeleye altın takar ve yerine döner. Halkanın sağ yarısındakiler damada, sol yarısındakiler geline gider. Aynı anda en fazla iki kişi gider, diğerleri sıra bekler. Altınlar koltuğa yeni biri oturunca sıfırlanır |
| Beğeni atar | Coşku dolar, müzik ve dans hızlanır. Dolunca **COŞKU MODU** |

### Gelin & damat

Merkezde, kırmızı halının üstünde gelin ve damat el ele oynar. Gelinde beyaz gelinlik, kırmızı kuşak, duvak ve taç var. Damatta siyah takım ve yaka gülü var. Koltuk boşken varsayılan bir çift isimsiz oynar. Taç atan damat, Çiçekten Taç atan gelin olur. Koltuk doluyken aynı hediyeyi atan yeni kişi koltuğu kapar, koltuktaki kişi tekrar atarsa süresi yenilenir. İkisi de doluyken gül yaprakları yağar. Süre `config.js` → `coupleSeconds`.

### Hediyeye özel roller

Hangi hediyenin hangi rolü verdiği `config.js` → `giftRoles` listesinde. Zurnacı için de satır eklenebilir (`role: 'zurna'`). Ekrandaki kurallar kartı bu listeden otomatik oluşur.

TikTok hediye adını bazen İngilizce gönderir (ör. "Crown"). Emin olmak için yayında yedek hesaptan hediyeyi bir kez at. Yönetim panelinde ve terminalde görünen adı ya da `#numarayı` ilgili satırın `names` veya `ids` kısmına ekle. Numara dil değişse de aynı kalır, en güvenlisi odur.

### Kamera

Dansçılar halkanın merkezine, yani gelin ile damada dönük oynar. Kamera normalde geniş açıdadır, ama 18–30 saniyede bir kendiliğinden açı değiştirir: halkanın etrafında döner, alçaktan süzülür, gelin-damada ya da müzisyenlere yaklaşır. Olaylarda otomatik yakın çekim yapar:

| Olay | Kamera |
|---|---|
| Yeni gelin / damat | Çifte yaklaşır. Yeni gelen kenardan yürüyerek gelip partnerinin elini tutar |
| Biri yeni yelek kazanır | 2 saniyeliğine o kişinin yüzüne yaklaşır (`camera.tierShotSeconds`) |
| Biri halaya girer | 2.5 saniyeliğine ona yaklaşır (`camera.joinShotSeconds`). En düşük öncelik: gelin/damat, müzisyen, halaybaşı veya yelek çekimi sürüyorsa yapılmaz. Kamera zıplamasın diye en fazla 8 saniyede bir (`camera.joinShotCooldown`) |
| Yeni halaybaşı | Halaybaşına yaklaşır |
| Yeni davulcu / zurnacı | O müzisyene yaklaşır |
| Coşku modu | Halkanın etrafında döner |

Yakın çekimde üstteki kartlar gizlenir, sonra geri gelir. Test panelinden kamerayı elle de değiştirebilirsin. Kendiliğinden açı değişimini kapatmak için `config.js` → `camera.director: false` yap.

### Müzik ve dans stilleri

Şarkı bitince en çok yorumlanan kategoriden yeni şarkı başlar. Dansçılar da o kategorinin figürüne geçer:

- **Halay:** el ele omuz hizası, sağa iki adım, tekme, vuruş. Halaybaşı mendil sallar.
- **Horon:** omuz omuza sıkı dizilim, eller aşağıda kenetli, sürekli titreme
- **Zeybek:** geniş aralık, kollar iki yana açık, ağır dönüşler ve diz çökme
- **Parti:** el ele tutuşma yok, herkes yerinde zıplar ve sağa sola adım atar. Figürler: tek yumruk havada, iki el havada sallama, omuz dansı (komşular farklı figürde). Coşku modunda herkes iki elini kaldırıp zıplar.

Kendi şarkılarının temposu (BPM) ve vuruş zamanı otomatik bulunur, dansçılar şarkıya oturur. Analiz şarkı başına yaklaşık 0.3 sn sürer ve sonuç saklanır. Şarkılar `public/music/halay`, `public/music/horon`, `public/music/zeybek` ve `public/music/parti` klasörlerine konur (ayrıntı: `public/music/BENIOKU.txt`). Klasör boşsa o kategorinin kendi ritminde (halay 4/4, horon 7/8, zeybek 9/8, parti 4/4 elektronik) otomatik bir ezgi çalar.

> ⚠️ Telifli şarkı koyma. TikTok canlı yayında telifli müziği algılayınca sesi kısabiliyor ya da yayını kapatabiliyor.

## 3D karakterler

Varsayılan iki model `public/models/` içinde. Bunlar three.js örneklerinden alındı: Ready Player Me erkek avatar ve Mixamo "Michelle". Dans hareketleri hazır animasyon değil. Kemikler her karede kodla (ters kinematik) hesaplanıyor. Bu sayede eller gerçekten komşunun eline bağlanıyor.

**Daha gerçekçi ya da farklı karakter eklemek için:**
1. [mixamo.com](https://www.mixamo.com)'a ücretsiz Adobe hesabıyla gir, bir karakter seç.
2. **Download** → Format: **FBX Binary**, Pose: **T-pose**, animasyonsuz.
3. Dosyayı `public/models/` klasörüne koy.
4. `public/config.js` → `models` listesine ekle:
   ```js
   { file: 'models/karakterim.fbx', height: 1.75 },
   ```

Her izleyiciye listedeki modellerden biri adına göre sabit atanır. Mixamo iskeleti olan her `.glb` / `.fbx` çalışır.

## Ayarlar

Bütün sayılar `public/config.js` dosyasında: halka yarıçapı (`ringRadius`), kamera, katılım süreleri, seviye eşikleri, kategoriler ve anahtar kelimeleri, şarkı süreleri, ses seviyeleri.

## Hediye kaydı

Yayın sırasında gelen her hediye terminale yazılır:

```
[21:14:05] 🎁 @zeynep_34 (Zeynep) → Rose x5 = 5 jeton
```

Ayrıca `logs/hediyeler-YYYY-AA-GG.csv` dosyasına eklenir. Excel'de açıp kim, ne zaman, hangi hediyeden kaç tane, toplam kaç jeton atmış görebilirsin. Sunucuyu **Ctrl+C** ile kapatınca o yayının özeti (en çok atan 10 kişi) terminale yazılır. Test panelinden gönderilen sahte hediyeler terminalde "(test)" diye görünür ama dosyaya yazılmaz.

## Kendi müziğini çalmak

Oyun ekranında farenin altındayken sağ altta **🎵 Müzik açık** düğmesi belirir (OBS'te kaynağa sağ tık → **Etkileşim**). Tıklayınca sadece oyunun müziği kapanır, efekt sesleri ve dansçıların ritmi devam eder. Aynı düğme yönetim panelinde de var (**🔇 Oyun müziğini kapat**). Seçim tarayıcıda hatırlanır. Düğme yayında görünmez.

## Yönetim paneli

`http://localhost:3000/admin.html` adresini yayın sırasında aynı bilgisayarda ayrı bir tarayıcı penceresinde açık tut.

- **Gelen olaylar:** Yayındaki her hediye ve yorum saat, kişi ve jeton değeriyle listelenir. Oyun ekranı olayı uygulayınca **✓ İşlendi**, 4 saniye içinde uygulamazsa **⚠ İşlenmedi** yazar. **↻ Uygula** olayı oyuna tekrar gönderir (zaten işlenmiş bir hediyede önce onay sorar, puan iki kez eklenmesin diye).
- **Elle hediye:** Kullanıcı adı ve jeton yazıp **Hediyeyi uygula**'ya bas. Gerçek hediye gibi işlenir (süre, puan, yelek, davulcu/zurnacı, gelin/damat). Hediye kaydına "(elle)" notuyla yazılır, istersen kutucuğu kaldır.
- **Roller:** Damat, gelin, davulcu ve zurnacı koltuklarını gör. Formdaki kişiyi doğrudan ata ya da koltuğu boşalt.
- **Halaydakiler:** Herkesin puanı ve durumu (🎁 kalıcı / 💬 kaçıncı çıkacak). Satırdan 📌 sabitle, ±10 puan, damat/gelin/halaybaşı yap veya halaydan çıkar.
- **Müzik, kamera, tur:** İstediğin kategoriyi hemen çal, şarkıyı geç, kamerayı değiştir, turu sıfırla.

Üstteki **Oyun ekranı** göstergesi kırmızıysa OBS / LIVE Studio'daki oyun sayfası sunucuya bağlı değildir. O sırada gelen hediyeler işlenmez, kaynak yenilenince **↻ Uygula** ile tekrar gönderilebilir.

## Test

Yönetim panelindeki **🧪 Test** bölümünden sahte hediye (her rol hediyesi, büyük hediye, takı), yorum, "kız"/"erkek", oy, beğeni, takip ve paylaşım gönderebilirsin. Formda kullanıcı adı yazılıysa o kişi adına gönderilir. Oyun ekranında klavye kısayolu yoktur.

## Dosyalar

```
server.js           TikTok olaylarını dinler, oyuna WebSocket ile iletir, müzik listesini verir
public/config.js    Bütün ayarlar
public/game.js      Oyun mantığı, oylama, arayüz
public/scene3d.js   3D sahne, karakterler, IK dans figürleri, davul/zurna
public/music.js     Şarkı çalma + otomatik ezgi üretici
public/audio.js     Ses altyapısı ve efektler
public/panel.html   Test / yönetim paneli
public/models/      3D karakterler
public/music/       Şarkı klasörleri
```

## Bilmen gerekenler

- `tiktok-live-connector` resmi değil. TikTok tarafında bir şey değişirse `npm install tiktok-live-connector@latest` ile güncelle.
- Çok sık bağlanınca imza sunucusu limit koyabilir. Gerekirse eulerstream.com'dan ücretsiz anahtar al, `SIGN_API_KEY` ortam değişkeniyle ver.
- Hediye karşılığında rastgele ödül, çekiliş veya para vaadi ekleme. TikTok kuralları buna izin vermiyor.
