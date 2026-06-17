from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from evalscope_ext.pruners.mmmu_probe_selector import MMMUProbeSelector


class MMMUProbeTests(unittest.TestCase):

    def test_probe_selects_requested_ratio(self) -> None:
        selector = MMMUProbeSelector()

        samples = [
            {"index": i, "subject": "Biology", "metadata": {"image_type": "diagram"}}
            for i in range(100)
        ]

        selected = selector.select(samples, prune_ratio=0.1)

        self.assertGreaterEqual(len(selected), 8)
        self.assertLessEqual(len(selected), 12)

    def test_ocr_sample_gets_high_priority(self) -> None:
        selector = MMMUProbeSelector()

        ocr_sample = {
            "index": 1,
            "subject": "Accounting",
            "metadata": {
                "image_type": "ocr",
                "contains_text": True
            }
        }

        normal_sample = {
            "index": 2,
            "subject": "Accounting",
            "metadata": {
                "image_type": "plain"
            }
        }

        self.assertGreater(
            selector.importance_score(ocr_sample),
            selector.importance_score(normal_sample)
        )

    def test_chart_sample_gets_high_priority(self) -> None:
        selector = MMMUProbeSelector()

        chart_sample = {
            "index": 1,
            "subject": "Economics",
            "metadata": {
                "image_type": "chart"
            }
        }

        normal_sample = {
            "index": 2,
            "subject": "Economics",
            "metadata": {
                "image_type": "plain"
            }
        }

        self.assertGreater(
            selector.importance_score(chart_sample),
            selector.importance_score(normal_sample)
        )

    def test_table_sample_gets_high_priority(self) -> None:
        selector = MMMUProbeSelector()

        table_sample = {
            "index": 1,
            "subject": "Business",
            "metadata": {
                "image_type": "table"
            }
        }

        normal_sample = {
            "index": 2,
            "subject": "Business",
            "metadata": {
                "image_type": "plain"
            }
        }

        self.assertGreater(
            selector.importance_score(table_sample),
            selector.importance_score(normal_sample)
        )

    def test_visual_stress_categories_are_covered(self) -> None:
        selector = MMMUProbeSelector()

        samples = [
            {"index": 1, "subject": "Accounting", "metadata": {"image_type": "ocr"}},
            {"index": 2, "subject": "Economics", "metadata": {"image_type": "chart"}},
            {"index": 3, "subject": "Business", "metadata": {"image_type": "table"}},
            {"index": 4, "subject": "Physics", "metadata": {"image_type": "diagram"}},
            {"index": 5, "subject": "Math", "metadata": {"image_type": "geometry"}},
            {"index": 6, "subject": "Medicine", "metadata": {"image_type": "medical"}},
            {"index": 7, "subject": "Chemistry", "metadata": {"image_type": "scientific"}},
            {"index": 8, "subject": "Biology", "metadata": {"image_type": "low_contrast"}},
        ]

        selected = selector.select(samples, prune_ratio=1.0)

        categories = {
            sample["metadata"]["image_type"]
            for sample in selected
        }

        expected = {
            "ocr",
            "chart",
            "table",
            "diagram",
            "geometry",
            "medical",
            "scientific",
            "low_contrast",
        }

        self.assertTrue(expected.issubset(categories))

    def test_subject_diversity_preserved(self) -> None:
        selector = MMMUProbeSelector()

        samples = [
            {"index": 1, "subject": "Accounting", "metadata": {"image_type": "ocr"}},
            {"index": 2, "subject": "Physics", "metadata": {"image_type": "diagram"}},
            {"index": 3, "subject": "Medicine", "metadata": {"image_type": "medical"}},
            {"index": 4, "subject": "Math", "metadata": {"image_type": "geometry"}},
        ]

        selected = selector.select(samples, prune_ratio=1.0)

        subjects = {sample["subject"] for sample in selected}

        self.assertGreaterEqual(len(subjects), 4)

    def test_missing_metadata_does_not_crash(self) -> None:
        selector = MMMUProbeSelector()

        sample = {
            "index": 1,
            "subject": "Unknown"
        }

        score = selector.importance_score(sample)

        self.assertIsInstance(score, float)

    def test_duplicate_indices_removed(self) -> None:
        selector = MMMUProbeSelector()

        samples = [
            {"index": 1, "subject": "Accounting", "metadata": {"image_type": "ocr"}},
            {"index": 1, "subject": "Accounting", "metadata": {"image_type": "ocr"}},
            {"index": 2, "subject": "Physics", "metadata": {"image_type": "diagram"}},
        ]

        selected = selector.select(samples, prune_ratio=1.0)

        indices = [sample["index"] for sample in selected]

        self.assertEqual(len(indices), len(set(indices)))


if __name__ == '__main__':
    unittest.main()
