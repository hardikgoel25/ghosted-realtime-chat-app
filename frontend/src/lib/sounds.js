const cache = new Map();

function get(src) {
  let audio = cache.get(src);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 0.5;
    cache.set(src, audio);
  }
  return audio;
}

function safePlay(audio) {
  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p?.catch) p.catch(() => {});
  } catch {
    // Autoplay restrictions or missing codec support: sounds are best-effort
  }
}

export function playSendSound() {
  safePlay(get("/send.mp3"));
}

export function playReceiveSound() {
  safePlay(get("/receive.wav"));
}
