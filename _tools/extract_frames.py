"""
Extracts N frames from an MP4 evenly-spaced, saves each as optimized WebP.
Also prints metadata JSON so the HTML can know frame count / dims.
"""
import sys, os, json, io
from pathlib import Path
import cv2
from PIL import Image

def extract(video_path, out_dir, num_frames=90, max_width=1600, quality=78, crop_bottom_ratio=0.0):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open {video_path}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps   = cap.get(cv2.CAP_PROP_FPS)
    w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total / fps if fps else 0

    # Apply bottom crop to remove watermarks / letterbox bands
    crop_bottom_px = int(round(h * crop_bottom_ratio)) if crop_bottom_ratio else 0
    effective_h = h - crop_bottom_px

    # clamp requested frames to what video has
    n = min(num_frames, total)
    if n < 2: n = 2
    indices = [round(i * (total - 1) / (n - 1)) for i in range(n)]

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # target size (keep aspect ratio), based on cropped source
    target_w = min(w, max_width)
    target_h = int(round(effective_h * target_w / w))
    # make even
    target_w -= target_w % 2
    target_h -= target_h % 2

    saved = []
    total_bytes = 0
    for i, idx in enumerate(indices):
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok:
            continue
        # BGR -> RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        # Crop bottom before resize
        if crop_bottom_px > 0:
            rgb = rgb[:effective_h, :, :]
        img = Image.fromarray(rgb)
        if img.size != (target_w, target_h):
            img = img.resize((target_w, target_h), Image.LANCZOS)

        out_path = out_dir / f"{i:03d}.webp"
        img.save(out_path, "WEBP", quality=quality, method=6)
        total_bytes += out_path.stat().st_size
        saved.append(out_path.name)

    cap.release()

    meta = {
        "source": str(video_path),
        "frames": len(saved),
        "fps": round(fps, 2),
        "duration_sec": round(duration, 2),
        "src_width": w, "src_height": h,
        "crop_bottom_px": crop_bottom_px,
        "effective_src_height": effective_h,
        "out_width": target_w, "out_height": target_h,
        "quality": quality,
        "total_bytes": total_bytes,
        "avg_kb_per_frame": round(total_bytes / len(saved) / 1024, 1) if saved else 0,
        "files": saved[:5] + ["..."] + saved[-3:] if len(saved) > 8 else saved,
    }
    meta_path = out_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(meta, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    video = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("D:/repository/shinhan/랜딩페이지_히어로_영상_생성.mp4")
    out   = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("D:/repository/shinhan/frames/hero")
    num   = int(sys.argv[3]) if len(sys.argv) > 3 else 90
    crop  = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
    extract(video, out, num_frames=num, crop_bottom_ratio=crop)
