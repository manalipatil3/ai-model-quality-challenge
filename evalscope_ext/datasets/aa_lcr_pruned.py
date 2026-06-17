# flake8: noqa: E501
from typing import Set

from evalscope.api.benchmark import BenchmarkMeta
from evalscope.api.registry import register_benchmark
from evalscope.benchmarks.aa_lcr.aa_lcr_adapter import AALCRAdapter
from evalscope.constants import Tags

from evalscope_ext.datasets.pruning_utils import resolve_pruned_indices


@register_benchmark(
    BenchmarkMeta(
        name='aa_lcr_pruned',
        pretty_name='AA-LCR (Pruned)',
        tags=[Tags.KNOWLEDGE, Tags.REASONING, Tags.LONG_CONTEXT, Tags.CUSTOM],
        description="""
## Overview

Pruned AA-LCR subset for fast customer go/no-go on long-context retrieval quality.

Samples are selected by model disagreement, mixed judge outcomes, and context-length
coverage using calibration scores from reference models. Default target size is ~10%.
""",
        dataset_id='evalscope/AA-LCR',
        metric_list=['acc'],
        few_shot_num=0,
        train_split=None,
        eval_split='test',
        extra_params={
            'prune_ratio': {
                'type': 'float',
                'description': 'Fraction of AA-LCR samples to keep (default 0.1).',
                'value': 0.1,
            },
            'pruning_strategy': {
                'type': 'str',
                'description': 'Pruning strategy name. Supported: disagreement.',
                'value': 'disagreement',
            },
            'calibration_dir': {
                'type': 'str | null',
                'description': 'Directory containing calibration predictions/reviews JSONL.',
                'value': None,
            },
            'text_dir': {
                'type': 'str | null',
                'description': 'Local AA-LCR document directory; auto-download if null.',
                'value': None,
            },
        },
    )
)
class AALCRPrunedAdapter(AALCRAdapter):
    """AA-LCR adapter that evaluates a pruned, informative subset."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.prune_ratio = float(self.extra_params.get('prune_ratio', 0.1))
        self.pruning_strategy = self.extra_params.get('pruning_strategy', 'disagreement')
        self.calibration_dir = self.extra_params.get('calibration_dir')
        self._allowed_indices: Set[int] = set(
            resolve_pruned_indices(
                dataset='aa_lcr_pruned',
                prune_ratio=self.prune_ratio,
                pruning_strategy=self.pruning_strategy,
                calibration_dir=self.calibration_dir,
            )
        )

    def sample_filter(self, sample) -> bool:
        if sample.id is None:
            return False
        return int(sample.id) in self._allowed_indices
