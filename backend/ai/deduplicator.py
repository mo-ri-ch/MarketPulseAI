"""
Duplicate Detector: Uses TF-IDF cosine similarity to group near-identical headlines
from multiple sources into a single de-duplicated cluster.
No external LLM needed — this is a lightweight, fast in-process algorithm.
"""
from __future__ import annotations
import re
import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional


def _tokenize(text: str) -> list[str]:
    """Lowercase, strip punctuation, split into words."""
    return re.findall(r'\b[a-z]{2,}\b', text.lower())


def _tfidf_vector(tokens: list[str], idf: dict[str, float]) -> dict[str, float]:
    tf: dict[str, float] = defaultdict(float)
    for t in tokens:
        tf[t] += 1
    total = max(len(tokens), 1)
    return {t: (count / total) * idf.get(t, 1.0) for t, count in tf.items()}


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    common = set(a) & set(b)
    if not common:
        return 0.0
    dot = sum(a[k] * b[k] for k in common)
    mag_a = math.sqrt(sum(v ** 2 for v in a.values()))
    mag_b = math.sqrt(sum(v ** 2 for v in b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


@dataclass
class NewsCluster:
    """A group of headlines that all describe the same event."""
    primary_headline: str                 # Highest-priority source headline
    primary_url: str
    primary_source: str
    primary_rank: int
    duplicate_sources: list[dict] = field(default_factory=list)  # [{source, url, headline}]
    tickers: list[str] = field(default_factory=list)


def deduplicate(news_items: list, threshold: float = 0.65) -> list[NewsCluster]:
    """
    Group news items by semantic similarity using TF-IDF cosine similarity.
    
    Args:
        news_items: list of NewsItem or dicts with 'headline', 'url', 'source_name', 'source_rank'
        threshold:  cosine similarity cutoff (0.65 = ~65% similar → treat as duplicate)
    
    Returns:
        List of NewsCluster objects, sorted by source rank (best source first).
    """
    if not news_items:
        return []

    # Build corpus for IDF
    def get_field(item, field):
        if isinstance(item, dict):
            return item.get(field, "")
        return getattr(item, field, "")

    corpus_tokens = [_tokenize(get_field(it, "headline")) for it in news_items]
    
    # Compute IDF
    N = len(news_items)
    doc_freq: dict[str, int] = defaultdict(int)
    for tokens in corpus_tokens:
        for t in set(tokens):
            doc_freq[t] += 1
    idf = {t: math.log(N / (df + 1)) + 1 for t, df in doc_freq.items()}

    # Build TF-IDF vectors
    vectors = [_tfidf_vector(toks, idf) for toks in corpus_tokens]

    assigned = [False] * N
    clusters: list[NewsCluster] = []

    for i in range(N):
        if assigned[i]:
            continue
        item_i = news_items[i]
        cluster = NewsCluster(
            primary_headline=get_field(item_i, "headline"),
            primary_url=get_field(item_i, "url"),
            primary_source=get_field(item_i, "source_name"),
            primary_rank=get_field(item_i, "source_rank") or 10,
            tickers=getattr(item_i, "tickers", []) or [],
        )
        assigned[i] = True

        for j in range(i + 1, N):
            if assigned[j]:
                continue
            sim = _cosine(vectors[i], vectors[j])
            if sim >= threshold:
                item_j = news_items[j]
                cluster.duplicate_sources.append({
                    "source": get_field(item_j, "source_name"),
                    "url": get_field(item_j, "url"),
                    "headline": get_field(item_j, "headline"),
                    "similarity": round(sim, 3),
                })
                assigned[j] = True
                # Merge tickers from duplicates
                for t in getattr(item_j, "tickers", []) or []:
                    if t not in cluster.tickers:
                        cluster.tickers.append(t)

        clusters.append(cluster)

    return clusters
