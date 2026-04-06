#!/usr/bin/env python3
"""
DRAIS Relay Manager — Icon Generator
Generates drais-relay.png (256×256) for the app drawer and taskbar.
Run once during install: python3 generate_icon.py
"""

from pathlib import Path


def generate_icon(output_path: str, size: int = 256):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow not found. Run: pip install Pillow")
        return False

    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rect dark background (slate-900)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=size // 5,
                            fill=(15, 23, 42, 255))

    # Blue accent ring
    ring_px = size // 18
    margin = size // 8
    draw.ellipse(
        [(margin, margin), (size - margin, size - margin)],
        outline=(59, 130, 246, 255), width=ring_px,
    )

    # Inner circle (card color slate-800)
    inner_m = margin + ring_px + size // 18
    draw.ellipse(
        [(inner_m, inner_m), (size - inner_m, size - inner_m)],
        fill=(30, 41, 59, 255),
    )

    # "D" letter centered
    font_path_candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
        'C:/Windows/Fonts/arialbd.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]
    font = None
    for fp in font_path_candidates:
        try:
            font = ImageFont.truetype(fp, size * 38 // 100)
            break
        except Exception:
            pass

    letter = 'D'
    if font:
        bbox = draw.textbbox((0, 0), letter, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = (size - tw) // 2 - bbox[0]
        ty = (size - th) // 2 - bbox[1] - size // 20
        draw.text((tx, ty), letter, fill=(241, 245, 249, 255), font=font)

        # "RELAY" sub-text
        try:
            small_font = ImageFont.truetype(font_path_candidates[0], size // 13)
            sub = 'RELAY'
            sb = draw.textbbox((0, 0), sub, font=small_font)
            sx = (size - (sb[2] - sb[0])) // 2 - sb[0]
            sy = size * 72 // 100
            draw.text((sx, sy), sub, fill=(148, 163, 184, 200), font=small_font)
        except Exception:
            pass
    else:
        # Fallback: draw a simple "D" with basic font
        draw.text((size // 3, size // 4), 'D', fill=(241, 245, 249, 255))

    img.save(output_path)
    print(f'✓  Icon saved: {output_path}')
    return True


if __name__ == '__main__':
    out = Path(__file__).parent / 'drais-relay.png'
    success = generate_icon(str(out))
    if not success:
        # Create a minimal 64x64 fallback
        try:
            from PIL import Image
            img = Image.new('RGBA', (64, 64), (15, 23, 42, 255))
            img.save(str(out))
            print(f'✓  Minimal icon saved: {out}')
        except Exception:
            print('⚠  Could not generate icon (Pillow not installed)')
