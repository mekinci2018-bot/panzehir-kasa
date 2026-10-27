# Panzehir Kasa — Devam Notları

Son güncelleme: 2026-10-28

## Proje nedir

Panzehir Reklam için basit bir kasa/cari takip uygulaması. Nakit ve kart
tahsilatını, müşterilerden alınacak (Alacaklar) ve tedarikçilere ödenecek
(Borçlar) tutarları, banka hesaplarını ve personel bilgilerini tutar.

Orijinal talep: "kasa-roan" adlı bir referans siteyle birebir aynı mantıkta,
sıfırdan, Panzehir markasıyla, Firebase + GitHub + Vercel'e bağlı bir sistem.

## Canlı ortam bilgileri

- **Canlı site (üretim):** https://panzehir-kasa.vercel.app
- **GitHub reposu:** https://github.com/mekinci2018-bot/panzehir-kasa
- **Firebase projesi:** `panzehir-84661` (console.firebase.google.com)
  - Firestore veritabanı: `(default)`, Production mode kuralları yayınlı
    (bkz. `firestore.rules` — herkese açık değil, sadece oturum açmış
    (anonim) kullanıcıya izin veriyor)
  - Authentication: **Anonymous** sağlayıcı etkin (görünmez oturum açma —
    kullanıcıya login ekranı göstermiyoruz, link paylaşılmadığı sürece
    güvenli kabul edildi)
- **Vercel:** GitHub reposuna bağlı, `main` dalına her push otomatik
  deploy tetikliyor.
- **API anahtarları / Firebase config:** Bu dosyaya yazılmadı. Vercel
  projesinin Environment Variables kısmında zaten tanımlı. Yerelde
  çalıştırmak için Firebase Console → Project Settings → "Your apps" →
  Web app'ten tekrar alınabilir (bkz. "Yerelde çalıştırma").

## Git dal yapısı

- `main` — üretimde yayında olan, onaylanmış kod. Vercel bunu izliyor.
- `tasarim` — bu notların yazıldığı dal. Şu an `main` ile birebir aynı
  noktadan ayrıldı (ekstra bir yedek/referans dalı, main'den farklı
  onaylanmamış bir içerik YOK). İleride üzerinde çalışılacak yeni/deneysel
  değişiklikler için kullanılabilir; `main`'e alınmadan Vercel'e yansımaz.

## Proje yapısı (önemli dosyalar)

```
app/
  layout.tsx              kök layout, Sidebar + ana içerik alanı
  page.tsx                "/" → "/kasa" yönlendirmesi
  kasa/page.tsx            ana kasa sayfası (özet kartları + Excel-vari giriş tablosu)
  kasa/KayitRow.tsx         tablo satırı bileşeni (hem kayıtlı hem taslak satır)
  alacaklar/page.tsx        Alacaklar sayfası (OutstandingList'i sarar)
  verecekler/page.tsx       Borçlar sayfası (rota adı "verecekler", görünen ad "Borçlar")
  arsiv/page.tsx            ay ay geçmiş kayıtlar + kapanmış kayıtlar
  banka-bilgileri/page.tsx  Banka Hesapları (rota adı "banka-bilgileri")
  calisanlar/page.tsx       Personel (rota adı "calisanlar")
  globals.css               tasarım tokenleri (renkler, kart/badge/tablo stilleri)

components/
  Sidebar.tsx              sol menü (masaüstü) + mobil hamburger/drawer
  Logo.tsx                 public/logo.png'yi gösterir
  PageHeader.tsx           sayfa başlığı + selamlama + tarih
  StatCard.tsx             özet kartları (ikon, renk tonu, üst şerit)
  EmptyState.tsx           boş durum kutuları
  OutstandingList.tsx      Alacaklar ve Borçlar sayfalarının ortak tablosu
  MonthNav.tsx             ay ileri/geri navigasyonu
  AmountModal.tsx          "Ödeme Al / Ödeme Yap" tutar girme penceresi

lib/
  firebase.ts              Firebase init + anonim oturum (client-only, lazy)
  db.ts                    Firestore'a yazma/güncelleme/silme fonksiyonları
  hooks.ts                 Firestore'dan gerçek zamanlı okuma (onSnapshot) hook'ları
  types.ts                 KasaKaydi / BankaHesabi / Calisan tipleri
  format.ts                para/tarih formatlama, selamlama metni

firestore.rules            Firestore güvenlik kuralları (Console'dan yayınlandı)
firebase.json / .firebaserc  Firebase CLI ile kural deploy etmek için (opsiyonel)
.env.local.example          gerekli ortam değişkenlerinin listesi (değerler boş)
```

### Veri modeli (Firestore koleksiyonları)

- `kasaKayitlari`: `{ tarih, ay, firma, aciklama, toplamTutar, alinanTutar, odemeSekli: "nakit"|"kart", yon: "gelen"|"giden", durum: "aktif"|"tamamlandi"|"arsiv" }`
  - `yon: "gelen"` ekranda **"Giriş"**, `yon: "giden"` ekranda **"Çıkış"** olarak gösterilir (veritabanı değeri değişmedi, sadece etiket).
  - `gelen` + kalan tutar > 0 → **Alacaklar** sayfasında görünür.
  - `giden` + kalan tutar > 0 → **Borçlar** sayfasında görünür.
- `bankaHesaplari`: `{ banka, hesapSahibi, iban, aciklama }`
- `calisanlar`: `{ adSoyad, tcKimlikNo, telefon, adres, acilDurumKisisi, acilTelefon, not }`

## Şimdiye kadar yapılanlar

1. Sıfırdan Next.js + Tailwind + Firebase projesi kuruldu, orijinal referans
   siteyle aynı temel akış (Kasa / Alacaklar / Arşiv / Banka Bilgileri /
   Çalışanlar) birebir uygulandı.
2. Yeni eklenen: **Borçlar** (Verecekler) sayfası — Alacaklar'ın ters yönü,
   tedarikçilere ödenecek tutarları takip eder.
3. Firebase projesi (`panzehir-84661`) kuruldu, Firestore + Anonim Auth
   etkinleştirildi, güvenlik kuralları yayınlandı.
4. GitHub reposu oluşturuldu, Vercel'e bağlandı, otomatik deploy zinciri
   doğrulandı (push → otomatik canlıya çıkıyor).
5. Gerçek Panzehir logosu entegre edildi (`public/logo.png`).
6. Kapsamlı görsel yeniden tasarım yapıldı: koyu lacivert/kırmızı marka
   kimliği, lucide-react ikon seti, selamlama+tarihli sayfa başlıkları,
   renkli/ikonlu özet kartları, Türk Lirası formatı (₺12.450,00), zebra
   tablo, Giriş/Çıkış renkli rozetler, yönlendirici boş durum mesajları,
   30 günden eski alacak/borçlarda "Gecikmiş" rozeti, mobilde hamburger
   menü + kayan panel, yumuşak geçiş animasyonları. **Bu sırada veri
   modeline, Firestore kodlarına veya koleksiyon/alan adlarına dokunulmadı
   — sadece görünüm ve ekran metinleri değişti.**
7. Bulunan ve düzeltilen hatalar:
   - Kasa sayfasında bir satır kaydedildikten sonra taslak satırın eski
     veriyi göstermeye devam etmesi (yanlışlıkla ikinci kez kaydetme
     riski) → düzeltildi (`KayitRow.tsx` içinde taslak satırlar artık
     üst bileşenden gelen sıfırlamayı doğru yansıtıyor).
   - Next.js 16'nın "Cache Components" özelliği dinamik tarih
     kullanımıyla çakıştığı için kapatıldı (`next.config.ts`).

## Yarım kalanlar / bilinen küçük notlar

- Kasa sayfasında yeni satır eklerken bazen art arda **iki boş taslak
  satır** görünebiliyor (bir kayıt kaydedilince). Veri hatası değil,
  sadece kozmetik bir fazlalık; orijinal tasarımdan beri var, düzeltilmedi
  çünkü işlevselliğe dokunmama kararı alındı.
- Hiçbir görünür giriş/login ekranı yok — güvenlik tamamen "linki kimseyle
  paylaşma" prensibine dayanıyor + arka planda anonim Firebase Auth.
  İleride gerçek bir kullanıcı girişi istenirse bu değişmeli.
- Otomatik yedekleme/dışa aktarma (Excel/PDF export vb.) yok.
- Test altyapısı (otomatik test) yok; tüm doğrulamalar manuel/Playwright
  ile tek seferlik yapıldı.
- `tasarim` dalı şu an sadece bir referans noktası; üzerinde bekleyen,
  onay gereken bir iş YOK.

## Sıradaki olası adımlar (öneri, zorunlu değil)

- Gerçek bir kullanıcı/şifre girişi eklemek istenirse Firebase Auth'u
  email/password veya Google ile değiştirmek.
- Arşiv sayfasına firma adına göre arama/filtre eklemek.
- Alacak/Borç kayıtlarını Excel'e aktarma.
- Aylık özet raporu (toplam gelir/gider grafiği).

## Yerelde çalıştırma (başka bir bilgisayarda)

```bash
git clone https://github.com/mekinci2018-bot/panzehir-kasa.git
cd panzehir-kasa
git checkout tasarim   # veya main
npm install
cp .env.local.example .env.local
```

`.env.local` içine Firebase Console → Project Settings → General →
"Your apps" → Web app'ten alınan değerleri yazın (6 adet
`NEXT_PUBLIC_FIREBASE_*` değişkeni). Sonra:

```bash
npm run dev
```

`http://localhost:3000` adresinde açılır.

### Firebase CLI notu

Bu projede `firebase.json` / `.firebaserc` dosyaları var; Firestore
kurallarını CLI ile deploy etmek isterseniz (`firebase deploy --only
firestore:rules`) önce `firebase login` ile `mekinci2018@gmail.com`
hesabıyla giriş yapmanız gerekir. Giriş bu bilgisayara özel olduğundan
yeni bilgisayarda tekrar yapılmalı (veya kurallar doğrudan Firebase
Console → Firestore → Rules sekmesinden elle güncellenebilir).

### Vercel notu

Yeni bir değişikliği canlıya almak için sadece `main` dalına push etmek
yeterli — Vercel otomatik yakalar. `tasarim` dalına push etmek canlı
siteyi ETKİLEMEZ.
