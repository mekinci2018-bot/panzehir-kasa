# Devam notları

Son güncelleme: 31.10.2026

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
- **Vercel doğrulaması:**
  - Vercel her yeniden dağıtımda **mekinci2018@gmail.com** adresine kod istiyor. Posta kutusu dolu olduğu için kod gelmiyor.
  - Önce Gmail'de yer açın: one.google.com/storage, Çöp Kutusu, Spam ve `larger:10M` aramasıyla bulunan büyük ekler.
  - Sonra Vercel → Deployments → en üst satır → ⋯ → Redeploy → gelen kodu girin.
  - Canlıda en son çalışan sürüm `78f9c56`. Ondan sonraki dağıtımlar derleme başlamadan hata verdi. Kodun değişkenler olmadan da derlendiği yerelde doğrulandı.
- **Google Drive otomatik yedek:**
  - Google tarafı hazır: Drive API açık, onay ekranı "In production", OAuth istemcisi ve yenileme jetonu alındı.
  - Vercel'e beş değişken girildi. `FIREBASE_SERVICE_ACCOUNT` tek satırlık (base64) biçimde.
  - Yeniden dağıtımdan sonra yapılacaklar: Ayarlar → **Şimdi Yedek Al**, ardından Vercel → Settings → Cron Jobs → **Run**.
  - Test başarılı olunca Google Cloud'da client secret'ı yenileyin, çünkü ekran görüntüsüyle sohbete düştü. Yollar: Clients → Panzehir Yedek → Add secret → eskisini Disable ve Delete. Sonra Vercel'de `GOOGLE_CLIENT_SECRET` değerini güncelleyin.
- **Firebase anahtar dosyası:** `panzehir-84661-firebase-adminsdk-…json` dosyası Geri Dönüşüm Kutusu'nda duruyor. Yedek ve aktarım betikleri bu dosyayı kullanıyor. İşi bitince kalıcı olarak silinmeli.
- **Excel yedeği isteği:** Gece yedeğinin yanına okunabilir bir `.xlsx` dosyası eklenebilir (`exceljs` zaten kurulu).

## Yedekler (`import/`, git'e girmez)
- `yedek-ONCESI-2026-10-31.json` ve `yedek-ONCESI-2026-10-31-aktarim-oncesi.json`: Excel aktarımından önceki deneme verisi.
- `yedek-URETIM-ONCESI-2026-10-31.json`: Aktarımdan sonra, Üretimde düzeltmesinden önce (32,7 MB, görseller dahil).
