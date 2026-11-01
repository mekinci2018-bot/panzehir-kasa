// Terminalde PIN gibi bir değeri gizli (karaktersiz, ekrana basılmadan) sorar. TTY değilse (örn. bir
// boru hattından çalıştırılıyorsa) normal (görünür) soruya düşer.
export function gizliSor(soru) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return import("node:readline/promises").then(async ({ createInterface }) => {
      const rl = createInterface({ input: stdin, output: process.stdout });
      const deger = await rl.question(soru);
      rl.close();
      return deger;
    });
  }
  return new Promise((resolve) => {
    process.stdout.write(soru);
    let girdi = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    function bitir() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(girdi);
    }
    function onData(ch) {
      const kod = ch.charCodeAt(0);
      if (kod === 13 || kod === 10) return bitir(); // Enter (CR/LF)
      if (kod === 4) return bitir(); // Ctrl+D
      if (kod === 3) process.exit(1); // Ctrl+C
      if (kod === 127 || kod === 8) {
        girdi = girdi.slice(0, -1); // Backspace/DEL
        return;
      }
      girdi += ch;
    }
    stdin.on("data", onData);
  });
}
