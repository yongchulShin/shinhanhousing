"""Convert user-provided PNG/JPG images to optimized WebP with semantic names."""
import sys, json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path("D:/repository/shinhan")
OUT  = ROOT / "images"
OUT.mkdir(parents=True, exist_ok=True)

# Mapping: source file -> (semantic name, max width, quality)
MAP = [
    ("Ultra-realistic_luxury_European_wrought_iron_gate_-1776444844672.png",
        "gate-wrought-iron-luxury", 1600, 82),
    ("Ultra-realistic_European_garden_entrance_elegant_-1776446174480.png",
        "gate-garden-entrance-elegant", 1600, 82),
    ("Gemini_Generated_Image_w3c4l7w3c4l7w3c4.png",
        "forged-detail-classic", 1600, 82),
    ("v2_watermarked-6282b619-f147-4830-ac05-1b2872679796.jpg",
        "iron-scroll-detail", 1600, 82),
]

report = []
for src_name, out_name, max_w, q in MAP:
    src = ROOT / src_name
    if not src.exists():
        print(f"skip missing: {src_name}")
        continue
    img = Image.open(src)
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    w, h = img.size
    if w > max_w:
        new_h = int(round(h * max_w / w))
        img = img.resize((max_w, new_h), Image.LANCZOS)
    # Also produce a 1200-wide and 800-wide variant for responsive
    for label, target in [("lg", 1600), ("md", 1200), ("sm", 800)]:
        cw, ch = img.size
        if cw > target:
            nh = int(round(ch * target / cw))
            v = img.resize((target, nh), Image.LANCZOS)
        else:
            v = img
        out = OUT / f"{out_name}-{label}.webp"
        v.save(out, "WEBP", quality=q, method=6)
        report.append({
            "src": src_name, "out": out.name,
            "dim": v.size, "kb": round(out.stat().st_size / 1024, 1)
        })

print(json.dumps(report, indent=2, ensure_ascii=False))
