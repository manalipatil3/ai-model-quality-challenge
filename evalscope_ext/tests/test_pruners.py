from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from evalscope_ext.datasets.pruning_utils import load_cached_indices, resolve_pruned_indices
from evalscope_ext.pruners.disagreement_pruner import DisagreementPruner


class PrunerTests(unittest.TestCase):
    def test_lcb_pruned_count(self) -> None:
        indices = load_cached_indices('live_code_bench_pruned', 0.1, subset='release_v5')
        self.assertIsNotNone(indices)
        assert indices is not None
        self.assertGreaterEqual(len(indices), 30)
        self.assertLessEqual(len(indices), 35)

    def test_aa_lcr_pruned_count(self) -> None:
        indices = load_cached_indices('aa_lcr_pruned', 0.1)
        self.assertIsNotNone(indices)
        assert indices is not None
        self.assertEqual(len(indices), 10)

    def test_disagreement_prefers_mixed_outcomes(self) -> None:
        pruner = DisagreementPruner()
        from evalscope_ext.pruners.base_pruner import SampleRecord

        mixed = SampleRecord(index=1, scores={'a': 1.0, 'b': 0.0}, category='x')
        easy = SampleRecord(index=2, scores={'a': 1.0, 'b': 1.0}, category='y')
        self.assertGreater(pruner.importance_score(mixed), pruner.importance_score(easy))

    def test_lcb_indices_unique(self):
        indices = load_cached_indices("live_code_bench_pruned", 0.1, subset="release_v5")
        self.assertEqual(len(indices), len(set(indices)))

    def test_aa_lcr_indices_unique(self):
        indices = load_cached_indices("aa_lcr_pruned", 0.1)
        self.assertEqual(len(indices), len(set(indices)))

    def test_lcb_indices_in_range(self):
        indices = load_cached_indices("live_code_bench_pruned", 0.1, subset="release_v5")
        self.assertTrue(all(0 <= i < 315 for i in indices))

    def test_aa_lcr_indices_in_range(self):
        indices = load_cached_indices("aa_lcr_pruned", 0.1)
        self.assertTrue(all(0 <= i < 100 for i in indices))

    def test_disagreement_prefers_mixed_over_all_fail(self):
        pruner = DisagreementPruner()
        from evalscope_ext.pruners.base_pruner import SampleRecord

        mixed = SampleRecord(index=1, scores={"a": 1.0, "b": 0.0}, category="x")
        all_fail = SampleRecord(index=2, scores={"a": 0.0, "b": 0.0}, category="y")

        self.assertGreater(
            pruner.importance_score(mixed),
            pruner.importance_score(all_fail)
        )

if __name__ == '__main__':
    unittest.main()
