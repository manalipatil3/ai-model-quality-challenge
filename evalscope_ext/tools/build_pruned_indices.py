from __future__ import annotations

import argparse
from pathlib import Path

from evalscope_ext.datasets.mmmu_probe import MMMUProbeSelector
from evalscope_ext.datasets.pruning_utils import save_default_indices


def main() -> None:
    parser = argparse.ArgumentParser(description='Build default pruned index sets from calibration data.')
    parser.add_argument(
        '--calibration-dir',
        type=Path,
        default=Path('Evals-20260616T210149Z-3-001/Evals/Part 1'),
        help='Directory containing predictions/ and reviews/ JSONL.',
    )
    parser.add_argument('--prune-ratio', type=float, default=0.1)
    parser.add_argument('--output', type=Path, default=Path('evalscope_ext/data/pruned_indices.json'))
    parser.add_argument(
        '--mmmu-reviews-dir',
        type=Path,
        default=Path('Evals-20260616T210149Z-3-001/Evals/MMMU/reviews/glm-4.5v-fp8'),
        help='Directory containing MMMU review JSONL files.',
    )
    args = parser.parse_args()

    entries = save_default_indices(
        calibration_dir=args.calibration_dir,
        output_path=args.output,
        prune_ratio=args.prune_ratio,
    )
    probe = MMMUProbeSelector.save_default_probe(
        reviews_dir=args.mmmu_reviews_dir,
        output_path=Path('evalscope_ext/data/mmmu_probe_indices.json'),
    )

    print(f'Wrote {args.output}')
    for key, entry in entries.items():
        print(f"  {key}: {entry['count']} samples")
    print(f"Wrote MMMU probe with {probe['count']} samples")


if __name__ == '__main__':
    main()
