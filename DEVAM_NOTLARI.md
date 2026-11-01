# Devam notları

Son güncelleme: 02.11.2026 (ikinci tur, test edildi ve commit edildi)

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

### Vercel dağıtımı düzeldi
- Sorun `CRON_SECRET` ortam değişkenindeki baştaki/sondaki boşluktu; değer düzeltilince build geçti. Son dağıtım **Hazır**, canlı site güncel.

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

### Kod (localhost'ta yapıldı, henüz test edilmedi)
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

## Yarın test edilecekler
1. **Sekme sayıları (Ekim 2026):** Tümü 242, Üretimde 94, Bitti 148, Ödeme Bekleyen 65 (43 ödenmedi + 22 kısmi), Ödendi 177, Faturası Kesilmeyen 230.
2. **Kasım 2026'ya geçince:** "Önceki aylardan devreden (94 iş)" görünmeli ve satırlarda "Ekim" rozeti olmalı. Bir Ekim siparişini "Üretimde"ye çevirince sayı 95 olmalı. Alacaklar sayfasında Kasım'da Ekim kalemleri durmalı.
3. **Uzun ürün adı:** Tam görünüyor mu? Tutar hücresine `17900` yazınca ₺17.900,00 olarak kaydediliyor mu? Üstteki kaydırma çubuğu tabloyu kaydırıyor mu?
4. **Sıralama:**
   - Siparişler'de Firma başlığına üç kez tıklayın: A→Z, Z→A, eski sıra. Ç, Ş, Ü ile başlayan firmalar doğru yerde mi?
   - Sayfayı yenileyince seçilen sıralama korunuyor mu?
   - KIRAÇ REKLAM ekstresinde Borç başlığına tıklayınca Bakiye sütunu gizleniyor mu?
5. **Siparişler → Yazdır / PDF:**
   - Sayfa yatay mı, logo renkli mi, rozetler renkli mi?
   - Toplamlar ekrandakiyle tutuyor mu?
   - Kasım'da devreden bölümü ayrı başlıkla çıkıyor mu?
6. **Sipariş detayı → Sipariş Formu:** Önizlemede sadece form görünmeli. Büyük görsel, açıklama ve "Teslim alan / İmza" alanı olmalı.

## Bekleyen işler
- **İş bilgisayarında git pull:** Ev bilgisayarından yapılan tüm commit'leri (bu dahil) iş bilgisayarına da çekin (`git pull`), ikisi senkron kalsın.
- **PIN değiştirme:** Ortak kasa hesabının 6 haneli PIN'i değiştirilecek.
- **Firebase anahtar dosyası:** `panzehir-84661-firebase-adminsdk-…json` dosyası — hem ev hem **iş bilgisayarında** kalıcı olarak silinecek (yedek ve aktarım betikleri için kullanılmıştı, artık gerekmiyor).
- **Google Drive otomatik yedek:**
  - Google tarafı hazır: Drive API açık, onay ekranı "In production", OAuth istemcisi ve yenileme jetonu alındı.
  - Vercel'e beş değişken girildi. `FIREBASE_SERVICE_ACCOUNT` tek satırlık (base64) biçimde.
  - Vercel dağıtımı artık Hazır olduğuna göre test edilebilir: Ayarlar → **Şimdi Yedek Al**, ardından Vercel → Settings → Cron Jobs → **Run**.
  - Test başarılı olunca Google Cloud'da client secret'ı yenileyin, çünkü ekran görüntüsüyle sohbete düştü. Yollar: Clients → Panzehir Yedek → Add secret → eskisini Disable ve Delete. Sonra Vercel'de `GOOGLE_CLIENT_SECRET` değerini güncelleyin.
- **Excel yedeği isteği:** Gece yedeğinin yanına okunabilir bir `.xlsx` dosyası eklenebilir (`exceljs` zaten kurulu).
- **Banka Havalesi açılır listesi:** İstenirse hesap sahibi/banka adını özel tasarım bir açılır liste ile (küçük/soluk banka adı) göstermek — tarayıcının native `<select>`'i buna izin vermiyor.

## Yedekler (`import/`, git'e girmez)
- `yedek-ONCESI-2026-10-31.json` ve `yedek-ONCESI-2026-10-31-aktarim-oncesi.json`: Excel aktarımından önceki deneme verisi.
- `yedek-URETIM-ONCESI-2026-10-31.json`: Aktarımdan sonra, Üretimde düzeltmesinden önce (32,7 MB, görseller dahil).
