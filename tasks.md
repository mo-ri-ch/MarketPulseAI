# Market Pulse AI - Development Tasks

## Phase 1: Infrastructure
- `[x]` **Frontend Setup**
  - `[x]` Initialize React + Next.js project
  - `[x]` Configure UI library and styling framework
  - `[x]` Setup basic routing and project structure
- `[x]` **Backend Setup**
  - `[x]` Initialize FastAPI project
  - `[x]` Setup environment variables & configuration management
- `[x]` **Database Setup**
  - `[x]` Provision database (SQLite locally, PostgreSQL for production)
  - `[x]` Define and apply schema for `users` table
  - `[x]` Define and apply schema for `watchlists` table
  - `[x]` Define and apply schema for `news` table
  - `[x]` Define and apply schema for `sources` table
  - `[x]` Define and apply schema for `alerts` table
  - `[x]` Define and apply schema for `summaries` table
  - `[x]` Define and apply schema for `sentiment_scores` table
- `[x]` **Authentication System**
  - `[x]` Implement user signup endpoint
  - `[x]` Implement user login/logout endpoints (JWT/Session)
  - `[ ]` Integrate Google Login (OAuth) - Pending Client ID
  - `[x]` Build frontend Auth UI components (Login/Signup pages)

## Phase 2: Search & Crawling
- `[x]` **Search Agents Framework**
  - `[x]` Setup web extraction layer structure
  - `[x]` Configure Playwright and BeautifulSoup dependencies
- `[x]` **Primary Source Connectors**
  - `[x]` Build connector for Moneycontrol
  - `[x]` Build connector for TradingView
  - `[x]` Build connector for NSE India
  - `[x]` Build connector for FrontPage
  - `[x]` Build connector for Motilal Oswal
- `[x]` **Secondary & Community Source Connectors**
  - `[x]` Build connectors for Secondary Sources (Reuters, Yahoo, etc.)
  - `[x]` Build connectors for Community Sources (Reddit, X/Twitter, YouTube)
- `[x]` **Crawling & Data Extraction**
  - `[x]` Implement headline extraction logic
  - `[x]` Implement timestamp extraction logic
  - `[x]` Implement stock name/ticker identification logic
  - `[x]` Define source ranking priority logic

## Phase 3: AI Layer
- `[x]` **Duplicate Detection**
  - `[x]` Implement similarity matching for news articles
  - `[x]` Merge identical stories while retaining multiple source references
- `[x]` **Entity & Ticker Extraction**
  - `[x]` Setup LLM / NLP model for entity recognition
  - `[x]` Extract and map entities to specific stock tickers
- `[x]` **AI Summarization**
  - `[x]` Build AI prompt for multi-source news summarization
  - `[x]` Integrate LLM API to generate unified summaries
- `[x]` **Sentiment Analysis**
  - `[x]` Implement sentiment scoring (Positive %, Neutral %, Negative %)
  - `[x]` Save sentiment scores to database
- `[x]` **Importance Ranking**
  - `[x]` Calculate news importance based on source ranking and content

## Phase 4: Dashboard
- `[x]` **UI Layout & Shell**
  - `[x]` Build Global Header and Search Bar
  - `[x]` Build Market Summary component
- `[x]` **Watchlists Feature**
  - `[x]` Build backend endpoints for Watchlist CRUD
  - `[x]` UI: Add stock to watchlist
  - `[x]` UI: Remove stock from watchlist
  - `[x]` UI: Search stocks
  - `[x]` UI: Support for multiple watchlists tabs/views
- `[x]` **News & Analysis Panels**
  - `[x]` Build Breaking News feed component
  - `[x]` Build AI Summary Panel component
  - `[x]` Build Sentiment Panel component
  - `[x]` Build Light/Dark Theme toggle support using CSS variables and local storage persistence
  - `[x]` Build dynamic news archiving logic to keep only last 2 days of news active
- `[x]` **Alerts System**
  - `[x]` Backend logic for Price movement alerts
  - `[x]` Backend logic for Breaking news alerts
  - `[x]` Backend logic for Sentiment change alerts
  - `[x]` Build Dashboard Notifications UI
  - `[x]` Implement Email delivery for alerts

## Phase 5: Production
- `[x]` **Deployment**
  - `[x]` Dockerize frontend and backend
  - `[x]` Setup CI/CD pipeline (Git integration triggers automatic deployment)
  - `[x]` Deploy database (PostgreSQL on Railway)
  - `[x]` Deploy backend to cloud provider (FastAPI on Railway)
  - `[x]` Deploy frontend (Next.js on Vercel)
- `[x]` **Monitoring & Optimization**
  - `[x]` Setup error tracking (e.g., Sentry integrated via sentry-sdk and env vars)
  - `[x]` Add logging for crawling and AI tasks (centralized logging)
  - `[x]` Optimize database queries and indexes (added index on news.published_at in models.py with dynamic self-healing index verification on startup)
  - `[x]` Optimize frontend performance and load times (leveraged Next.js Turbopack production optimizer and code-splitting)


