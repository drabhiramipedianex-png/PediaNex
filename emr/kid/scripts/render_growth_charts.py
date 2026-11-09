"""Local growth-chart renderer used by the Vite dev server.

Reads a JSON payload on stdin and prints the chart package JSON on stdout,
mirroring api/growth_charts.py (the Vercel Python function).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from chart_plotting import ChartPlotError, generate_chart_package  # noqa: E402


def main() -> int:
    try:
        raw = sys.stdin.read() or "{}"
        payload = json.loads(raw)
        sys.stdout.write(json.dumps(generate_chart_package(payload)))
        return 0
    except ChartPlotError as exc:
        sys.stdout.write(str(exc))
        return 1
    except json.JSONDecodeError:
        sys.stdout.write("Request body must be valid JSON.")
        return 1
    except Exception as exc:  # pragma: no cover - surfaced to the dev server
        sys.stdout.write(f"Unable to generate charts right now: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
