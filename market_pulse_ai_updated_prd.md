# Product Requirements Document (PRD)

# Product Name
Market Pulse AI (Web Search Intelligence Edition)

## Vision
Build a single-page AI-powered market intelligence dashboard that aggregates stock market updates using web search, crawling, and AI extraction instead of dedicated stock APIs.

Goal:
"Open one page and instantly understand what is happening in the market."

---

# Problem Statement

Users jump between:
- Moneycontrol
- TradingView
- NSE India
- FrontPage
- Motilal Oswal
- Reuters
- Yahoo Finance
- Reddit
- Social media

Problems:
- Information overload
- Duplicate stories
- Missed events
- Slow decision-making

The system should centralize and summarize everything.

---

# Core Architecture

User Dashboard
↓
Search Agent Layer
↓

Data Sources

Primary:
- Moneycontrol
- TradingView
- NSE India
- FrontPage
- Motilal Oswal

Secondary:
- Reuters Markets
- Yahoo Finance
- Investing.com
- Economic Times Markets
- LiveMint
- Business Standard
- CNBC TV18

Community Sources:
- Reddit
- X/Twitter
- YouTube market discussions

↓

Web Extraction Layer

Tools:
- Playwright
- BeautifulSoup
- Scrapers
- Content parsers

↓

AI Processing Layer

Modules:
- News extraction
- Duplicate detection
- Entity extraction
- Stock ticker identification
- Sentiment analysis
- AI summarization
- Importance ranking

↓

Database

PostgreSQL

Tables:

users
watchlists
news
sources
alerts
summaries
sentiment_scores

↓

Frontend

React + Next.js

---

# Source Ranking Logic

Priority:

1. NSE India
2. Moneycontrol
3. Reuters
4. TradingView
5. Motilal Oswal
6. Financial news websites
7. Community discussions
8. Social media

---

# Functional Requirements

## Authentication

Features:

- Signup
- Login
- Logout
- Google login

---

## Watchlists

Features:

- Add stock
- Remove stock
- Search stock
- Multiple watchlists

---

## News Aggregation

Features:

- Search all configured sources
- Crawl pages
- Extract headlines
- Extract timestamps
- Extract stock names

---

## Duplicate News Handling

Example:

Same event appears from:

- Moneycontrol
- Reuters
- TradingView

Expected:

- Merge stories
- Keep source references
- Generate single AI summary

---

## AI Summary

Example:

Input:

"NVIDIA announces AI chips and analysts increase targets"

Output:

"NVIDIA receives positive sentiment after AI chip announcement and analyst upgrades."

---

## Sentiment Analysis

Output:

Positive: 80%
Neutral: 15%
Negative: 5%

---

## Alerts

Types:

Price movement alerts
Breaking news alerts
Sentiment change alerts

Delivery:

- Dashboard notifications
- Email
- Telegram future support

---

## Dashboard Layout

------------------------------------------------------
Header

Search Bar

Market Summary

------------------------------------------------------

Watchlist

------------------------------------------------------

Breaking News

------------------------------------------------------

AI Summary Panel

------------------------------------------------------

Sentiment Panel

------------------------------------------------------

Alerts

------------------------------------------------------

---

# Development Plan

## Phase 1

Infrastructure

Tasks:

- Setup React frontend
- Setup FastAPI backend
- Setup PostgreSQL
- Authentication

Deliverable:

Login system

---

## Phase 2

Search & Crawling

Tasks:

- Build search agents
- Add source connectors
- Add crawling

Deliverable:

News aggregation

---

## Phase 3

AI Layer

Tasks:

- Summarization
- Sentiment
- Entity extraction
- Duplicate removal

Deliverable:

AI insights

---

## Phase 4

Dashboard

Tasks:

- Build UI
- Watchlists
- Alerts

Deliverable:

Interactive dashboard

---

## Phase 5

Production

Tasks:

- Deployment
- Monitoring
- Error handling
- Optimization

Deliverable:

Production application

---

# Future Features

- Voice assistant
- Portfolio tracking
- WhatsApp notifications
- AI chatbot
- Multi-agent market analysis
- Personalized recommendations
