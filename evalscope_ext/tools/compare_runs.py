from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CALIBRATION = PACKAGE_ROOT.parent / 'Evals-20260616T210149Z-3-001' / 'Evals'


def _load_report_metrics(report_dir: Path) -> Dict[str, Dict[str, float]]:
    """Load model -> metric -> score from evalscope report JSON files."""
    reports_root = report_dir / 'reports' if (report_dir / 'reports').exists() else report_dir
    metrics: Dict[str, Dict[str, float]] = {}
    if not reports_root.exists():
        return metrics

    for model_dir in reports_root.iterdir():
        if not model_dir.is_dir():
            continue
        model_metrics: Dict[str, float] = {}
        for report_file in model_dir.glob('*.json'):
            payload = json.loads(report_file.read_text(encoding='utf-8'))
            dataset = payload.get('dataset_name') or report_file.stem
            score = float(payload.get('score', 0.0))
            for metric in payload.get('metrics', []):
                model_metrics[f'{dataset}:{metric.get("name", "score")}'] = float(metric.get('score', score))
            model_metrics[f'{dataset}:score'] = score
        if model_metrics:
            metrics[model_dir.name] = model_metrics
    return metrics


def _load_review_accuracy(
    reviews_dir: Path,
    benchmark_prefix: str,
    metric_key: str,
    indices: Optional[Sequence[int]] = None,
) -> Dict[str, float]:
    allowed = {int(index) for index in indices} if indices is not None else None
    accuracies: Dict[str, List[float]] = {}
    for review_path in sorted(reviews_dir.glob(f'{benchmark_prefix}__*.jsonl')):
        model = review_path.stem.split('__', 1)[1]
        scores: List[float] = []
        with review_path.open(encoding='utf-8') as handle:
            for line in handle:
                row = json.loads(line)
                index = int(row['index'])
                if allowed is not None and index not in allowed:
                    continue
                value = row['sample_score']['score']['value']
                if metric_key == 'pass':
                    scores.append(float(value.get('pass', value.get('acc', 0.0))))
                else:
                    scores.append(float(value.get('acc', value.get('pass', 0.0))))
        if scores:
            accuracies[model] = sum(scores) / len(scores)
    return accuracies


def _rank_models(scores: Dict[str, float]) -> List[str]:
    return sorted(scores.keys(), key=lambda model: scores[model], reverse=True)


def _ranking_retention(full_rank: Sequence[str], pruned_rank: Sequence[str]) -> float:
    common = [model for model in full_rank if model in pruned_rank]
    if len(common) < 2:
        return 1.0
    inversions = 0
    pairs = 0
    for i in range(len(common)):
        for j in range(i + 1, len(common)):
            pairs += 1
            full_order = full_rank.index(common[i]) < full_rank.index(common[j])
            pruned_order = pruned_rank.index(common[i]) < pruned_rank.index(common[j])
            if full_order != pruned_order:
                inversions += 1
    return 1.0 - (inversions / pairs)


def _accuracy_retention(full_scores: Dict[str, float], pruned_scores: Dict[str, float]) -> Dict[str, float]:
    retention: Dict[str, float] = {}
    for model, full_score in full_scores.items():
        pruned_score = pruned_scores.get(model)
        if pruned_score is None or full_score == 0:
            retention[model] = 1.0 if pruned_score == full_score else 0.0
        else:
            retention[model] = pruned_score / full_score
    return retention


def compare_offline_calibration(
    calibration_dir: Path,
    benchmark_prefix: str,
    metric_key: str,
    pruned_indices: Sequence[int],
) -> Dict[str, object]:
    reviews_dir = calibration_dir / 'reviews'
    full_scores = _load_review_accuracy(reviews_dir, benchmark_prefix, metric_key)
    pruned_scores = _load_review_accuracy(reviews_dir, benchmark_prefix, metric_key, indices=pruned_indices)
    full_rank = _rank_models(full_scores)
    pruned_rank = _rank_models(pruned_scores)

    full_sample_count = 0
    sample_file = next(iter(sorted(reviews_dir.glob(f'{benchmark_prefix}__*.jsonl'))), None)
    if sample_file is not None:
        with sample_file.open(encoding='utf-8') as handle:
            full_sample_count = sum(1 for _ in handle)

    return {
        'mode': 'offline_calibration',
        'benchmark': benchmark_prefix,
        'full_sample_count': full_sample_count,
        'pruned_sample_count': len(pruned_indices),
        'sample_reduction': 1.0 - (len(pruned_indices) / max(full_sample_count, 1)),
        'full_accuracy_by_model': full_scores,
        'pruned_accuracy_by_model': pruned_scores,
        'accuracy_retention_by_model': _accuracy_retention(full_scores, pruned_scores),
        'full_ranking': full_rank,
        'pruned_ranking': pruned_rank,
        'ranking_retention': _ranking_retention(full_rank, pruned_rank),
        'runtime_reduction_estimate': 1.0 - (len(pruned_indices) / max(full_sample_count, 1)),
        'ranking_preserved': full_rank == pruned_rank,
    }


def compare_report_dirs(full_dir: Path, pruned_dir: Path) -> Dict[str, object]:
    full_metrics = _load_report_metrics(full_dir)
    pruned_metrics = _load_report_metrics(pruned_dir)
    summary = {
        'mode': 'evalscope_reports',
        'datasets': {},
    }

    all_datasets = sorted(
        {
            key.split(':', 1)[0]
            for model_metrics in full_metrics.values()
            for key in model_metrics
            if ':' in key
        }
    )
    for dataset in all_datasets:
        full_scores = {
            model: metrics.get(f'{dataset}:score', metrics.get(f'{dataset}:mean_acc', 0.0))
            for model, metrics in full_metrics.items()
        }
        pruned_scores = {
            model: metrics.get(f'{dataset}:score', metrics.get(f'{dataset}:mean_acc', 0.0))
            for model, metrics in pruned_metrics.items()
        }
        full_rank = _rank_models(full_scores)
        pruned_rank = _rank_models(pruned_scores)
        summary['datasets'][dataset] = {
            'full_accuracy_by_model': full_scores,
            'pruned_accuracy_by_model': pruned_scores,
            'accuracy_retention_by_model': _accuracy_retention(full_scores, pruned_scores),
            'full_ranking': full_rank,
            'pruned_ranking': pruned_rank,
            'ranking_retention': _ranking_retention(full_rank, pruned_rank),
        }
    return summary


def _print_summary(result: Dict[str, object]) -> None:
    print(json.dumps(result, indent=2))
    if result.get('mode') == 'offline_calibration':
        print('\nSummary')
        print(f"  Benchmark: {result['benchmark']}")
        print(f"  Samples: {result['pruned_sample_count']} / {result['full_sample_count']}")
        print(f"  Sample reduction: {result['sample_reduction']:.1%}")
        print(f"  Ranking retention: {result['ranking_retention']:.1%}")
        if result.get('ranking_preserved') is not None:
            print(f"  Ranking preserved: {result['ranking_preserved']}")
        for model, retention in result['accuracy_retention_by_model'].items():
            print(f"  Accuracy retention ({model}): {retention:.1%}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Compare full vs pruned evalscope runs.')
    parser.add_argument('--full', type=Path, help='Full evalscope output directory.')
    parser.add_argument('--pruned', type=Path, help='Pruned evalscope output directory.')
    parser.add_argument(
        '--offline-calibration',
        type=Path,
        default=None,
        help='Use shipped calibration JSONL instead of evalscope report dirs.',
    )
    parser.add_argument('--benchmark', choices=['live_code_bench_v5', 'aa_lcr'], default='live_code_bench_v5')
    parser.add_argument('--metric', choices=['pass', 'acc'], default='pass')
    parser.add_argument('--indices-file', type=Path, default=None, help='JSON file with pruned indices.')
    args = parser.parse_args(argv)

    if args.offline_calibration:
        indices_path = args.indices_file or (PACKAGE_ROOT / 'data' / 'pruned_indices.json')
        if args.indices_file:
            payload = json.loads(indices_path.read_text(encoding='utf-8'))
            if isinstance(payload, dict) and 'indices' in payload:
                indices = payload['indices']
            else:
                key = next(iter(payload))
                indices = payload[key]['indices']
        else:
            from evalscope_ext.datasets.pruning_utils import load_cached_indices, resolve_pruned_indices

            dataset = 'live_code_bench_pruned' if args.benchmark.startswith('live_code') else 'aa_lcr_pruned'
            indices = load_cached_indices(dataset, 0.1) or resolve_pruned_indices(
                dataset=dataset,
                calibration_dir=str(args.offline_calibration),
            )
        result = compare_offline_calibration(
            calibration_dir=args.offline_calibration,
            benchmark_prefix=args.benchmark,
            metric_key=args.metric,
            pruned_indices=indices,
        )
        _print_summary(result)
        return 0

    if not args.full or not args.pruned:
        parser.error('Provide --full and --pruned, or use --offline-calibration.')
    result = compare_report_dirs(args.full, args.pruned)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
