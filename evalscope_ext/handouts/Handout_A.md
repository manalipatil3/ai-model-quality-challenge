# Handout A — Why This Works (Technical)

## Part A — Coding + long-context compression

### Problem framing

The customer needs a **go/no-go signal** on two capabilities: code generation (LiveCodeBench v5) and long-context retrieval (AA-LCR). Running full benchmarks on every candidate model is too slow and expensive for a sales cycle. The goal is the **smallest subset that preserves model ranking and deployment decisions**, not the subset with the highest absolute accuracy.

### Approach

We built a universal **`DisagreementPruner`** inside evalscope:

```text
Importance = Disagreement + Difficulty + Diversity
```

1. **Disagreement** — Join predictions/reviews from three reference models on `index`. Samples where models split (some pass, some fail) are the most informative for ranking a fourth unseen model.
2. **Difficulty** — Mixed outcomes score highest. All-pass items are "easy" (everyone looks good); all-fail items are less discriminative for ordering strong vs weak models.
3. **Diversity** — Greedy selection with a category-coverage bonus:
   - **LCB:** prompt-length buckets (short / medium / long)
   - **AA-LCR:** context-length buckets from `input_tokens` metadata

We then take the top `prune_ratio` fraction (default **10%**) while guaranteeing at least one sample per bucket.

### Results

| Benchmark | Reduction | Ranking |
|-----------|-----------|---------|
| LCB v5 | 315 → **32** (~90%) | Preserved |
| AA-LCR | 100 → **10** (90%) | Preserved |

Pruned absolute accuracy is **lower** than full-benchmark accuracy by design — the pruned set over-indexes on hard/disagreement cases. That is the correct signal for "which model is better," not "what is the marketing pass rate."

### Why this generalizes beyond three calibration models

The method selects **structurally discriminative** items (model disagreement + mixed difficulty), not items where a specific model failed. A fourth model is likely to split on the same frontier items if capability differences exist. We deliberately avoid fitting to per-model error patterns.

### Assumptions

- Calibration models span the capability range the customer cares about.
- AA-LCR judge noise exists; disagreement partly reflects judge variance — acceptable for a screening benchmark.
- LCB `index` aligns with evalscope `sample.id` for `release_v5`.

### Part B — MMMU encoder probe (design)

For the full ~12K MMMU HuggingFace dataset, we propose **`MMMUProbeSelector`**: ~24 samples (3 per category) targeting **encoder stress**, not general reasoning:

| Category | Why it stresses encoders |
|----------|--------------------------|
| OCR | Small text, handwriting |
| Charts / Tables | Structured layout + numeric glyphs |
| Diagrams | Fine lines, labels, topology |
| Scientific figures | Multi-scale detail |
| Geometry | Spatial relations from pixels |
| Medical images | Low-level texture + contrast |
| Low contrast | Compression / noise sensitivity |

Selection prefers multi-image MCQ items where a vision encoding error flips the answer letter — measurable through the standard OpenAI multimodal chat API without internal encoder hooks.

### What would change with more resources

| Resource | Change |
|----------|--------|
| More calibration data | Re-fit indices per customer vertical |
| Live model endpoint | Active learning: add samples where new model disagrees with committee |
| More time | Per-subject MMMU probe refresh; judge-variance correction for AA-LCR |
