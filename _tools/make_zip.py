"""Package index.html + required asset directories into a single deploy zip."""
import os, zipfile
from pathlib import Path

ROOT = Path("D:/repository/shinhan")
OUT  = ROOT / "shinhan-housing.zip"

INCLUDE_FILES = [ROOT / "index.html"]
INCLUDE_DIRS  = [
    ROOT / "images",
    ROOT / "frames" / "hero",
    ROOT / "frames" / "secondary",
]
# Skip these by name in any directory
SKIP_NAMES = {"meta.json", ".DS_Store", "Thumbs.db"}

def iter_files():
    for f in INCLUDE_FILES:
        if f.exists() and f.is_file():
            yield f
    for d in INCLUDE_DIRS:
        if not d.exists():
            continue
        for path in d.rglob("*"):
            if path.is_file() and path.name not in SKIP_NAMES:
                yield path

def main():
    if OUT.exists():
        OUT.unlink()

    count = 0
    total_src = 0
    # WebP/JPEG/PNG/MP4 are already compressed — use ZIP_STORED for speed and minimal CPU
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for f in iter_files():
            arcname = f.relative_to(ROOT).as_posix()
            zf.write(f, arcname)
            count += 1
            total_src += f.stat().st_size

    zip_size = OUT.stat().st_size
    print(f"Created: {OUT}")
    print(f"Files:   {count}")
    print(f"Source:  {total_src/1024/1024:.2f} MB")
    print(f"Zip:     {zip_size/1024/1024:.2f} MB")

if __name__ == "__main__":
    main()
