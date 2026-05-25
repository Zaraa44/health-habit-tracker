/* ── main.js ─── shared app behavior ──────────────────────────────────── */

function formatHeaderDate() {
  const el = document.getElementById("headerDate");
  if (!el) return;

  const formatter = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  el.textContent = formatter.format(new Date());
}

async function checkApiStatus() {
  const dot = document.getElementById("statusDot");
  if (!dot) return;

  try {
    const res = await fetch("/api/health");
    dot.classList.toggle("ok", res.ok);
    dot.classList.toggle("error", !res.ok);
  } catch {
    dot.classList.remove("ok");
    dot.classList.add("error");
  }
}

function preventMobileZoom() {
  let lastTouchEnd = 0;

  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();

      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }

      lastTouchEnd = now;
    },
    { passive: false },
  );

  document.addEventListener(
    "gesturestart",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );
}

document.addEventListener("DOMContentLoaded", () => {
  formatHeaderDate();
  checkApiStatus();
  preventMobileZoom();
});
