"""End-to-end validation for Task 2 evalscope_ext."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CALIBRATION = REPO_ROOT / 'Evals-20260616T210149Z-3-001' / 'Evals' / 'Part 1'
MMMU_REVIEWS = REPO_ROOT / 'Evals-20260616T210149Z-3-001' / 'Evals' / 'MMMU' / 'reviews' / 'glm-4.5v-fp8'


def check_data_files() -> None:
    pruned_path = REPO_ROOT / 'evalscope_ext' / 'data' / 'pruned_indices.json'
    mmmu_path = REPO_ROOT / 'evalscope_ext' / 'data' / 'mmmu_probe_indices.json'
    assert pruned_path.exists(), f'Missing {pruned_path}'
    assert mmmu_path.exists(), f'Missing {mmmu_path}'

    pruned = json.loads(pruned_path.read_text(encoding='utf-8'))
    assert 'live_code_bench_pruned::0.1' in pruned
    assert 'aa_lcr_pruned::0.1' in pruned
    lcb_count = pruned['live_code_bench_pruned::0.1']['count']
    aa_count = pruned['aa_lcr_pruned::0.1']['count']
    assert 30 <= lcb_count <= 35, f'LCB count {lcb_count} out of expected range'
    assert aa_count == 10, f'AA-LCR count {aa_count} != 10'

    mmmu = json.loads(mmmu_path.read_text(encoding='utf-8'))
    assert mmmu['count'] == 24, f'MMMU probe count {mmmu["count"]} != 24'
    assert len(mmmu['probes']) == 24
    subjects = {(p['subject'], p['index']) for p in mmmu['probes']}
    assert len(subjects) == 24, 'Duplicate subject/index pairs in MMMU probe'


def check_registration() -> None:
    import evalscope.benchmarks  # noqa: F401
    from evalscope.api.registry import BENCHMARK_REGISTRY

    for name in ('live_code_bench_pruned', 'aa_lcr_pruned', 'mmmu_probe'):
        assert name in BENCHMARK_REGISTRY, f'{name} not registered'


def check_offline_ranking() -> None:
    from evalscope_ext.tools.compare_runs import compare_offline_calibration
    from evalscope_ext.datasets.pruning_utils import load_cached_indices

    lcb_indices = load_cached_indices('live_code_bench_pruned', 0.1, subset='release_v5')
    assert lcb_indices is not None
    lcb = compare_offline_calibration(
        calibration_dir=CALIBRATION,
        benchmark_prefix='live_code_bench_v5',
        metric_key='pass',
        pruned_indices=lcb_indices,
    )
    assert lcb['ranking_preserved'] is True
    assert lcb['full_ranking'] == ['gpt-oss-120b', 'kimi-k2.5', 'minimax-m2.5']

    aa_indices = load_cached_indices('aa_lcr_pruned', 0.1)
    assert aa_indices is not None
    aa = compare_offline_calibration(
        calibration_dir=CALIBRATION,
        benchmark_prefix='aa_lcr',
        metric_key='acc',
        pruned_indices=aa_indices,
    )
    assert aa['ranking_preserved'] is True
    assert aa['full_ranking'] == ['kimi-k2.5', 'minimax-m2.5', 'gpt-oss-120b']


def check_pruner_rebuild() -> None:
    from evalscope_ext.datasets.pruning_utils import resolve_pruned_indices

    lcb = resolve_pruned_indices('live_code_bench_pruned', prune_ratio=0.1, calibration_dir=str(CALIBRATION))
    aa = resolve_pruned_indices('aa_lcr_pruned', prune_ratio=0.1, calibration_dir=str(CALIBRATION))
    assert len(lcb) == 32
    assert len(aa) == 10


def check_mmmu_selector() -> None:
    from evalscope_ext.datasets.mmmu_probe import MMMUProbeSelector

    probes = MMMUProbeSelector.from_reference_reviews(MMMU_REVIEWS, samples_per_category=3)
    assert len(probes) == 24
    categories = set()
    for probe in probes:
        assert 'subject' in probe and 'index' in probe


def check_adapter_extra_params() -> None:
    from evalscope.api.registry import BENCHMARK_REGISTRY

    lcb_meta = BENCHMARK_REGISTRY['live_code_bench_pruned']
    aa_meta = BENCHMARK_REGISTRY['aa_lcr_pruned']
    assert 'prune_ratio' in lcb_meta.extra_params
    assert 'pruning_strategy' in lcb_meta.extra_params
    assert 'prune_ratio' in aa_meta.extra_params


def main() -> int:
    sys.path.insert(0, str(REPO_ROOT))
    checks = [
        ('data files', check_data_files),
        ('evalscope registration', check_registration),
        ('offline ranking', check_offline_ranking),
        ('pruner rebuild', check_pruner_rebuild),
        ('mmmu selector', check_mmmu_selector),
        ('adapter extra_params', check_adapter_extra_params),
    ]
    failed = []
    print('Task 2 Validation Report')
    print('=' * 40)
    for name, fn in checks:
        try:
            fn()
            print(f'[PASS] {name}')
        except Exception as exc:
            print(f'[FAIL] {name}: {exc}')
            failed.append(name)

    # Unit tests
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromName('evalscope_ext.tests.test_pruners')
    runner = unittest.TextTestRunner(verbosity=0)
    result = runner.run(suite)
    if result.wasSuccessful():
        print('[PASS] unit tests (3)')
    else:
        print('[FAIL] unit tests')
        failed.append('unit tests')

    print('=' * 40)
    if failed:
        print(f'FAILED: {", ".join(failed)}')
        return 1
    print('ALL CHECKS PASSED')
    return 0


if __name__ == '__main__':
    sys.exit(main())
