"""Build build/icon.ico from build/icon-source.png (owner's artwork, 2026-09-20).

The app, the installer, the uninstaller and the taskbar all read that one .ico
(electron-builder.yml). Every frame is RESAMPLED FROM THE FULL-SIZE ARTWORK with
LANCZOS rather than from the frame above it, so the 16px one - the size Explorer
and the taskbar spend all day drawing - is as sharp as the source allows instead
of a copy of a copy.

Run: python tools/make-icon.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'build' / 'icon-source.png'
OUT = ROOT / 'build' / 'icon.ico'

# What Windows asks for. 256 is the one File Explorer's extra-large view draws;
# 16 and 32 are the taskbar and the details list.
SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]


def main() -> None:
    src = Image.open(SOURCE).convert('RGBA')
    if src.width != src.height:
        raise SystemExit(f'the source must be square, not {src.width}x{src.height}')
    frames = [src.resize((n, n), Image.LANCZOS) for n in SIZES]
    # Pillow writes every frame given in `append_images`; the base image is the
    # largest so a reader that understands only one frame gets the good one.
    frames[-1].save(OUT, format='ICO', sizes=[(n, n) for n in SIZES])
    print(f'{OUT.relative_to(ROOT)}: {len(SIZES)} frames, {OUT.stat().st_size} bytes')


if __name__ == '__main__':
    main()
