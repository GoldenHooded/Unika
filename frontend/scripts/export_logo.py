"""
Export the Unika logo as a static PNG with transparent background.
Recreates the same geometry as UnikaLogo.tsx:
  - 5 equilateral triangles centred at (50,50) in a 100×100 viewBox
  - Each triangle rotated by its startRot, with stroke+fill+glow
Output:
  frontend/public/unika-logo.svg   (static SVG, transparent, ~512px)
  frontend/public/unika-logo.png   (PNG 512×512, transparent background)
"""
from __future__ import annotations
import math
import os
import sys
from pathlib import Path

# ── Geometry ──────────────────────────────────────────────────────────────────

S60 = math.sin(math.pi / 3)   # ≈ 0.866

TRIANGLES = [
    dict(r=41, color='#60A5FA', strokeW=1.1, fillOp=0.10, startRot=  0),
    dict(r=33, color='#A78BFA', strokeW=1.5, fillOp=0.16, startRot= 22),
    dict(r=25, color='#22D3EE', strokeW=1.9, fillOp=0.20, startRot= 48),
    dict(r=37, color='#818CF8', strokeW=1.0, fillOp=0.09, startRot=-14),
    dict(r=18, color='#38BDF8', strokeW=2.3, fillOp=0.26, startRot= 68),
]


def hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))


def tri_points_rotated(r: float, rot_deg: float) -> list[tuple[float, float]]:
    """Equilateral triangle centred at (50,50), rotated by rot_deg degrees."""
    rad = math.radians(rot_deg)
    raw = [
        (50,            50 - r),
        (50 - r * S60,  50 + r * 0.5),
        (50 + r * S60,  50 + r * 0.5),
    ]
    result = []
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    for (x, y) in raw:
        dx, dy = x - 50, y - 50
        result.append((50 + dx * cos_a - dy * sin_a,
                       50 + dx * sin_a + dy * cos_a))
    return result


def points_attr(pts: list[tuple[float, float]]) -> str:
    return ' '.join(f'{x:.4f},{y:.4f}' for x, y in pts)


# ── SVG generation ───────────────────────────────────────────────────────────

def make_svg(view_size: int = 512) -> str:
    """Generate static SVG string (transparent background)."""
    # Build filter defs (one glow per triangle)
    defs = []
    for i, t in enumerate(TRIANGLES):
        r, g, b = hex_to_rgb(t['color'])
        # Outer glow: blur + colorize + merge with source
        defs.append(f"""
    <filter id="glow{i}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="0 0 0 0 {r:.4f}
                0 0 0 0 {g:.4f}
                0 0 0 0 {b:.4f}
                0 0 0 0.7 0" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>""")

    defs_block = '<defs>' + ''.join(defs) + '\n  </defs>'

    # Build polygon elements
    polygons = []
    for i, t in enumerate(TRIANGLES):
        pts = tri_points_rotated(t['r'], t['startRot'])
        polygons.append(
            f'  <polygon\n'
            f'    points="{points_attr(pts)}"\n'
            f'    fill="{t["color"]}" fill-opacity="{t["fillOp"]:.2f}"\n'
            f'    stroke="{t["color"]}" stroke-width="{t["strokeW"]}" stroke-opacity="0.9"\n'
            f'    stroke-linejoin="round"\n'
            f'    filter="url(#glow{i})"\n'
            f'  />'
        )

    polys_block = '\n'.join(polygons)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg"\n'
        f'     width="{view_size}" height="{view_size}" viewBox="0 0 100 100">\n'
        f'  {defs_block}\n'
        f'{polys_block}\n'
        f'</svg>\n'
    )


# ── PNG export ────────────────────────────────────────────────────────────────

def export_png(svg_content: str, out_path: Path, size: int = 512) -> bool:
    """Try to render SVG to PNG. Returns True on success."""
    # Method 1: cairosvg
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(
            bytestring=svg_content.encode('utf-8'),
            write_to=str(out_path),
            output_width=size,
            output_height=size,
            background_color='transparent',
        )
        print(f'[cairosvg] Written: {out_path}')
        return True
    except ImportError:
        pass
    except Exception as e:
        print(f'[cairosvg] Error: {e}', file=sys.stderr)

    # Method 2: Pillow with per-triangle glow layers
    try:
        from PIL import Image, ImageDraw, ImageFilter  # type: ignore

        SCALE = 4  # super-sample for anti-aliasing
        W = size * SCALE
        PAD_FRAC = 0.10  # 10% padding on each side

        def scale_pt(x, y):
            pad  = W * PAD_FRAC
            span = W * (1 - 2 * PAD_FRAC)
            return (pad + x / 100 * span, pad + y / 100 * span)

        # Accumulate layers: glow first, then solid fill+stroke
        composite = Image.new('RGBA', (W, W), (0, 0, 0, 0))

        for t in TRIANGLES:
            pts    = tri_points_rotated(t['r'], t['startRot'])
            scaled = [scale_pt(x, y) for x, y in pts]
            r2, g2, b2 = [int(c * 255) for c in hex_to_rgb(t['color'])]

            # ── Glow layer: draw filled shape, blur it, alpha-reduced ──────────
            glow_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
            gd = ImageDraw.Draw(glow_img, 'RGBA')
            gd.polygon(scaled, fill=(r2, g2, b2, 200))
            # Blur radius relative to canvas size
            blur_px = W * 0.018
            glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=blur_px))
            composite = Image.alpha_composite(composite, glow_img)

            # ── Fill layer ────────────────────────────────────────────────────
            fill_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
            fd = ImageDraw.Draw(fill_img, 'RGBA')
            fd.polygon(scaled, fill=(r2, g2, b2, int(t['fillOp'] * 255)))
            composite = Image.alpha_composite(composite, fill_img)

            # ── Stroke layer: draw outline via multiple shifted draws ──────────
            sw = max(1, int(t['strokeW'] * W / 100 * 1.8))
            stroke_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
            sd = ImageDraw.Draw(stroke_img, 'RGBA')
            # Thick outline approximation: draw line along each edge
            sc = (r2, g2, b2, int(0.92 * 255))
            for j in range(len(scaled)):
                x0, y0 = scaled[j]
                x1, y1 = scaled[(j + 1) % len(scaled)]
                sd.line([(x0, y0), (x1, y1)], fill=sc, width=sw)
            composite = Image.alpha_composite(composite, stroke_img)

        # Downscale for anti-aliasing
        final = composite.resize((size, size), Image.LANCZOS)
        final.save(str(out_path), 'PNG')
        print(f'[Pillow]    Written: {out_path}')
        return True
    except ImportError:
        pass
    except Exception as e:
        print(f'[Pillow]    Error: {e}', file=sys.stderr)

    print('[warn] No PNG renderer available (install cairosvg or Pillow). SVG only.', file=sys.stderr)
    return False


# ── App icon (with dark background) ──────────────────────────────────────────

APP_ICON_BG    = (22, 24, 36, 255)    # #161824 — same dark as the app
ICON_PAD_FRAC  = 0.14                  # 14% padding inside the icon circle


def render_logo_on_image(img, size: int, pad_frac: float = ICON_PAD_FRAC):
    """Draw the 5 triangles (glow+fill+stroke) onto an existing RGBA Image."""
    from PIL import Image, ImageDraw, ImageFilter  # type: ignore

    W = img.size[0]

    def scale_pt(x, y):
        pad  = W * pad_frac
        span = W * (1 - 2 * pad_frac)
        return (pad + x / 100 * span, pad + y / 100 * span)

    for t in TRIANGLES:
        pts    = tri_points_rotated(t['r'], t['startRot'])
        scaled = [scale_pt(x, y) for x, y in pts]
        r2, g2, b2 = [int(c * 255) for c in hex_to_rgb(t['color'])]

        glow_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow_img, 'RGBA')
        gd.polygon(scaled, fill=(r2, g2, b2, 200))
        glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=W * 0.018))
        img = Image.alpha_composite(img, glow_img)

        fill_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fill_img, 'RGBA')
        fd.polygon(scaled, fill=(r2, g2, b2, int(t['fillOp'] * 255)))
        img = Image.alpha_composite(img, fill_img)

        sw = max(1, int(t['strokeW'] * W / 100 * 1.8))
        stroke_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        sd = ImageDraw.Draw(stroke_img, 'RGBA')
        sc = (r2, g2, b2, int(0.92 * 255))
        for j in range(len(scaled)):
            x0, y0 = scaled[j]
            x1, y1 = scaled[(j + 1) % len(scaled)]
            sd.line([(x0, y0), (x1, y1)], fill=sc, width=sw)
        img = Image.alpha_composite(img, stroke_img)

    return img


def make_app_icon_png(size: int = 512) -> 'Image':
    """Create a square app icon: rounded-rect dark bg + logo centred."""
    from PIL import Image, ImageDraw  # type: ignore

    SCALE = 4
    W = size * SCALE

    # Dark background (fully opaque)
    base = Image.new('RGBA', (W, W), APP_ICON_BG)

    # Optional subtle rounded-rect mask (squircle-ish)
    mask = Image.new('L', (W, W), 0)
    md   = ImageDraw.Draw(mask)
    radius = int(W * 0.18)
    md.rounded_rectangle([(0, 0), (W - 1, W - 1)], radius=radius, fill=255)
    base.putalpha(mask)

    # Draw logo on top
    result = render_logo_on_image(base, W)

    return result.resize((size, size), Image.LANCZOS)


def export_app_icons(public_dir: 'Path') -> None:
    """Generate icon.png (512) and icon.ico (multi-size) for Electron."""
    try:
        from PIL import Image  # type: ignore

        icon_png_path = public_dir / 'icon.png'
        icon_ico_path = public_dir / 'icon.ico'

        print('Generating app icons...')
        img512 = make_app_icon_png(512)
        img512.save(str(icon_png_path), 'PNG')
        print(f'[icon.png]  Written: {icon_png_path}')

        # Multi-size ICO (Windows needs 16, 32, 48, 64, 128, 256)
        ico_sizes = [16, 32, 48, 64, 128, 256]
        ico_frames = [img512.resize((s, s), Image.LANCZOS) for s in ico_sizes]
        ico_frames[-1].save(
            str(icon_ico_path),
            format='ICO',
            sizes=[(s, s) for s in ico_sizes],
            append_images=ico_frames[:-1],
        )
        print(f'[icon.ico]  Written: {icon_ico_path}')
    except ImportError:
        print('[warn] Pillow not available — skipping app icon generation.', file=sys.stderr)
    except Exception as e:
        print(f'[error] App icon generation failed: {e}', file=sys.stderr)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    script_dir = Path(__file__).resolve().parent
    public_dir = script_dir.parent / 'public'
    public_dir.mkdir(parents=True, exist_ok=True)

    svg_path = public_dir / 'unika-logo.svg'
    png_path = public_dir / 'unika-logo.png'

    print('Generating Unika logo (transparent)...')
    svg_content = make_svg(view_size=512)

    # Save SVG
    svg_path.write_text(svg_content, encoding='utf-8')
    print(f'[SVG]       Written: {svg_path}')

    # Export transparent PNG
    export_png(svg_content, png_path, size=512)

    # Export app icons (dark background, for Electron/Windows)
    export_app_icons(public_dir)

    print('Done.')


if __name__ == '__main__':
    main()
