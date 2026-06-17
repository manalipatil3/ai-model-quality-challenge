# Cerebras Performance Explorer

**Live URL:** _Deploy with Vercel/Netlify — see [Deploy](#deploy) below, then paste your URL here._

Turn internal Cerebras perf projection `.xlsx` sweeps into actionable views for customers and engineers. Upload one or many sweeps (including brand-new models like **Model L**) with zero code changes.

## Quick start

```bash
cd perf-ui
npm install
npm run dev
```

Open http://localhost:5173 — Models **A–K** (77 sweeps, 7 profiles each) preload automatically.

## Build

```bash
npm run build
npm run preview
```

Default data is regenerated from `../perf_data-*/perf_data` via `scripts/build-default-data.mjs` before dev/build.

## Deploy

### Vercel (recommended)

1. Push `perf-ui/` to a GitHub repo (or deploy from monorepo with root directory `perf-ui`).
2. Import the project at [vercel.com](https://vercel.com).
3. Set **Root Directory** to `perf-ui`, **Build Command** `npm run build`, **Output Directory** `dist`.
4. Deploy — copy the production URL into this README and your submission form.

```bash
cd perf-ui
npx vercel --prod
```

### Netlify

```bash
cd perf-ui
npm run build
npx netlify deploy --prod --dir=dist
```

## Features

| View | Audience | What it shows |
|------|----------|---------------|
| **Customer** | PM / customer | Go/No-Go badge, tok/s, TTFT, context size, cost efficiency, best-model recommendation, auto insights |
| **Engineer** | Internal perf / deployment | Full raw metric table, throughput & TTFT charts, profile trend lines, anomaly warnings |
| **Compare** | Both | Side-by-side table + bar charts for selected models on a traffic profile |

### Upload

- Single or multi-file `.xlsx` upload (drag via file picker).
- Parser reads the **Summary** sheet and maps columns by header name — no hard-coded model list.
- Works with `Model_<X>_profile_<N>/Model <X> profile <N>.xlsx` including `Model L`.
- Sample Model L file: `public/samples/Model L profile 1.xlsx`

### Insights (examples)

- “Model B has the lowest TTFT on profile 1.”
- “Model L is fastest among Go-rated sweeps.”
- Anomaly flags for latency over target, TTFT spikes, queueing drops.

## Assumptions

1. **File contract:** Each sweep is a single-sheet workbook (`Summary`) with standard Cerebras projection columns (Input Length, Batch Size, TTFT, Throughput, etc.).
2. **Model identity** is parsed from folder or filename (`Model A profile 3.xlsx` → model `A`, profile `3`).
3. **Reference batch** for customer summary is batch size **10** (first operating point).
4. **Go/No-Go gates:**
   - **GO:** max latency ≤ target, TTFT ≤ 50 ms, gen speed ≥ 500 tok/s/user
   - **REVIEW:** fails one secondary gate
   - **NO-GO:** max latency exceeds target (or multiple secondary failures)
5. **Cost efficiency** is derived as aggregate tok/s ÷ tok/s per box (higher = better hardware utilization). No dollar pricing in source data.
6. **Default preload:** Models A–K only; uploaded sweeps merge/replace by `{modelId}-profile-{N}` id.

## Model size guesses (A–K)

Based on relative throughput and TTFT patterns across profiles:

| Tier | Models | Guess |
|------|--------|-------|
| Largest / flagship | F, G, H | ~100B+ class, highest aggregate tok/s on long-context profiles |
| Mid-large | D, E, I | ~30–70B, strong balance of speed and context |
| Compact / edge | A, B, C | ~7–13B, lower absolute tok/s but competitive TTFT on short profiles |
| Specialized | J, K | Tuned variants — J skews latency-sensitive, K skews throughput |

## Traffic profile use cases (1–7)

| Profile | Shape | Likely use case |
|---------|-------|-----------------|
| 1 | 10k in / 333 out, 50% cache | Production chat with history |
| 2 | 10k in / 4k out, cold | Long-form writing / codegen |
| 3 | 3.2k in / 400 out | API micro-prompts |
| 4 | 1k / 1k balanced | General assistant turns |
| 5 | 8k in / 1k out | RAG document Q&A |
| 6 | 60k in / 200 out, 90% cache | Enterprise search / legal discovery |
| 7 | 17k in / 3.5k out, 70% cache | Agentic workflows with tool output |

## Tech stack

- **Vite + React + TypeScript**
- **Tailwind CSS v4** — layout and theming
- **xlsx** — client-side Excel parsing
- **Recharts** — engineer & compare visualizations

## Test upload locally

```bash
node scripts/test-upload.mjs
```

Manual: upload `public/samples/Model L profile 1.xlsx` in the UI and confirm it appears in all three views.

## Video walkthrough

Record a ≤5 min video covering: problem framing, framework choice, assumptions, model size guesses, and profile use cases. Link it in your submission form.

## Submission checklist

- [ ] Private GitHub repo with this code
- [ ] Live URL at top of README + submission form
- [ ] Video link in submission form
- [ ] Reviewers granted repo access
