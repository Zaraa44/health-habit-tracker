/* ── main.js ─── global utilities only ─────────────────────────────────── */

function today() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });
}

async function checkApiStatus() {
  const dot = document.getElementById('statusDot');
  try {
    const res = await fetch('/api/health');
    const d   = await res.json();
    if (dot) {
      dot.classList.add('online');
      dot.title = `API v${d.version}`;
    }
  } catch {
    if (dot) dot.classList.remove('online');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('headerDate');
  if (el) el.textContent = today();
  checkApiStatus();
});

// Prevent iOS Safari double-tap zoom
let lastTouchEnd = 0;

document.addEventListener(
  "touchend",
  function (event) {
    const now = Date.now();

    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }

    lastTouchEnd = now;
  },
  { passive: false }
);

// Prevent gesture pinch zoom on iOS Safari
document.addEventListener(
  "gesturestart",
  function (event) {
    event.preventDefault();
  },
  { passive: false }
);

