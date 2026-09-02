from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
files = sorted((ROOT / "public/cooking-steps/recipes").glob("r[0-9][0-9][0-9]/*.webp"))
font = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 16)
cols, rows, cell_w, cell_h = 6, 8, 260, 205
page_size = cols * rows

for page_index, start in enumerate(range(0, len(files), page_size), 1):
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(files[start:start + page_size]):
        x = (index % cols) * cell_w
        y = (index // cols) * cell_h
        image = Image.open(path).convert("RGB")
        image.thumbnail((cell_w, cell_h - 28))
        sheet.paste(image, (x, y + 28))
        draw.text((x + 4, y + 5), f"{path.parent.name}-{path.stem}", font=font, fill="black")
    sheet.save(f"/private/tmp/what-to-eat-all-{page_index:02d}.jpg", quality=88)

print(f"created {(len(files) + page_size - 1) // page_size} contact sheets for {len(files)} images")
