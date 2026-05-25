from datetime import date, timedelta
from pathlib import Path
from typing import Optional
import json
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "habits.json"
LEGACY_DATA_FILE = BASE_DIR / "data" / "habit.json"

router = APIRouter()


class HabitCreate(BaseModel):
    name: str
    icon: str = "star"
    goal: float = Field(default=1, gt=0)
    unit: str = "count"
    increment: float = Field(default=1, gt=0)


class HabitUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    goal: Optional[float] = Field(default=None, gt=0)
    unit: Optional[str] = None
    increment: Optional[float] = Field(default=None, gt=0)


class HabitComplete(BaseModel):
    date: Optional[str] = None
    amount: float = Field(default=1, ge=0)


def default_store() -> dict:
    return {"habits": {}, "completions": {}}


def save_store(data: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def normalize_store(data: dict) -> dict:
    # Supports old accidental key name: "habit".
    habits = data.get("habits") or data.get("habit") or {}
    completions = data.get("completions") or {}

    for index, habit in enumerate(habits.values()):
        habit.setdefault("id", str(uuid.uuid4())[:8])
        habit.setdefault("icon", "star")
        habit.setdefault("goal", 1)
        habit.setdefault("unit", "count")
        habit.setdefault("increment", 1)
        habit.setdefault("order", index)

    return {"habits": habits, "completions": completions}


def load_store() -> dict:
    try:
        if DATA_FILE.exists():
            return normalize_store(load_json(DATA_FILE))

        if LEGACY_DATA_FILE.exists():
            data = normalize_store(load_json(LEGACY_DATA_FILE))
            save_store(data)
            return data

        data = default_store()
        save_store(data)
        return data

    except (json.JSONDecodeError, OSError):
        data = default_store()
        save_store(data)
        return data


store = load_store()
habits: dict = store["habits"]
completions: dict = store["completions"]


def amount_for_day(habit_id: str, day: date) -> float:
    return float(completions.get(f"{habit_id}:{day}", 0))


def is_done(habit: dict, day: date) -> bool:
    return amount_for_day(habit["id"], day) >= float(habit.get("goal", 1))


@router.get("/api/habits")
async def get_habits():
    today = str(date.today())
    result = []

    for habit in habits.values():
        completed = float(completions.get(f"{habit['id']}:{today}", 0))
        goal = float(habit.get("goal", 1))

        result.append({
            **habit,
            "completed_today": completed,
            "done": completed >= goal,
        })

    result.sort(key=lambda item: item.get("order", 0))
    return {"data": result}


@router.post("/api/habits", status_code=201)
async def create_habit(body: HabitCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Habit name is required")

    habit_id = str(uuid.uuid4())[:8]
    habit = {
        "id": habit_id,
        "name": name,
        "icon": body.icon or "star",
        "goal": body.goal,
        "unit": body.unit.strip() or "count",
        "increment": body.increment,
        "order": len(habits),
    }

    habits[habit_id] = habit
    save_store(store)
    return habit


@router.put("/api/habits/{habit_id}")
async def update_habit(habit_id: str, body: HabitUpdate):
    if habit_id not in habits:
        raise HTTPException(404, "Habit not found")

    habit = habits[habit_id]

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Habit name is required")
        habit["name"] = name

    if body.icon is not None:
        habit["icon"] = body.icon or "star"

    if body.goal is not None:
        habit["goal"] = body.goal

    if body.unit is not None:
        habit["unit"] = body.unit.strip() or "count"

    if body.increment is not None:
        habit["increment"] = body.increment

    save_store(store)
    return habit


@router.delete("/api/habits/{habit_id}", status_code=204)
async def delete_habit(habit_id: str):
    if habit_id not in habits:
        raise HTTPException(404, "Habit not found")

    habits.pop(habit_id)

    for key in [key for key in completions if key.startswith(f"{habit_id}:")]:
        completions.pop(key)

    save_store(store)


@router.post("/api/habits/{habit_id}/complete")
async def complete_habit(habit_id: str, body: HabitComplete):
    if habit_id not in habits:
        raise HTTPException(404, "Habit not found")

    day = body.date or str(date.today())
    amount = max(float(body.amount), 0)
    completions[f"{habit_id}:{day}"] = amount

    done = amount >= float(habits[habit_id]["goal"])
    save_store(store)

    return {
        "habit_id": habit_id,
        "date": day,
        "amount": amount,
        "done": done,
    }


@router.delete("/api/habits/{habit_id}/complete")
async def uncomplete_habit(habit_id: str, d: Optional[str] = None):
    if habit_id not in habits:
        raise HTTPException(404, "Habit not found")

    day = d or str(date.today())
    completions.pop(f"{habit_id}:{day}", None)
    save_store(store)

    return {
        "habit_id": habit_id,
        "date": day,
        "amount": 0,
        "done": False,
    }


@router.get("/api/habits/trends")
async def get_habit_trends():
    today = date.today()
    result = []

    for habit in habits.values():
        current_streak = 0
        cursor = today

        while current_streak < 3650 and is_done(habit, cursor):
            current_streak += 1
            cursor -= timedelta(days=1)

        best_streak = 0
        running_streak = 0

        for i in range(364, -1, -1):
            day = today - timedelta(days=i)
            if is_done(habit, day):
                running_streak += 1
                best_streak = max(best_streak, running_streak)
            else:
                running_streak = 0

        last_7_days = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            amount = amount_for_day(habit["id"], day)
            last_7_days.append({
                "date": str(day),
                "label": day.strftime("%a"),
                "amount": amount,
                "done": amount >= float(habit.get("goal", 1)),
            })

        result.append({
            "id": habit["id"],
            "name": habit["name"],
            "icon": habit.get("icon", "star"),
            "goal": habit.get("goal", 1),
            "unit": habit.get("unit", "count"),
            "increment": habit.get("increment", 1),
            "completed_today": amount_for_day(habit["id"], today),
            "done_today": is_done(habit, today),
            "current_streak": current_streak,
            "best_streak": best_streak,
            "last_7_days": last_7_days,
        })

    result.sort(key=lambda item: habits[item["id"]].get("order", 0))
    return {"data": result}
