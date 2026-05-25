/* ── habits.js ─── habit widget logic ─────────────────────────────────── */

const ICONS = {
  water: `
    <svg viewBox="0 0 24 24">
      <path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12z"/>
    </svg>
  `,
  walk: `
    <svg viewBox="0 0 24 24">
      <circle cx="13" cy="4" r="2"/>
      <path d="M10 21l2-6"/>
      <path d="M16 21l-3-6"/>
      <path d="M9 9l3-3 3 3"/>
      <path d="M12 6v8"/>
      <path d="M7 13l5-2"/>
    </svg>
  `,
  sleep: `
    <svg viewBox="0 0 24 24">
      <path d="M21 15.5A8.5 8.5 0 0 1 8.5 3 7 7 0 1 0 21 15.5z"/>
    </svg>
  `,
  book: `
    <svg viewBox="0 0 24 24">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/>
      <path d="M4 5.5v16"/>
      <path d="M8 7h8"/>
    </svg>
  `,
  breathe: `
    <svg viewBox="0 0 24 24">
      <path d="M12 4c3 3 3 6 0 8"/>
      <path d="M12 12c-3 2-6 2-8 0"/>
      <path d="M12 12c3 2 6 2 8 0"/>
      <path d="M12 12c0 4-2 6-5 7"/>
      <path d="M12 12c0 4 2 6 5 7"/>
    </svg>
  `,
  strength: `
    <svg viewBox="0 0 24 24">
      <path d="M6 9v6"/>
      <path d="M18 9v6"/>
      <path d="M3 11v2"/>
      <path d="M21 11v2"/>
      <path d="M6 12h12"/>
    </svg>
  `,
  meal: `
    <svg viewBox="0 0 24 24">
      <path d="M8 3v8"/>
      <path d="M5 3v8"/>
      <path d="M11 3v8"/>
      <path d="M5 11h6"/>
      <path d="M8 11v10"/>
      <path d="M17 3v18"/>
      <path d="M17 3c2 2 3 5 3 8h-3"/>
    </svg>
  `,
  heart: `
    <svg viewBox="0 0 24 24">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>
    </svg>
  `,
  medicine: `
    <svg viewBox="0 0 24 24">
      <path d="M10 21a6 6 0 0 1-4.2-10.2l5-5A6 6 0 0 1 19.2 14l-5 5A5.9 5.9 0 0 1 10 21z"/>
      <path d="M8.5 8.5l7 7"/>
    </svg>
  `,
  star: `
    <svg viewBox="0 0 24 24">
      <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2 7.5 14 3 9.6l6.2-.9z"/>
    </svg>
  `
};

const HABIT_API = "/api/habits";
const HABIT_TRENDS_API = "/api/habits/trends";

let habits = [];
let selectedIcon = "star";
let editingHabitId = null;
let longPressTimer = null;
let suppressClick = false;

function $(id) {
  return document.getElementById(id);
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function toPositiveNumber(value, fallback = 1) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function formatAmount(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);

  return n.toFixed(2).replace(/\.?0+$/, "");
}

function formatStreakLabel(days) {
  const n = Number(days || 0);

  if (n === 1) return "1 day";
  return `${n} days`;
}

function normalizeUnit(value) {
  const unit = String(value || "").trim();
  return unit || "count";
}

function iconSvg(name) {
  return ICONS[name] || ICONS.star;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderIconGrid() {
  const grid = $("iconGrid");
  if (!grid) return;

  grid.innerHTML = "";

  Object.keys(ICONS).forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `icon-option ${name === selectedIcon ? "selected" : ""}`;
    btn.setAttribute("aria-label", name);
    btn.dataset.icon = name;
    btn.innerHTML = iconSvg(name);

    btn.addEventListener("click", () => {
      selectedIcon = name;
      renderIconGrid();
    });

    grid.appendChild(btn);
  });
}

function renderHabits() {
  const scroll = $("habitsScroll");
  const empty = $("habitsEmpty");

  if (!scroll || !empty) return;

  scroll.innerHTML = "";

  if (!habits.length) {
    empty.classList.add("visible");
    return;
  }

  empty.classList.remove("visible");

  habits
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .forEach((habit) => {
      const completed = Number(habit.completed_today || 0);
      const goal = Math.max(Number(habit.goal || 1), 0.1);
      const unit = normalizeUnit(habit.unit);
      const increment = Math.max(Number(habit.increment || 1), 0.1);

      const progress = Math.min(completed / goal, 1);
      const dashOffset = 163.4 * (1 - progress);

      const item = document.createElement("div");
      item.className = `habit-item ${habit.done ? "done" : ""}`;
      item.dataset.id = habit.id;
      item.title = `Tap to add ${formatAmount(increment)} ${unit}. Long-press to edit.`;

      item.innerHTML = `
        <div class="habit-ring-wrap">
          <svg class="habit-ring-svg" viewBox="0 0 62 62">
            <circle class="ring-bg" cx="31" cy="31" r="26"></circle>
            <circle class="ring-progress" cx="31" cy="31" r="26" style="stroke-dashoffset:${dashOffset}"></circle>
          </svg>

          <div class="ring-icon">
            ${iconSvg(habit.icon)}
          </div>

          <div class="ring-check">
            <svg viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>

        <div class="habit-label">${escapeHtml(habit.name)}</div>
        <div class="habit-count">
          ${formatAmount(completed)}/${formatAmount(goal)} ${escapeHtml(unit)}
        </div>
        <div class="habit-step">
          +${formatAmount(increment)}
        </div>
      `;

      item.addEventListener("pointerdown", () => {
        suppressClick = false;
        longPressTimer = window.setTimeout(() => {
          suppressClick = true;
          openHabitModal(habit);
        }, 550);
      });

      item.addEventListener("pointerup", () => {
        window.clearTimeout(longPressTimer);
      });

      item.addEventListener("pointerleave", () => {
        window.clearTimeout(longPressTimer);
      });

      item.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openHabitModal(habit);
      });

      item.addEventListener("click", async (event) => {
        event.stopPropagation();

        if (suppressClick) return;
        await trackHabit(habit);
      });

      scroll.appendChild(item);
    });
}

async function loadHabits() {
  try {
    const payload = await requestJson(HABIT_API);
    habits = payload.data || [];
    renderHabits();
  } catch {
    showToast("Could not load habits");
  }
}

async function trackHabit(habit) {
  const completed = Number(habit.completed_today || 0);
  const goal = Math.max(Number(habit.goal || 1), 0.1);
  const increment = Math.max(Number(habit.increment || 1), 0.1);

  const nextAmount = completed >= goal
    ? 0
    : Math.min(completed + increment, goal);

  try {
    if (nextAmount <= 0) {
      await requestJson(`${HABIT_API}/${habit.id}/complete`, {
        method: "DELETE"
      });
    } else {
      await requestJson(`${HABIT_API}/${habit.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ amount: nextAmount })
      });
    }

    const item = document.querySelector(`.habit-item[data-id="${habit.id}"]`);
    if (item) {
      item.classList.add("bounce");
      window.setTimeout(() => item.classList.remove("bounce"), 420);
    }

    await loadHabits();
  } catch {
    showToast("Could not update habit");
  }
}

function openHabitModal(habit = null) {
  const modal = $("habitModal");
  const title = $("modalTitle");
  const name = $("habitName");
  const goal = $("habitGoal");
  const unit = $("habitUnit");
  const increment = $("habitIncrement");
  const deleteBtn = $("habitDeleteBtn");

  if (!modal || !title || !name || !goal || !unit || !increment || !deleteBtn) return;

  editingHabitId = habit?.id || null;
  selectedIcon = habit?.icon || "star";

  title.textContent = habit ? "Edit Habit" : "New Habit";
  name.value = habit?.name || "";
  goal.value = habit?.goal || 1;
  unit.value = habit?.unit || "count";
  increment.value = habit?.increment || 1;

  deleteBtn.style.display = habit ? "block" : "none";

  renderIconGrid();
  modal.classList.add("open");

  window.setTimeout(() => name.focus(), 100);
}

function closeHabitModal() {
  const modal = $("habitModal");
  if (!modal) return;

  modal.classList.remove("open");
  editingHabitId = null;
  selectedIcon = "star";
}

async function saveHabit() {
  const nameInput = $("habitName");
  const goalInput = $("habitGoal");
  const unitInput = $("habitUnit");
  const incrementInput = $("habitIncrement");

  if (!nameInput || !goalInput || !unitInput || !incrementInput) return;

  const name = nameInput.value.trim();
  const goal = toPositiveNumber(goalInput.value, 1);
  const unit = normalizeUnit(unitInput.value);
  const increment = toPositiveNumber(incrementInput.value, 1);

  if (!name) {
    showToast("Habit name required");
    nameInput.focus();
    return;
  }

  const body = {
    name,
    icon: selectedIcon,
    goal,
    unit,
    increment
  };

  try {
    if (editingHabitId) {
      await requestJson(`${HABIT_API}/${editingHabitId}`, {
        method: "PUT",
        body: JSON.stringify(body)
      });
    } else {
      await requestJson(HABIT_API, {
        method: "POST",
        body: JSON.stringify(body)
      });
    }

    closeHabitModal();
    await loadHabits();
  } catch {
    showToast("Could not save habit");
  }
}

async function deleteHabit() {
  if (!editingHabitId) return;

  try {
    await requestJson(`${HABIT_API}/${editingHabitId}`, {
      method: "DELETE"
    });

    closeHabitModal();
    await loadHabits();
  } catch {
    showToast("Could not delete habit");
  }
}

async function openHabitTrendsModal() {
  const modal = $("habitTrendsModal");

  if (!modal) return;

  modal.classList.add("open");

  try {
    const payload = await requestJson(HABIT_TRENDS_API);
    renderHabitTrends(payload.data || []);
  } catch {
    showToast("Could not load trends");
  }
}

function closeHabitTrendsModal() {
  $("habitTrendsModal")?.classList.remove("open");
}

function renderHabitTrends(items) {
  const list = $("habitTrendsList");
  const empty = $("habitTrendsEmpty");

  if (!list || !empty) return;

  list.innerHTML = "";

  if (!items.length) {
    empty.classList.add("visible");
    return;
  }

  empty.classList.remove("visible");

  items.forEach((habit) => {
    const row = document.createElement("div");
    row.className = "trend-card";

    const currentStreak = Number(habit.current_streak || 0);
    const bestStreak = Number(habit.best_streak || 0);
    const unit = normalizeUnit(habit.unit);

    const daysHtml = (habit.last_7_days || [])
      .map((day) => {
        const amount = formatAmount(day.amount || 0);
        const label = escapeHtml(day.label || "");
        const stateClass = day.done ? "done" : "";

        return `
          <div class="trend-day ${stateClass}" title="${amount} ${escapeHtml(unit)}">
            <span class="trend-dot"></span>
            <span class="trend-day-label">${label}</span>
          </div>
        `;
      })
      .join("");

    row.innerHTML = `
      <div class="trend-top">
        <div class="trend-main">
          <div class="trend-icon">
            ${iconSvg(habit.icon)}
          </div>

          <div>
            <div class="trend-name">${escapeHtml(habit.name)}</div>
            <div class="trend-goal">
              Goal: ${formatAmount(habit.goal)} ${escapeHtml(unit)}
            </div>
          </div>
        </div>

        <div class="trend-streak">
          <div class="trend-streak-value">${currentStreak}</div>
          <div class="trend-streak-label">day streak</div>
        </div>
      </div>

      <div class="trend-stats">
        <div>
          <span>Current</span>
          <strong>${formatStreakLabel(currentStreak)}</strong>
        </div>

        <div>
          <span>Best</span>
          <strong>${formatStreakLabel(bestStreak)}</strong>
        </div>

        <div>
          <span>Today</span>
          <strong>${formatAmount(habit.completed_today)} ${escapeHtml(unit)}</strong>
        </div>
      </div>

      <div class="trend-week">
        ${daysHtml}
      </div>
    `;

    list.appendChild(row);
  });
}

function bindHabitEvents() {
  $("habitsAddBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openHabitModal();
  });

  $("habitsCard")?.addEventListener("click", (event) => {
    if (event.target.closest(".habit-item")) return;
    if (event.target.closest("#habitsAddBtn")) return;

    openHabitTrendsModal();
  });

  $("habitTrendsCloseBtn")?.addEventListener("click", closeHabitTrendsModal);

  $("habitTrendsModal")?.addEventListener("click", (event) => {
    if (event.target.id === "habitTrendsModal") {
      closeHabitTrendsModal();
    }
  });

  $("habitSaveBtn")?.addEventListener("click", saveHabit);
  $("habitDeleteBtn")?.addEventListener("click", deleteHabit);
  $("habitCancelBtn")?.addEventListener("click", closeHabitModal);

  $("habitModal")?.addEventListener("click", (event) => {
    if (event.target.id === "habitModal") {
      closeHabitModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeHabitModal();
      closeHabitTrendsModal();
    }

    if (event.key === "Enter" && $("habitModal")?.classList.contains("open")) {
      saveHabit();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindHabitEvents();
  renderIconGrid();
  loadHabits();
});