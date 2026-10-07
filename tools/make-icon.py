"""Build build/icon.ico from build/icon-source.png (owner's artwork).

The app, the installer, the uninstaller and the taskbar all read that one .ico
(electron-builder.yml). Every frame is RESAMPLED FROM THE FULL-SIZE ARTWORK with
LANCZOS rather than from the frame above it, so the 16px one - the size Explorer
and the taskbar spend all day drawing - is as sharp as the source allows instead
of a copy of a copy.

THE ICON IS A BADGE WITH A FAINT EDGE (owner, 2026-10-07: "give it a outer
border just like wind has since i have a black taskbar so we need a faint
border"). The artwork is drawn on black, which on a black taskbar has no edge at
all, so each frame is the artwork on a rounded black square (Wind's geometry:
8..248 of 256, corner 56) with a #202020 outline, Wind's colour, drawn at
exactly ONE PHYSICAL PIXEL in every frame: the thinnest line that never
vanishes, and never a smear from scaling a thicker one down.

Run: python tools/make-icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'build' / 'icon-source.png'
OUT = ROOT / 'build' / 'icon.ico'
README = ROOT / 'assets' / 'prism-terminal-icon.png'

# What Windows asks for between 100% and 300% scaling (small 16, taskbar 24,
# large 32, each times the scale), so the shell never resamples a neighbour.
SIZES = [16, 20, 24, 28, 30, 32, 36, 40, 42, 48, 54, 56, 60, 64, 72, 80, 96, 128, 256]
EDGE = (0x20, 0x20, 0x20, 255)
SS = 8  # supersampling: the badge is drawn 8x and brought down once


def badge(art: Image.Image, n: int) -> Image.Image:
    big = n * SS
    # The edge is snapped to whole pixels of the FRAME, so its one pixel lands
    # on one pixel instead of two half-lit ones.
    inset = round(8 * n / 256) * SS
    radius = 56 * big / 256
    box = (inset, inset, big - inset - 1, big - inset - 1)
    # The artwork fills the badge, cut to its rounded square.
    side = box[2] - box[0] + 1
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    layer = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    layer.paste(art.resize((side, side), Image.LANCZOS), box[:2])
    out = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    out.paste(layer, (0, 0), mask)
    # One physical pixel of edge, inside the badge.
    ImageDraw.Draw(out).rounded_rectangle(box, radius=radius, outline=EDGE, width=SS)
    return out.resize((n, n), Image.LANCZOS)


def main() -> None:
    art = Image.open(SOURCE).convert('RGBA')
    if art.width != art.height:
        raise SystemExit(f'the source must be square, not {art.width}x{art.height}')
    frames = {n: badge(art, n) for n in SIZES}
    frames[256].save(OUT, format='ICO', sizes=[(n, n) for n in SIZES], append_images=[frames[n] for n in SIZES[:-1]])
    frames[256].save(README)
    print(f'{OUT.relative_to(ROOT)}: {len(SIZES)} frames, {OUT.stat().st_size} bytes')


if __name__ == '__main__':
    main()
