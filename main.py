from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from typing import Optional
from pathlib import Path
from datetime import date, timedelta
import json
import uuid
import uvicorn


BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="HealthTrack API", version="1.0.0")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


# ── Models ────────────────────────────────────────────────────────────────────

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


# ── JSON storage ──────────────────────────────────────────────────────────────

DATA_FILE = BASE_DIR / "data" / "habits.json"


def default_store():
    return {
        "habits": {},
        "completions": {}
    }


def save_store(data):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)

    with DATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_store():
    if not DATA_FILE.exists():
        data = default_store()
        save_store(data)
        return data

    try:
        with DATA_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)

        return {
            "habits": data.get("habits", {}),
            "completions": data.get("completions", {})
        }

    except (json.JSONDecodeError, OSError):
        data = default_store()
        save_store(data)
        return data


store = load_store()
habits: dict = store["habits"]
completions: dict = store["completions"]  # { "habit_id:YYYY-MM-DD": amount }


# ── Pages ─────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# ── Habits CRUD ───────────────────────────────────────────────────────────────

@app.get("/api/habits")
async def get_habits():
    today = str(date.today())
    result = []

    for h in habits.values():
        key = f"{h['id']}:{today}"
        completed = float(completions.get(key, 0))
        goal = float(h.get("goal", 1))

        result.append({
            **h,
            "completed_today": completed,
            "done": completed >= goal
        })

    return {"data": result}


@app.post("/api/habits", status_code=201)
async def create_habit(body: HabitCreate):
    name = body.name.strip()

    if not name:
        raise HTTPException(400, "Habit name is required")

    hid = str(uuid.uuid4())[:8]

    habit = {
        "id": hid,
        "name": name,
        "icon": body.icon,
        "goal": body.goal,
        "unit": body.unit.strip() or "count",
        "increment": body.increment,
        "order": len(habits)
    }

    habits[hid] = habit
    save_store(store)

    return habit


@app.put("/api/habits/{hid}")
async def update_habit(hid: str, body: HabitUpdate):
    if hid not in habits:
        raise HTTPException(404, "Habit not found")

    h = habits[hid]

    if body.name is not None:
        name = body.name.strip()

        if not name:
            raise HTTPException(400, "Habit name is required")

        h["name"] = name

    if body.icon is not None:
        h["icon"] = body.icon

    if body.goal is not None:
        h["goal"] = body.goal

    if body.unit is not None:
        h["unit"] = body.unit.strip() or "count"

    if body.increment is not None:
        h["increment"] = body.increment

    save_store(store)

    return h


@app.delete("/api/habits/{hid}", status_code=204)
async def delete_habit(hid: str):
    if hid not in habits:
        raise HTTPException(404, "Habit not found")

    habits.pop(hid)

    for k in [k for k in completions if k.startswith(f"{hid}:")]:
        completions.pop(k)

    save_store(store)


@app.post("/api/habits/{hid}/complete")
async def complete_habit(hid: str, body: HabitComplete):
    if hid not in habits:
        raise HTTPException(404, "Habit not found")

    d = body.date or str(date.today())
    key = f"{hid}:{d}"

    amount = max(float(body.amount), 0)
    completions[key] = amount

    done = amount >= float(habits[hid]["goal"])

    save_store(store)

    return {
        "habit_id": hid,
        "date": d,
        "amount": amount,
        "done": done
    }


@app.delete("/api/habits/{hid}/complete")
async def uncomplete_habit(hid: str, d: Optional[str] = None):
    if hid not in habits:
        raise HTTPException(404, "Habit not found")

    d = d or str(date.today())
    completions.pop(f"{hid}:{d}", None)

    save_store(store)

    return {
        "habit_id": hid,
        "date": d,
        "amount": 0,
        "done": False
    }


@app.get("/api/habits/trends")
async def get_habit_trends():
    today = date.today()
    result = []

    def amount_for_day(habit_id: str, day: date) -> float:
        return float(completions.get(f"{habit_id}:{day}", 0))

    def is_done(habit: dict, day: date) -> bool:
        return amount_for_day(habit["id"], day) >= float(habit.get("goal", 1))

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
                "done": amount >= float(habit.get("goal", 1))
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
            "last_7_days": last_7_days
        })

    return {"data": result}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)