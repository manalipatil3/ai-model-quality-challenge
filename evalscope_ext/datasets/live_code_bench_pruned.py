# flake8: noqa: E501
from typing import Any, Dict, Set

from evalscope.api.benchmark import BenchmarkMeta
from evalscope.api.registry import register_benchmark
from evalscope.benchmarks.live_code_bench.live_code_bench_adapter import LiveCodeBenchAdapter
from evalscope.constants import Tags

from evalscope_ext.datasets.pruning_utils import resolve_pruned_indices


@register_benchmark(
    BenchmarkMeta(
        name='live_code_bench_pruned',
        pretty_name='Live-Code-Bench (Pruned)',
        tags=[Tags.CODING, Tags.CUSTOM],
        description="""
## Overview

Pruned LiveCodeBench v5 subset for fast customer go/no-go on coding capability.

Samples are selected by model disagreement, mixed difficulty, and prompt-length diversity
using calibration scores from reference models. Default target size is ~10% of release_v5.
""",
        dataset_id='evalscope/livecodebench_code_generation_lite_parquet',
        subset_list=['release_v5'],
        metric_list=['acc'],
        aggregation='mean_and_pass_at_k',
        eval_split='test',
        prompt_template=
        '### Question:\n{question_content}\n\n{format_prompt} ### Answer: (use the provided format with backticks)\n\n',
        review_timeout=6,
        extra_params={
            'prune_ratio': {
                'type': 'float',
                'description': 'Fraction of release_v5 samples to keep (default 0.1).',
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
            'start_date': {
                'type': 'str | null',
                'description': 'Optional date filter inherited from LiveCodeBench.',
                'value': None,
            },
            'end_date': {
                'type': 'str | null',
                'description': 'Optional date filter inherited from LiveCodeBench.',
                'value': None,
            },
            'debug': {
                'type': 'bool',
                'description': 'Enable verbose debug logging for code execution.',
                'value': False,
            },
        },
        sandbox_config={
            'image': 'python:3.11-slim',
            'tools_config': {
                'shell_executor': {},
                'python_executor': {},
            },
        },
    )
)
class LiveCodeBenchPrunedAdapter(LiveCodeBenchAdapter):
    """LiveCodeBench adapter that evaluates a pruned, informative subset."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.prune_ratio = float(self.extra_params.get('prune_ratio', 0.1))
        self.pruning_strategy = self.extra_params.get('pruning_strategy', 'disagreement')
        self.calibration_dir = self.extra_params.get('calibration_dir')
        self._allowed_indices: Set[int] = set(
            resolve_pruned_indices(
                dataset='live_code_bench_pruned',
                prune_ratio=self.prune_ratio,
                pruning_strategy=self.pruning_strategy,
                calibration_dir=self.calibration_dir,
                subset='release_v5',
            )
        )

    def sample_filter(self, sample) -> bool:
        if not super().sample_filter(sample):
            return False
        if sample.id is None:
            return False
        return int(sample.id) in self._allowed_indices
