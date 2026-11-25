# RainGuard AI — Flood-Risk Intelligence Platform (Smart India Hackathon 2026)

A complete, modular flood-risk intelligence & simulation platform featuring:
- **Classical scikit-learn ML Backend** (`backend/train_model.py`): Benchmarks `RandomForestClassifier` & `GradientBoostingClassifier` pipelines (`StandardScaler` + tree ensemble) trained on a clearly labeled synthetic hydrological dataset, auto-saving artifacts to `backend/artifacts/`.
- **FastAPI REST Backend** (`backend/main.py`): Exposes `/health`, `/model/info`, `/model/retrain`, `/predict`, `/predict/batch`, `/simulate/montecarlo`, and `/weather/tamilnadu`.
- **OpenWeatherMap Server-Side Weather Integration** (`backend/weather_service.py`): Fetches live weather & 24-hour precipitation across 16 Tamil Nadu districts using `OPENWEATHER_API_KEY` (with automatic keyless Open-Meteo and synthetic monsoon fallbacks).
- **Ready-to-Publish Streamlit Application** (`streamlit_app.py` + `streamlit_modules/`): Complete Dark Yellow + Yellow/Lavender command center with 3D Tamil Nadu map, 2D 5×5 heatmap toggle, 24-hour Live Trends, Rainfall Forecasting, Flood-Risk Simulator with real-time 3D reflection, 1,000+ run Monte Carlo engine, and Responder Intelligence Desk.
- **Interactive React + Three.js Web Dashboard** (`src/`): Also connects to `http://localhost:8000/predict` with automatic fallback.

---

## 1. Publish Directly to Streamlit Community Cloud

1. Push the **contents** of this folder directly to the **root** of your GitHub repository (so `streamlit_app.py` and `requirements.txt` are at the top level — avoid uploading inside a subfolder with spaces or parentheses like `geoshiled-ai (1)`).
2. Go to [share.streamlit.io](https://share.streamlit.io) → **New app**.
3. Set **Main file path** to `streamlit_app.py` and select **Python 3.11 or 3.12** under Advanced Settings (root `requirements.txt` and `.streamlit/config.toml` are already configured).
4. *(Optional)* In **App Settings → Secrets**, add your OpenWeatherMap key:
   ```toml
   OPENWEATHER_API_KEY = "your_openweathermap_api_key"
   ```
   *(If you also deploy the FastAPI backend separately on Render/Railway/Cloud Run, add `FASTAPI_URL = "https://your-fastapi-url"` to Secrets; otherwise Streamlit runs the bundled classical scikit-learn model & OpenWeatherMap client in-process automatically.)*

---

## 2. Run Locally (FastAPI + Streamlit)

```bash
# 1. Install Streamlit + scikit-learn dependencies (Python 3.11+ recommended)
pip install -r requirements.txt

# 2. Install FastAPI server dependencies (needed only when running uvicorn backend)
pip install -r backend/requirements.txt

# 3. Copy environment template and add your OpenWeatherMap key
cp .env.example .env

# 4. Train the classical scikit-learn model (also runs automatically on first boot)
python -m backend.train_model

# 5. Terminal 1 — Start FastAPI backend on port 8000
uvicorn backend.main:app --reload --port 8000

# 6. Terminal 2 — Start Streamlit Command Center on port 8501
streamlit run streamlit_app.py
```

In the Streamlit sidebar, toggle **Connect to External FastAPI Server** to route `/predict`, `/weather/tamilnadu`, and `/simulate/montecarlo` through FastAPI (`http://localhost:8000`).

---

## 3. Run the React + Three.js Web Dashboard Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. In the left sidebar under **ML Inference Backend**, toggle **Live FastAPI** to query `http://localhost:8000/predict`.

---

## Prototype Honesty Notice
- The scikit-learn models are trained on synthetic hydrological demonstration data for Smart India Hackathon 2026.
- Forecasts are experimental estimates and Monte Carlo percentiles are uncalibrated sensitivity ranges.
- This application is not connected to live IMD, MOSDAC, NWP, AWS, ESP32, or satellite agency feeds and never transmits real alerts or official evacuation orders.
