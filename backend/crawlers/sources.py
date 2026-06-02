"""
Source Ranking Definitions
Priority: 1 = highest, 8 = lowest
"""

SOURCES = [
    # Primary
    {"name": "NSE India",       "url": "https://www.nseindia.com/",        "rank": 1},
    {"name": "Moneycontrol",    "url": "https://www.moneycontrol.com/",    "rank": 2},
    {"name": "Reuters",         "url": "https://www.reuters.com/markets/", "rank": 3},
    {"name": "TradingView",     "url": "https://www.tradingview.com/news/","rank": 4},
    {"name": "Motilal Oswal",   "url": "https://www.motilaloswal.com/",    "rank": 5},
    # Secondary
    {"name": "Yahoo Finance",   "url": "https://finance.yahoo.com/",       "rank": 6},
    {"name": "Economic Times",  "url": "https://economictimes.indiatimes.com/markets/", "rank": 6},
    {"name": "LiveMint",        "url": "https://www.livemint.com/market/", "rank": 6},
    {"name": "Business Standard","url": "https://www.business-standard.com/markets/", "rank": 6},
    {"name": "Investing.com",   "url": "https://www.investing.com/news/",  "rank": 6},
    {"name": "CNBC TV18",       "url": "https://www.cnbctv18.com/market/", "rank": 6},
    # Community
    {"name": "Reddit",          "url": "https://www.reddit.com/r/IndianStockMarket/", "rank": 7},
    {"name": "FrontPage",       "url": "https://frontpageindia.com/",      "rank": 7},
]

# NIFTY50 common tickers and names for entity matching
NIFTY50_TICKERS = {
    "RELIANCE": ["Reliance", "Reliance Industries", "RIL"],
    "TCS": ["TCS", "Tata Consultancy", "Tata Consultancy Services"],
    "HDFCBANK": ["HDFC Bank", "HDFC"],
    "INFY": ["Infosys", "Infy"],
    "HINDUNILVR": ["Hindustan Unilever", "HUL"],
    "ICICIBANK": ["ICICI Bank", "ICICI"],
    "BAJFINANCE": ["Bajaj Finance"],
    "SBIN": ["SBI", "State Bank of India", "State Bank"],
    "BHARTIARTL": ["Airtel", "Bharti Airtel"],
    "KOTAKBANK": ["Kotak Bank", "Kotak Mahindra Bank"],
    "WIPRO": ["Wipro"],
    "AXISBANK": ["Axis Bank"],
    "LT": ["L&T", "Larsen & Toubro", "Larsen and Toubro"],
    "HCLTECH": ["HCL Tech", "HCL Technologies"],
    "ADANIENT": ["Adani Enterprises"],
    "ADANIPORTS": ["Adani Ports"],
    "TATAMOTORS": ["Tata Motors"],
    "TATASTEEL": ["Tata Steel"],
    "MARUTI": ["Maruti Suzuki", "Maruti"],
    "SUNPHARMA": ["Sun Pharma", "Sun Pharmaceutical"],
    "TITAN": ["Titan"],
    "NESTLEIND": ["Nestle India", "Nestle"],
    "ULTRACEMCO": ["UltraTech Cement"],
    "ASIANPAINT": ["Asian Paints"],
    "ONGC": ["ONGC", "Oil and Natural Gas"],
    "POWERGRID": ["Power Grid"],
    "NTPC": ["NTPC"],
    "COALINDIA": ["Coal India"],
    "JSWSTEEL": ["JSW Steel"],
    "INDUSINDBK": ["IndusInd Bank"],
}
