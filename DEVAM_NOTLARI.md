# Devam notları

Son güncelleme: 03.11.2026 (Aşama 1 ve eki bitti, commit edildi)

## 03.11.2026'da yapılanlar

- İş bilgisayarına `git pull` yapıldı; ev bilgisayarının 02.11 commit'leri (`a6e98a9`, `44f5a2b`, `20afc2e`) çekildi. `npm install` bağımlılıklarda değişiklik bulmadı — iki bilgisayar senkron.
- **Vercel dağıtımı ve otomatik Drive yedeği çalışıyor** (ayrıntı aşağıda).

### Aşama 1: Ödeme tarihi (localhost'ta test edildi, onaylandı)

- Yeni `components/TarihAlani.tsx`: tarih girişi + iki uyarı — ileri tarih (turuncu), içinde bulunulan aydan farklı ay (mavi, "Bu kayıt Ekim 2026'ya işlenecek").
- Kullanıldığı yerler: Tahsil Et (Alacaklar), Ödeme Yap (Borçlar), sipariş Ödeme Al, Yeni Alacak / Yeni Borç ve Kasa giriş satırı (orada sadece uyarı satırı, tarih hücresi zaten vardı).
- `lib/db.ts`: `tahsilEt` ve `siparisOdemeAl` artık tarih alıyor. İkisi de `todayISO()` sabitine bağlıydı, yani geçmiş tarih girilse bile kayıt bugüne yazılıyordu. Para hareketi `Odeme.tarih` / `KasaKaydi.tarih` üzerinden yürüdüğü için ay görünümleri, devirler ve toplamlar kendiliğinden doğru aya düşüyor (`aylikKasa` her hareketi kendi tarihine göre sayıyor).
- `lib/format.ts` → `ayaDogru()`: yıl okunuşuna göre doğru ek (2026'**ya**, 2025'**e**, 2027'**ye**); sabit ek yazılsa bazı yıllarda bozuk görünürdü.
- Girişin kendi anı için **yeni alan açılmadı**: `KasaKaydi.createdAt` ve `Odeme.createdAt` zaten o anı tutuyor. Yeni `GirisNotu` parçası, para tarihi ile girildiği gün farklıysa detayda küçük yazıyla gösteriyor ("· 03.11.2026 tarihinde girildi").

### Aşama 1 eki: Ödeme satırı düzelt / sil / geri al (localhost'ta test edildi, onaylandı)

- Ödeme listelerindeki her satırda `⋯` → **Düzenle** / **Sil** (onaylı). Düzenle penceresinde tutar, tarih ve ödeme şekli değişebiliyor.
- İki ödeme türü ayrı ele alındı:
  - **Kayıt detayı → "Sonradan yapılan ödemeler":** ödeme, kaydın `odemeler[]` dizisinde bir satır; kendi belgesi yok. Silinince diziden **çıkarılmıyor**, yerinde `silindi` işaretiyle duruyor — çıkarılsa sonraki satırların indeksleri kayar ve `hesapAta()` ödemeleri indeksle adreslediği için hesapsız havaleleri yanlış satıra bağlar. `hareketlerOf()` işaretli satırı atlıyor, canlı satırların `odemeIndex`'i bozulmuyor.
  - **Sipariş detayı → "Ödemeler":** ödeme kendi başına bir kasa kaydı; silinince kaydın tamamı Çöp Kutusu'nun **ana tablosuna** gidiyor.
- `alinanTutar` türetilmiş değil, saklanan bir alan. Bu yüzden her değişiklikte peşin kısım mevcut değerlerden hesaplanıp (`alinanTutar − canlı ödemeler`) yeniden yazılıyor; peşin + sonraki ödemeler dengesi birebir korunuyor. Durum da yeniden hesaplanıyor: tamamlanmış kayıttan ödeme silinince yine "aktif" olup Alacaklar / Borçlar'a dönüyor, arşivlenmiş kayıt arşivde kalıyor.
- Çöp Kutusu'na **Silinen Ödemeler** bölümü eklendi (30 gün, geri alınabilir; geri alınınca kaydın alınan tutarı ve kasa toplamları yine artıyor).
- Yeni `components/SatirMenu.tsx`: genel `⋯` satır menüsü, 02.11'de düzeltilen desenle (portal + arkada tıklama perdesi, `pointerdown` dinleyicisi değil).

## Sıradaki plan

Her aşamada aynı kurallar: önce kısa plan, veri değiştiren işlemden önce yedek, localhost'ta gösterim, test adımları, onaydan sonra commit + push. Mevcut kayıtlar bozulmayacak.

### Aşama 2 — Hesaplar arası transfer (virman) + Mahsup

**Transfer**

- Kasa'daki İşlem seçenekleri: Giriş / Çıkış / **Transfer** / **Mahsup**.
- Kaynak → hedef, Banka Hesapları'ndaki **tüm** hesaplar arasında, **her yönde**, **Nakit Kasa dahil**. Belirli kişilere bağlı değil (Ali Akın / Berkant Ünal yalnızca örnekti).
- Listelerde hesap sahibinin adı önde ("ALİ AKIN · Ziraat"); listelerin altında **"+ Yeni hesap ekle"** — küçük pencerede hesap sahibi + banka adı, eklenince hemen seçilebilir.
- Banka Hesapları sayfasına da Transfer butonu.
- Kurgu: iki ayrı kayıt değil, **tek kayıt**. `tur: "transfer"`; kaynak bacağı mevcut `odemeSekli`/`bankaHesapId`, hedef bacağı yeni `hedefOdemeSekli`/`hedefBankaHesapId`. `hareketlerOf()` bu kayıt için iki hareket üretir (kaynakta −, hedefte +). Toplam kasa kendiliğinden değişmez, iki hesabın hareketlerinde görünür, tek kayıt olduğu için silme/geri getirme zaten atomik. `firmaId` olmadığı için cari / ekstre / Alacaklar'a hiç girmez.
- Arşiv'e Transfer sekmesi; Gelen / Giden / Harcama sekmeleri ve o sekmelerin toplamları `tur !== "transfer"` ile filtrelenecek.
- Kaynak = hedef olamaz. Kaynak hesapta bakiye yetersizse uyarı verilir ama **engellenmez**.

**Mahsup (aracılı ödeme)**

- Durum: müşterinin kartı, borçlu olunan tedarikçinin POS'undan çekiliyor ya da müşteri parayı doğrudan tedarikçinin hesabına atıyor. Para kasaya **hiç girmiyor**; şu an Giriş olarak girilince kasa olduğundan fazla görünüyor.
- Alanlar: Tarih, Ödeyen (müşteri), Alan (tedarikçi / personel / gider kalemi), Tutar, Ödeme şekli (Kredi Kartı + "nereden çekildi" / Banka Havalesi / Nakit), Açıklama, **Karşı tarafa sayılan tutar** (varsayılan aynı tutar).
- Mahsup kaydı **hiç para hareketi üretmeyecek**: Nakit / Banka / Kart-POS ve Toplam Kasa değişmez. "Nereden çekildi" yalnızca bilgi olarak durur.
- İki etki: ödeyenin alacağı düşer (Aşama 3'teki dağıtım kuralıyla, eski siparişten yeniye), alanın borcu düşer. Silinince iki etki birden geri alınır.
- Komisyon farkı (örn. 10.000 çekildi, tedarikçi 9.700 saydı → 300): **iki bağlı belge** olarak yazılacak — mahsup + komisyon gideri, `mahsupId` ile bağlı, birlikte silinir / geri gelir. Böylece Arşiv'deki Harcama sekmesi ve POS komisyonu kaleminin ekstresi hiç değişmeden çalışır; tek belgeye sıkıştırılsa beş ayrı yerde özel durum gerekirdi. **Bu karar 03.11.2026'da onaylandı.**
- Her iki firmanın ekstresinde "Mahsup · A → C" olarak görünecek. Arşiv'de Mahsup sekmesi; Gelen / Giden / Harcama toplamlarına dahil edilmez (komisyon hariç — o Harcama'ya girer).
- Firma ekstresinden, Alacaklar'dan ve Borçlar'dan da Mahsup butonuyla başlatılabilir; ilgili taraf önceden seçili gelir.

### Aşama 2B — Genel Durum sayfası

- Menünün **en üstüne** "Genel Durum". Uygulama açılınca bu sayfa gelecek, logo da buraya gidecek. Yazdır / PDF olacak.
- **Param nerede:** Nakit Kasa, her banka hesabı ayrı satır (hesap sahibi adıyla), Kart / POS, Toplam. Satıra tıklayınca o hesabın hareketleri açılır.
- **Kimden alacağım:** müşteri bazında kalan alacak, büyükten küçüğe; yanında açık sipariş sayısı ve en eski açık siparişin tarihi; WhatsApp ve "Tahsilat Al" kısayolu. Üstte toplam.
- **Kime borçluyum:** tedarikçiler (devir bakiyesi dahil), vadesi yaklaşan çek / senet borçları (vade tarihiyle), personel (Aşama 4'ten sonra). Üstte toplam.
- **Net durum:** Param + Alacaklarım − Borçlarım; tek büyük rakam.
- **Bu aşamada sorulacak karar:** çek ve senetler şu anda sistemde borç olarak **yok** (31.10'da girilmedi; liste JOKERLED ve ERHAN ŞENTÜRK firmalarının notunda duruyor). "Vadesi yaklaşan çek / senet" bölümü ancak bunlar vade tarihli borç kaydı olarak girilince dolar.

### Aşama 3 — Tahsilatların siparişlere dağıtılması

- **Önce, hiçbir şey değiştirmeden tutarsızlık raporu:** her firma için (cari bakiye) ile (siparişlerin kalan toplamı + diğer alacaklar) karşılaştırılacak; farkı olan firmalar ve farkın nedeni (hangi tahsilat siparişlere dağıtılmamış) listelenecek. Onaydan sonra, yedek alarak, dağıtılmamış tahsilatlar aynı kuralla (eskiden yeniye) dağıtılacak ve sonuç raporlanacak.
- **Önemli bulgu (03.11.2026):** sorun yalnızca "dağıtım yok" değil. Firmadan alınan düz bir Kasa Girişi şu anda cariye **hiç** yansımıyor — `toplamTutar = alinanTutar` olduğu için "peşin satış" gibi modelleniyor ve ekstrede borç + alacak satırı birbirini sıfırlıyor. Bu yüzden `tur: "tahsilat"` diye ayrı bir kayıt türü gerekiyor: ekstrede yalnızca alacak satırı üretir, bakiyeye dağıtılmamış kısmı kadar etki eder.
- Kurgu: `KasaKaydi.dagitim: [{ hedefTur: "siparis" | "kayit", id, tutar }]`. **Tek kaynak kuralı:** bir kayıt `dagitim` taşıyorsa siparişe katkısı yalnızca ondan gelir, taşımıyorsa eski `siparisId`'den — aynı para iki kez sayılmaz. Yeni `lib/dagitim.ts` tüm dağıtımları tek yerde toplar; `siparisOdemeleri`, `kayitBakiyesi`, `ekstreOlustur`, `cariOzetleri` ve Alacaklar bunu kullanır.
- Firma bazında **Tahsilat Al** (Alacaklar, firma ekstresi, Bugün aranacaklar ve Kasa'da firma seçilip Giriş yapılınca): tutar girilince açık siparişlere **eskiden yeniye** otomatik dağıtılır. Kaydetmeden önce önizleme: hangi siparişe ne kadar düştü, hangisi kapandı, hangisi kısmi kaldı. Kullanıcı dağıtımı elle değiştirebilir (sipariş seçerek ya da tutar girerek).
- Siparişler dışındaki alacak kalemleri (devir bakiyesi vb.) de aynı sırayla dağıtıma girer.
- Fazla ödeme firmanın **avans / alacak bakiyesi** olarak kalır, ekstrede görünür ve o firmanın sonraki siparişine otomatik (onaylı) düşer.
- Tahsilat silinir / çöpe giderse dağıtımı geri alınır; çöpten dönünce tekrar uygulanır.
- Sipariş detayına "Bu siparişe yapılan ödemeler" listesi: tarih, tutar, ödeme şekli, hangi tahsilattan geldiği.
- **Alacaklar / Borçlar firma bazında gruplanacak:** aynı firmanın siparişleri (örn. EGESER REKLAM) tek satırda toplanacak, satıra tıklayınca açılacak; firma satırında **Tahsilat Al / Ödeme Yap** butonu olacak.

### Aşama 4 — Personel maaş carisi

- Personel kartı alanları: Ad Soyad, Maaş türü (Haftalık / Aylık), Maaş tutarı, Saatlik mesai ücreti, Geçmişten devreden alacak (başlangıç bakiyesi + tarihi), Aktif / Pasif.
- **Kaldırılacak alanlar:** TC kimlik no, telefon, adres, acil durum kişisi, acil telefon, not. Önce yedek; sonra arayüzden kaldırma **ve** veritabanından `deleteField()` ile silme (kişisel veri saklamamak için). Kuru çalıştırmalı betik.
- Yeni `personelHareketleri` koleksiyonu (`personelId` ile): Hak ediş (maaş), Mesai, Ek (prim vb.), Kesinti, Ödeme.
- **Otomatik hak ediş:** haftalık personele her Pazartesi, aylık personele her ayın 1'inde maaş tutarı hak ediş olarak eklenir. Idempotentlik belge kimliğiyle kurulacak: `{personelId}_2026-W45` (haftalık) / `{personelId}_2026-11` (aylık) — aynı dönem ikinci kez yazılamaz. Uygulama açılışında eksik dönemler tamamlanır. Personel sayfasında "Bu hafta / bu ay işlendi" bilgisi görünür; hak ediş satırı düzenlenebilir / silinebilir.
- **Mesai Ekle:** tarih + saat → tutar = saat × saatlik mesai ücreti; istenirse tutar elle de girilebilir.
- **Ödeme Yap:** tarih, tutar, ödeme şekli (Nakit / Banka Havalesi + hesap); Kasa'ya `personelId` ile Çıkış olarak yazılır. Kasa'dan personel seçilerek yapılan çıkışlar da aynı ekstreye düşer.
- Kalan = devreden + hak edişler + mesai + ekler − kesintiler − ödemeler. Pozitifse "Personele borç ₺X".
- Liste kartı: Ad Soyad, maaş türü ve tutarı, Kalan (vurgulu), son ödeme tarihi / tutarı; butonlar: Ödeme Yap, Mesai Ekle.
- Ada tıklayınca personel ekstresi: Tarih, Açıklama, Hak ediş, Ödeme, yürüyen Bakiye (tarih sırasıyla); tarih aralığı seçimi; Yazdır / PDF.
- Kasa özet şeridine **"Personel Borcu"** kartı (tüm aktif personelin kalan toplamı), Ödenecek Borç'tan ayrı.
- Mevcut personel kayıtları bozulmayacak; eski alanlar silinmeden önce yedekte kalacak.
- Varsayımlar (onaylandı): haftalık dönem Pazartesi başlar; mesai saat × saatlik ücretle hesaplanır.

## 02.11.2026'da yapılanlar (ikinci tur, localhost'ta test edildi, onaylandı)

- **Daha çok satır görünsün:** Siparişler, Arşiv, Alacaklar, Borçlar artık ekranın kalan yüksekliğini dolduruyor; sayfa kaymıyor, sadece tablo kendi içinde kayıyor (sticky başlık ve Siparişler'in çift kaydırma çubuğu duruyor). Satır/hücre iç boşlukları küçültüldü. Mekanizma: `app/layout.tsx`'te kaydırma `<body>`'den `<main>`'e taşındı; bu 4 sayfanın kökünde `.sayfa-dolu`, tablo alanında `.tablo-doldur` sınıfı var (`globals.css`).
- **Siparişler varsayılan sekme:** Sayfaya her girişte "Tümü" ve bu ay açılıyor; sekme seçimi artık localStorage'da tutulmuyor, sadece sayfadayken korunuyor. Boş sekmede "Tümünü göster" bağlantısı eklendi.
- **Logo → Kasa:** Sol üstteki logo (masaüstü ve mobil menü) tıklanınca Kasa'ya gidiyor; PIN ekranındaki logo tıklanamaz kalıyor.
- **Fatura basitleştirildi:** Fatura sütunu tablodan, "Faturası Kesilmeyen" sekmesi, yazdırma çıktıları ve mobil kartlardan kaldırıldı (veri silinmedi). Ayarlar → "Fatura takibini göster" (varsayılan kapalı) açılırsa sipariş detayında küçük bir "Fatura kesildi" onay kutusu görünüyor.
- **Yazı imleci:** Düzenlenemeyen metinlerde (başlık, rakam vb.) artık yanıp sönen imleç görünmüyor; sadece input/textarea'da görünüyor (`globals.css`, `caret-color`).
- **Firmalar → telefon:**
  - Telefon sütunu doğrudan listede düzenlenebiliyor (Enter kaydeder, Tab bir alttaki firmaya geçer).
  - "Toplu telefon ekle" butonu: Excel'den iki sütun (Firma, Telefon) yapıştırma ya da CSV seçme (Google Kişiler dahil), firma adı otomatik eşleştirme, önizleme (eşleşen / eşleşmeyen / zaten telefonu olan — üzerine yazma onayı ile), toplu kaydetme.
  - Telefonlar hangi biçimde girilirse girilsin ("0532…", "532…", "+90 532…") "0532 123 45 67" biçiminde kaydediliyor (`lib/telefonIceAktar.ts`).

### Vercel dağıtımı düzeldi (çözüldü)
- Sorun e-posta doğrulaması değildi: `CRON_SECRET` ortam değişkeninin değerinde baştaki/sondaki boşluk vardı. Değer düzeltilince build geçti. Son dağıtım **Hazır**, canlı site güncel.
- Otomatik Google Drive yedeği de çalışıyor: son otomatik yedek **02.11.2026 03:06**.

### Veri düzeltmesi: Ekim 2026 üretim durumu (canlı veride)
- Ekim 2026 tarihli, "Bitti" durumundaki 169 sipariş "Teslim Edildi" yapıldı (Kasım ve sonrasına dokunulmadı).
- Önce/sonra: Bitti 169→0, Teslim Edildi 5→174, Teslim Edildi · Parası Alınmadı 1→28 (taşınan siparişlerden 27'sinin kalan ödemesi var — beklenen durum, ödeme durumu değişmedi).
- `scripts/siparis-ekim-teslim.mjs`: Kuru çalıştırma varsayılan; `--yaz` ile uygular. Her çalıştırmada önce `siparisler` koleksiyonunun tam yedeğini `import/` klasörüne alır. PIN'i terminalde sorar (`.env.local` CRLF satır sonlarına karşı dayanıklı okunuyor).

### Kod (localhost'ta test edildi, onaylandı)
- **Kasa sayfası düzeni:** Özet şeridi ve Aylık kasa özeti en üstte (başlığın altında), giriş formu ve Bugün girilenler altta. Sayfa sonundaki Alacaklar/Borçlar önizleme kutuları kaldırıldı (kendi sayfaları var).
- **Banka havalesi gösterimi:** `hesapEtiketi()` artık önce hesap sahibinin adını, yanında bankayı gösteriyor ("MUSTAFA EKİNCİ · KuveytTürk") — Kasa, Arşiv, Ödeme Al/Yap, Sipariş detayı ve Banka Hesapları kartlarının hepsinde ortak. Banka Hesapları kart başlığı da buna göre değişti. Not: "Banka Havalesi" seçilince açılan kutu tarayıcının kendi `<select>`'i olduğu için sıralama düzeldi ama banka adını küçük/soluk gösteremiyor (istenirse özel açılır liste yapılabilir — B raporunda bekliyor).
- **Firma silme/düzenleme:** Firmalar listesinde ve firma ekstresinde "⋯" menüsü (Düzenle, Türünü değiştir, Birleştir, Sil). Kaydı olmayan firma onaylanınca Çöp Kutusu'na gidiyor (30 gün, geri alınabilir, adı anında serbest kalıyor). Kaydı olan firma doğrudan silinemiyor; Birleştir ya da Pasif yap seçeneği sunuluyor (pasif firmalar yeni kayıtlarda çıkmıyor, geçmişte görünmeye devam ediyor).

## 31.10.2026'da yapılanlar

### Aşama 4: Excel aktarımı (canlı veride)
- Eski deneme verisinin tamamı silindi: kasa kayıtları, siparişler, görseller ve firmalar. Yalnızca banka hesabı (KUVEYTTÜRK) ve giriş şifresi kaldı.
- `import/` klasöründeki Excel dosyaları aktarıldı:
  - 150 firma: 122 müşteri, 24 tedarikçi, 4 gider kalemi
  - 242 sipariş ve 374 görsel (her görselin önizlemesiyle)
  - 33 tahsilat notu
  - 19 tedarikçi devir bakiyesi (Borçlar'da, toplam 1.554.689,42 TL)
- Sipariş toplamları: tutar 3.153.250, ödenen 2.289.100, kalan 865.350 TL. Aktarımdan sonra Firestore'dan okunan sayılar kuru çalıştırmayla birebir tuttu.
- Çek ve senetler borç olarak girilmedi. Liste, JOKERLED ve ERHAN ŞENTÜRK firmalarının notunda duruyor.
- Ayrı bırakılan, belki birleştirilecek firmalar: TUNA REKLAM BAYRAM, NEO REKLAM, BEKA KADİR, M-SERHAT REKLAM, TANIŞ REKLAM RECEP, AYDIN REKLAM (SAKARYA KARASU), SR DARICA REKLAM, ÖMER TAMER, TARAY REKLAM. Ayrıntılar `import/kuru-rapor.md` dosyasında. Birleştirmek için uygulamada Firmalar → iki firmayı seç → Birleştir.
- Betikler:
  - `scripts/excel-aktar.mjs`: Varsayılan olarak kuru çalıştırma yapar. `--yaz` ile siler ve aktarır.
  - `scripts/yedek-al.mjs [ETİKET]`: Görseller dahil tam yedeği `import/` klasörüne alır. Var olan bir dosyanın üzerine yazmaz.

### Üretim durumu düzeltmesi (canlı veride)
- "Bekliyor" durumundaki 87 sipariş "Üretimde" yapıldı. Şu an: Üretimde 94, Bitti 148, Bekliyor 0.

### Kod (localhost'ta yapıldı; 02.11'de test edildi ve doğrulandı)
- **Ay mantığı (Siparişler):** Önceki aylardan sadece "Üretimde" olanlar devreder. Bitti ve Teslim Edildi olanlar kendi aylarında kalır. Alacaklar ve firma ekstresi değişmedi.
- **Tablo görünümü:**
  - Görsel önizlemeleri 80 piksel.
  - Ürün / İş sütunu geniş, uzun adlar alt satıra kayar.
  - Tutar ₺17.900,00 biçiminde görünür, düz sayı olarak girilebilir.
  - Kalın ve koyu kaydırma çubuğu var, tablonun üstünde ikincisi de var.
- **Sütun sıralama:** Siparişler, Bugün girilenler, Arşiv, Alacaklar, Borçlar, Firmalar, Banka hareketleri, Çöp Kutusu ve Cari ekstrede çalışır.
  - Başlığa tıklama sırası: ▲ / ▼ / varsayılan.
  - Firma adları Türkçe alfabeye göre sıralanır.
  - Seçilen sıralama her sayfa için hatırlanır.
  - Ekstrede tarih dışında bir sütuna göre sıralanınca Bakiye sütunu gizlenir.
- **Siparişler → Yazdır / PDF:** A4 yatay, ekrandaki ay, sekme, arama ve sıralamayla birebir çıkar. Sipariş detayında ayrıca **Sipariş Formu** var (büyük görsel ve imza alanı).

## 31.10 test listesi: doğrulandı

- 31.10.2026'da bırakılan test listesinin tamamı localhost'ta geçti ve onaylandı: ay mantığı (Kasım'a yalnızca "Üretimde" işlerin devretmesi ve ay rozeti), tablo görünümü ve ₺ tutar biçimi, sütun sıralama (Türkçe alfabe dahil), Siparişler → Yazdır / PDF ve Sipariş Formu.
- Listedeki "Faturası Kesilmeyen" sekmesi 02.11.2026'da kaldırıldığı için o maddedeki sayı artık geçerli değil.

## Bekleyen küçük işler

- **Google Drive client secret'ı yenileme:** Otomatik yedek **çalışıyor** (son otomatik yedek 02.11.2026 03:06), Drive kurulumu bitti. Geriye tek iş kaldı: client secret ekran görüntüsüyle sohbete düştüğü için yenilenmeli. Yollar: Google Cloud → Clients → Panzehir Yedek → Add secret → eskisini Disable ve Delete. Sonra Vercel'de `GOOGLE_CLIENT_SECRET` değerini güncelleyip yeniden dağıtın, ertesi gün gece yedeğinin geldiğini doğrulayın.
- **PIN değiştirme:** Ortak kasa hesabının 6 haneli PIN'i değiştirilecek.
- **Firebase anahtar dosyası:** `panzehir-84661-firebase-adminsdk-…json` — hem ev hem **iş bilgisayarında** kalıcı olarak silinecek (yedek ve aktarım betikleri için kullanılmıştı, artık gerekmiyor).
- **Excel (.xlsx) yedeği:** gece yedeğinin yanına okunabilir bir `.xlsx` dosyası eklenecek (`exceljs` zaten kurulu).

İsteğe bağlı, acil değil:

- **Banka Havalesi açılır listesi:** hesap sahibi / banka adını özel tasarım bir açılır listeyle (küçük, soluk banka adı) göstermek — tarayıcının native `<select>`'i buna izin vermiyor.

## Yedekler (`import/`, git'e girmez)
- `yedek-ONCESI-2026-10-31.json` ve `yedek-ONCESI-2026-10-31-aktarim-oncesi.json`: Excel aktarımından önceki deneme verisi.
- `yedek-URETIM-ONCESI-2026-10-31.json`: Aktarımdan sonra, Üretimde düzeltmesinden önce (32,7 MB, görseller dahil).
