from __future__ import annotations

from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

import fitz
from PIL import Image, ImageOps


CHARTS = {
    "boys-height-0-5-who.png": {
        "url": "https://www.who.int/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/cht-lhfa-boys-p-0-5.pdf",
        "crop": (175, 240, 1515, 1070),
    },
    "girls-height-0-5-who.png": {
        "url": "https://www.who.int/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/cht-lhfa-girls-p-0-5.pdf",
        "crop": (175, 240, 1515, 1070),
    },
    "boys-weight-0-5-who.png": {
        "url": "https://www.who.int/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/cht-wfa-boys-p-0-5.pdf",
        "crop": (175, 240, 1515, 1070),
    },
    "girls-weight-0-5-who.png": {
        "url": "https://www.who.int/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/cht-wfa-girls-p-0-5.pdf",
        "crop": (175, 240, 1515, 1070),
    },
    "boys-bmi-0-5-who.png": {
        "url": "https://www.who.int/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/cht-bfa-boys-p-0-5.pdf",
        "crop": (175, 240, 1515, 1070),
    },
    "girls-bmi-0-5-who.png": {
        "url": "https://www.who.int/docs/default-source/child-growth/child-growth-standards/indicators/body-mass-index-for-age/cht-bfa-girls-p-0-5.pdf",
        "crop": (175, 240, 1515, 1070),
    },
    "boys-ofc-0-5-who.png": {
        "url": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/head-circumference-for-age/cht_hcfa_boys_p_0_5.pdf?sfvrsn=1761a85f_7",
        "crop": (165, 211, 1430, 1010),
    },
    "girls-ofc-0-5-who.png": {
        "url": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/head-circumference-for-age/cht_hcfa_girls_p_0_5.pdf?sfvrsn=35ae3892_7",
        "crop": (165, 211, 1430, 1010),
    },
}


def download_pdf(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=45) as response:
        return response.read()


def render_first_page(pdf_bytes: bytes) -> Image.Image:
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    pixmap = document[0].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    return Image.open(BytesIO(pixmap.tobytes("png"))).convert("RGB")


def remove_brand_fill(image: Image.Image) -> Image.Image:
    pixels = image.load()
    for y in range(image.height):
      for x in range(image.width):
        red, green, blue = pixels[x, y]
        if blue > 120 and green > 80 and red < 120:
          pixels[x, y] = (255, 255, 255)
        elif red > 170 and blue > 120 and green < 120:
          pixels[x, y] = (255, 255, 255)
    return image


def convert_to_bw(image: Image.Image) -> Image.Image:
    no_fill = remove_brand_fill(image.copy())
    grayscale = ImageOps.grayscale(no_fill)
    grayscale = ImageOps.autocontrast(grayscale)
    return grayscale


def main() -> None:
    output_dir = Path("emr/kid/assets/who-official-png")
    output_dir.mkdir(parents=True, exist_ok=True)

    for filename, chart in CHARTS.items():
        rendered = render_first_page(download_pdf(chart["url"]))
        cropped = rendered.crop(chart["crop"])
        output_path = output_dir / filename
        convert_to_bw(cropped).save(output_path, format="PNG", optimize=True)
        print(f"Saved {output_path}")


if __name__ == "__main__":
    main()
