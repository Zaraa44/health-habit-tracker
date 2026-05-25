# HealthTrack 🌿

A mobile-first health tracking web app built with **FastAPI** + vanilla HTML/CSS/JS.

## Project structure

```
healthapp/
├── main.py              ← FastAPI app + all API routes
├── requirements.txt
├── templates/
│   └── index.html       ← Jinja2 HTML template
└── static/
    ├── css/style.css    ← All styles (mobile-first, dark theme)
    └── js/main.js       ← Frontend JS (API calls, widget updates)
```

## Setup & run

```bash
# 1. Create a virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the server
python main.py
# or: uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser (or on your phone via your local IP).

## API docs

FastAPI auto-generates interactive docs:
- Swagger UI → http://localhost:8000/docs
- ReDoc      → http://localhost:8000/redoc

## Available endpoints

| Method | Path          | Description          |
|--------|---------------|----------------------|
| GET    | /api/health   | Health check         |
| GET    | /api/summary  | Latest + totals      |
| GET/POST | /api/weight | Weight entries       |
| GET/POST | /api/sleep  | Sleep entries        |
| GET/POST | /api/water  | Water intake         |
| GET/POST | /api/mood   | Mood entries         |
| GET/POST | /api/steps  | Step count           |

## Widgets (current)
- ⚖️  Weight
- 😴  Sleep
- 💧  Hydration
- 😊  Mood
- 👟  Steps

## Widgets (placeholders — coming soon)
- 🏋️  Workout
- ❤️  Heart Rate
- 🍎  Calories
- 💊  Supplements

## Next steps
- Replace the in-memory `data_store` with **SQLite** (via `databases` or `SQLAlchemy`)
- Add user authentication
- Build out the Trends / Log / Settings pages
- Connect a mobile PWA manifest + service worker for offline support
