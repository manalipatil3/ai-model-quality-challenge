from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set


@dataclass
class SampleRecord:
    """Joined per-sample view used by pruning strategies."""

    index: int
    scores: Dict[str, float]
    metadata: Dict[str, Any] = field(default_factory=dict)
    category: str = 'default'

    @property
    def mean_score(self) -> float:
        if not self.scores:
            return 0.0
        return sum(self.scores.values()) / len(self.scores)

    @property
    def unanimous(self) -> bool:
        values = list(self.scores.values())
        return len(values) > 0 and len(set(values)) == 1

    @property
    def pass_rate(self) -> float:
        if not self.scores:
            return 0.0
        return sum(1 for value in self.scores.values() if value >= 0.5) / len(self.scores)


class BasePruner(ABC):
    """Select informative benchmark samples while preserving category coverage."""

    def __init__(
        self,
        prune_ratio: float = 0.1,
        min_per_category: int = 1,
        seed: int = 42,
    ) -> None:
        if not 0 < prune_ratio <= 1:
            raise ValueError('prune_ratio must be in (0, 1].')
        self.prune_ratio = prune_ratio
        self.min_per_category = min_per_category
        self.seed = seed

    @abstractmethod
    def score_sample(self, sample: SampleRecord) -> float:
        """Return the base importance score for a sample."""

    def disagreement_score(self, sample: SampleRecord) -> float:
        values = list(sample.scores.values())
        if len(values) <= 1:
            return 0.0
        return 1.0 if len(set(values)) > 1 else 0.0

    def difficulty_score(self, sample: SampleRecord) -> float:
        """Mixed outcomes are most informative for go/no-go and ranking."""
        values = list(sample.scores.values())
        if not values:
            return 0.0
        all_pass = all(value >= 0.5 for value in values)
        all_fail = all(value < 0.5 for value in values)
        if all_pass:
            return 0.15
        if all_fail:
            return 0.25
        return 1.0

    def diversity_bonus(self, sample: SampleRecord, selected_counts: Mapping[str, int]) -> float:
        """Reward under-covered categories during greedy selection."""
        count = selected_counts.get(sample.category, 0)
        return 1.0 / (1.0 + count)

    def importance_score(self, sample: SampleRecord, selected_counts: Optional[Mapping[str, int]] = None) -> float:
        selected_counts = selected_counts or {}
        return (
            self.disagreement_score(sample)
            + self.difficulty_score(sample)
            + self.score_sample(sample)
            + self.diversity_bonus(sample, selected_counts)
        )

    def select(self, samples: Sequence[SampleRecord]) -> List[int]:
        if not samples:
            return []

        target = max(1, round(len(samples) * self.prune_ratio))
        categories = sorted({sample.category for sample in samples})
        selected: List[SampleRecord] = []
        selected_counts: Dict[str, int] = defaultdict(int)
        remaining = list(samples)

        # Seed one sample per category to preserve coverage.
        for category in categories:
            if len(selected) >= target:
                break
            candidates = [sample for sample in remaining if sample.category == category]
            if not candidates:
                continue
            best = max(
                candidates,
                key=lambda sample: self.disagreement_score(sample)
                + self.difficulty_score(sample)
                + self.score_sample(sample),
            )
            selected.append(best)
            selected_counts[best.category] += 1
            remaining.remove(best)

        while len(selected) < target and remaining:
            best = max(
                remaining,
                key=lambda sample: self.importance_score(sample, selected_counts),
            )
            selected.append(best)
            selected_counts[best.category] += 1
            remaining.remove(best)

        return sorted(sample.index for sample in selected)

    @staticmethod
    def load_review_scores(
        reviews_dir: Path,
        benchmark_prefix: str,
        metric_key: str,
        models: Optional[Sequence[str]] = None,
    ) -> Dict[int, Dict[str, float]]:
        """Load per-model scores from evalscope review JSONL files."""
        models = list(models or [])
        if not models:
            models = sorted(path.name.split('__', 1)[1].replace('.jsonl', '')
                            for path in reviews_dir.glob(f'{benchmark_prefix}__*.jsonl'))

        by_index: Dict[int, Dict[str, float]] = defaultdict(dict)
        for model in models:
            review_path = reviews_dir / f'{benchmark_prefix}__{model}.jsonl'
            if not review_path.exists():
                continue
            with review_path.open(encoding='utf-8') as handle:
                for line in handle:
                    row = json.loads(line)
                    index = int(row['index'])
                    value = row['sample_score']['score']['value']
                    if metric_key == 'pass':
                        score = float(value.get('pass', value.get('acc', 0.0)))
                    else:
                        score = float(value.get('acc', value.get('pass', 0.0)))
                    by_index[index][model] = score
        return dict(by_index)

    @staticmethod
    def load_prediction_metadata(
        predictions_dir: Path,
        benchmark_prefix: str,
        model: Optional[str] = None,
    ) -> Dict[int, Dict[str, Any]]:
        """Load per-sample metadata from one prediction file."""
        if model is None:
            candidates = sorted(predictions_dir.glob(f'{benchmark_prefix}__*.jsonl'))
            if not candidates:
                return {}
            prediction_path = candidates[0]
        else:
            prediction_path = predictions_dir / f'{benchmark_prefix}__{model}.jsonl'

        metadata_by_index: Dict[int, Dict[str, Any]] = {}
        if not prediction_path.exists():
            return metadata_by_index

        with prediction_path.open(encoding='utf-8') as handle:
            for line in handle:
                row = json.loads(line)
                metadata_by_index[int(row['index'])] = row.get('metadata') or {}
        return metadata_by_index

    @staticmethod
    def context_length_bucket(length: int, buckets: Iterable[int] = (20_000, 60_000, 120_000)) -> str:
        thresholds = list(buckets)
        labels = ['short', 'medium', 'long', 'very_long']
        for idx, threshold in enumerate(thresholds):
            if length < threshold:
                return labels[idx]
        return labels[-1]

    @staticmethod
    def save_indices(path: Path, dataset: str, indices: Sequence[int], meta: Optional[Dict[str, Any]] = None) -> None:
        payload = {
            'dataset': dataset,
            'indices': list(indices),
            'meta': meta or {},
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding='utf-8')

    @staticmethod
    def load_indices(path: Path) -> List[int]:
        payload = json.loads(path.read_text(encoding='utf-8'))
        return [int(index) for index in payload['indices']]
