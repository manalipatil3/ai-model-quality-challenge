from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Sequence

from .base_pruner import BasePruner, SampleRecord


class DisagreementPruner(BasePruner):
    """
    Universal pruner for coding + long-context benchmarks.

    Importance = disagreement + difficulty + diversity (+ optional metadata signal).
    """

    def __init__(
        self,
        prune_ratio: float = 0.1,
        min_per_category: int = 1,
        seed: int = 42,
        length_weight: float = 0.05,
    ) -> None:
        super().__init__(prune_ratio=prune_ratio, min_per_category=min_per_category, seed=seed)
        self.length_weight = length_weight

    def score_sample(self, sample: SampleRecord) -> float:
        length = int(sample.metadata.get('context_length', 0) or 0)
        if length <= 0:
            return 0.0
        # Normalize long-context spread without overfitting to a single token cutoff.
        normalized = min(length / 150_000.0, 1.0)
        return self.length_weight * normalized

    @classmethod
    def from_reviews(
        cls,
        reviews_dir: Path,
        benchmark_prefix: str,
        metric_key: str,
        predictions_dir: Optional[Path] = None,
        category_fn=None,
        metadata_fn=None,
        models: Optional[Sequence[str]] = None,
        prune_ratio: float = 0.1,
    ) -> 'DisagreementPruner':
        pruner = cls(prune_ratio=prune_ratio)
        scores_by_index = cls.load_review_scores(reviews_dir, benchmark_prefix, metric_key, models=models)
        metadata_by_index: Dict[int, Dict] = {}
        if predictions_dir is not None:
            metadata_by_index = cls.load_prediction_metadata(predictions_dir, benchmark_prefix)

        samples: List[SampleRecord] = []
        for index, model_scores in sorted(scores_by_index.items()):
            metadata = metadata_by_index.get(index, {})
            if metadata_fn is not None:
                metadata = {**metadata, **metadata_fn(index, metadata)}
            category = category_fn(index, metadata) if category_fn is not None else 'default'
            samples.append(
                SampleRecord(
                    index=index,
                    scores=model_scores,
                    metadata=metadata,
                    category=category,
                )
            )
        pruner._samples = samples
        return pruner

    def build_records(
        self,
        reviews_dir: Path,
        benchmark_prefix: str,
        metric_key: str,
        predictions_dir: Optional[Path] = None,
        category_fn=None,
        metadata_fn=None,
        models: Optional[Sequence[str]] = None,
    ) -> List[SampleRecord]:
        scores_by_index = self.load_review_scores(reviews_dir, benchmark_prefix, metric_key, models=models)
        metadata_by_index: Dict[int, Dict] = {}
        if predictions_dir is not None:
            metadata_by_index = self.load_prediction_metadata(predictions_dir, benchmark_prefix)

        records: List[SampleRecord] = []
        for index, model_scores in sorted(scores_by_index.items()):
            metadata = metadata_by_index.get(index, {})
            if metadata_fn is not None:
                metadata = {**metadata, **metadata_fn(index, metadata)}
            category = category_fn(index, metadata) if category_fn is not None else 'default'
            records.append(
                SampleRecord(
                    index=index,
                    scores=model_scores,
                    metadata=metadata,
                    category=category,
                )
            )
        return records

    def select_from_reviews(
        self,
        reviews_dir: Path,
        benchmark_prefix: str,
        metric_key: str,
        predictions_dir: Optional[Path] = None,
        category_fn=None,
        metadata_fn=None,
        models: Optional[Sequence[str]] = None,
    ) -> List[int]:
        records = self.build_records(
            reviews_dir=reviews_dir,
            benchmark_prefix=benchmark_prefix,
            metric_key=metric_key,
            predictions_dir=predictions_dir,
            category_fn=category_fn,
            metadata_fn=metadata_fn,
            models=models,
        )
        return self.select(records)
