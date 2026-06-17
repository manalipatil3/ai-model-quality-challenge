# Handout B — Why This Matters (Business)

## What changes for the customer conversation

Today, evaluating a candidate model against LiveCodeBench + AA-LCR means **415 expensive samples** and long sandbox/judge runs. With these pruners, sales and solutions engineering can get a **ranking-preserving signal from ~42 samples** (~90% fewer) in a fraction of the wall-clock time.

That turns "we'll get back to you next week" into **same-day go/no-go** on coding and long-context fit.

## How to run it tomorrow

1. Install the evalscope fork + `evalscope_ext` (see README).
2. Run the **pruned** benchmarks on the candidate model:

   ```bash
   evalscope eval --model <candidate> --datasets live_code_bench_pruned \
     --dataset-args '{"pruning_strategy": "disagreement", "prune_ratio": 0.1}' \
     --output ./results_pruned/
   ```

3. Compare against your baseline / last candidate using `compare_runs.py` or your internal scorecard.
4. If the model **ranks above your bar** on the pruned set, proceed to full eval or POC. If it **clearly loses** to incumbents, stop early.

## Multimodal probe — signal random sampling cannot give

If the customer adds images next quarter, **`mmmu_probe`** (~24 samples) targets **vision encoder failure modes** — OCR, charts, tables, diagrams — not random trivia. Random 24 samples might all be easy art-history questions; our probe **guarantees coverage** of the image types that break production deployments (misread table cell, wrong chart trend, garbled diagram label).

## Why PMs should care

- **Faster deals** — fewer eval cycles blocking contracts.
- **Lower eval cost** — less GPU/API spend on models that won't win.
- **Clearer story** — "We tested the hard, discriminative cases" resonates more than a single headline number.
- **Roadmap optionality** — multimodal probe de-risks next-quarter scope without committing to full 12K MMMU upfront.
