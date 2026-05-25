# HealthTrack

Mobile-first health tracker built with FastAPI, Jinja templates, vanilla JavaScript, and local JSON storage.

## Structure

```text
main.py                 FastAPI app setup
habit.py                Habit API + JSON storage
food.py                 Food/product/calorie API + JSON storage
templates/index.html    Main page
templates/habit.html    Habit widget and modals
templates/food.html     Food widget and modals
static/css/style.css    Shared app styles
static/css/habits.css   Habit styles
static/css/food.css     Food styles
static/js/main.js       Shared frontend logic
static/js/habit.js      Habit frontend logic
static/js/food.js       Food frontend logic
data/habits.json        Habit data
data/food.json          Food data
```

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open:

```text
http://127.0.0.1:8000/
```

For phone testing, open your laptop IP address:

```text
http://YOUR-LAPTOP-IP:8000/
```
