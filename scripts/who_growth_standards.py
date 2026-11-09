"""
WHO Child Growth Standards (0-5 years) reference data for the minimal-style
IAP/WHO chart generators.

Values below are approximate WHO Child Growth Standards median trajectories
with per-age standard deviations, entered from general training knowledge of
the published WHO 2006 growth standards -- NOT transcribed directly from a
live WHO source in this environment. The five display percentiles (P3, P15,
P50, P85, P97) are derived from (median, sd) using standard normal z-scores:

    P3  = median - 1.881 * sd
    P15 = median - 1.036 * sd
    P50 = median
    P85 = median + 1.036 * sd
    P97 = median + 1.881 * sd

This mirrors how the existing IAP 5-18 charts already draw fixed percentile
bands, but the underlying (median, sd) numbers here should be spot-checked
against WHO's official published tables (https://www.who.int/tools/child-growth-standards)
before being relied on clinically. The known-accurate `who-official-png`
assets (rasterized directly from WHO's own PDFs) remain the authoritative
reference elsewhere in this app; this module only powers the small in-app
"minimal" chart previews.
"""

from __future__ import annotations

Z_P3 = -1.881
Z_P15 = -1.036
Z_P85 = 1.036
Z_P97 = 1.881

WHO_DISPLAY_COLUMNS = {
    "height": ["P97", "P85", "P50", "P15", "P3"],
    "weight": ["P97", "P85", "P50", "P15", "P3"],
    "head": ["P97", "P85", "P50", "P15", "P3"],
    "bmi_small": ["P97", "P85", "P50", "P15", "P3"],
}

WHO_AXIS = {
    "height": {"x_min": 0, "x_max": 60, "y_min": 40, "y_max": 120},
    "weight": {"x_min": 0, "x_max": 60, "y_min": 0, "y_max": 25},
    "head": {"x_min": 0, "x_max": 60, "y_min": 30, "y_max": 55},
    "bmi_small": {"x_min": 0, "x_max": 60, "y_min": 10, "y_max": 25},
}

# (age_months, median, sd) checkpoints. Ages: 0, 3, 6, 9, 12, 15, 18, 21, 24, 30, 36, 42, 48, 54, 60.
WHO_MEDIAN_SD = {
    ("Boys", "weight"): [
        (0, 3.3, 0.45), (3, 6.4, 0.68), (6, 7.9, 0.79), (9, 8.9, 0.87),
        (12, 9.6, 0.93), (15, 10.3, 0.99), (18, 10.9, 1.04), (21, 11.5, 1.10),
        (24, 12.2, 1.15), (30, 13.3, 1.27), (36, 14.3, 1.38), (42, 15.3, 1.48),
        (48, 16.3, 1.58), (54, 17.3, 1.69), (60, 18.3, 1.80),
    ],
    ("Girls", "weight"): [
        (0, 3.2, 0.45), (3, 5.8, 0.65), (6, 7.3, 0.76), (9, 8.2, 0.84),
        (12, 8.9, 0.90), (15, 9.6, 0.97), (18, 10.2, 1.03), (21, 10.9, 1.10),
        (24, 11.5, 1.16), (30, 12.7, 1.30), (36, 13.9, 1.44), (42, 15.0, 1.58),
        (48, 16.1, 1.72), (54, 17.2, 1.86), (60, 18.2, 2.00),
    ],
    ("Boys", "height"): [
        (0, 49.9, 1.9), (3, 61.4, 2.1), (6, 67.6, 2.2), (9, 72.0, 2.3),
        (12, 75.7, 2.4), (15, 79.1, 2.5), (18, 82.3, 2.6), (21, 85.1, 2.7),
        (24, 87.8, 2.9), (30, 91.9, 3.1), (36, 96.1, 3.3), (42, 99.9, 3.5),
        (48, 103.3, 3.7), (54, 106.7, 3.9), (60, 110.0, 4.1),
    ],
    ("Girls", "height"): [
        (0, 49.1, 1.9), (3, 59.8, 2.1), (6, 65.7, 2.2), (9, 70.1, 2.3),
        (12, 74.0, 2.4), (15, 77.5, 2.6), (18, 80.7, 2.7), (21, 83.7, 2.8),
        (24, 86.4, 3.0), (30, 90.7, 3.2), (36, 95.1, 3.4), (42, 99.0, 3.6),
        (48, 102.7, 3.8), (54, 106.2, 4.0), (60, 109.4, 4.2),
    ],
    ("Boys", "head"): [
        (0, 34.5, 1.3), (3, 40.5, 1.3), (6, 43.3, 1.3), (9, 45.0, 1.3),
        (12, 46.1, 1.3), (15, 46.9, 1.4), (18, 47.4, 1.4), (21, 47.9, 1.4),
        (24, 48.3, 1.4), (30, 48.8, 1.4), (36, 49.3, 1.5), (42, 49.6, 1.5),
        (48, 49.9, 1.5), (54, 50.1, 1.5), (60, 50.3, 1.5),
    ],
    ("Girls", "head"): [
        (0, 33.9, 1.2), (3, 39.5, 1.3), (6, 42.2, 1.3), (9, 43.8, 1.3),
        (12, 44.9, 1.3), (15, 45.8, 1.3), (18, 46.4, 1.4), (21, 46.9, 1.4),
        (24, 47.3, 1.4), (30, 47.8, 1.4), (36, 48.2, 1.4), (42, 48.5, 1.4),
        (48, 48.8, 1.4), (54, 49.0, 1.4), (60, 49.2, 1.5),
    ],
    ("Boys", "bmi_small"): [
        (0, 13.4, 1.1), (3, 16.9, 1.2), (6, 17.3, 1.2), (9, 17.0, 1.1),
        (12, 16.8, 1.1), (15, 16.5, 1.1), (18, 16.3, 1.1), (21, 16.1, 1.1),
        (24, 16.0, 1.1), (30, 15.8, 1.1), (36, 15.6, 1.1), (42, 15.5, 1.1),
        (48, 15.4, 1.1), (54, 15.3, 1.1), (60, 15.3, 1.1),
    ],
    ("Girls", "bmi_small"): [
        (0, 13.3, 1.1), (3, 16.3, 1.2), (6, 16.8, 1.2), (9, 16.5, 1.1),
        (12, 16.3, 1.1), (15, 16.0, 1.1), (18, 15.8, 1.1), (21, 15.7, 1.1),
        (24, 15.6, 1.1), (30, 15.4, 1.1), (36, 15.3, 1.1), (42, 15.2, 1.1),
        (48, 15.2, 1.1), (54, 15.2, 1.1), (60, 15.2, 1.1),
    ],
}


def _expand(sex_kind: tuple[str, str]) -> dict:
    checkpoints = WHO_MEDIAN_SD[sex_kind]
    _, kind = sex_kind
    rows = []
    for age, median, sd in checkpoints:
        rows.append((
            age,
            round(median + Z_P3 * sd, 2),
            round(median + Z_P15 * sd, 2),
            round(median, 2),
            round(median + Z_P85 * sd, 2),
            round(median + Z_P97 * sd, 2),
        ))
    return {
        "axis": WHO_AXIS[kind],
        "columns": ["P3", "P15", "P50", "P85", "P97"],
        "rows": rows,
    }


WHO_0TO5_PERCENTILES = {sex_kind: _expand(sex_kind) for sex_kind in WHO_MEDIAN_SD}
