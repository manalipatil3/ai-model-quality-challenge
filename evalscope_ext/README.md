# Task 2 — Benchmark Compression (`evalscope_ext`)

Pruned evalscope benchmarks for fast customer go/no-go on **coding** (LiveCodeBench v5), **long-context** (AA-LCR), and a forward-looking **MMMU encoder probe**.

**Evalscope commit SHA:** `fe8c5a4755bcdb5558c002fbe6fe7a03e8170ce4`  
Fork path: [`evalscope-upstream/`](../evalscope-upstream/)

---

## Architecture

```text
evalscope_ext/
├── pruners/
│   ├── base_pruner.py          # Importance = disagreement + difficulty + diversity
│   └── disagreement_pruner.py  # Universal pruner for LCB + AA-LCR
├── datasets/
│   ├── live_code_bench_pruned.py
│   ├── aa_lcr_pruned.py
│   ├── mmmu_probe.py           # MMMUProbeSelector (Part B)
│   └── mmmu_probe_adapter.py
├── tools/
│   ├── build_pruned_indices.py
│   └── compare_runs.py
├── data/
│   ├── pruned_indices.json     # Precomputed LCB + AA-LCR subsets
│   └── mmmu_probe_indices.json # 24-subject/index encoder-stress probes
└── handouts/
    ├── Handout_A.md
    └── Handout_B.md
```

---

## Setup

```bash
# From repo root
pip install -e evalscope-upstream
pip install -e evalscope_ext

# Optional: rebuild index files from shipped calibration JSONL
python -m evalscope_ext.tools.build_pruned_indices \
  --calibration-dir "Evals-20260616T210149Z-3-001/Evals/Part 1" \
  --mmmu-reviews-dir "Evals-20260616T210149Z-3-001/Evals/MMMU/reviews/glm-4.5v-fp8"
```

Pruned benchmarks auto-register when evalscope loads (`evalscope.benchmarks.evalscope_ext.register_extensions_adapter`).

---

## Run contract

### Full vs pruned eval (LiveCodeBench)

```bash
evalscope eval --model <model> --datasets live_code_bench --output ./results_full/

evalscope eval --model <model> --datasets live_code_bench_pruned \
  --dataset-args '{"pruning_strategy": "disagreement", "prune_ratio": 0.1}' \
  --output ./results_pruned/

python -m evalscope_ext.tools.compare_runs --full ./results_full/ --pruned ./results_pruned/
```

### AA-LCR pruned

```bash
evalscope eval --model <model> --datasets aa_lcr_pruned \
  --dataset-args '{"pruning_strategy": "disagreement", "prune_ratio": 0.1}' \
  --output ./results_aa_lcr_pruned/
```

### MMMU encoder probe (Part B)

```bash
evalscope eval --model <vlm-model> --datasets mmmu_probe --output ./results_mmmu_probe/
```

---

## Offline validation (shipped JSONL, no live inference)

Using calibration reviews under `Evals/Part 1/`:

```bash
python -m evalscope_ext.tools.compare_runs \
  --offline-calibration "Evals-20260616T210149Z-3-001/Evals/Part 1" \
  --benchmark live_code_bench_v5 --metric pass

python -m evalscope_ext.tools.compare_runs \
  --offline-calibration "Evals-20260616T210149Z-3-001/Evals/Part 1" \
  --benchmark aa_lcr --metric acc
```

### Verified results (reference models)

| Benchmark | Full → Pruned | Ranking preserved | Sample reduction |
|-----------|---------------|-------------------|------------------|
| LiveCodeBench v5 | 315 → 32 | Yes (gpt-oss-120b > kimi-k2.5 > minimax-m2.5) | ~90% |
| AA-LCR | 100 → 10 | Yes (kimi-k2.5 > minimax-m2.5 > gpt-oss-120b) | 90% |
| MMMU probe | ~12K design → 24 reference probes | Encoder-stress categories covered | ~99%+ vs full MMMU |

Pruned accuracy is **lower in absolute terms** because the subset intentionally oversamples disagreement / mixed-difficulty items — the signal we need for model ranking and go/no-go, not headline pass rates.

---

## Pruning strategy

**Importance score** per sample (from calibration model reviews):

```text
Importance = Disagreement + Difficulty + Diversity (+ context-length tie-break)
```

| Signal | Definition |
|--------|------------|
| **Disagreement** | Reference models do not all pass/fail the same way |
| **Difficulty** | Mixed outcomes (some pass, some fail) score highest; all-pass / all-fail score lower |
| **Diversity** | Greedy selection boosts under-covered buckets (LCB prompt length; AA-LCR context length) |

This is **not** random sampling, top-k easiest/hardest, or hand-picked IDs. It generalizes to unseen models because it selects *discriminative* items, not items tuned to a specific model's errors.

---

## Deliverables

- **Handout A (technical):** [`handouts/Handout_A.md`](handouts/Handout_A.md)
- **Handout B (business):** [`handouts/Handout_B.md`](handouts/Handout_B.md)
- **Video walkthrough:** record separately and link in submission form
