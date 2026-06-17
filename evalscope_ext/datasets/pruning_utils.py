from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set

from evalscope_ext.pruners.base_pruner import BasePruner
from evalscope_ext.pruners.disagreement_pruner import DisagreementPruner

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INDICES_PATH = PACKAGE_ROOT / 'data' / 'pruned_indices.json'
DEFAULT_CALIBRATION_ROOT = PACKAGE_ROOT.parent / 'Evals-20260616T210149Z-3-001' / 'Evals' / 'Part 1'


def _aa_lcr_category(_index: int, metadata: Dict) -> str:
    tokens = int(metadata.get('input_tokens') or metadata.get('context_length') or 0)
    return BasePruner.context_length_bucket(tokens)


def _aa_lcr_metadata(_index: int, metadata: Dict) -> Dict:
    tokens = int(metadata.get('input_tokens') or 0)
    return {'context_length': tokens, 'input_tokens': tokens}


def _lcb_category(_index: int, metadata: Dict) -> str:
    length = int(metadata.get('context_length') or 0)
    if length <= 0:
        return 'default'
    if length < 2_000:
        return 'prompt_short'
    if length < 4_000:
        return 'prompt_medium'
    return 'prompt_long'


def _lcb_metadata(index: int, metadata: Dict) -> Dict:
    if metadata.get('context_length'):
        return metadata
    return metadata


@lru_cache(maxsize=8)
def _load_lcb_prompt_lengths(predictions_dir: str) -> Dict[int, int]:
    path = Path(predictions_dir)
    if not path.exists():
        return {}
    candidate = next(iter(sorted(path.glob('live_code_bench_v5__*.jsonl'))), None)
    if candidate is None:
        return {}
    lengths: Dict[int, int] = {}
    with candidate.open(encoding='utf-8') as handle:
        for line in handle:
            row = json.loads(line)
            messages = row.get('messages') or []
            text = ''
            if messages:
                text = str(messages[0].get('content', ''))
            lengths[int(row['index'])] = len(text)
    return lengths


def resolve_pruned_indices(
    dataset: str,
    prune_ratio: float = 0.1,
    pruning_strategy: str = 'disagreement',
    calibration_dir: Optional[str] = None,
    subset: Optional[str] = None,
) -> List[int]:
    """Resolve sample indices for a pruned benchmark run."""
    cached = load_cached_indices(dataset, prune_ratio, subset=subset)
    if cached is not None:
        return cached

    if pruning_strategy != 'disagreement':
        raise ValueError(f'Unsupported pruning_strategy: {pruning_strategy}')

    calibration_root = Path(calibration_dir) if calibration_dir else DEFAULT_CALIBRATION_ROOT
    reviews_dir = calibration_root / 'reviews'
    predictions_dir = calibration_root / 'predictions'

    pruner = DisagreementPruner(prune_ratio=prune_ratio)
    if dataset in {'live_code_bench_pruned', 'live_code_bench'}:
        prompt_lengths = _load_lcb_prompt_lengths(str(predictions_dir))

        def lcb_category(index: int, metadata: Dict) -> str:
            length = int(metadata.get('context_length') or prompt_lengths.get(index, 0))
            return _lcb_category(index, {**metadata, 'context_length': length})

        def lcb_metadata(index: int, metadata: Dict) -> Dict:
            length = prompt_lengths.get(index, 0)
            return {**metadata, 'context_length': length}

        return pruner.select_from_reviews(
            reviews_dir=reviews_dir,
            benchmark_prefix='live_code_bench_v5',
            metric_key='pass',
            predictions_dir=predictions_dir,
            category_fn=lcb_category,
            metadata_fn=lcb_metadata,
        )

    if dataset in {'aa_lcr_pruned', 'aa_lcr'}:
        return pruner.select_from_reviews(
            reviews_dir=reviews_dir,
            benchmark_prefix='aa_lcr',
            metric_key='acc',
            predictions_dir=predictions_dir,
            category_fn=_aa_lcr_category,
            metadata_fn=_aa_lcr_metadata,
        )

    raise ValueError(f'Unknown dataset for pruning: {dataset}')


def load_cached_indices(
    dataset: str,
    prune_ratio: float,
    subset: Optional[str] = None,
    indices_path: Path = DEFAULT_INDICES_PATH,
) -> Optional[List[int]]:
    if not indices_path.exists():
        return None
    payload = json.loads(indices_path.read_text(encoding='utf-8'))
    key = _cache_key(dataset, prune_ratio, subset)
    entry = payload.get(key)
    if entry is None:
        return None
    return [int(index) for index in entry['indices']]


def _cache_key(dataset: str, prune_ratio: float, subset: Optional[str]) -> str:
    ratio = f'{prune_ratio:.4f}'.rstrip('0').rstrip('.')
    subset_suffix = f'::{subset}' if subset else ''
    return f'{dataset}::{ratio}{subset_suffix}'


def save_default_indices(
    calibration_dir: Optional[Path] = None,
    output_path: Path = DEFAULT_INDICES_PATH,
    prune_ratio: float = 0.1,
) -> Dict[str, Dict]:
    calibration_root = calibration_dir or DEFAULT_CALIBRATION_ROOT
    entries = {}
    for dataset in ('live_code_bench_pruned', 'aa_lcr_pruned'):
        indices = resolve_pruned_indices(
            dataset=dataset,
            prune_ratio=prune_ratio,
            calibration_dir=str(calibration_root),
        )
        entry = {
            'dataset': dataset,
            'prune_ratio': prune_ratio,
            'count': len(indices),
            'indices': indices,
        }
        entries[_cache_key(dataset, prune_ratio, None)] = entry
        if dataset == 'live_code_bench_pruned':
            entries[_cache_key(dataset, prune_ratio, 'release_v5')] = entry
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(entries, indent=2), encoding='utf-8')
    return entries


class PrunedIndexFilter:
    """Callable used by evalscope adapters to filter Sample objects by index."""

    def __init__(self, allowed_indices: Sequence[int]) -> None:
        self.allowed: Set[int] = {int(index) for index in allowed_indices}

    def __call__(self, sample) -> bool:
        sample_id = sample.id
        if sample_id is None:
            return False
        return int(sample_id) in self.allowed
