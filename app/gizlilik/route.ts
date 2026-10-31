// Public privacy page for the Google OAuth consent screen (Branding > privacy policy link). A route
// handler rather than a page so it skips the root layout and AuthGate: Google must reach it without
// the password.
const HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gizlilik - Panzehir Kasa</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.6;color:#14132a}</style>
</head>
<body>
<h1>Gizlilik</h1>
<p>Panzehir Kasa, Panzehir Reklam'ın iç kullanımı için yazılmış bir kasa defteridir; dışarıya açık
kullanıcı kaydı yoktur.</p>
<p>Uygulama Google Drive'a yalnızca <code>drive.file</code> izniyle, işletme sahibinin kendi hesabına
erişir: kendi oluşturduğu "Panzehir Yedekler" klasörüne kasa verilerinin yedeğini yazar, eski
yedekleri siler ve geri yükleme için okur. Drive'daki başka hiçbir dosyayı göremez.</p>
<p>Veriler üçüncü kişilerle paylaşılmaz, satılmaz ve reklam amacıyla kullanılmaz.</p>
<p>İletişim: panzehirreklam@gmail.com</p>
</body>
</html>`;

export function GET() {
  return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
