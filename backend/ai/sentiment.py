"""
Sentiment Analyzer: Lightweight rule-based sentiment scoring for financial headlines.
Uses a curated financial lexicon — no ML model dependency required for fast local inference.
For production, swap score_headline() with a call to an LLM or FinBERT.
"""
import re

# Financial-domain positive / negative word lists
POSITIVE_WORDS = {
    "surge", "surges", "surged", "rally", "rallies", "rallied", "gain", "gains",
    "gained", "rise", "rises", "rose", "risen", "jump", "jumps", "jumped", "soar",
    "soars", "soared", "beat", "beats", "boost", "boosts", "boosted", "upgrade",
    "upgraded", "upgrades", "outperform", "bullish", "record", "high", "profit",
    "profits", "revenue", "growth", "strong", "positive", "buy", "overweight",
    "dividend", "buyback", "acquisition", "merger", "deal", "launch", "approval",
    "approved", "win", "wins", "won", "upside", "recover", "recovery", "rebound",
}

NEGATIVE_WORDS = {
    "fall", "falls", "fell", "fallen", "drop", "drops", "dropped", "decline",
    "declines", "declined", "plunge", "plunges", "plunged", "crash", "crashes",
    "crashed", "loss", "losses", "miss", "misses", "missed", "downgrade",
    "downgraded", "downgrades", "underperform", "bearish", "low", "weak", "sell",
    "underweight", "lawsuit", "fraud", "recall", "default", "debt", "bankrupt",
    "bankruptcy", "penalty", "fine", "fined", "investigation", "probe", "risk",
    "concern", "concerns", "warning", "warn", "warns", "slump", "slumps",
    "slumped", "tank", "tanks", "tanked", "volatile", "volatility", "cut", "cuts",
}

NEGATION_WORDS = {"not", "no", "never", "neither", "nor", "without"}


def score_headline(headline: str) -> dict:
    """
    Score a single news headline for financial sentiment.
    
    Returns:
        {
            "positive": float (0.0–1.0),
            "neutral":  float (0.0–1.0),
            "negative": float (0.0–1.0),
            "label":    "positive" | "neutral" | "negative"
        }
    """
    tokens = re.findall(r"\b\w+\b", headline.lower())
    pos_count = 0
    neg_count = 0

    for i, token in enumerate(tokens):
        # Check for preceding negation (within 2 tokens)
        negated = any(w in NEGATION_WORDS for w in tokens[max(0, i - 2) : i])

        if token in POSITIVE_WORDS:
            if negated:
                neg_count += 1
            else:
                pos_count += 1
        elif token in NEGATIVE_WORDS:
            if negated:
                pos_count += 0.5  # double negative = slight positive
            else:
                neg_count += 1

    total = pos_count + neg_count
    if total == 0:
        return {"positive": 0.0, "neutral": 1.0, "negative": 0.0, "label": "neutral"}

    pos_ratio = round(pos_count / (total + 1), 3)
    neg_ratio = round(neg_count / (total + 1), 3)
    neu_ratio = round(1.0 - pos_ratio - neg_ratio, 3)

    if pos_ratio > neg_ratio and pos_ratio > 0.2:
        label = "positive"
    elif neg_ratio > pos_ratio and neg_ratio > 0.2:
        label = "negative"
    else:
        label = "neutral"

    return {
        "positive": pos_ratio,
        "neutral": max(neu_ratio, 0.0),
        "negative": neg_ratio,
        "label": label,
    }


def score_cluster(headlines: list[str]) -> dict:
    """
    Aggregate sentiment scores across multiple headlines for the same event.
    Returns blended scores across all provided headlines.
    """
    if not headlines:
        return {"positive": 0.0, "neutral": 1.0, "negative": 0.0, "label": "neutral"}
    
    scores = [score_headline(h) for h in headlines]
    avg_pos = round(sum(s["positive"] for s in scores) / len(scores), 3)
    avg_neg = round(sum(s["negative"] for s in scores) / len(scores), 3)
    avg_neu = round(1.0 - avg_pos - avg_neg, 3)

    if avg_pos > avg_neg and avg_pos > 0.15:
        label = "positive"
    elif avg_neg > avg_pos and avg_neg > 0.15:
        label = "negative"
    else:
        label = "neutral"

    return {
        "positive": avg_pos,
        "neutral": max(avg_neu, 0.0),
        "negative": avg_neg,
        "label": label,
    }
