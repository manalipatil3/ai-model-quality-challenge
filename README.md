# Cerebras AI Engineer Challenge

**Repository:** https://github.com/manalipatil3/ai-model-quality-challenge

**Live URL (Task 1):** https://ai-model-quality-task1.vercel.app

**Task 2 docs (Vercel):** https://ai-model-quality-task2.vercel.app

**Submit:** https://docs.google.com/forms/d/e/1FAIpQLSdwLrRJkKUgTd2sisyJO10VSf1-1vJ3NIywV5HtMlUSc7ijMw/viewform?usp=publish-editor

| Task | Path | Summary |
|------|------|---------|
| Task 1 — Performance UI | `perf-ui/` | Upload `.xlsx` sweeps → Customer / Engineer / Compare views |
| Task 2 — Benchmark compression | `evalscope_ext/`, `evalscope-upstream/` | Pruned LCB + AA-LCR + MMMU probe in evalscope |

**Requires:** Node 18+, Python 3.10+, data folders `perf_data-20260616T205716Z-3-001/` and `Evals-20260616T210149Z-3-001/` at repo root.

---

## Task 1

```bash
cd perf-ui
npm install
npm run dev          # http://localhost:5173
npm test             # tests
npm run build        # production → dist/
```

**Reviewer check:** Upload `perf-ui/public/samples/Model L profile 1.xlsx` → verify all three views.

---

## Deploy

Both tasks deploy as **two Vercel projects** from this repo ([vercel.com/new](https://vercel.com/new) → Import Git Repository).
- Task 1 project: `ai-model-quality-task1`
- Task 2 project: `ai-model-quality-task2`

### Task 1 — `perf-ui/` (required live URL)

**Important:** In Vercel project settings, either:
- leave **Root Directory** empty (repo root — uses root `vercel.json`), **or**
- set **Root Directory** to `perf-ui` (uses `perf-ui/vercel.json`)

| Setting | Value (if using `perf-ui` root) |
|---------|--------|
| Root Directory | `perf-ui` |
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Or CLI (after `npx vercel login`):

```bash
cd perf-ui && npm run build && npx vercel --prod
```

### Task 2 — `task2-site/` (handouts + reviewer guide)

Static docs site (Python evalscope code still runs locally from the repo).

| Setting | Value |
|---------|--------|
| Root Directory | `task2-site` |
| Framework | Other (no build) |

```bash
cd task2-site && npx vercel --prod
```

Or run both: `powershell -File scripts/deploy-vercel.ps1`

After deploy, paste the **Task 1 URL** at the top of this README and in the submission form.

---

## Task 2

**Evalscope SHA:** `fe8c5a4755bcdb5558c002fbe6fe7a03e8170ce4`

```bash
pip install -r requirements.txt

python evalscope_ext/scripts/validate_all.py          # full check → ALL CHECKS PASSED
python evalscope_ext/scripts/test_part_a_manual.py    # Part A data validation
python evalscope_ext/tests/test_pruners.py          # Part A unit tests
python evalscope_ext/tests/test_mmmu_probe.py         # Part B unit tests
```

**Handouts:** `evalscope_ext/handouts/Handout_A.md`, `Handout_B.md`

**Optional live eval:**
```bash
evalscope eval --model <model> --datasets live_code_bench_pruned \
  --dataset-args '{"pruning_strategy": "disagreement", "prune_ratio": 0.1}' \
  --output ./results_pruned/
```

---

## Submission

- [x] GitHub repo — https://github.com/manalipatil3/ai-model-quality-challenge
- [ ] Private repo + reviewer access
- [x] Live Task 1 URL (Vercel `perf-ui/`)
- [x] Task 2 docs on Vercel (`task2-site/`) — optional but recommended
- [ ] Task 1 video (≤ 5 min)
- [ ] Task 2 video
- [ ] Handouts A & B

### Videos

**Task 1:** Live URL demo — audiences, what you cut, stack choice, upload new model, assumptions, model sizes (A–K), profile use cases (1–7).

**Task 2:** Pruning strategy (disagreement + difficulty + diversity), results (LCB 315→32, AA-LCR 100→10, ranking preserved), `validate_all.py` demo, MMMU encoder probe (24 samples), handout highlights.
