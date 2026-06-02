# Market Pulse AI (Web Search Intelligence Edition)

Market Pulse AI is a single-page AI-powered market intelligence dashboard that aggregates, deduplicates, and analyzes stock market updates using web search, crawling, and AI extraction. Instead of relying on expensive, dedicated stock API subscriptions, it dynamically fetches and processes data from various financial news sources, community discussions, and official exchange filings.

## Key Features

1. **Clean & Minimal Dashboard Layout**:
   - A distraction-free, 3-column layout focused on fast information retrieval:
     - **Column 1**: Watchlist Management & Real-Time Alerts.
     - **Column 2**: Breaking News, Unified AI Summaries, and Source Linking.
     - **Column 3**: Stock Sentiment Breakdown & Predictive Direction Analysis.

2. **Multi-Source Crawling & Extraction**:
   - Primary Sources: NSE India, Moneycontrol, TradingView, FrontPage, Motilal Oswal.
   - Secondary Sources: Reuters, Yahoo Finance, Investing.com, Economic Times, LiveMint, Business Standard.
   - Community Sources: Reddit, X/Twitter, YouTube discussions.
   - Smart extractors parse article headlines, exact publishing timestamps, and associated stock tickers.

3. **Smart AI Processing Pipeline**:
   - **Deduplication & Merging**: Identical news stories from different publications are merged together, preserving multiple source links and preventing feed clutter.
   - **Unified Summarization**: Generates a single, cohesive AI summary for grouped articles.
   - **Sentiment Scoring**: Computes positive, neutral, and negative sentiment confidence levels.

4. **Predictive Sentiment & Stock Analytics**:
   - Type a stock ticker (e.g., `TCS`, `RELIANCE`, `INFY`) in the search bar.
   - The platform aggregates recent news and uses the Gemini API (or local heuristics fallback) to analyze key catalysts, highlight drivers/risks, and predict market direction tomorrow (`UP`, `DOWN`, `NEUTRAL`) with a confidence score.

5. **Security & Personalization**:
   - JWT-based user authentication (Signup, Login, Logout).
   - Custom watchlists linked to user accounts.
   - Real-time dashboard notifications and automated email alerts for sentiment changes, breaking news, or price movements.

---

## Tech Stack

### Backend
- **Framework**: FastAPI
- **Database**: SQLite (local) / PostgreSQL (production) with SQLAlchemy ORM
- **Migrations**: Alembic
- **Scraping / Crawling**: BeautifulSoup4, HTTPX, custom RSS & live search processors
- **AI / LLM Integration**: Google Gemini API (`gemini-2.0-flash` or custom models) for sentiment, summarization, and market predictive analytics
- **Authentication**: JWT tokens, bcrypt password hashing
- **Deployment**: Dockerized, optimized for Railway or similar cloud hosting

### Frontend
- **Framework**: Next.js (React) + TypeScript
- **Styling**: Minimalist Vanilla CSS
- **State Management**: React Hooks & Context API
- **Deployment**: Vercel

---

## Project Structure

```
StockMarketNews/
├── backend/              # FastAPI Application
│   ├── ai/               # LLM pipelines & prompts
│   ├── alembic/          # Database migrations
│   ├── crawlers/         # Scrapers and RSS source connectors
│   ├── routers/          # API endpoint routes (watchlists, news, auth, prediction)
│   ├── auth.py           # Authentication logic
│   ├── database.py       # DB connection pool setup
│   ├── main.py           # FastAPI entrypoint
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic validation schemas
│   ├── requirements.txt  # Backend requirements
│   └── Dockerfile        # Container configuration
│
├── frontend/             # Next.js Application
│   ├── public/           # Static assets
│   ├── src/              # Next.js app sources (pages, hooks, components)
│   ├── package.json      # Dependencies and scripts
│   └── Dockerfile        # Container configuration
│
├── tasks.md              # Project status tracking and roadmap
├── market_pulse_ai_updated_prd.md  # Product Requirements Document
└── README.md             # This file
```

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- Gemini API Key (Optional, fallback logic handles requests if key is not configured)

### Setup & Run Backend

1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```

2. Create a virtual environment and activate it:
   ```bash
   # Windows
   python -m venv venv
   .\venv\Scripts\activate

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and fill in your `GEMINI_API_KEY`, database URL, JWT secret key, and SMTP credentials if using email notifications.*

5. Run database migrations:
   ```bash
   alembic upgrade head
   ```

6. Start the FastAPI development server:
   ```bash
   python main.py
   ```
   The backend API will run on [http://localhost:8000](http://localhost:8000).

### Setup & Run Frontend

1. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (if any, in `.env.local`).

4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   The user interface will be accessible at [http://localhost:3000](http://localhost:3000).

---

## Deployment

- **Backend**: Can be easily built using the `backend/Dockerfile` and deployed on platforms like Railway, Render, or AWS ECS.
- **Frontend**: Connect your GitHub repository to Vercel, pointing the root directory to `frontend/`. It will automatically build and deploy the Next.js application.
