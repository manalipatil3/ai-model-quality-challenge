from __future__ import annotations

from typing import Dict, List, Sequence

# Encoder-stress image types ranked for vision-encoder probing.
IMAGE_TYPE_SCORES: Dict[str, float] = {
    'ocr': 1.0,
    'chart': 0.9,
    'charts': 0.9,
    'table': 0.85,
    'tables': 0.85,
    'diagram': 0.8,
    'diagrams': 0.8,
    'geometry': 0.75,
    'medical': 0.75,
    'medical_images': 0.75,
    'scientific': 0.7,
    'scientific_figures': 0.7,
    'low_contrast': 0.65,
    'plain': 0.1,
}

COVERAGE_ORDER = [
    'ocr',
    'chart',
    'table',
    'diagram',
    'geometry',
    'medical',
    'scientific',
    'low_contrast',
]


class MMMUProbeSelector:
    """Select MMMU probe samples that stress vision encoders."""

    def importance_score(self, sample: Dict) -> float:
        metadata = sample.get('metadata') or {}
        image_type = str(metadata.get('image_type', 'plain')).lower()
        score = IMAGE_TYPE_SCORES.get(image_type, 0.2)
        if metadata.get('contains_text'):
            score += 0.1
        return float(score)

    def _image_type(self, sample: Dict) -> str:
        metadata = sample.get('metadata') or {}
        return str(metadata.get('image_type', 'plain')).lower()

    def select(self, samples: Sequence[Dict], prune_ratio: float = 0.1) -> List[Dict]:
        if not samples:
            return []

        target = len(samples) if prune_ratio >= 1.0 else max(1, round(len(samples) * prune_ratio))

        deduped: Dict[int, Dict] = {}
        for sample in samples:
            index = int(sample['index'])
            existing = deduped.get(index)
            if existing is None or self.importance_score(sample) > self.importance_score(existing):
                deduped[index] = sample

        ranked = sorted(deduped.values(), key=self.importance_score, reverse=True)
        selected: List[Dict] = []
        selected_indices: set[int] = set()
        covered_types: set[str] = set()

        for image_type in COVERAGE_ORDER:
            for sample in ranked:
                if self._image_type(sample) != image_type:
                    continue
                index = int(sample['index'])
                if index in selected_indices:
                    continue
                selected.append(sample)
                selected_indices.add(index)
                covered_types.add(image_type)
                break

        for sample in ranked:
            if len(selected) >= target:
                break
            index = int(sample['index'])
            if index in selected_indices:
                continue
            selected.append(sample)
            selected_indices.add(index)

        if prune_ratio < 1.0:
            selected = sorted(selected, key=self.importance_score, reverse=True)[:target]

        return selected
