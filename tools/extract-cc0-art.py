#!/usr/bin/env python3
"""
Bake the CC0 source art (see src/assets/cc0/) into the runtime data module
src/game/art-cc0-data.ts.

The renderer cannot decode PNGs synchronously at scene-create time (it bakes
textures up front and uses them on the first frame), so this one-off tool slices
/ recolours / composites the CC0 sources into final sprites and emits their raw
RGBA pixels as base64. textures.ts blits them into Phaser canvas textures under
the existing texture keys, so MainScene is untouched.

Requires Pillow.  Run:  python tools/extract-cc0-art.py [--preview]
"""
import os, sys, base64
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..")
CC0 = os.path.join(ROOT, "src", "assets", "cc0")

RL = Image.open(os.path.join(CC0, "roguelike", "roguelikeSheet_transparent.png")).convert("RGBA")
ANI = Image.open(os.path.join(CC0, "pixel-animals", "Animals.png")).convert("RGBA")
DOG = Image.open(os.path.join(CC0, "dog", "dog_sit.png")).convert("RGBA")

STRIDE, TILE = 17, 16

def rl(c, r):
    return RL.crop((c * STRIDE, r * STRIDE, c * STRIDE + TILE, r * STRIDE + TILE))

def scaled(src, w, h):
    return src.resize((w, h), Image.NEAREST)

def blend(img, hexcol, t):
    """Lerp every opaque pixel toward hexcol by t, preserving the source shading."""
    tr, tg, tb = (hexcol >> 16) & 255, (hexcol >> 8) & 255, hexcol & 255
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (round(r * (1 - t) + tr * t),
                        round(g * (1 - t) + tg * t),
                        round(b * (1 - t) + tb * t), a)
    return out

def paste(dst, src, x, y, w=None, h=None):
    if w is not None:
        src = scaled(src, w, h)
    dst.alpha_composite(src, (x, y))

def colorkey(img, rgb, tol=24):
    """Make pixels close to rgb fully transparent (some packs use a flat bg)."""
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and abs(r - rgb[0]) <= tol and abs(g - rgb[1]) <= tol and abs(b - rgb[2]) <= tol:
                px[x, y] = (0, 0, 0, 0)
    return out

def tight(img):
    bb = img.getbbox()
    return img.crop(bb) if bb else img

# ── biome themes (mirror BIOME_THEME in textures.ts) ──────────────────────────
THEME = {
    "tundra":    {"grass": 0x9fb6a8, "dirt": 0xb9a98f},
    "forest":    {"grass": 0x5f9a4f, "dirt": 0x7d5a38},
    "river":     {"grass": 0x6fae55, "dirt": 0xa98a5a},
    "grassland": {"grass": 0x9fbf5e, "dirt": 0xc2a06a},
    "desert":    {"grass": 0xd9c27e, "dirt": 0xd2b06a},
    "coast":     {"grass": 0x86c08f, "dirt": 0xccb98a},
}
# Real Kenney base tiles, tinted toward each biome for distinction.
GRASS_GREEN = rl(5, 0)   # lush green grass
GRASS_STONE = rl(7, 0)   # grey cobble (frozen tundra ground)
SAND = rl(8, 0)          # beige sand
DIRT = rl(6, 0)          # brown packed dirt
GRASS_BASE = {"tundra": GRASS_STONE, "desert": SAND}
GRASS_T = {"tundra": 0.30, "forest": 0.22, "river": 0.20,
           "grassland": 0.38, "desert": 0.18, "coast": 0.30}
DIRT_BASE = {"tundra": GRASS_STONE, "desert": SAND}
DIRT_T = {"tundra": 0.45, "forest": 0.25, "river": 0.22,
          "grassland": 0.28, "desert": 0.30, "coast": 0.25}

def build():
    art = {}

    # ── biome ground ──
    for b, th in THEME.items():
        art[f"grass-{b}"] = blend(GRASS_BASE.get(b, GRASS_GREEN), th["grass"], GRASS_T[b])
        art[f"dirt-{b}"] = blend(DIRT_BASE.get(b, DIRT), th["dirt"], DIRT_T[b])

    # farmland = packed soil; crop = soil with green sprouts
    farmland = blend(DIRT, 0x8a6038, 0.35)
    art["farmland"] = farmland
    crop = farmland.copy()
    sprout = rl(22, 11)  # small green plant
    for cx in (1, 8):
        paste(crop, sprout, cx, 2, 7, 12)
    art["crop"] = crop

    # ── decor ──
    art["tree"] = rl(13, 11)
    art["pine"] = rl(16, 11)
    art["bush"] = rl(26, 9)
    art["rock"] = rl(55, 20)
    art["food-berry"] = rl(56, 17)   # bowl of fruit
    art["food-meat"] = rl(54, 16)    # roast on a platter

    # ── animals ──
    art["cow"] = tight(ANI.crop((0, 0, 16, 16)))
    art["sheep"] = tight(ANI.crop((32, 0, 48, 16)))
    art["dog"] = tight(colorkey(DOG, (164, 117, 160)))

    # ── hearth / fire ──
    art["fire-0"] = rl(15, 8)   # brazier, tall flame
    art["fire-1"] = rl(14, 8)   # brazier, low flame

    # ── shelters (composited; kept at the original texture sizes) ──
    art["shelter-cave"] = shelter_cave()
    art["shelter-hut"] = shelter_tent(46, 32, ttop=(48, 10), tbody=(48, 11))
    art["shelter-village"] = shelter_village()
    art["shelter-town"] = shelter_town()
    art["shelter-city"] = shelter_city()
    return art

# tent occupies tiles (tc,tr)+(tc+1,tr) over (tc,tr+1)+(tc+1,tr+1)
def tent_img(tc, tr):
    t = Image.new("RGBA", (TILE * 2, TILE * 2), (0, 0, 0, 0))
    paste(t, rl(tc, tr), 0, 0)
    paste(t, rl(tc + 1, tr), TILE, 0)
    paste(t, rl(tc, tr + 1), 0, TILE)
    paste(t, rl(tc + 1, tr + 1), TILE, TILE)
    return t.crop(t.getbbox())

def shelter_tent(w, h, ttop, tbody):
    c = Image.new("RGBA", (44, 34), (0, 0, 0, 0))
    t = tent_img(ttop[0], ttop[1])
    tw = w
    th = round(t.height * tw / t.width)
    paste(c, t, (44 - tw) // 2, 34 - th, tw, th)
    return c

def shelter_cave():
    c = Image.new("RGBA", (44, 32), (0, 0, 0, 0))
    # grey rocky mound from cobble + boulders, with a dark cave mouth
    paste(c, scaled(GRASS_STONE, 44, 26), 0, 6)
    paste(c, rl(55, 20), 1, 14, 16, 16)
    paste(c, rl(56, 20), 27, 14, 16, 16)
    d = ImageDraw.Draw(c)
    d.ellipse((15, 14, 29, 32), fill=(20, 17, 22, 255))
    return c

def shelter_village():
    c = Image.new("RGBA", (56, 38), (0, 0, 0, 0))
    paste(c, tent_img(46, 10), 1, 8, 26, 28)    # green tent
    paste(c, tent_img(48, 10), 30, 4, 24, 26)   # tan tent
    paste(c, tent_img(46, 10), 20, 14, 20, 22)  # small green tent in front
    return c

# house: 2-tile-wide peaked-roof building from one wall-colour block
WALL = {"tan": 13, "gray": 20, "lgray": 27, "brown": 34}
def house(wt_wall_rows, base):
    """Return a 2-wide house image: peaked roof over wall rows with a door."""
    b = WALL[base]
    rows = 3 + wt_wall_rows  # 3 roof rows + wall rows
    img = Image.new("RGBA", (TILE * 2, TILE * rows), (0, 0, 0, 0))
    # roof
    paste(img, rl(b + 0, 21), 0, 0); paste(img, rl(b + 1, 21), TILE, 0)
    paste(img, rl(b + 0, 22), 0, TILE); paste(img, rl(b + 1, 22), TILE, TILE)
    paste(img, rl(b + 0, 23), 0, TILE * 2); paste(img, rl(b + 1, 23), TILE, TILE * 2)
    # walls
    for wr in range(wt_wall_rows):
        y = TILE * (3 + wr)
        paste(img, rl(b + 0, 15), 0, y); paste(img, rl(b + 1, 15), TILE, y)
    # door at bottom centre
    paste(img, rl(b + 3, 17), TILE // 2, TILE * (rows - 1))
    return img.crop(img.getbbox() or (0, 0, TILE * 2, TILE * rows))

def shelter_town():
    c = Image.new("RGBA", (64, 44), (0, 0, 0, 0))
    h1 = house(1, "tan"); h2 = house(1, "brown")
    s = 30
    paste(c, h1, 2, 44 - round(h1.height * s / h1.width), s, round(h1.height * s / h1.width))
    paste(c, h2, 34, 44 - round(h2.height * s / h2.width), s, round(h2.height * s / h2.width))
    return c

def shelter_city():
    c = Image.new("RGBA", (72, 52), (0, 0, 0, 0))
    specs = [("gray", 2, 2, 24), ("lgray", 2, 26, 22), ("tan", 1, 50, 20)]
    for base, wr, x, w in specs:
        h = house(wr, base)
        hh = round(h.height * w / h.width)
        paste(c, h, x, 52 - hh, w, hh)
    return c

# ── output ────────────────────────────────────────────────────────────────────
GROUPS = {
    "biome": [f"{k}-{b}" for b in THEME for k in ("grass", "dirt")] + ["farmland", "crop"],
    "decor": ["tree", "pine", "rock", "bush", "food-berry", "food-meat"],
    "animal": ["dog", "sheep", "cow"],
    "shelter": ["shelter-cave", "shelter-hut", "shelter-village", "shelter-town", "shelter-city"],
    "fire": ["fire-0", "fire-1"],
}

def preview(art):
    items = list(art.items())
    cell, pad, cols = 80, 16, 8
    rows = (len(items) + cols - 1) // cols
    out = Image.new("RGBA", (cols * (cell + pad) + pad, rows * (cell + pad) + pad), (38, 38, 46, 255))
    d = ImageDraw.Draw(out)
    for i, (k, im) in enumerate(items):
        s = min(cell / im.width, cell / im.height, 4)
        sw, sh = round(im.width * s), round(im.height * s)
        r, cc = divmod(i, cols)
        x = pad + cc * (cell + pad); y = pad + r * (cell + pad)
        out.alpha_composite(scaled(im, sw, sh), (x + (cell - sw) // 2, y + (cell - sh) // 2))
        d.text((x, y - 11), k, fill=(255, 230, 120, 255))
    p = os.path.join(os.path.dirname(__file__), "preview.png")
    out.convert("RGB").save(p); print("preview ->", p, out.size)

def emit(art):
    lines = [
        "// AUTO-GENERATED by tools/extract-cc0-art.py — do not edit by hand.",
        "// Raw RGBA pixels of the CC0 source art (see src/assets/cc0/CREDITS.md),",
        "// baked into Phaser textures by textures.ts under the existing texture keys.",
        "",
        "export interface Cc0Sprite { w: number; h: number; data: string; }",
        "",
        "export const CC0_ART: Record<string, Cc0Sprite> = {",
    ]
    for k, im in art.items():
        b64 = base64.b64encode(im.tobytes()).decode("ascii")
        lines.append(f'  {js_key(k)}: {{ w: {im.width}, h: {im.height}, data: "{b64}" }},')
    lines.append("};")
    lines.append("")
    lines.append("export const CC0_GROUPS = {")
    for g, keys in GROUPS.items():
        arr = ", ".join('"' + k + '"' for k in keys)
        lines.append(f"  {g}: [{arr}] as const,")
    lines.append("};")
    lines.append("")
    p = os.path.join(ROOT, "src", "game", "art-cc0-data.ts")
    with open(p, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("emitted ->", p)

def js_key(k):
    return k if k.replace("-", "").replace("_", "").isalnum() and "-" not in k else f'"{k}"'

if __name__ == "__main__":
    art = build()
    preview(art)
    if "--emit" in sys.argv:
        emit(art)
