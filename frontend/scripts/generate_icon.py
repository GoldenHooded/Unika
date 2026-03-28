"""
Generate Unika logo PNG (and ICO) using Pillow.
Renders the 5-triangle logo at 512×512 with alpha channel.

Usage:
  python scripts/generate_icon.py
Outputs:
  public/icon.png   — 512×512 RGBA
  public/icon.ico   — multi-size ICO (16, 32, 48, 64, 128, 256)
"""
from __future__ import annotations
import io, math, pathlib, struct, sys
from PIL import Image, ImageDraw, ImageFilter

# ── Palette (matches UnikaLogo.tsx) ──────────────────────────────────────────

def hex_to_rgba(h: str, alpha: int = 255) -> tuple[int,int,int,int]:
    h = h.lstrip('#')
    r, g, b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
    return (r, g, b, alpha)

TRIANGLES = [
    # (circumradius_frac, color_hex, stroke_alpha, fill_alpha, start_rot_deg)
    (1.00, '#60A5FA', 235, 50,   0 ),
    (0.80, '#A78BFA', 238, 70,  22 ),
    (0.60, '#22D3EE', 245, 95,  48 ),
    (0.90, '#818CF8', 232, 42, -14 ),
    (0.44, '#38BDF8', 252, 115, 68 ),
]

def tri_points(cx: float, cy: float, r: float, rot_deg: float) -> list[tuple[float,float]]:
    """Equilateral triangle vertices centred at (cx,cy), circumradius r, rotated rot_deg."""
    pts = []
    for k in range(3):
        angle = math.radians(rot_deg - 90 + k * 120)
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts

def draw_logo(size: int = 512) -> Image.Image:
    # Work at 4× for anti-aliasing, then downscale
    SCALE = 4
    W = size * SCALE
    CX = W // 2
    R_MAX = W * 0.36          # max circumradius in hi-res pixels (logo fills ~72% of bg)

    # --- Base layer: dark rounded background ---
    base = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    bg   = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    bg_d = ImageDraw.Draw(bg)
    radius = int(W * 0.22)    # corner radius
    bg_d.rounded_rectangle([0, 0, W-1, W-1], radius=radius, fill=(15, 18, 30, 255))
    base = Image.alpha_composite(base, bg)

    # Subtle radial gradient overlay for depth
    grad = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    for step in range(30, 0, -1):
        r2   = int(W * 0.50 * step / 30)
        alp  = int(18 * (1 - step / 30))
        gd   = ImageDraw.Draw(grad)
        gd.ellipse([CX-r2, CX-r2, CX+r2, CX+r2], fill=(60, 100, 200, alp))
    base = Image.alpha_composite(base, grad)

    # --- Glow layer: thick, blurred strokes ---
    glow_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)

    for r_frac, color, _, _, rot in TRIANGLES:
        r  = R_MAX * r_frac
        pts = tri_points(CX, CX, r, rot)
        cr, cg, cb, _ = hex_to_rgba(color)
        # Multiple concentric strokes for bloom
        for width, alpha in [(int(r*0.28), 35), (int(r*0.16), 55), (int(r*0.08), 80)]:
            glow_draw.polygon(pts, fill=None, outline=(cr, cg, cb, alpha))
            # Polygon outline workaround: draw lines for each edge
            for j in range(3):
                p1, p2 = pts[j], pts[(j+1)%3]
                glow_draw.line([p1, p2], fill=(cr, cg, cb, alpha), width=max(1, width))

    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=W * 0.032))
    base = Image.alpha_composite(base, glow_img)

    # --- Fill layer ---
    fill_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    fill_draw = ImageDraw.Draw(fill_img)

    for r_frac, color, _, fill_alpha, rot in TRIANGLES:
        r   = R_MAX * r_frac
        pts = tri_points(CX, CX, r, rot)
        cr, cg, cb, _ = hex_to_rgba(color)
        fill_draw.polygon(pts, fill=(cr, cg, cb, fill_alpha))

    base = Image.alpha_composite(base, fill_img)

    # --- Stroke layer ---
    stroke_img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    stroke_draw = ImageDraw.Draw(stroke_img)

    for r_frac, color, stroke_alpha, _, rot in TRIANGLES:
        r   = R_MAX * r_frac
        pts = tri_points(CX, CX, r, rot)
        cr, cg, cb, _ = hex_to_rgba(color)
        sw = max(3, int(W * 0.006))
        for j in range(3):
            p1, p2 = pts[j], pts[(j+1)%3]
            stroke_draw.line([p1, p2], fill=(cr, cg, cb, stroke_alpha), width=sw)

    base = Image.alpha_composite(base, stroke_img)

    # --- Small specular shimmer in centre ---
    shimmer = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shimmer)
    cr2 = int(W * 0.06)
    sd.ellipse(
        [CX - cr2, CX - cr2, CX + cr2, CX + cr2],
        fill=(255, 255, 255, 18),
    )
    shimmer = shimmer.filter(ImageFilter.GaussianBlur(radius=cr2 * 0.6))
    base = Image.alpha_composite(base, shimmer)

    # Downscale to target size (Lanczos = best quality)
    return base.resize((size, size), Image.LANCZOS)


def write_ico(path: pathlib.Path, sizes: list[int]) -> None:
    """
    Write a multi-size ICO file where every frame is stored as a PNG
    (ICONDIRENTRY with width=0 means 256; PNG data embedded verbatim).
    This is the 'Vista ICO' format supported by Windows Vista+ and all
    modern tools.  Pillow's own ICO saver only writes BMP frames and
    ignores the sizes list, so we build the binary ourselves.
    """
    frames: list[bytes] = []
    for sz in sizes:
        img = draw_logo(sz)
        buf = io.BytesIO()
        img.save(buf, 'PNG')
        frames.append(buf.getvalue())

    # ICO header: reserved(2) type(2) count(2)
    n = len(frames)
    header = struct.pack('<HHH', 0, 1, n)

    # Each ICONDIRENTRY is 16 bytes:
    #   width(1) height(1) colorCount(1) reserved(1)
    #   planes(2) bitCount(2) bytesInRes(4) imageOffset(4)
    # For PNG frames width/height are stored as 0 when size == 256
    dir_size   = n * 16
    data_offset = 6 + dir_size   # 6 = ICO header size

    entries = b''
    offset  = data_offset
    for sz, data in zip(sizes, frames):
        w = h = sz if sz < 256 else 0
        entries += struct.pack('<BBBBHHII',
            w, h,           # width, height (0 means 256)
            0,              # colorCount (0 = no palette)
            0,              # reserved
            1,              # planes
            32,             # bitCount
            len(data),      # bytesInRes
            offset,         # imageOffset
        )
        offset += len(data)

    with open(path, 'wb') as f:
        f.write(header)
        f.write(entries)
        for data in frames:
            f.write(data)


def main() -> None:
    out_dir = pathlib.Path(__file__).parent.parent / 'public'
    out_dir.mkdir(exist_ok=True)

    print(f'Rendering 512×512 logo…')
    img512 = draw_logo(512)

    png_path = out_dir / 'icon.png'
    img512.save(str(png_path), 'PNG')
    print(f'  OK  {png_path}  ({png_path.stat().st_size // 1024} KB)')

    # ICO: write manually as PNG-compressed multi-size ICO.
    # Pillow's ICO plugin is unreliable for multiple sizes; we build the
    # binary ourselves — modern Windows ICO stores each frame as raw PNG.
    ico_path = out_dir / 'icon.ico'
    sizes    = [16, 32, 48, 64, 128, 256]
    write_ico(ico_path, sizes)
    print(f'  OK  {ico_path}  ({ico_path.stat().st_size // 1024} KB)  [{", ".join(str(s) for s in sizes)}]')


if __name__ == '__main__':
    main()
