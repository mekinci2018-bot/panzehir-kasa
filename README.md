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
3. Build > Authentication > Sign-in method > **Anonymous**'u etkinleştirin.
4. Project settings > General > "Your apps" > Web app ekleyip verilen
   `firebaseConfig` değerlerini `.env.local` dosyasına yazın.
5. Firestore > Rules sekmesine bu reponun kök dizinindeki `firestore.rules`
   dosyasının içeriğini yapıştırıp yayınlayın.

## Dağıtım

Vercel'e bu repo import edilip, yukarıdaki altı `NEXT_PUBLIC_FIREBASE_*`
değişkeni proje ayarlarında (Environment Variables) tanımlanarak deploy
edilir.
