/* ── food.js ─── local food + calorie widget ───────────────────────────── */

const FOOD_SUMMARY_API = "/api/food/summary";
const FOOD_GOAL_API = "/api/food/goal";
const PRODUCTS_API = "/api/products";
const MEALS_API = "/api/meals";

let products = [];
let selectedProduct = null;
let latestSummary = null;
let draftServingSizes = [];

function food$(id) {
  return document.getElementById(id);
}

function foodToast(message) {
  if (typeof showToast === "function") {
    showToast(message);
    return;
  }

  console.warn(message);
}

async function foodRequestJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function foodNumber(value, fallback = 0) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function foodPositive(value, fallback = 1) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function foodFormat(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);

  return n.toFixed(1).replace(/\.0$/, "");
}

function foodEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function calculateFromProduct(product, grams) {
  const multiplier = Number(grams || 0) / 100;

  return {
    calories: Number(product.calories_per_100g || 0) * multiplier,
    protein: Number(product.protein_per_100g || 0) * multiplier,
    carbs: Number(product.carbs_per_100g || 0) * multiplier,
    fat: Number(product.fat_per_100g || 0) * multiplier,
  };
}

function openModal(id) {
  food$(id)?.classList.add("open");
}

function closeModal(id) {
  food$(id)?.classList.remove("open");
}

async function loadFoodSummary() {
  try {
    latestSummary = await foodRequestJson(FOOD_SUMMARY_API);
    renderFoodSummary(latestSummary);
  } catch {
    foodToast("Could not load calories");
  }
}

function renderFoodSummary(summary) {
  const current = food$("caloriesCurrent");
  const goal = food$("caloriesGoal");
  const fill = food$("caloriesBarFill");
  const protein = food$("caloriesProtein");
  const carbs = food$("caloriesCarbs");
  const fat = food$("caloriesFat");

  if (!current || !goal || !fill || !protein || !carbs || !fat) return;

  const totalCalories = Number(summary.total_calories || 0);
  const dailyGoal = Number(summary.daily_calorie_goal || 2200);
  const progress = dailyGoal > 0 ? Math.min(totalCalories / dailyGoal, 1) : 0;

  current.textContent = foodFormat(totalCalories);
  goal.textContent = foodFormat(dailyGoal);
  fill.style.width = `${progress * 100}%`;

  protein.textContent = `${foodFormat(summary.total_protein || 0)}g`;
  carbs.textContent = `${foodFormat(summary.total_carbs || 0)}g`;
  fat.textContent = `${foodFormat(summary.total_fat || 0)}g`;
}

async function loadProducts() {
  try {
    const payload = await foodRequestJson(PRODUCTS_API);
    products = payload.data || [];
    renderProductList();
  } catch {
    foodToast("Could not load products");
  }
}

function openFoodModal() {
  openModal("foodModal");
  loadProducts();

  window.setTimeout(() => {
    food$("foodSearch")?.focus();
  }, 100);
}

function closeFoodModal() {
  closeModal("foodModal");
}

function renderProductList() {
  const list = food$("foodList");
  const empty = food$("foodEmpty");
  const search = String(food$("foodSearch")?.value || "").trim().toLowerCase();

  if (!list || !empty) return;

  list.innerHTML = "";

  const filtered = products.filter((product) => {
    return String(product.name || "").toLowerCase().includes(search);
  });

  if (!filtered.length) {
    empty.classList.add("visible");
    return;
  }

  empty.classList.remove("visible");

  filtered.forEach((product) => {
    const row = document.createElement("div");
    row.className = "food-row";

    const servingSizes = product.serving_sizes || [];
    const servingText = servingSizes.length
      ? servingSizes.map((serving) => `${foodEscape(serving.name)} ${foodFormat(serving.grams)}g`).join(" · ")
      : "No serving sizes";

    row.innerHTML = `
      <button class="food-row-main" type="button">
        <div>
          <div class="food-row-name">${foodEscape(product.name)}</div>
          <div class="food-row-meta">${foodFormat(product.calories_per_100g)} kcal / 100g</div>
          <div class="food-row-servings">${servingText}</div>
        </div>
        <div class="food-row-macros">
          P ${foodFormat(product.protein_per_100g)} ·
          C ${foodFormat(product.carbs_per_100g)} ·
          F ${foodFormat(product.fat_per_100g)}
        </div>
      </button>
      <button class="food-row-delete" type="button" aria-label="Delete product">
        <svg viewBox="0 0 24 24">
          <path d="M3 6h18"/>
          <path d="M8 6V4h8v2"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v5"/>
          <path d="M14 11v5"/>
        </svg>
      </button>
    `;

    row.querySelector(".food-row-main")?.addEventListener("click", () => {
      openMealModal(product);
    });

    row.querySelector(".food-row-delete")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteProduct(product);
    });

    list.appendChild(row);
  });
}

async function deleteProduct(product) {
  const ok = window.confirm(
    `Delete "${product.name}"? This also removes meals logged with this product.`,
  );

  if (!ok) return;

  try {
    await foodRequestJson(`${PRODUCTS_API}/${product.id}`, { method: "DELETE" });
    await loadProducts();
    await loadFoodSummary();
  } catch {
    foodToast("Could not delete product");
  }
}

function openProductModal() {
  draftServingSizes = [];

  ["productName", "servingNameInput", "servingGramsInput"].forEach((id) => {
    const el = food$(id);
    if (el) el.value = "";
  });

  ["productCalories", "productProtein", "productCarbs", "productFat"].forEach((id) => {
    const el = food$(id);
    if (el) el.value = "0";
  });

  renderDraftServingSizes();
  openModal("productModal");

  window.setTimeout(() => {
    food$("productName")?.focus();
  }, 100);
}

function closeProductModal() {
  closeModal("productModal");
}

function addDraftServingSize() {
  const nameInput = food$("servingNameInput");
  const gramsInput = food$("servingGramsInput");
  const name = String(nameInput?.value || "").trim();
  const grams = foodPositive(gramsInput?.value, 0);

  if (!name) {
    foodToast("Serving name required");
    nameInput?.focus();
    return;
  }

  if (grams <= 0) {
    foodToast("Serving grams required");
    gramsInput?.focus();
    return;
  }

  draftServingSizes.push({ name, grams });

  nameInput.value = "";
  gramsInput.value = "";
  renderDraftServingSizes();
}

function removeDraftServingSize(index) {
  draftServingSizes.splice(index, 1);
  renderDraftServingSizes();
}

function renderDraftServingSizes() {
  const list = food$("servingList");
  if (!list) return;

  list.innerHTML = "";

  if (!draftServingSizes.length) {
    list.innerHTML = `<div class="serving-empty">No serving sizes added</div>`;
    return;
  }

  draftServingSizes.forEach((serving, index) => {
    const row = document.createElement("div");
    row.className = "serving-row";
    row.innerHTML = `
      <div>
        <strong>${foodEscape(serving.name)}</strong>
        <span>${foodFormat(serving.grams)}g</span>
      </div>
      <button type="button">Remove</button>
    `;

    row.querySelector("button")?.addEventListener("click", () => {
      removeDraftServingSize(index);
    });

    list.appendChild(row);
  });
}

async function saveProduct() {
  const name = food$("productName")?.value.trim() || "";

  if (!name) {
    foodToast("Product name required");
    food$("productName")?.focus();
    return;
  }

  const body = {
    name,
    calories_per_100g: foodNumber(food$("productCalories")?.value, 0),
    protein_per_100g: foodNumber(food$("productProtein")?.value, 0),
    carbs_per_100g: foodNumber(food$("productCarbs")?.value, 0),
    fat_per_100g: foodNumber(food$("productFat")?.value, 0),
    serving_sizes: draftServingSizes,
  };

  try {
    await foodRequestJson(PRODUCTS_API, {
      method: "POST",
      body: JSON.stringify(body),
    });

    closeProductModal();
    await loadProducts();
  } catch {
    foodToast("Could not save product");
  }
}

function openMealModal(product) {
  selectedProduct = product;

  const card = food$("selectedFoodCard");
  const title = food$("mealTitle");
  const select = food$("mealServing");

  if (title) title.textContent = product.name;

  if (card) {
    card.innerHTML = `
      <div class="selected-food-name">${foodEscape(product.name)}</div>
      <div class="selected-food-meta">
        ${foodFormat(product.calories_per_100g)} kcal / 100g ·
        P ${foodFormat(product.protein_per_100g)} ·
        C ${foodFormat(product.carbs_per_100g)} ·
        F ${foodFormat(product.fat_per_100g)}
      </div>
    `;
  }

  if (select) {
    select.innerHTML = `<option value="custom">Custom grams</option>`;

    (product.serving_sizes || []).forEach((serving) => {
      const option = document.createElement("option");
      option.value = serving.id;
      option.textContent = `${serving.name} (${foodFormat(serving.grams)}g)`;
      select.appendChild(option);
    });

    select.value = "custom";
  }

  if (food$("mealGrams")) food$("mealGrams").value = "100";
  if (food$("mealServings")) food$("mealServings").value = "1";

  updateMealFields();
  updateMealPreview();
  openModal("mealModal");

  window.setTimeout(() => {
    food$("mealGrams")?.focus();
  }, 100);
}

function closeMealModal() {
  closeModal("mealModal");
  selectedProduct = null;
}

function selectedServing() {
  if (!selectedProduct) return null;

  const servingId = food$("mealServing")?.value;
  if (!servingId || servingId === "custom") return null;

  return (selectedProduct.serving_sizes || []).find((item) => item.id === servingId) || null;
}

function currentMealGrams() {
  const serving = selectedServing();

  if (serving) {
    const servings = foodPositive(food$("mealServings")?.value, 1);
    return Number(serving.grams) * servings;
  }

  return foodPositive(food$("mealGrams")?.value, 100);
}

function updateMealFields() {
  const serving = selectedServing();
  const servingsField = food$("mealServingsField");
  const gramsField = food$("mealGramsField");

  if (!servingsField || !gramsField) return;

  servingsField.style.display = serving ? "block" : "none";
  gramsField.style.display = serving ? "none" : "block";
}

function updateMealPreview() {
  const preview = food$("mealPreview");
  if (!preview || !selectedProduct) return;

  const grams = currentMealGrams();
  const totals = calculateFromProduct(selectedProduct, grams);
  const serving = selectedServing();
  const label = serving
    ? `${foodFormat(food$("mealServings")?.value || 1)} × ${foodEscape(serving.name)}`
    : `${foodFormat(grams)}g`;

  preview.innerHTML = `
    <div>${label}</div>
    <strong>${foodFormat(totals.calories)} kcal</strong>
    <span>
      P ${foodFormat(totals.protein)}g ·
      C ${foodFormat(totals.carbs)}g ·
      F ${foodFormat(totals.fat)}g
    </span>
  `;
}

async function saveMeal() {
  if (!selectedProduct) return;

  const serving = selectedServing();
  const body = serving
    ? {
        product_id: selectedProduct.id,
        serving_id: serving.id,
        servings: foodPositive(food$("mealServings")?.value, 1),
      }
    : {
        product_id: selectedProduct.id,
        grams: foodPositive(food$("mealGrams")?.value, 100),
      };

  try {
    await foodRequestJson(MEALS_API, {
      method: "POST",
      body: JSON.stringify(body),
    });

    closeMealModal();
    closeFoodModal();
    await loadFoodSummary();
  } catch {
    foodToast("Could not add food");
  }
}

function openCalorieGoalModal() {
  const input = food$("dailyCalorieGoal");

  if (input) {
    input.value = latestSummary?.daily_calorie_goal || 2200;
  }

  openModal("calorieGoalModal");

  window.setTimeout(() => {
    input?.focus();
  }, 100);
}

function closeCalorieGoalModal() {
  closeModal("calorieGoalModal");
}

async function saveCalorieGoal() {
  const goal = foodPositive(food$("dailyCalorieGoal")?.value, 2200);

  try {
    await foodRequestJson(FOOD_GOAL_API, {
      method: "PUT",
      body: JSON.stringify({ daily_calorie_goal: goal }),
    });

    closeCalorieGoalModal();
    await loadFoodSummary();
  } catch {
    foodToast("Could not save calorie goal");
  }
}

function closeAllFoodModals() {
  closeFoodModal();
  closeProductModal();
  closeMealModal();
  closeCalorieGoalModal();
}

function bindOverlayClose(id, closeFn) {
  food$(id)?.addEventListener("click", (event) => {
    if (event.target.id === id) closeFn();
  });
}

function bindFoodEvents() {
  food$("caloriesAddBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openFoodModal();
  });

  food$("caloriesGoalBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openCalorieGoalModal();
  });

  food$("foodCloseIconBtn")?.addEventListener("click", closeFoodModal);
  food$("foodCreateBtn")?.addEventListener("click", openProductModal);
  food$("foodSearch")?.addEventListener("input", renderProductList);

  food$("productSaveBtn")?.addEventListener("click", saveProduct);
  food$("productCancelBtn")?.addEventListener("click", closeProductModal);
  food$("servingAddBtn")?.addEventListener("click", addDraftServingSize);

  food$("mealSaveBtn")?.addEventListener("click", saveMeal);
  food$("mealCancelBtn")?.addEventListener("click", closeMealModal);
  food$("mealServing")?.addEventListener("change", () => {
    updateMealFields();
    updateMealPreview();
  });
  food$("mealGrams")?.addEventListener("input", updateMealPreview);
  food$("mealServings")?.addEventListener("input", updateMealPreview);

  food$("calorieGoalSaveBtn")?.addEventListener("click", saveCalorieGoal);
  food$("calorieGoalCancelBtn")?.addEventListener("click", closeCalorieGoalModal);

  bindOverlayClose("foodModal", closeFoodModal);
  bindOverlayClose("productModal", closeProductModal);
  bindOverlayClose("mealModal", closeMealModal);
  bindOverlayClose("calorieGoalModal", closeCalorieGoalModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllFoodModals();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindFoodEvents();
  loadFoodSummary();
});
