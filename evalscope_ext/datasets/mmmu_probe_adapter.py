# flake8: noqa: E501
from pathlib import Path
from typing import Dict, Set, Tuple

from evalscope.api.benchmark import BenchmarkMeta
from evalscope.api.registry import register_benchmark
from evalscope.benchmarks.mmmu.mmmu_adapter import MMMUAdapter, SUBSET_LIST
from evalscope.constants import Tags

from evalscope_ext.datasets.mmmu_probe import DEFAULT_PROBE_PATH, MMMUProbeSelector, load_probe_entries


@register_benchmark(
    BenchmarkMeta(
        name='mmmu_probe',
        pretty_name='MMMU Probe (Encoder Stress)',
        tags=[Tags.MULTI_MODAL, Tags.KNOWLEDGE, Tags.QA, Tags.CUSTOM],
        description="""
## Overview

Small MMMU probe designed to stress vision encoders (OCR, charts, tables, diagrams,
scientific figures, geometry, medical images, low-contrast scenes).

Use this for cheap multimodal go/no-go when a customer adds image inputs next quarter.
""",
        dataset_id='AI-ModelScope/MMMU',
        subset_list=SUBSET_LIST,
        metric_list=['acc'],
        eval_split='validation',
        extra_params={
            'probe_indices_path': {
                'type': 'str | null',
                'description': 'Optional JSON file with precomputed probe subject/index pairs.',
                'value': None,
            },
            'calibration_reviews_dir': {
                'type': 'str | null',
                'description': 'Optional directory of MMMU review JSONL for probe generation.',
                'value': None,
            },
            'samples_per_category': {
                'type': 'int',
                'description': 'Target samples per encoder-stress category when building a probe.',
                'value': 3,
            },
        },
    )
)
class MMMUProbeAdapter(MMMUAdapter):
    """MMMU adapter restricted to encoder-stress probe indices."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        probe_path = self.extra_params.get('probe_indices_path')
        calibration_dir = self.extra_params.get('calibration_reviews_dir')
        samples_per_category = int(self.extra_params.get('samples_per_category', 3))

        if calibration_dir:
            probes = MMMUProbeSelector.from_reference_reviews(
                Path(calibration_dir),
                samples_per_category=samples_per_category,
            )
        elif probe_path:
            probes = load_probe_entries(Path(probe_path))
        else:
            probes = load_probe_entries(DEFAULT_PROBE_PATH)

        self._allowed_by_subject: Dict[str, Set[int]] = {}
        for probe in probes:
            subject = str(probe['subject'])
            index = int(probe['index'])
            self._allowed_by_subject.setdefault(subject, set()).add(index)

    def sample_filter(self, sample) -> bool:
        if sample.id is None:
            return False
        subset = getattr(self, 'current_subset_name', None) or sample.subset_key
        if subset is None:
            return False
        allowed = self._allowed_by_subject.get(subset)
        if allowed is None:
            return False
        return int(sample.id) in allowed
