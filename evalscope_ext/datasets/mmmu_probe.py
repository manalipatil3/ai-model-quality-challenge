from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PROBE_PATH = PACKAGE_ROOT / 'data' / 'mmmu_probe_indices.json'

# Image-encoder stress categories for Part B.
ENCODER_STRESS_CATEGORIES: Dict[str, str] = {
    'ocr': 'Dense text, handwriting, or small-font OCR in images',
    'charts': 'Bar/line/pie charts and plotted numeric trends',
    'tables': 'Structured tabular layouts and spreadsheet-like grids',
    'diagrams': 'Flowcharts, schematics, and labeled node-edge diagrams',
    'scientific_figures': 'Plots, microscopy, spectra, and lab instrument readouts',
    'geometry': 'Geometric constructions, angles, and spatial reasoning figures',
    'medical_images': 'Clinical imaging and anatomy-heavy visuals',
    'low_contrast': 'Low-contrast, noisy, or heavily compressed images',
}

SUBJECT_TO_STRESS: Dict[str, str] = {
    'Accounting': 'tables',
    'Finance': 'charts',
    'Economics': 'charts',
    'Marketing': 'charts',
    'Manage': 'tables',
    'Computer_Science': 'diagrams',
    'Electronics': 'diagrams',
    'Mechanical_Engineering': 'diagrams',
    'Architecture_and_Engineering': 'diagrams',
    'Energy_and_Power': 'diagrams',
    'Math': 'geometry',
    'Physics': 'scientific_figures',
    'Chemistry': 'scientific_figures',
    'Biology': 'scientific_figures',
    'Basic_Medical_Science': 'medical_images',
    'Clinical_Medicine': 'medical_images',
    'Diagnostics_and_Laboratory_Medicine': 'medical_images',
    'Pharmacy': 'medical_images',
    'Public_Health': 'medical_images',
    'Geography': 'low_contrast',
    'History': 'ocr',
    'Literature': 'ocr',
    'Art': 'low_contrast',
    'Art_Theory': 'low_contrast',
    'Design': 'low_contrast',
    'Music': 'ocr',
    'Agriculture': 'scientific_figures',
    'Materials': 'scientific_figures',
    'Psychology': 'charts',
    'Sociology': 'charts',
}


@dataclass
class ProbeCandidate:
    index: int
    subject: str
    stress_category: str
    question_type: str
    image_count: int
    score: float


class MMMUProbeSelector:
    """
    Select a small MMMU probe set that stresses vision encoders rather than pure text reasoning.

    The selector is designed for the full ~12K HuggingFace dataset. When only reference rows are
    available locally, it still builds a category-balanced probe from those rows.
    """

    def __init__(
        self,
        samples_per_category: int = 3,
        max_total: int = 24,
    ) -> None:
        self.samples_per_category = samples_per_category
        self.max_total = max_total

    def infer_stress_category(
        self,
        subject: str,
        question: str = '',
        question_type: str = '',
    ) -> str:
        lowered = question.lower()
        if any(token in lowered for token in ('table', 'spreadsheet', 'row', 'column')):
            return 'tables'
        if any(token in lowered for token in ('chart', 'graph', 'plot', 'bar', 'line')):
            return 'charts'
        if any(token in lowered for token in ('diagram', 'circuit', 'schematic', 'flow')):
            return 'diagrams'
        if any(token in lowered for token in ('x-ray', 'mri', 'scan', 'clinical', 'medical')):
            return 'medical_images'
        if any(token in lowered for token in ('angle', 'triangle', 'circle', 'geometry')):
            return 'geometry'
        if any(token in lowered for token in ('ocr', 'handwriting', 'text in image')):
            return 'ocr'
        if question_type == 'multiple-choice' and '<image' in lowered and len(lowered) < 120:
            return 'ocr'
        return SUBJECT_TO_STRESS.get(subject, 'scientific_figures')

    def score_candidate(self, candidate: ProbeCandidate) -> float:
        # Prefer multi-image and MCQ items where encoder errors flip the answer letter.
        image_bonus = min(candidate.image_count, 4) * 0.15
        mcq_bonus = 0.2 if candidate.question_type == 'multiple-choice' else 0.05
        return image_bonus + mcq_bonus

    def select_from_records(self, records: Sequence[Dict]) -> List[Dict[str, object]]:
        candidates: List[ProbeCandidate] = []
        for record in records:
            subject = str(record.get('subject') or record.get('subset') or 'unknown')
            question = str(record.get('question') or '')
            question_type = str(record.get('question_type') or 'unknown')
            image_count = int(record.get('image_count') or self._count_image_markers(question))
            stress = self.infer_stress_category(subject, question, question_type)
            candidates.append(
                ProbeCandidate(
                    index=int(record['index']),
                    subject=subject,
                    stress_category=stress,
                    question_type=question_type,
                    image_count=image_count,
                    score=self.score_candidate(
                        ProbeCandidate(
                            index=int(record['index']),
                            subject=subject,
                            stress_category=stress,
                            question_type=question_type,
                            image_count=image_count,
                            score=0.0,
                        )
                    ),
                )
            )

        selected_keys: Set[tuple] = set()
        selected: List[Dict[str, object]] = []
        by_category: Dict[str, List[ProbeCandidate]] = {}
        for candidate in candidates:
            by_category.setdefault(candidate.stress_category, []).append(candidate)

        def add_candidate(candidate: ProbeCandidate) -> None:
            key = (candidate.subject, candidate.index)
            if key in selected_keys:
                return
            selected_keys.add(key)
            selected.append({'subject': candidate.subject, 'index': candidate.index})

        for category in ENCODER_STRESS_CATEGORIES:
            pool = sorted(
                by_category.get(category, []),
                key=lambda item: item.score,
                reverse=True,
            )
            for candidate in pool[: self.samples_per_category]:
                add_candidate(candidate)
                if len(selected) >= self.max_total:
                    return selected

        if len(selected) < self.max_total:
            remaining = sorted(
                [candidate for candidate in candidates if (candidate.subject, candidate.index) not in selected_keys],
                key=lambda item: item.score,
                reverse=True,
            )
            for candidate in remaining:
                add_candidate(candidate)
                if len(selected) >= self.max_total:
                    break
        return selected

    @staticmethod
    def _count_image_markers(question: str) -> int:
        return question.lower().count('<image')

    @classmethod
    def _iter_review_files(cls, reviews_dir: Path) -> List[Path]:
        direct = sorted(reviews_dir.glob('mmmu_*.jsonl'))
        if direct:
            return direct
        return sorted(reviews_dir.glob('**/mmmu_*.jsonl'))

    @classmethod
    def from_reference_reviews(cls, reviews_dir: Path, samples_per_category: int = 3) -> List[Dict[str, object]]:
        selector = cls(samples_per_category=samples_per_category)
        records: List[Dict] = []
        review_files = cls._iter_review_files(reviews_dir)
        for review_path in review_files:
            subject = review_path.stem.replace('mmmu_', '')
            with review_path.open(encoding='utf-8') as handle:
                for line in handle:
                    row = json.loads(line)
                    sample_score = row.get('sample_score', {})
                    metadata = sample_score.get('sample_metadata') or {}
                    question = str(row.get('input') or metadata.get('question') or '')
                    records.append(
                        {
                            'index': int(row['index']),
                            'subject': subject,
                            'question': question,
                            'question_type': metadata.get('question_type', 'unknown'),
                            'image_count': MMMUProbeSelector._count_image_markers(question),
                            'img_type': metadata.get('img_type', ''),
                        }
                    )
        return selector.select_from_records(records)

    @classmethod
    def save_default_probe(
        cls,
        reviews_dir: Path,
        output_path: Path = DEFAULT_PROBE_PATH,
        samples_per_category: int = 3,
    ) -> Dict:
        probes = cls.from_reference_reviews(reviews_dir, samples_per_category=samples_per_category)
        payload = {
            'dataset': 'mmmu_probe',
            'count': len(probes),
            'probes': probes,
            'categories': list(ENCODER_STRESS_CATEGORIES.keys()),
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        return payload


def load_probe_entries(path: Path = DEFAULT_PROBE_PATH) -> List[Dict[str, object]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding='utf-8'))
    if 'probes' in payload:
        return payload['probes']
    return [{'subject': '*', 'index': int(index)} for index in payload.get('indices', [])]
