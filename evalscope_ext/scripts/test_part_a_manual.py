"""Manual Part A validation for Task 2 (LCB v5 + AA-LCR).

Uses shipped calibration JSONL under Evals/Part 1/ and project pruned indices.
Run from repo root:

    python evalscope_ext/scripts/test_part_a_manual.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

CALIBRATION_DIR = REPO_ROOT / 'Evals-20260616T210149Z-3-001' / 'Evals' / 'Part 1'
PREDICTIONS_DIR = CALIBRATION_DIR / 'predictions'
REVIEWS_DIR = CALIBRATION_DIR / 'reviews'
PRUNED_INDICES_PATH = REPO_ROOT / 'evalscope_ext' / 'data' / 'pruned_indices.json'

BENCHMARKS = {
    'live_code_bench_v5': {
        'dataset': 'live_code_bench_pruned',
        'metric': 'pass',
        'expected_full_ranking': ['gpt-oss-120b', 'kimi-k2.5', 'minimax-m2.5'],
        'expected_pruned_count': 32,
        'expected_full_count': 315,
    },
    'aa_lcr': {
        'dataset': 'aa_lcr_pruned',
        'metric': 'acc',
        'expected_full_ranking': ['kimi-k2.5', 'minimax-m2.5', 'gpt-oss-120b'],
        'expected_pruned_count': 10,
        'expected_full_count': 100,
    },
}


def load_jsonl(file_path: Path) -> list[dict]:
    data = []
    with open(file_path, 'r', encoding='utf-8') as handle:
        for line in handle:
            if line.strip():
                data.append(json.loads(line))
    return data


def extract_score(row: dict, metric_key: str) -> float:
    value = row['sample_score']['score']['value']
    if metric_key == 'pass':
        return float(value.get('pass', value.get('acc', 0.0)))
    return float(value.get('acc', value.get('pass', 0.0)))


# ============================================
# TEST 1: Prediction / Review Join
# ============================================
def test_prediction_review_join(predictions: list[dict], reviews: list[dict]) -> bool:
    pred_ids = {x['index'] for x in predictions}
    review_ids = {x['index'] for x in reviews}

    missing_reviews = pred_ids - review_ids
    missing_predictions = review_ids - pred_ids

    print('\nTEST 1: Prediction Review Join')

    if not missing_reviews and not missing_predictions:
        print('PASS')
        return True

    print('FAIL')
    print('Missing reviews:', len(missing_reviews))
    print('Missing predictions:', len(missing_predictions))
    return False


# ============================================
# TEST 2: Duplicate Indexes
# ============================================
def test_duplicate_indexes(data: list[dict]) -> bool:
    indexes = [x['index'] for x in data]
    duplicates = [item for item, count in Counter(indexes).items() if count > 1]

    print('\nTEST 2: Duplicate Indexes')

    if len(duplicates) == 0:
        print('PASS')
        return True

    print('FAIL')
    print('Duplicates:', duplicates[:10])
    return False


# ============================================
# TEST 3: Missing Metadata
# ============================================
def test_missing_metadata(predictions: list[dict]) -> None:
    missing = [row['index'] for row in predictions if 'metadata' not in row]

    print('\nTEST 3: Missing Metadata')
    print(f'Missing metadata rows: {len(missing)}')


# ============================================
# TEST 4: Missing Scores
# ============================================
def test_missing_scores(reviews: list[dict]) -> None:
    missing = [row['index'] for row in reviews if 'sample_score' not in row]

    print('\nTEST 4: Missing Scores')
    print(f'Missing score rows: {len(missing)}')


# ============================================
# TEST 5: Disagreement Detection
# ============================================
def test_disagreement(model_scores: dict[int, list[float]]) -> list[int]:
    disagreement = [idx for idx, scores in model_scores.items() if len(set(scores)) > 1]

    print('\nTEST 5: Disagreement Samples')
    print(f'Disagreement samples: {len(disagreement)}')

    return disagreement


# ============================================
# TEST 6: Prune Ratio
# ============================================
def test_prune_ratio(total_count: int, selected_count: int) -> bool:
    ratio = selected_count / total_count

    print('\nTEST 6: Prune Ratio')
    print(f'Total Samples: {total_count}')
    print(f'Selected Samples: {selected_count}')
    print(f'Ratio: {ratio:.2f}')

    if ratio <= 0.15:
        print('PASS')
        return True

    print('FAIL')
    return False


# ============================================
# TEST 7: Ranking Preservation
# ============================================
def test_ranking_preservation(full_ranking: list[str], pruned_ranking: list[str]) -> bool:
    print('\nTEST 7: Ranking Preservation')
    print('Full :', full_ranking)
    print('Pruned:', pruned_ranking)

    if full_ranking == pruned_ranking:
        print('PASS')
        return True

    print('FAIL')
    return False


def build_model_scores(reviews_dir: Path, benchmark_prefix: str, metric_key: str) -> dict[int, list[float]]:
    model_scores: dict[int, list[float]] = defaultdict(list)
    for review_path in sorted(reviews_dir.glob(f'{benchmark_prefix}__*.jsonl')):
        for row in load_jsonl(review_path):
            model_scores[int(row['index'])].append(extract_score(row, metric_key))
    return dict(model_scores)


def load_pruned_indices(benchmark_prefix: str) -> list[int]:
    from evalscope_ext.datasets.pruning_utils import load_cached_indices, resolve_pruned_indices

    dataset = BENCHMARKS[benchmark_prefix]['dataset']
    subset = 'release_v5' if benchmark_prefix.startswith('live_code') else None
    indices = load_cached_indices(dataset, 0.1, subset=subset)
    if indices is None:
        indices = resolve_pruned_indices(
            dataset=dataset,
            calibration_dir=str(CALIBRATION_DIR),
            subset=subset,
        )
    return indices


def run_benchmark_suite(benchmark_prefix: str) -> dict[str, bool]:
    config = BENCHMARKS[benchmark_prefix]
    metric_key = config['metric']
    print('\n' + '=' * 60)
    print(f'BENCHMARK: {benchmark_prefix}')
    print('=' * 60)

    results: dict[str, bool] = {}
    review_files = sorted(REVIEWS_DIR.glob(f'{benchmark_prefix}__*.jsonl'))
    prediction_files = sorted(PREDICTIONS_DIR.glob(f'{benchmark_prefix}__*.jsonl'))

    if not review_files or not prediction_files:
        print(f'FAIL: missing files for {benchmark_prefix}')
        return {'files_present': False}

    # Per-model file checks (tests 1-4)
    for review_file in review_files:
        model = review_file.stem.split('__', 1)[1]
        prediction_file = PREDICTIONS_DIR / f'{benchmark_prefix}__{model}.jsonl'
        print(f'\n--- Model: {model} ---')

        if not prediction_file.exists():
            print(f'SKIP: missing prediction file for {model}')
            continue

        predictions = load_jsonl(prediction_file)
        reviews = load_jsonl(review_file)

        results[f'{model}:join'] = test_prediction_review_join(predictions, reviews)
        results[f'{model}:duplicates'] = test_duplicate_indexes(predictions)
        test_missing_metadata(predictions)
        test_missing_scores(reviews)

    # Benchmark-level checks (tests 5-7)
    model_scores = build_model_scores(REVIEWS_DIR, benchmark_prefix, metric_key)
    disagreement = test_disagreement(model_scores)
    results['disagreement_present'] = len(disagreement) > 0

    pruned_indices = load_pruned_indices(benchmark_prefix)
    sample_review = load_jsonl(review_files[0])
    total_count = len(sample_review)

    results['prune_ratio'] = test_prune_ratio(total_count, len(pruned_indices))
    results['pruned_count'] = len(pruned_indices) == config['expected_pruned_count']

    from evalscope_ext.tools.compare_runs import compare_offline_calibration

    comparison = compare_offline_calibration(
        calibration_dir=CALIBRATION_DIR,
        benchmark_prefix=benchmark_prefix,
        metric_key=metric_key,
        pruned_indices=pruned_indices,
    )
    results['ranking'] = test_ranking_preservation(
        comparison['full_ranking'],
        comparison['pruned_ranking'],
    )
    results['expected_ranking'] = comparison['full_ranking'] == config['expected_full_ranking']

    print('\nSummary')
    print(f"  Full samples: {comparison['full_sample_count']} (expected {config['expected_full_count']})")
    print(f"  Pruned samples: {comparison['pruned_sample_count']} (expected {config['expected_pruned_count']})")
    print(f"  Ranking preserved: {comparison['ranking_preserved']}")

    return results


def main() -> int:
    print('Task 2 Part A — manual data validation')
    print(f'Calibration dir: {CALIBRATION_DIR}')

    if not CALIBRATION_DIR.exists():
        print('FAIL: calibration directory not found')
        return 1

    all_results: dict[str, dict[str, bool]] = {}
    failed = False

    for benchmark_prefix in BENCHMARKS:
        suite = run_benchmark_suite(benchmark_prefix)
        all_results[benchmark_prefix] = suite
        if suite.get('files_present') is False:
            failed = True
            continue
        for name, passed in suite.items():
            if not passed:
                failed = True

    print('\n' + '=' * 60)
    print('FINAL RESULT')
    print('=' * 60)
    for benchmark_prefix, suite in all_results.items():
        status = 'PASS' if suite and all(suite.values()) else 'FAIL'
        print(f'{benchmark_prefix}: {status}')

    if failed:
        print('\nSome Part A checks failed.')
        return 1

    print('\nAll Part A validation checks completed successfully.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
