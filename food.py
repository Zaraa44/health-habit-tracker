from datetime import date
from pathlib import Path
from typing import Optional
import json
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
FOOD_FILE = BASE_DIR / "data" / "food.json"

router = APIRouter()


class ServingSize(BaseModel):
    name: str
    grams: float = Field(gt=0)


class ProductCreate(BaseModel):
    name: str
    calories_per_100g: float = Field(default=0, ge=0)
    protein_per_100g: float = Field(default=0, ge=0)
    carbs_per_100g: float = Field(default=0, ge=0)
    fat_per_100g: float = Field(default=0, ge=0)
    serving_sizes: list[ServingSize] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    calories_per_100g: Optional[float] = Field(default=None, ge=0)
    protein_per_100g: Optional[float] = Field(default=None, ge=0)
    carbs_per_100g: Optional[float] = Field(default=None, ge=0)
    fat_per_100g: Optional[float] = Field(default=None, ge=0)
    serving_sizes: Optional[list[ServingSize]] = None


class MealCreate(BaseModel):
    product_id: str
    grams: Optional[float] = Field(default=None, gt=0)
    serving_id: Optional[str] = None
    servings: float = Field(default=1, gt=0)
    date: Optional[str] = None


class CalorieGoalUpdate(BaseModel):
    daily_calorie_goal: float = Field(gt=0)


def default_food_store() -> dict:
    return {
        "settings": {"daily_calorie_goal": 2200},
        "products": {},
        "meals": {},
    }


def save_food_store(data: dict) -> None:
    FOOD_FILE.parent.mkdir(parents=True, exist_ok=True)
    with FOOD_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def normalize_existing_product(product: dict) -> dict:
    product.setdefault("id", str(uuid.uuid4())[:8])
    product.setdefault("name", "Unnamed product")
    product.setdefault("calories_per_100g", 0)
    product.setdefault("protein_per_100g", 0)
    product.setdefault("carbs_per_100g", 0)
    product.setdefault("fat_per_100g", 0)
    product.setdefault("serving_sizes", [])

    for serving in product["serving_sizes"]:
        serving.setdefault("id", str(uuid.uuid4())[:8])
        serving.setdefault("name", "Serving")
        serving.setdefault("grams", 100)

    return product


def load_food_store() -> dict:
    if not FOOD_FILE.exists():
        data = default_food_store()
        save_food_store(data)
        return data

    try:
        with FOOD_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)

        defaults = default_food_store()
        settings = {**defaults["settings"], **data.get("settings", {})}
        loaded_products = data.get("products", {})
        loaded_meals = data.get("meals", {})

        for product in loaded_products.values():
            normalize_existing_product(product)

        normalized = {
            "settings": settings,
            "products": loaded_products,
            "meals": loaded_meals,
        }
        save_food_store(normalized)
        return normalized

    except (json.JSONDecodeError, OSError):
        data = default_food_store()
        save_food_store(data)
        return data


food_store = load_food_store()
food_settings: dict = food_store["settings"]
products: dict = food_store["products"]
meals: dict = food_store["meals"]


def round_macro(value: float) -> float:
    return round(float(value), 2)


def normalize_serving_sizes(serving_sizes: list[ServingSize]) -> list[dict]:
    normalized = []

    for serving in serving_sizes:
        name = serving.name.strip()
        if not name:
            continue

        normalized.append({
            "id": str(uuid.uuid4())[:8],
            "name": name,
            "grams": float(serving.grams),
        })

    return normalized


def calculate_meal(product: dict, grams: float) -> dict:
    multiplier = float(grams) / 100
    return {
        "calories": round_macro(product.get("calories_per_100g", 0) * multiplier),
        "protein": round_macro(product.get("protein_per_100g", 0) * multiplier),
        "carbs": round_macro(product.get("carbs_per_100g", 0) * multiplier),
        "fat": round_macro(product.get("fat_per_100g", 0) * multiplier),
    }


def meals_for_day(day: str) -> list[dict]:
    return [meal for meal in meals.values() if meal.get("date") == day]


def summarize_meals(day: str) -> dict:
    day_meals = meals_for_day(day)
    total_calories = round_macro(sum(meal.get("calories", 0) for meal in day_meals))
    total_protein = round_macro(sum(meal.get("protein", 0) for meal in day_meals))
    total_carbs = round_macro(sum(meal.get("carbs", 0) for meal in day_meals))
    total_fat = round_macro(sum(meal.get("fat", 0) for meal in day_meals))
    goal = float(food_settings.get("daily_calorie_goal", 2200))

    return {
        "date": day,
        "daily_calorie_goal": goal,
        "total_calories": total_calories,
        "remaining_calories": round_macro(max(goal - total_calories, 0)),
        "progress": min(total_calories / goal, 1) if goal > 0 else 0,
        "total_protein": total_protein,
        "total_carbs": total_carbs,
        "total_fat": total_fat,
        "meals": day_meals,
    }


def resolve_meal_grams(product: dict, body: MealCreate) -> tuple[float, Optional[dict], float]:
    serving_sizes = product.get("serving_sizes", [])

    if body.serving_id:
        serving = next(
            (item for item in serving_sizes if item.get("id") == body.serving_id),
            None,
        )
        if not serving:
            raise HTTPException(400, "Serving size not found")

        servings = float(body.servings)
        grams = float(serving["grams"]) * servings
        return grams, serving, servings

    if body.grams is None:
        raise HTTPException(400, "Either grams or serving_id is required")

    return float(body.grams), None, 1


@router.get("/api/food/summary")
async def get_food_summary(d: Optional[str] = None):
    day = d or str(date.today())
    return summarize_meals(day)


@router.put("/api/food/goal")
async def update_calorie_goal(body: CalorieGoalUpdate):
    food_settings["daily_calorie_goal"] = body.daily_calorie_goal
    save_food_store(food_store)
    return {"daily_calorie_goal": food_settings["daily_calorie_goal"]}


@router.get("/api/products")
async def get_products():
    result = sorted(products.values(), key=lambda product: product.get("name", "").lower())
    return {"data": result}


@router.post("/api/products", status_code=201)
async def create_product(body: ProductCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Product name is required")

    product_id = str(uuid.uuid4())[:8]
    product = {
        "id": product_id,
        "name": name,
        "calories_per_100g": body.calories_per_100g,
        "protein_per_100g": body.protein_per_100g,
        "carbs_per_100g": body.carbs_per_100g,
        "fat_per_100g": body.fat_per_100g,
        "serving_sizes": normalize_serving_sizes(body.serving_sizes),
    }

    products[product_id] = product
    save_food_store(food_store)
    return product


@router.put("/api/products/{product_id}")
async def update_product(product_id: str, body: ProductUpdate):
    if product_id not in products:
        raise HTTPException(404, "Product not found")

    product = products[product_id]

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Product name is required")
        product["name"] = name

    if body.calories_per_100g is not None:
        product["calories_per_100g"] = body.calories_per_100g
    if body.protein_per_100g is not None:
        product["protein_per_100g"] = body.protein_per_100g
    if body.carbs_per_100g is not None:
        product["carbs_per_100g"] = body.carbs_per_100g
    if body.fat_per_100g is not None:
        product["fat_per_100g"] = body.fat_per_100g
    if body.serving_sizes is not None:
        product["serving_sizes"] = normalize_serving_sizes(body.serving_sizes)

    save_food_store(food_store)
    return product


@router.delete("/api/products/{product_id}", status_code=204)
async def delete_product(product_id: str):
    if product_id not in products:
        raise HTTPException(404, "Product not found")

    products.pop(product_id)

    for meal_id in [
        meal_id
        for meal_id, meal in meals.items()
        if meal.get("product_id") == product_id
    ]:
        meals.pop(meal_id)

    save_food_store(food_store)


@router.post("/api/meals", status_code=201)
async def create_meal(body: MealCreate):
    if body.product_id not in products:
        raise HTTPException(404, "Product not found")

    product = products[body.product_id]
    grams, serving, servings = resolve_meal_grams(product, body)
    meal_id = str(uuid.uuid4())[:8]
    meal_date = body.date or str(date.today())
    totals = calculate_meal(product, grams)

    meal = {
        "id": meal_id,
        "product_id": body.product_id,
        "name": product["name"],
        "grams": grams,
        "date": meal_date,
        "serving_id": serving.get("id") if serving else None,
        "serving_name": serving.get("name") if serving else "Custom grams",
        "servings": servings,
        **totals,
    }

    meals[meal_id] = meal
    save_food_store(food_store)
    return meal


@router.delete("/api/meals/{meal_id}", status_code=204)
async def delete_meal(meal_id: str):
    if meal_id not in meals:
        raise HTTPException(404, "Meal not found")

    meals.pop(meal_id)
    save_food_store(food_store)
