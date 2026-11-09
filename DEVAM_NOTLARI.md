# Devam notları

Son güncelleme: 09.11.2026 (Personel sayfasının düzeni yenilendi; 06.11'deki hak ediş düzeltmesi de notlara işlendi)

## ⚠️ Ev bilgisayarına geçerken

**Aşama 3 iş bilgisayarında yazıldı ve push edildi. Ev bilgisayarındaki 06.11 tarihli, push edilmemiş Aşama 3 çalışması geçersiz: orada `git stash` ile kenara al, sonra `git pull` yap. Birleştirmeye çalışma — iki uygulama aynı dosyalara (`lib/dagitim.ts`, `components/OutstandingList.tsx`, `lib/db.ts`) dokunuyor.**

Aynı durum 04.11'de tersi yönde yaşandı: Aşama 2 iki bilgisayarda ayrı ayrı yazıldı, ev sürümü esas alındı, iş bilgisayarındaki sürüm `yerel-asama2-04-11` dalında duruyor (silinmedi, birleştirilmedi).

## 09.11.2026'da yapılanlar

### Personel sayfasının düzeni: iki bölüm, tek sütun uzun satır (doğrudan commit edildi — kullanıcı isteği; localhost'ta gösterilmedi, yalnızca `tsc` / `eslint` / `build` temiz)

06.11'deki hak ediş düzeltmesinden sonra yarım kalan iş.

- **İki bölüm:** üstte **Haftalık Personel**, altta **Aylık Personel**; bölüm başlığında kişi sayısı ve o bölümün ödenecek toplamı ("Haftalık Personel · 6 kişi · Ödenecek ₺51.910"). Pasif personel en altta, ayrı bölüm ve soluk (`opacity-65`), toplamı yazılmıyor. `maasTuru()` olmayan eski kayıtlar "aylık" sayıldığı için iki bölümün toplamı her zaman aktif personelin tamamı.
- **Tek sütun, uzun satır:** iki sütunlu kart düzeni (`lg:grid-cols-2`) kalktı; her personel tam genişlikte tek satır. Soldan sağa: Ad Soyad (altında küçük "Haftalık · ₺19.650 · mesai ₺…/saat") · Son ödeme · işlenme durumu · **Kalan** (vurgulu, sağa hizalı) · Ödeme Yap, Mesai Ekle, Ekstre, `⋯`.
- **Telefonda** satır `order` ile kırılıyor: ilk satırda ad soyad ile Kalan, altında son ödeme, işlenme durumu ve butonlar. Alacaklar / Borçlar'daki `md:hidden` + `hidden md:flex` deseninin aksine **ayrı bir mobil render yazılmadı** — satır tek parça olduğu için tek DOM yetiyor, kopya markup riski yok.
- Ad soyada tıklayınca ekstre açılıyor (eskiden de öyleydi, korundu). `PersonelKarti` → `PersonelSatir`, yanında küçük `BolumBasligi`.
- `hakEdisDurumu()` artık satır başına **bir kez** çağrılıyor (eskiden aynı hesap iki kez yapılıyordu).

`tsc --noEmit`, `eslint` ve `npm run build` temiz.

### Bekleyen işlerden iki madde çıkarıldı (kullanıcı kararı)

**Drive client secret yenileme** ve **PIN değiştirme** maddeleri listeden çıkarıldı; yapılmayacak.

## 06.11.2026'da yapılanlar (iş bilgisayarında)

### Hak ediş düzeltmesi: eksik dönemler artık gerçekten işleniyor (commit `a469232`)

Personel sayfasında birçok kişide kalıcı olarak "Bu hafta / bu ay işlenmedi" yazıyordu, "şimdi işle" düğmesi de hiçbir şey yazmıyordu. İki ayrı hata:

- `lib/personel.ts` içindeki geriye dönük tamamlama sınırı (26 hafta / 12 ay) **başlangıç** tarihinden sayılıyordu. Devreden tarihi sınırdan eskiyse üretilen dönemler bugüne hiç ulaşmıyor, yani bu haftanın / bu ayın hak edişi hiç yazılmıyordu. Sınır artık **bugünden geriye** sayılıyor; bugünün dönemi her zaman üretiliyor (yeni `uretilecekDonemler()`).
- Ekranda gösterilen durum ile yazılan hak ediş ayrı yerlerden okunuyordu: `buDonemIslendi()` yalnızca "bu dönemin kaydı var mı?" diye soruyordu, ama devreden tarihi dönem ortasındaysa o dönem bilinçli olarak devredene dahil sayılıp yazılmıyor — o personeller sonsuza kadar "işlenmedi" görüyordu. Yerine `hakEdisDurumu()` geldi; hep `uretilecekDonemler`e baktığı için ekranda yazan ile yazılacak olan kopamıyor. Dört durum: **işlendi / devredene-dahil / eksik / yok**. Uyarı yalnızca gerçekten yazılacak dönem varsa görünüyor, devredene dahil dönemlerde soluk "bu hafta devredene dahil" yazıyor.

`HakEdisOtomatik` artık yazdığını söylüyor: "Maaş hak edişi işlendi · N personel · M dönem" (`bildir`) — maaş borcu kendiliğinden arttığında nedeni görünüyor.

**Dikkat:** bu düzeltmeden sonraki ilk açılışta, devreden tarihi eski olan personelin eksik dönemleri (en fazla 26 hafta / 12 ay geriye) otomatik yazıldı; personel borcu buna bağlı olarak arttı. **Rakamlar kontrol edilmeli** — her hak ediş satırı personel ekstresinden düzenlenip silinebiliyor.

39 birim kontrolü çalıştırıldı ve hepsi geçti (dönem kimliği ve başı, Pazartesi bulma, devreden tarihi yok / dönem ortasında / dönem başıyla aynı gün / ileri tarihli, sınırdan eski devreden tarihinde bugünün döneminin üretilmesi, yazılmış dönemin ikinci kez eksik sayılmaması, pasif / maaşsız, yıl sonu geçişi). `tsc --noEmit`, `eslint` ve `npm run build` temiz.

### Genel Durum sadeleşti: "Sipariş Durumu" (localhost'ta test edildi, onaylandı, commit edildi)

Sayfanın eski bölümlerinin **tamamı kaldırıldı** — üstteki dört kutu, Hazır Değerler, Ticari Alacaklar (yaşlandırma dahil), Ticari Borçlar, Vadesi Yaklaşan Ödemeler ve Personel. Hepsi başka sayfalarda (Kasa, Alacaklar, Borçlar, Banka Hesapları, Personel) zaten görünüyordu. `app/genel-durum/page.tsx` 877 → 285 satır.

Yerine iki bölüm geldi:

- **Eldeki iş:** dört kutu, her biri adet + tutar ve tamamı tıklanabilir — Üretimde, "Bitti, teslim bekliyor", "Teslim edildi, parası alınmadı", "Bu ay alınan sipariş" (ay adıyla). Üçüncü kutuda tutar bilinçli olarak sipariş tutarı değil **tahsil edilmeyen kalan**; her kutunun altında hangi rakam olduğu küçük yazıyla duruyor. Adetler Siparişler'in kendi `sekmedeMi()` tanımından geliyor, yoksa kutudaki sayı ile açılan listenin sayısı birbirinden kayabilirdi.
- **Aylık sipariş dökümü:** en yeni ay üstte — Ay / Yeni sipariş / Sipariş tutarı / Hâlâ üretimde (adet · tutar) / Teslim edildi (adet · tutar) / Tahsil edilen / Kalan alacak, en altta toplam satırı. Satıra tıklayınca Siparişler o ayla açılıyor. Grafik yok; mevcut `.rapor-tablo` stili.

- **Siparişler sayfası artık `?ay=YYYY-MM&sekme=<sekme>` parametrelerini açılışta bir kez okuyor.** `useSearchParams` **kullanılmadı**: Next 16 dokümanına göre o kanca prerender edilen bu sayfanın tamamını en yakın Suspense sınırına kadar istemci tarafına çekiyor. Onun yerine `window.location.search` okunuyor, geçersiz değer yok sayılıyor (localStorage geri yüklemesindeki desenin aynısı).
- Yazdır / PDF kaldı: başlık **"Sipariş Durumu"**, "… itibarıyla" + düzenlenme tarihi. Baskıda kutular 4'lü sırada; tablonun ekrandaki sabit genişliği baskıda kalkıyor, böylece A4'e sığıyor.
- Menüdeki yeri değişmedi (Banka Hesapları'nın altında), **etiketi "Sipariş Durumu" oldu**; yol (`/genel-durum`) aynı kaldı.
- Artık kullanılmayan kod da temizlendi: tahsilat kısayolu, yaşlandırma dilimleri, hazır değerler hesapları ve yalnızca o bölüm için yazılmış `lib/whatsapp.ts` → `firmaWaMesaji`.

### Kasa'dan "Bugün aranacaklar" şeridi kaldırıldı

Sürekli ekranda duruyordu ve gerek kalmadı. `components/BugunAranacaklar.tsx` silindi; Kasa sayfasındaki `aramaListesi` hesabı, ona bağlı `SiparisOdemeModal` ve `FirmaFormModal` ("telefon ekle") blokları ve kullanılmayan importlar da temizlendi. **WhatsApp butonu ve tahsilat notları yerinde:** `components/WhatsappButonu.tsx` ile `siparisWaMesaji()` Siparişler ve sipariş detayında, tahsilat notları da sipariş detayında çalışmaya devam ediyor.

### Aşama 3: Tahsilatların dağıtılması (localhost'ta test edildi, onaylandı, commit edildi)

**Kurgu canlı veriden okunarak yazıldı.** Ev bilgisayarının betikleri canlı veriye iki kayıt yazmış, kod bunların biçimine birebir uyduruldu (`scripts/belge-oku.mjs` ile okundu — salt okuma inceleme betiği, commit'e dahil):

- `tur: "tahsilat"` ve `dagitim: [{ hedefTur: "siparis" | "kayit", id, tutar }]`. Avans / fazla ödeme için **ayrı alan yok**: avans = `alinanTutar − Σ dagitim.tutar`.
- İki kayıt iki biçim gösteriyor, ikisi de korundu: Kasa satırından girilen tahsilat `toplamTutar: 0` + `durum: "aktif"` (EGESER, 15.000 → excel-57 7.500 + excel-38 7.500), sipariş detayından alınan ödeme `toplamTutar = alinanTutar` + `durum: "tamamlandi"` (MEGA, 3.000).
- **En önemli bulgu:** MEGA kaydında `siparisId` **excel-79**, dağıtımı **excel-19**. Yani `siparisId` artık yalnızca "nereden başlatıldı" bilgisidir. Eski kod ikisini birlikte sayıyordu; bu yüzden canlıda excel-79 3.000 TL fazla ödenmiş, excel-19 hiç ödenmemiş, EGESER'in 15.000'i de hiçbir yere yansımamış görünüyordu. **Tek kaynak kuralı** bu yüzden zorunlu.

**Yeni `lib/dagitim.ts` — dağıtımı okuyan tek yer.** Tek kaynak kuralı (`dagitim` varsa katkı yalnızca ondan, yoksa eski `siparisId`'den), `kayitKalani()` (bir kaydın kalanı artık kendi ödemelerinin yanında **ona dağıtılmış tahsilatlarla** da kapanır), `avans()`, `acikHedefler()` (sipariş + kasa kalemleri birlikte, eskiden yeniye), `dagitimPlani()`, `siparisOdemeSatirlari()`, `firmaAvansi()`, `avansDusumleri()`. `siparisOdemeleri()` buraya taşındı — `lib/siparis.ts`'te kalsa plan `siparisHesap()`'a ihtiyaç duyduğu için döngüsel import olurdu.

**Yeni `lib/tahsilat.ts` — yazmanın tek yolu.** Nereden başlatılırsa başlatılsın (Alacaklar firma satırı, Alacaklar tek kalem, sipariş detayı, Kasa satırı, Genel Durum kısayolu, mahsup) plan + yazma + bildirim mesajı buradan geçer.

- **Eskiden yeniye dağıtım**, tek kalemden başlanmışsa **o kalem başa alınır**; kalanı yoksa sıradaki en eskiye geçer (MEGA kaydının davranışı birebir bu).
- **Avans**: dağıtılmayan kısım. Yeni sipariş açılınca `addSiparis` **aynı Firestore işleminde** en eski avanstan başlayarak düşürür. Notlarda "(onaylı)" yazıyordu; 06.11'de **otomatik** olmasına karar verildi, onay sorulmuyor, yalnızca bildirim veriliyor.
- **Kasa'da firma + Toplam boş + Peşin dolu** giriş artık tahsilat sayılıp dağıtılıyor (eskiden cariye hiç yansımıyordu).
- **Mahsupta müşteri tarafı** da aynı kuralla dağıtılıyor; alan tarafın etkisi (sayılan tutar) değişmedi.
- **Silme / düzenleme:** silinen kayıt listeden düştüğü an dağıtımı da geri alınır (çöpten dönünce tekrar uygulanır) — ayrı bir geri alma kodu gerekmedi, çünkü dağıtım hep canlı kayıtlardan hesaplanıyor. Tutar düzenlenince (`yenidenDagitim`) kayıt kendi payı hesaba katılmadan baştan dağıtılır: kayıt detayı, sipariş ödemesi düzenle, mahsup.
- **Pencereler değişmedi** (yeni alan / önizleme yok). Tek yeni parça `components/Bildirim.tsx`: `₺15.000,00 → 2 siparişe dağıtıldı · ₺500,00 avansta kaldı` şeridi, `app/layout.tsx`'te duruyor, her yerden `bildir()` ile çağrılıyor.

**Zorunlu iki yan düzeltme:**

- Tahsilatta `toplamTutar` 0 olabildiği için Arşiv, Çöp Kutusu ve "Bugün girilenler" tutarı yeni `kayitTutari()` ile okuyor — yoksa Arşiv'in Giriş toplamı o 15.000'i saymazdı. `ozelKayitMi()` bilinçli olarak tahsilatı **dışarıda bırakıyor**: tahsilat gerçek bir para girişidir, Arşiv'in Gelen sekmesinde normal giriş gibi sayılır; özel yanı yalnızca cari etkisinin avansla sınırlı olması ve ekstrede borç satırı üretmemesi.
- Sipariş detayındaki "Ödemeler" listesi artık dağıtıma göre, o siparişe **düşen payı** gösteriyor (`siparisOdemeSatirlari`). Yoksa MEGA'da ödeme excel-79'da görünüp o siparişin kalanını düşürmüyordu.

**Doğrulama:** `tsc --noEmit`, `eslint`, `npm run build` temiz; **74 birim kontrolü** çalıştırıldı ve hepsi geçti — canlı verideki iki kaydın senaryosu, tek kaynak kuralı, çift sayma olmaması, plan sırası ve öncelikli kalem, avans ve sonraki siparişe düşmesi, kasa kaydına dağıtım, silinen tahsilatın dağıtımı geri alması, mahsubun iki tarafı, dağıtımı olmayan eski kayıtların bozulmaması, bildirim metni, sipariş ödeme listesi.

`scripts/tutarsizlik-rapor.mjs` yeni modele göre güncellendi (tek kaynak kuralı, avans, `cariEtkileri`); yeni **D bölümü** hedefi silinmiş ya da kaydın tutarını aşan dağıtım satırlarını arıyor. **06.11'de çalıştırıldı: tek bulgu HİZMET firmasında 1.200 TL avans**, bozuk dağıtım satırı yok.

### Kasa'ya Personel Borcu kartı + Alacaklar'da firma bazında gruplama (commit `bf37c2f`)

- Aşama 4'ten kalan tek parça: Kasa özet şeridinde **Personel Borcu** kutusu (aktif personelin kalan maaş alacağı, Genel Durum'daki aynı `personelBorcuToplami()`). **Ödenecek Borç'a dahil değil** — ticari borç değil. `StatStrip`'in `xl` kolon sayısı artık kutu sayısını izliyor, yoksa 7. kutu tek başına alt sıraya düşüyordu.
- Alacaklar'da `gruplu` bayrağı açıldı (Borçlar'da 04.11'de yazılan yapı): aynı müşterinin açık kalemleri tek satırda, tıklayınca açılıyor. `grupOzeti()` Borçlar'da belge dökümü ("7 senet · 2 çek"), Alacaklar'da sipariş dökümü ("5 sipariş · 1 kalem") yazıyor. Grup satırında **Gecikmiş** rozeti (kapalıyken gecikme gizlenmesin diye) ve firma bazında **Ödeme Al** düğmesi var — Alacaklar'da bu düğme Aşama 3'ün dağıtımlı penceresini açıyor, Borçlar'da (dağıtım yok) en eski kalemin penceresini.
- Mobil grup başlığı `<button>`'dan `role="button"` div'e çevrildi: firma linki (bir `<a>`) bir `<button>`'un içinde duruyordu, geçersiz HTML idi.

## 04.11.2026'da yapılanlar

### Aşama 2B: Genel Durum — "Finansal Durum Raporu" (localhost'ta test edildi, onaylandı, commit edildi)

- Yeni `app/genel-durum/page.tsx`. Dil ve düzen bilinçli olarak **şirket raporu** gibi: "Param nerede / Kimden alacağım / Kime borçluyum" gibi günlük ifadeler kullanılmıyor.
- Üstte dört kutu: Hazır Değerler, Ticari Alacaklar, Ticari Borçlar ve vurgulu **Net Finansal Durum** (pozitifse yeşil, negatifse kırmızı zemin).
- **Hazır Değerler — Kasa ve Bankalar:** Hesap (hesap sahibi · banka) / Tür (Nakit · Banka · POS) / Son hareket / Bakiye + Toplam satırı. Satıra tıklayınca son 8 hareket açılıyor. "Hesap seçilmemiş havaleler" ayrı satır — bu yüzden toplam, Kasa'daki Toplam Kasa ile birebir tutuyor.
- **Ticari Alacaklar — Müşteriler:** 0–30 / 31–60 / 61–90 / 90+ gün yaşlandırma çubuğu (tutar + yüzde; gecikme en eski açık kalemin tarihinden). Tablo: Müşteri / Açık sipariş / En eski tarih / Gecikme / Bakiye, ilk 10 cari + "Diğer N müşteri" özeti + toplam; başlıkta "Tümünü gör" → Alacaklar. Satır sonunda iki küçük ikon: WhatsApp ve Tahsilat Al (firmanın **en eski** açık kalemini açar; sipariş ise Ödeme Al, düz kasa kaydı ise Tahsilat penceresi).
- **Ticari Borçlar — Tedarikçiler:** Tedarikçi / Açık kalem / En eski tarih / Bakiye, aynı ilk-10 + toplam yapısı; altında **Vadesi Yaklaşan Ödemeler** alt tablosu (vade / firma / açıklama / tutar; geçmiş kırmızı, 7 gün içi turuncu). Aşama 4'ten sonra buraya personel satırı eklenecek.
- **Önemli:** bakiyeler **cari bazında netleniyor** (aynı firmanın sipariş kalanları + kasa kayıtları birlikte). Bu yüzden buradaki Ticari Alacaklar, Kasa'daki kayıt bazlı "Tahsil Edilecek"ten farklı çıkabilir. Personelli ve firması bağlanmamış eski kayıtlar da listeye giriyor, yoksa net durum eksik kalırdı.
- Yazdır / PDF başlığı "Finansal Durum Raporu" + tarih; butonlar, açılır hareketler ve "Tümünü gör" bağlantıları baskıda gizli. Rapor tabloları için `globals.css` → `.rapor-tablo`, `.rapor-bolum-baslik`.
- Menüde "Genel Durum" **Banka Hesapları'nın altında**; açılış sayfası ve logo Kasa'da kaldı (önce en üste alınıp açılış yapılmıştı, 04.11'de geri alındı).
- Aşama 3'teki bulgu burada da geçerli: firmadan alınan düz Kasa Girişi cariye yansımadığı için bazı müşterilerin alacağı olduğundan büyük görünebilir.

### Borçlar: firma bazında gruplama + "Ödendi olarak işaretle" (localhost'ta test edildi, onaylandı, commit edildi)

- `components/OutstandingList.tsx` içinde `gruplu` bayrağı (şimdilik yalnızca Borçlar'da açık). Aynı tedarikçinin bütün açık kalemleri tek ana satırda: firma, "N kalem" rozeti, tür dökümü ("7 senet · 2 çek"), en yakın vade, toplam. Tıklayınca kalemler girintili alt satır olarak açılıyor; tek kalemi olan firma katlanmıyor. Grup sırası, seçili sütun sıralamasını koruyor. Mobil kartlar da aynı düzende. **Aşama 3'te Alacaklar aynı yapıdan açılacak.**
- Vade tarihli kalemlerde (çek / senet) **"Ödendi olarak işaretle"**: kalan tutarın tamamı hazır gelir, ödeme şekli ve tarihi sorulur, mevcut `tahsilEt` yolundan Kasa'ya Çıkış olarak yazılır. Vadesi olmayan kalemlerde buton eskisi gibi "Ödeme Yap"; "Arşive Gönder" her kalemde duruyor.
- Yeni `lib/belge.ts`: açıklamadan "çek" / "senet" okur (kelime sınırına bakar, "çekildi" gibi sözcüklere takılmaz). **Ayrı alan açılmadı**, çünkü belge no ve banka da aynı açıklama metninde duracak.

### Çek / senet kayıtları girildi (canlı veride, kontrol edildi, onaylandı)

- **Önce salt okuma kontrolü:** `scripts/cek-senet-rapor.mjs` (hiçbir şey yazmaz) ile ERHAN ŞENTÜRK ve MC LED (JOKER LED) bakiyeleri ile firma notları yan yana okundu. **Sonuç: iki firmanın da tedarikçi devir bakiyesi yok**, yani senetler bir devir bakiyesinin ödemesi değil — çift sayma riski yok, kayıtlar doğrudan girildi.
- **Girilen 9 vade tarihli borç kaydı, toplam 644.500 TL:**
  - ERHAN ŞENTÜRK, 2 çek: `Çek · No 6001176 · İŞ BANKASI` 75.000 (vade 06.11.2026), `Çek · No 6001177 · İŞ BANKASI` 90.000 (vade 20.11.2026) = 165.000 TL. Notlardaki **ödenmiş 2 çek bilerek girilmedi.**
  - MC LED (JOKER LED), 7 senet × 68.500 = 479.500 TL; vadeler 30.10.2026, 13.11.2026, 27.11.2026, 11.12.2026, 25.12.2026, 15.01.2027, 29.01.2027. Numara ve banka bilgisi olmadığı için açıklama düz `Senet`. **30.10.2026 vadeli senet ödenmemiş olarak girildi** (kullanıcı kararı), vadesi geçmiş görünüyor.
- Kayıt biçimi: `yon: "giden"`, `durum: "aktif"`, `alinanTutar: 0`, `kaynak: "veresiye"` (uygulamadaki "Yeni Borç" ile aynı), `vadeTarihi` ayrı alanda. **`tarih` = girildiği gün (04.11.2026)**, vade değil — çünkü Borçlar listesi `tarih`e göre ay süzüyor; vade tarihi konsa 2027 vadeli senetler bu ay hiç görünmezdi.
- `scripts/cek-senet-gir.mjs`: kuru çalıştırma varsayılan, `--yaz` ile uygular. Her çalıştırmada (kuru dahil) `kasaKayitlari` + `firmalar` yedeğini `import/` klasörüne alır (`yedek-CEK-SENET-ONCESI-…`). Belge kimlikleri vade + belge no'dan türetilir (`vadeli-<firma>-<vade>-<no>`) ve aynı firma/vade/tutar üçlüsü varsa atlanır — betik ikinci kez çalışsa da çift kayıt olmaz. Firma eşleştirmesi tek sonuca düşmezse hiçbir şey yazmadan durur. Yazmadan sonra Firestore'dan yeniden okuyup firma bazında açık kalem sayısı ve toplamları doğrular.
- Genel Durum'daki "Vadesi Yaklaşan Ödemeler" tablosu bu kayıtlarla doldu; Ticari Borçlar toplamı bunları **bir kez** sayıyor (tedarikçi bakiyesinin içinde), alt tablo yalnızca döküm.
- Not: `scripts/yedek-al.mjs` servis hesabı anahtarı istiyor, o dosya bu bilgisayarda yok; görseller dahil tam yedek için Ayarlar → "Şimdi yedek al" (Drive) kullanılmalı.

### Aşama 2: Transfer + Mahsup (ev bilgisayarında yazıldı, localhost'ta test edildi)

**Veri kurgusu.** `KasaKaydi.tur`: `"transfer" | "mahsup" | "mahsup-komisyon"`. Üçü de `alinanTutar = toplamTutar` ve `durum: "tamamlandi"` ile kaydediliyor; böylece "açık kalem" süzen her yer (Alacaklar, Borçlar, Kasa'nın Tahsil Edilecek / Ödenecek kartları) onları **kendiliğinden** görmezden geliyor. Gerçek davranış iki yerde: `lib/hareketler.ts` (para hareketi) ve yeni **`lib/kayit.ts`** (`cariEtkileri`, `harcamaTutari`, `kayitFirmayaAitMi`, rozet etiketleri).

**Transfer.**
- Tek belge, iki bacak: kaynak `odemeSekli`/`bankaHesapId`, hedef `hedefOdemeSekli`/`hedefBankaHesapId`. `hareketlerOf()` kaynakta çıkış, hedefte giriş üretiyor (`bacak: "kaynak" | "hedef"`), toplam kasa değişmiyor, iki hesabın hareketlerinde görünüyor. `firmaId` yok → cariye, ekstreye, Alacaklar'a hiç girmiyor.
- `components/TransferModal.tsx`: Nakit Kasa + bütün banka hesapları (Kart / POS yok), her yönde; "⇅ Yönü çevir"; listelerde hesap sahibi önde (`hesapEtiketi`); en altta "+ Yeni hesap ekle…" (sahip + banka, eklenince seçili geliyor); kaynak = hedef engelli; bakiye yetersizse turuncu uyarı ama kayıt engellenmiyor. Düzenleme ve "Sil" aynı pencerede (tek belge olduğu için iki bacak birlikte kalkıyor / geri geliyor).
- Açılış yerleri: Kasa'daki İşlem listesi (Transfer… / Mahsup… seçilince ilgili pencere açılıyor, satırın işlemi bozulmuyor), Kasa başlığındaki **Transfer** butonu ve Banka Hesapları sayfasındaki **Transfer** butonu.

**Mahsup (aracılı ödeme).**
- `components/MahsupModal.tsx`: tarih, ödeyen (müşteri), alan (tedarikçi / personel / gider kalemi), çekilen tutar, ödeme şekli (Kredi Kartı + "nereden çekildi" / Banka Havalesi / Nakit — **yalnızca bilgi**), karşı tarafa sayılan tutar (varsayılan: çekilenle aynı), açıklama. Pencerede canlı özet: kimin bakiyesinden ne düşecek, fark varsa komisyon satırı.
- Etki: ödeyenin bakiyesi **çekilen** tutar kadar düşüyor, alanın borcu **sayılan** tutar kadar düşüyor; Nakit / Banka / Kart-POS ve Toplam Kasa değişmiyor (`hareketlerOf` boş dönüyor).
- Alan **gider kalemiyse** gider aynı anda doğup kapandığı için bakiyesi değişmiyor, ekstrede borç + alacak satırı olarak görünüyor ve **Harcama sekmesinde + toplamında** sayılıyor. Alan **personelse** sayılan tutar personel ekstresine **ödeme** olarak düşüyor (`lib/personel.ts`), personel kalanı azalıyor.
- **Komisyon farkı** (örn. 10.000 çekildi, 9.700 sayıldı → 300): `POS KOMİSYONU` gider kalemine (yoksa `komisyonKalemiBulVeyaOlustur` ile oluşturuluyor) `mahsupId` ile bağlı **ayrı** bir gider belgesi yazılıyor. Sayılan tutar düzenlenip fark kapanırsa belge siliniyor, fark yeniden açılırsa yeniden yazılıyor. Silme / geri alma ikisini birlikte taşıyor (`kayitSil(id, ekIds)`, `kayitGeriYukle(id, ekIds)`); Çöp Kutusu'nda komisyon ayrı satır olarak listelenmiyor, mahsupla birlikte dönüyor.
- Başlatma: Kasa'daki "Bugün girilenler" satırlarında ve Alacaklar / Borçlar satırlarında `⋯` → **Mahsup** (alacakta ödeyen, borçta alan taraf önceden seçili), firma ekstresinde **Mahsup** butonu (müşteride ödeyen, tedarikçi/giderde alan taraf seçili).
- Görünüm: iki firmanın ekstresinde "Mahsup · A → C"; Arşiv'de **Transfer** ve **Mahsup** sekmeleri, satırlarda tür rozeti ve mahsupta "A → C" gösterimi; **Gelen / Giden / Net** toplamlarına girmiyorlar (kendi toplamları şeritte ayrıca yazıyor); komisyon ve gider mahsubu Harcama'da. Yazdırma çıktısında Giriş / Çıkış sütunları boş, satırda tür işareti var.

**Doğrulama:** `tsc --noEmit`, `eslint`, `npm run build` temiz; **46 birim testi** çalıştırıldı ve hepsi geçti — transferin iki bacağı ve toplam kasayı değiştirmemesi, aylık kasa dağılımı (nakit −, banka +), mahsupta iki tarafın etkisi, 10.000 = 9.700 + 300 aritmetiği, komisyon belgesinin bakiye bırakmaması ama Harcama'ya girmesi, gider kalemine ve personele mahsup, ekstre satırları ve açıklamaları, normal kayıtların bozulmadığı.

**Aşama 3'e bırakılan:** mahsubun **sipariş kalanına** yansıması (şimdilik yalnızca cari bakiye).

### Aşama 3’ün ilk adımı: tutarsızlık raporu (salt okuma; 06.11.2026’da çalıştırıldı)

- `scripts/tutarsizlik-rapor.mjs` — hiçbir şey yazmaz. Hesap mantığı uygulamayla birebir aynı (`siparisOdemeleri`, `siparisHesap`, `kayitBakiyesi`, `siparisBakiyesi`).
- **A)** Bakiye farkı olan firmalar: `cari bakiye` ile `sipariş kalanı + açık alacak kalemleri − açık borç kalemleri` karşılaştırması, fark ve nedeni (siparişleri aşan ödeme / avans, hangi siparişte ne kadar).
- **B)** Siparişlere dağıtılmamış tahsilatlar — Aşama 3'ün asıl kümesi: firmanın açık siparişi varken siparişe bağlanmamış düz Kasa Girişleri (`toplamTutar = alinanTutar`, `siparisId` yok, veresiye değil), firma başına kayıt listesi, dağıtılabilir tutar ve siparişleri aşıp avansa kalacak kısım.
- **C)** Açık siparişi olmayan ama bağlanmamış tahsilatı olan firmalar (bilgi amaçlı).
- Çalıştırma: `node scripts/tutarsizlik-rapor.mjs` (tamamı için `--hepsi`). **Çıktı alınıp Aşama 3'ün planı buna göre netleştirilecek.**

### Aşama 4: Personel maaş carisi (localhost'ta test edildi, onaylandı, commit edildi)

- **Kart alanları:** Ad Soyad, Maaş türü (Haftalık / Aylık), Maaş tutarı, Saatlik mesai ücreti, Geçmişten devreden alacak + tarihi, Aktif / Pasif. `components/PersonelFormModal.tsx`.
- **Kişisel veriler kaldırıldı:** TC kimlik no, telefon, adres, acil durum kişisi, acil telefon, not — arayüzden çıktı **ve 04.11.2026'da `scripts/personel-alan-temizle.mjs --yaz` ile veritabanından silindi** (`deleteField()`). Betik kuru çalıştırmayla başlar, önce `calisanlar` yedeğini `import/yedek-PERSONEL-ALAN-ONCESI-…` dosyasına alır (silinen değerler **yalnızca o yedekte** kaldı), kişisel değerleri ekrana basmaz, sonunda Firestore'dan yeniden okuyup hiç kalmadığını doğrular. `lib/types.ts`'te bu alanlar isteğe bağlı olarak duruyor (eski yedekten geri yükleme bozulmasın diye).
- **Yeni `personelHareketleri` koleksiyonu:** hak ediş, mesai, ek, kesinti. **Ödemeler burada tutulmuyor** — personele ödeme `personelId` taşıyan bir Kasa Çıkış kaydıdır (`personelOdemeYap`). Böylece Kasa'dan personel seçilerek girilen çıkışlar da aynı ekstreye düşüyor ve para iki kez sayılmıyor (Aşama 3'teki "tek kaynak" kuralının aynısı). `lib/personel.ts` iki kaynağı birleştiriyor.
- **Kalan** = devreden + hak edişler + mesai + ekler − kesintiler − ödemeler.
- **Otomatik hak ediş:** `components/HakEdisOtomatik.tsx`, `app/layout.tsx`'te duruyor (hiçbir şey çizmiyor), uygulama açılışında eksik dönemleri tamamlıyor. Belge kimliği `{personelId}_{dönem}` → aynı dönem ikinci kez yazılamıyor. **Dönem kimliği kararı:** notlarda `2026-W45` yazıyordu, yerine haftanın **Pazartesi tarihi** kullanıldı (`h2026-11-02`) ve aylık için `a2026-11`; ISO hafta numarasının yıl sonu karmaşası olmadan aynı sonucu veriyor. Geriye dönük tamamlama devreden tarihinden başlar (devreden yoksa yalnızca bulunduğumuz dönem), en fazla 26 hafta / 12 ay. Devreden tarihi dönem ortasındaysa o dönem devredene dahil sayılır, bir sonraki dönemden başlar.
- **Mesai Ekle:** tarih + saat → saat × saatlik ücret; tutar elle de girilebilir. **Ek / Kesinti** ekstre sayfasından. Her satır (otomatik hak ediş dahil) `⋯` menüsünden düzenlenip silinebiliyor.
- **Liste:** kart görünümü — maaş türü/tutarı, vurgulu **Kalan**, son ödeme tarihi/tutarı, "Bu hafta / bu ay işlendi" (işlenmediyse tek tıkla işler), Ödeme Yap / Mesai Ekle / Ekstre; `⋯` → Düzenle, Pasif yap, (hiç hareketi ve kasa kaydı yoksa) Sil. Üstte "Personel borcu" şeridi, altta pasif personel ayrı grup.
- **Ekstre `/calisanlar/[id]`:** dört kutu (Devreden, Toplam hak ediş, Toplam ödenen, vurgulu Kalan), tarih aralığı (aralık başı devir satırıyla), Tarih / Açıklama / Hak ediş / Ödeme / yürüyen Bakiye, Yazdır / PDF ("Personel Maaş Ekstresi"). `FirmaLink` artık personel adlarını `/calisanlar/{id}` ekstresine bağlıyor (eskiden liste sayfasına gidiyordu).
- **Genel Durum:** Ticari Borçlar bölümünün altında **Personel** tablosu (aktif personel, maaş türü/tutarı, kalan + toplam). **Karar (04.11):** personel borcu Ticari Borçlar toplamına girmez (ticari borç değil) ama **Net Finansal Durum'dan düşülür** → Net = Hazır değerler + Ticari alacaklar − Ticari borçlar − Personel borcu. Özet şeridindeki açıklama satırı ve Ticari Borçlar kutusunun altındaki "Personel borcu ayrı: ₺X" satırı bunu gösteriyor; yazdırma çıktısı da aynı.
- `lib/yedekBicimi.ts` → tarayıcı yedeği listesine `personelHareketleri` eklendi (yoksa "Bilgisayara İndir" bu koleksiyonu atlardı). Firestore kuralları koleksiyon adı bazlı değil, ek kural gerekmedi.
- **Doğrulama:** `tsc --noEmit`, `eslint`, `npm run build` temiz; dönem ve ekstre mantığı için 32 birim testi çalıştırıldı ve hepsi geçti (Pazartesi bulma ve yıl sonu, dönem kimliği/etiketi, devreden tarihine göre dönem üretimi, aynı dönemin iki kez yazılmaması, pasif/maaşsız personel, 26 hafta / 12 ay sınırı, kalan hesabı, ekstrenin tarih sırası ve yürüyen bakiyesi, pasif personelin toplamdan düşmesi).
- **Kalan tek parça tamamlandı:** Kasa özet şeridindeki "Personel Borcu" kartı 06.11.2026'da eklendi (commit `bf37c2f`).

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

**Durum (09.11.2026): Aşama 2, 2B, 3, 4, Genel Durum'un sadeleşmesi ve Personel sayfasının yeni düzeni bitti — plandaki bütün aşamalar tamam.** Sırada bekleyen bir aşama yok; geriye aşağıdaki "Bekleyen küçük işler" kaldı (iki bilgisayardaki Firebase anahtar dosyası, Excel `.xlsx` yedeği). Client secret yenileme ve PIN değiştirme 09.11'de listeden çıkarıldı.

### Aşama 2B — Genel Durum · sonradan sadeleştirildi (06.11.2026)

04.11'de yazılan "Finansal Durum Raporu" bölümlerinin tamamı 06.11'de kaldırıldı; sayfa artık yalnızca sipariş durumunu gösteriyor. Ayrıntı yukarıda, "Genel Durum sadeleşti" bölümünde. Aşağıdaki 04.11 kaydı, o bölümlerin nasıl çalıştığını anlatan tarihsel not olarak duruyor (gerekirse geri getirmek için).

### Aşama 2 — Hesaplar arası transfer (virman) + Mahsup · **BİTTİ** (04.11.2026, ev bilgisayarında yeniden yazıldı)

> Ayrıntı yukarıda, 04.11.2026 bölümünde. Aşağıdaki kurgu kararlarının tamamı uygulandı; tek sapma, mahsupta alan tarafın türünün (`karsiTur`) kayda yazılması ve mahsubun **sipariş kalanına** yansımasının Aşama 3'e bırakılması (şimdilik yalnızca cari bakiye).

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

### Aşama 2B — Genel Durum sayfası · **BİTTİ** (04.11.2026)

Ayrıntı yukarıda, "04.11.2026'da yapılanlar" bölümünde. Geriye yalnızca çek / senet kayıtlarının girilmesi kaldı (aynı bölümün sonundaki adımlar).

### Aşama 3 — Tahsilatların siparişlere dağıtılması · **BİTTİ** (06.11.2026, iş bilgisayarında)

> Ayrıntı yukarıda, 06.11.2026 bölümünde. Aşağıdaki kurgu kararlarının tamamı uygulandı. **Üç sapma:**
> 1. Kaydetmeden önce **dağıtım önizlemesi ve elle değiştirme yapılmadı** — "pencere değişmesin, sadece `₺X → N siparişe dağıtıldı` bildirimi" kararıyla (06.11).
> 2. Avansın sonraki siparişe düşmesi **onay sormuyor**, otomatik (06.11 kararı).
> 3. Dağıtılmamış eski tahsilatlar için **göç betiği yazılmadı**: tutarsızlık raporu tek bir kalem buldu (HİZMET firmasında 1.200 TL avans), toplu dağıtıma gerek kalmadı. Düz Kasa Girişleri bundan sonra girildikleri anda tahsilat olarak dağıtılıyor; eski kayıtlar dokunulmadan çalışmaya devam ediyor.

- **Önce, hiçbir şey değiştirmeden tutarsızlık raporu:** her firma için (cari bakiye) ile (siparişlerin kalan toplamı + diğer alacaklar) karşılaştırılacak; farkı olan firmalar ve farkın nedeni (hangi tahsilat siparişlere dağıtılmamış) listelenecek. Onaydan sonra, yedek alarak, dağıtılmamış tahsilatlar aynı kuralla (eskiden yeniye) dağıtılacak ve sonuç raporlanacak.
- **Önemli bulgu (03.11.2026):** sorun yalnızca "dağıtım yok" değil. Firmadan alınan düz bir Kasa Girişi şu anda cariye **hiç** yansımıyor — `toplamTutar = alinanTutar` olduğu için "peşin satış" gibi modelleniyor ve ekstrede borç + alacak satırı birbirini sıfırlıyor. Bu yüzden `tur: "tahsilat"` diye ayrı bir kayıt türü gerekiyor: ekstrede yalnızca alacak satırı üretir, bakiyeye dağıtılmamış kısmı kadar etki eder.
- Kurgu: `KasaKaydi.dagitim: [{ hedefTur: "siparis" | "kayit", id, tutar }]`. **Tek kaynak kuralı:** bir kayıt `dagitim` taşıyorsa siparişe katkısı yalnızca ondan gelir, taşımıyorsa eski `siparisId`'den — aynı para iki kez sayılmaz. Yeni `lib/dagitim.ts` tüm dağıtımları tek yerde toplar; `siparisOdemeleri`, `kayitBakiyesi`, `ekstreOlustur`, `cariOzetleri` ve Alacaklar bunu kullanır.
- Firma bazında **Tahsilat Al** (Alacaklar, firma ekstresi, Bugün aranacaklar ve Kasa'da firma seçilip Giriş yapılınca): tutar girilince açık siparişlere **eskiden yeniye** otomatik dağıtılır. Kaydetmeden önce önizleme: hangi siparişe ne kadar düştü, hangisi kapandı, hangisi kısmi kaldı. Kullanıcı dağıtımı elle değiştirebilir (sipariş seçerek ya da tutar girerek).
- Siparişler dışındaki alacak kalemleri (devir bakiyesi vb.) de aynı sırayla dağıtıma girer.
- Fazla ödeme firmanın **avans / alacak bakiyesi** olarak kalır, ekstrede görünür ve o firmanın sonraki siparişine otomatik (onaylı) düşer.
- Tahsilat silinir / çöpe giderse dağıtımı geri alınır; çöpten dönünce tekrar uygulanır.
- Sipariş detayına "Bu siparişe yapılan ödemeler" listesi: tarih, tutar, ödeme şekli, hangi tahsilattan geldiği.
- **Alacaklar firma bazında gruplanacak:** Borçlar'da 04.11'de çalışmaya başlayan yapı (`components/OutstandingList.tsx` → `gruplu` bayrağı) Alacaklar'a da açılacak; aynı firmanın siparişleri (örn. EGESER REKLAM) tek satırda toplanacak, satıra tıklayınca açılacak. Eksik kalan tek parça: **firma satırındaki Tahsilat Al / Ödeme Yap butonu** — firma bazında tahsilat, dağıtım kuralı (eskiden yeniye) bu aşamada yazılınca eklenecek.
- **Mahsup (aracılı ödeme) bu aşamada yapılacak:** kurgusu yukarıdaki Aşama 2 bölümünde duruyor (para hareketi üretmez, iki carinin bakiyesini düşürür, komisyon farkı `mahsupId` ile bağlı ikinci belge olarak yazılır). Ödeyenin alacağının düşürülmesi Aşama 3'ün dağıtım kuralını kullandığı için ikisi birlikte yapılıyor.

### Aşama 4 — Personel maaş carisi · **BİTTİ** (04.11.2026)

Ayrıntı yukarıda, 04.11.2026 bölümünde. Aşağıdaki özgün plan karşılaştırma için duruyor; yapılanla iki farkı var: dönem kimliği ISO hafta numarası yerine haftanın Pazartesi tarihi, ve ödemeler ayrı hareket türü değil, `personelId` taşıyan Kasa kayıtları.

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

- **Firebase anahtar dosyası:** `panzehir-84661-firebase-adminsdk-…json` — hem ev hem **iş bilgisayarında** kalıcı olarak silinecek (yedek ve aktarım betikleri için kullanılmıştı, artık gerekmiyor).
- **Excel (.xlsx) yedeği:** gece yedeğinin yanına okunabilir bir `.xlsx` dosyası eklenecek (`exceljs` zaten kurulu). Kod okunarak çıkarılan iki tuzak: (1) `exceljs` şu an **devDependency**, sunucuda çalışacağı için `dependencies`'e taşınmalı; (2) `yedekleriListele()` `panzehir-` ile başlayan her dosyayı görüyor — xlsx Ayarlar'daki **geri yükleme listesinden dışlanmalı** (geri yüklenebilir bir dosya değil) ama `temizle()`'nin 30 günlük budamasına girmeli. Sayfa önerisi: Kasa Kayıtları, Ödemeler ve Dağıtım (dizi alanları satır satır açılarak), Siparişler, Firmalar, Banka Hesapları, Personel, Personel Hareketleri.

İsteğe bağlı, acil değil:

- **Banka Havalesi açılır listesi:** hesap sahibi / banka adını özel tasarım bir açılır listeyle (küçük, soluk banka adı) göstermek — tarayıcının native `<select>`'i buna izin vermiyor.

## Yedekler (`import/`, git'e girmez)
- `yedek-ONCESI-2026-10-31.json` ve `yedek-ONCESI-2026-10-31-aktarim-oncesi.json`: Excel aktarımından önceki deneme verisi.
- `yedek-URETIM-ONCESI-2026-10-31.json`: Aktarımdan sonra, Üretimde düzeltmesinden önce (32,7 MB, görseller dahil).
