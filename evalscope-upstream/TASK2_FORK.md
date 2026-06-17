# Evalscope fork — Task 2 extensions

This directory is a shallow clone of [modelscope/evalscope](https://github.com/modelscope/evalscope) with Task 2 benchmark compression hooks.

**Pinned commit:** `fe8c5a4755bcdb5558c002fbe6fe7a03e8170ce4`

## Extension point

Pruned benchmarks live in the sibling package [`../evalscope_ext/`](../evalscope_ext/) and register via:

```text
evalscope/benchmarks/evalscope_ext/register_extensions_adapter.py
```

## Install

```bash
pip install -e .
pip install -e ../evalscope_ext
```

See [`../evalscope_ext/README.md`](../evalscope_ext/README.md) for run commands and validation results.
