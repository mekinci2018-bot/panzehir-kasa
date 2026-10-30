# Panzehir Reklam — Kasa Defteri

Nakit/kart kasa takibi, alacaklar, verecekler, arşiv, banka bilgileri ve
çalışanlar için basit bir kasa defteri uygulaması.

## Geliştirme

```bash
npm install
cp .env.local.example .env.local   # Firebase config değerlerini doldurun
npm run dev
```

## Firebase kurulumu

1. [Firebase Console](https://console.firebase.google.com)'da proje açın.
2. Build > Firestore Database > "Create database" (production mode).
3. Build > Authentication > Sign-in method > **Email/Password**'ü etkinleştirin.
   Users sekmesinden `kasa@panzehir-kasa.app` kullanıcısını ekleyin; şifresi
   uygulamaya girişte kullanılan 6 haneli şifredir (koda yazılmaz).
4. Project settings > General > "Your apps" > Web app ekleyip verilen
   `firebaseConfig` değerlerini `.env.local` dosyasına yazın.
5. Firestore > Rules sekmesine bu reponun kök dizinindeki `firestore.rules`
   dosyasının içeriğini yapıştırıp yayınlayın.

## Dağıtım

Vercel'e bu repo import edilip, yukarıdaki altı `NEXT_PUBLIC_FIREBASE_*`
değişkeni proje ayarlarında (Environment Variables) tanımlanarak deploy
edilir.

## Yedekleme (Google Drive)

Her gece 03:00'te (TR) Vercel Cron `/api/yedek/cron`'u çağırır: görseller hariç yedek
`Panzehir Yedekler` klasörüne `panzehir-yedek-YYYY-AA-GG.json` olarak yüklenir; pazar gecesi
görseller dahil `panzehir-tam-yedek-YYYY-AA-GG.json.gz` da alınır. 30 günlük yedek ve son 8 tam
yedek saklanır. Ayarlar sayfasında elle yedek, bilgisayara indirme ve geri yükleme bulunur.

Vercel ortam değişkenleri (koda yazılmaz):

| Değişken | İçerik |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase servis hesabı anahtar dosyasının içeriği (JSON ya da base64) |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth istemci kimliği |
| `GOOGLE_CLIENT_SECRET` | OAuth istemci gizli anahtarı |
| `GOOGLE_REFRESH_TOKEN` | Drive için `drive.file` kapsamıyla alınmış yenileme jetonu |
| `CRON_SECRET` | Rastgele uzun bir metin; Vercel Cron bunu gönderir, başkası çağıramaz |
| `DRIVE_FOLDER_ID` | (opsiyonel) Belirli bir klasör kullanılacaksa kimliği |
