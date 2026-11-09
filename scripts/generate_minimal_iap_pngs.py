from __future__ import annotations

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:  # pragma: no cover - environment-specific dependency
    raise SystemExit(
        "Pillow is required to generate PNG chart assets. Install it with `pip install pillow`."
    ) from exc

from generate_minimal_iap_svgs import (
    CHARTS,
    IAP_2015_PERCENTILES,
    IAP_DISPLAY_COLUMNS,
    X_AXIS,
    get_percentile_labels,
    get_y_labels,
)
from who_growth_standards import WHO_0TO5_PERCENTILES, WHO_DISPLAY_COLUMNS


SCALE = 4
CANVAS_WIDTH = 260
PANEL_GAP = 20
PANEL_WIDTH = 170
PANEL_HEIGHT = 140
PANEL_Y = 22
TOTAL_HEIGHT = PANEL_Y + PANEL_HEIGHT + 26

BG = "#ffffff"
AXIS = "#111111"
TICK = "#666666"
LABEL = "#222222"
CURVE = "#8a8f96"
MEDIAN = "#222222"
PERCENTILE = "#444444"


def sx(value: int | float) -> int:
    return round(value * SCALE)


def load_font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    font_names = (
        ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf")
        if bold
        else ("arial.ttf", "Arial.ttf", "DejaVuSans.ttf")
    )
    for font_name in font_names:
        try:
            return ImageFont.truetype(font_name, sx(size))
        except OSError:
            continue
    return ImageFont.load_default()


LABEL_FONT = load_font(9, bold=True)
PERCENTILE_FONT = load_font(8, bold=True)


def map_reference_point(age: float, value: float, axis: dict, x: int, y: int, width: int, height: int):
    x_ratio = (age - axis["x_min"]) / (axis["x_max"] - axis["x_min"])
    y_ratio = (value - axis["y_min"]) / (axis["y_max"] - axis["y_min"])
    return sx(x + width * x_ratio), sx(y + height - height * y_ratio)


def build_reference_curves(panel: dict, x: int, y: int, width: int, height: int):
    age_mode = panel.get("age_mode")
    sex = panel.get("sex", "")
    kind = panel["kind"]

    if age_mode == "years":
        reference = IAP_2015_PERCENTILES.get((sex, kind))
        display_columns = IAP_DISPLAY_COLUMNS.get(kind, [])
    elif age_mode == "months":
        reference = WHO_0TO5_PERCENTILES.get((sex, kind))
        display_columns = WHO_DISPLAY_COLUMNS.get(kind, [])
    else:
        return []

    if not reference or not display_columns:
        return []

    curves = []
    for column in display_columns:
        column_index = reference["columns"].index(column) + 1
        points = [
            map_reference_point(row[0], row[column_index], reference["axis"], x, y, width, height)
            for row in reference["rows"]
        ]
        color = MEDIAN if column == "P50" else CURVE
        width_px = sx(1)
        curves.append((points, color, width_px))
    return curves


def build_curves(panel: dict, x: int, y: int, width: int, height: int):
    return build_reference_curves(panel, x, y, width, height)


def text_center(draw: ImageDraw.ImageDraw, xy, text: str, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    text_x = xy[0] - width / 2
    text_y = xy[1] - height / 2
    draw.text((text_x, text_y), text, font=font, fill=fill)
    draw.text((text_x + sx(0.22), text_y), text, font=font, fill=fill)


def text_right(draw: ImageDraw.ImageDraw, xy, text: str, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    text_x = xy[0] - width
    text_y = xy[1] - height / 2
    draw.text((text_x, text_y), text, font=font, fill=fill)
    draw.text((text_x + sx(0.22), text_y), text, font=font, fill=fill)


def draw_axes(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int, panel: dict):
    draw.line([(sx(x), sx(y)), (sx(x), sx(y + height)), (sx(x + width), sx(y + height))], fill=AXIS, width=sx(1))

    x_labels = X_AXIS[panel["age_mode"]]
    x_step = width / max(1, len(x_labels) - 1)
    for index, label in enumerate(x_labels):
        tick_x = x + round(x_step * index)
        draw.line([(sx(tick_x), sx(y + height)), (sx(tick_x), sx(y + height - 6))], fill=TICK, width=sx(1))
        text_center(draw, (sx(tick_x), sx(y + height + 16)), label, LABEL_FONT, LABEL)

    y_labels = get_y_labels(panel)
    y_step = height / max(1, len(y_labels) - 1)
    for index, label in enumerate(y_labels):
        tick_y = y + round(y_step * index)
        draw.line([(sx(x), sx(tick_y)), (sx(x + 6), sx(tick_y))], fill=TICK, width=sx(1))
        text_right(draw, (sx(x - 6), sx(tick_y)), label, LABEL_FONT, LABEL)


def draw_percentiles(draw: ImageDraw.ImageDraw, panel: dict, x: int, y: int, width: int, height: int):
    labels = get_percentile_labels(panel)
    top = y + 14
    step = max(14, min(18, (height - 24) // max(1, len(labels) - 1)))
    for index, label in enumerate(labels):
        text_x = sx(x + width + 8)
        text_y = sx(top + index * step - 4)
        draw.text((text_x, text_y), label, font=PERCENTILE_FONT, fill=PERCENTILE)
        draw.text((text_x + sx(0.22), text_y), label, font=PERCENTILE_FONT, fill=PERCENTILE)


def render_chart(chart: dict) -> Image.Image:
    image = Image.new("RGB", (sx(CANVAS_WIDTH), sx(TOTAL_HEIGHT)), BG)
    draw = ImageDraw.Draw(image)

    panel_count = len(chart["panels"])
    total_panel_width = panel_count * PANEL_WIDTH + (panel_count - 1) * PANEL_GAP
    start_x = (CANVAS_WIDTH - total_panel_width) // 2

    for index, panel in enumerate(chart["panels"]):
        x = start_x + index * (PANEL_WIDTH + PANEL_GAP)
        draw_axes(draw, x, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, panel)
        for points, color, width_px in build_curves(panel, x, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT):
          draw.line(points, fill=color, width=width_px, joint="curve")
        draw_percentiles(draw, panel, x, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT)

    return image


def main() -> None:
    output_dir = Path("emr/kid/assets/iap-official-png")
    output_dir.mkdir(parents=True, exist_ok=True)

    for chart in CHARTS:
        output_name = chart["filename"].replace(".svg", ".png")
        output_path = output_dir / output_name
        render_chart(chart).save(output_path, format="PNG", optimize=True)
        print(f"Saved {output_path}")


if __name__ == "__main__":
    main()
