import Phaser from "phaser";
import { SKIN, HAIR } from "./palette.js";
import type { Biome, Lineage } from "../sim/index.js";

/**
 * All art is generated programmatically (no external assets) so the slice runs
 * with `npm install` alone. Each draw routine paints into an offscreen Graphics
 * and bakes a texture; the scene only ever references texture keys, so a real
 * CC0/Kenney spritesheet can be swapped in later without touching the scene.
 */

type G = Phaser.GameObjects.Graphics;

function px(g: G, color: number, x: number, y: number, w = 1, h = 1, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(x, y, w, h);
}

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

const darken = (c: number, amt: number) => Phaser.Display.Color.IntegerToColor(c).darken(amt).color;
const lighten = (c: number, amt: number) => Phaser.Display.Color.IntegerToColor(c).lighten(amt).color;

export const TILE = 16;

// ── biome ground ─────────────────────────────────────────────────────────────

interface BiomeTheme {
  grass: number;
  grassDark: number;
  grassAlt: number;
  dirt: number;
  dirtDark: number;
}
const BIOME_THEME: Record<Biome, BiomeTheme> = {
  tundra: { grass: 0x9fb6a8, grassDark: 0x83a08f, grassAlt: 0xc3d4cb, dirt: 0xb9a98f, dirtDark: 0x9d8d74 },
  forest: { grass: 0x5f9a4f, grassDark: 0x457a39, grassAlt: 0x74b35f, dirt: 0x7d5a38, dirtDark: 0x644624 },
  river: { grass: 0x6fae55, grassDark: 0x4f8c3f, grassAlt: 0x86c267, dirt: 0xa98a5a, dirtDark: 0x8c7148 },
  grassland: { grass: 0x9fbf5e, grassDark: 0x82a345, grassAlt: 0xbcd277, dirt: 0xc2a06a, dirtDark: 0xa5824f },
  desert: { grass: 0xd9c27e, grassDark: 0xc2a85f, grassAlt: 0xeedda0, dirt: 0xd2b06a, dirtDark: 0xba9450 },
  coast: { grass: 0x86c08f, grassDark: 0x66a070, grassAlt: 0xa7d6ad, dirt: 0xccb98a, dirtDark: 0xae9c6c },
};

const speckleSpots = [
  [2, 3], [9, 2], [5, 7], [12, 9], [3, 11], [8, 13], [13, 5], [6, 1],
];

export function makeBiomeTextures(scene: Phaser.Scene): void {
  for (const biome of Object.keys(BIOME_THEME) as Biome[]) {
    const t = BIOME_THEME[biome];
    bake(scene, `grass-${biome}`, TILE, TILE, (g) => {
      px(g, t.grass, 0, 0, TILE, TILE);
      speckleSpots.forEach(([x, y], i) => px(g, i % 2 ? t.grassDark : t.grassAlt, x, y, 2, 1));
    });
    bake(scene, `dirt-${biome}`, TILE, TILE, (g) => {
      px(g, t.dirt, 0, 0, TILE, TILE);
      speckleSpots.forEach(([x, y], i) => px(g, i % 2 ? t.dirtDark : t.dirt, x, y, 2, 1));
    });
  }
  // farmland + crop for the agricultural eras
  bake(scene, "farmland", TILE, TILE, (g) => {
    px(g, 0x8a6038, 0, 0, TILE, TILE);
    for (let r = 2; r < TILE; r += 4) px(g, 0x6f4a2a, 0, r, TILE, 2);
  });
  bake(scene, "crop", TILE, TILE, (g) => {
    px(g, 0x8a6038, 0, 0, TILE, TILE);
    for (let r = 2; r < TILE; r += 4) px(g, 0x6f4a2a, 0, r, TILE, 2);
    for (let c = 2; c < TILE; c += 4) {
      px(g, 0x4f8f3a, c, 4, 1, 8);
      px(g, 0xd9c24b, c - 1, 3, 3, 2);
    }
  });
}

// ── decor & resources ─────────────────────────────────────────────────────────

export function makeDecorTextures(scene: Phaser.Scene): void {
  bake(scene, "tree", 18, 22, (g) => {
    px(g, 0x6e472d, 8, 15, 3, 7);
    px(g, 0x8a5a3b, 8, 15, 1, 7);
    px(g, 0x3c7038, 3, 3, 12, 11);
    px(g, 0x4f8f4a, 4, 2, 10, 9);
    px(g, 0x66a85e, 5, 3, 6, 4);
  });
  bake(scene, "pine", 16, 24, (g) => {
    px(g, 0x5a3b25, 7, 18, 2, 6);
    px(g, 0x2f5d35, 3, 3, 10, 6);
    px(g, 0x356a3c, 2, 8, 12, 6);
    px(g, 0x2f5d35, 1, 13, 14, 5);
  });
  bake(scene, "rock", 14, 11, (g) => {
    px(g, 0x6f6b66, 1, 4, 12, 7);
    px(g, 0x9a958f, 2, 3, 9, 6);
    px(g, 0xb6b1aa, 3, 4, 4, 2);
  });
  bake(scene, "bush", 16, 13, (g) => {
    px(g, 0x3c7038, 1, 4, 14, 9);
    px(g, 0x4f8f4a, 2, 3, 12, 8);
    [[4, 6], [9, 5], [6, 9], [11, 8]].forEach(([x, y]) => px(g, 0xc0334d, x, y, 2, 2));
  });
  bake(scene, "food-berry", 12, 10, (g) => {
    px(g, 0x6b4a2e, 1, 6, 10, 4);
    [[2, 4], [5, 3], [8, 5], [4, 6], [7, 6]].forEach(([x, y]) => px(g, 0xc0334d, x, y, 2, 2));
  });
  bake(scene, "food-meat", 12, 10, (g) => {
    px(g, 0x6b4a2e, 1, 6, 10, 4);
    px(g, 0xc46a5a, 2, 3, 8, 4);
    px(g, 0xd98a7a, 3, 4, 4, 1);
  });
}

// ── animals ──────────────────────────────────────────────────────────────────

export function makeAnimalTextures(scene: Phaser.Scene): void {
  bake(scene, "dog", 14, 10, (g) => {
    px(g, 0x7a5232, 2, 4, 8, 4); // body
    px(g, 0x7a5232, 9, 3, 3, 3); // head
    px(g, 0x5a3a22, 1, 7, 2, 3); // legs
    px(g, 0x5a3a22, 7, 7, 2, 3);
    px(g, 0x5a3a22, 0, 4, 2, 1); // tail
    px(g, 0x2a1a10, 10, 4, 1, 1); // eye
  });
  bake(scene, "sheep", 14, 11, (g) => {
    px(g, 0xeae4da, 2, 3, 9, 5); // wool
    px(g, 0xf6f2ea, 3, 2, 7, 3);
    px(g, 0x4a4036, 10, 4, 3, 3); // head
    px(g, 0x4a4036, 3, 8, 2, 3); // legs
    px(g, 0x4a4036, 8, 8, 2, 3);
  });
  bake(scene, "cow", 16, 12, (g) => {
    px(g, 0x6b4a32, 2, 3, 10, 6);
    px(g, 0xe8e0d4, 4, 4, 3, 3); // patch
    px(g, 0x4a3322, 11, 3, 4, 4); // head
    px(g, 0x3a2818, 3, 9, 2, 3);
    px(g, 0x3a2818, 9, 9, 2, 3);
  });
}

// ── shelters (cave → hut → village → town → city) ─────────────────────────────

export function makeShelterTextures(scene: Phaser.Scene): void {
  bake(scene, "shelter-cave", 44, 32, (g) => {
    px(g, 0x6f6b66, 2, 6, 40, 26);
    px(g, 0x9a958f, 4, 8, 36, 22);
    px(g, 0x231f1c, 15, 14, 14, 16);
    px(g, 0x3a3531, 16, 13, 12, 3);
    px(g, 0xb6b1aa, 6, 9, 9, 3);
  });
  bake(scene, "shelter-hut", 44, 34, (g) => {
    px(g, 0x6e472d, 6, 16, 32, 16);
    px(g, 0x8a5a3b, 8, 18, 28, 13);
    px(g, 0xc9a24b, 3, 6, 38, 12);
    px(g, 0xb38c3a, 3, 14, 38, 3);
    px(g, 0xd9b65e, 6, 7, 32, 4);
    px(g, 0x2c2018, 19, 22, 8, 10);
    px(g, 0xffd166, 30, 22, 3, 3);
  });
  bake(scene, "shelter-village", 56, 38, (g) => {
    // a cluster of huts
    const hut = (ox: number, oy: number, s: number) => {
      px(g, 0x8a5a3b, ox, oy + 8, 16 * s, 12);
      px(g, 0xc9a24b, ox - 1, oy, 18 * s, 9);
      px(g, 0xb38c3a, ox - 1, oy + 7, 18 * s, 2);
      px(g, 0x2c2018, ox + 6, oy + 12, 5, 8);
    };
    hut(6, 14, 1);
    hut(30, 10, 1.1);
    hut(20, 20, 0.9);
    px(g, 0x7a5a3a, 0, 34, 56, 4); // packed-earth ground
  });
  bake(scene, "shelter-town", 64, 44, (g) => {
    px(g, 0x8d8a85, 4, 18, 56, 26); // stone block
    px(g, 0xa7a39d, 6, 20, 52, 8);
    // peaked tiled roofs
    px(g, 0xa6503c, 2, 10, 30, 10);
    px(g, 0xa6503c, 34, 6, 28, 14);
    px(g, 0x7e3c2c, 2, 18, 60, 2);
    // doors & windows
    px(g, 0x3a2a1c, 10, 30, 8, 14);
    px(g, 0x3a2a1c, 26, 32, 7, 12);
    px(g, 0x6fa9c9, 44, 28, 6, 6);
    px(g, 0x6fa9c9, 52, 28, 6, 6);
  });
  bake(scene, "shelter-city", 72, 52, (g) => {
    // skyline of towers
    px(g, 0x6d7a86, 4, 20, 64, 32);
    const tower = (ox: number, w: number, top: number, col: number) => {
      px(g, col, ox, top, w, 52 - top);
      for (let yy = top + 3; yy < 50; yy += 5)
        for (let xx = ox + 1; xx < ox + w - 1; xx += 4) px(g, 0xffe08a, xx, yy, 2, 2);
    };
    tower(6, 14, 8, 0x5b6772);
    tower(26, 16, 2, 0x77838f);
    tower(48, 18, 6, 0x4f5a64);
    px(g, 0x3a444d, 4, 48, 64, 4);
  });
}

// ── hearth / fire ──────────────────────────────────────────────────────────────

export function makeFireTextures(scene: Phaser.Scene): void {
  const draw = (tall: boolean) => (g: G) => {
    [[2, 12], [6, 13], [10, 13], [13, 12]].forEach(([x, y]) => px(g, 0x9a958f, x, y, 3, 3));
    px(g, 0x6e472d, 4, 12, 8, 2);
    const top = tall ? 2 : 4;
    px(g, 0xd64933, 6, 11, 4, 3);
    px(g, 0xff8b3d, 6, top + 2, 4, 7);
    px(g, 0xffd166, 7, top + 3, 2, tall ? 5 : 4);
  };
  bake(scene, "fire-0", 16, 16, draw(true));
  bake(scene, "fire-1", 16, 16, draw(false));
}

// ── hominin morph (era + genome aware) ────────────────────────────────────────

export interface MorphParams {
  /** 0..5 over the era ladder; drives clothing, tools and posture. */
  eraIdx: number;
  /** 0 = archaic (heavy brow, stooped), 1 = modern (upright, high forehead). */
  modernity: number;
  bulk: number;
  fur: number;
  skin: number;
  hair: number;
  lineage?: Lineage;
}

/**
 * Per-era costume. One entry per era (Paleolithic … Information); the tribe
 * visibly "dresses up" and re-equips as history advances.
 */
interface EraStyle {
  garment: number;
  /** how the torso is clothed */
  cut: "hide" | "wrap" | "tunic" | "robe" | "doublet" | "coat" | "shirt";
  trousers: boolean;
  hat?: number;
  tool: "spear" | "stick" | "sickle" | "sword" | "scroll" | "hammer" | "wrench" | "case" | "device" | "none";
}
const ERA_STYLE: EraStyle[] = [
  { garment: 0x8a6a48, cut: "hide", trousers: false, tool: "spear" }, // Paleolithic
  { garment: 0x9c7a4a, cut: "wrap", trousers: false, tool: "stick" }, // Neolithic
  { garment: 0xb08a4a, cut: "tunic", trousers: false, tool: "sickle" }, // Bronze
  { garment: 0x9a5a3a, cut: "tunic", trousers: true, tool: "sword" }, // Iron
  { garment: 0xe6e0cf, cut: "robe", trousers: false, tool: "scroll" }, // Classical
  { garment: 0x6d2f3a, cut: "doublet", trousers: true, tool: "sword" }, // Medieval
  { garment: 0x394150, cut: "coat", trousers: true, hat: 0x20242c, tool: "hammer" }, // Industrial
  { garment: 0x2f5fa0, cut: "shirt", trousers: true, tool: "wrench" }, // Modern
  { garment: 0x2f8f87, cut: "shirt", trousers: true, tool: "device" }, // Information
];

export function morphKey(p: MorphParams): string {
  const b = (v: number) => Math.round(v * 4);
  return `hom_${p.eraIdx}_${b(p.modernity)}_${b(p.bulk)}_${b(p.fur)}_${p.skin}_${p.hair}_${p.lineage ?? "x"}`;
}

const HOM_W = 18;
const HOM_H = 26;

export function ensureHomininTexture(scene: Phaser.Scene, p: MorphParams): string {
  const key = morphKey(p);
  bake(scene, key, HOM_W, HOM_H, (g) => {
    let skin: number = SKIN[p.skin % SKIN.length];
    if (p.lineage === "neanderthal") skin = lighten(skin, 8);
    if (p.lineage === "denisovan") skin = darken(skin, 8);
    const hair = HAIR[p.hair % HAIR.length];
    const skinShade = darken(skin, 16);
    const style = ERA_STYLE[Math.max(0, Math.min(ERA_STYLE.length - 1, p.eraIdx))];
    const garment = style.garment;
    const gLight = lighten(garment, 14);
    const gDark = darken(garment, 14);

    const stoop = 1 - p.modernity; // archaic forms hunch forward
    const cx = 9;
    const headW = 6;
    const headH = 6;
    const headY = 3 + Math.round(stoop * 2);
    const headX = cx - 3 + Math.round(stoop * 2);
    const torsoW = 6 + Math.round(p.bulk * 3);
    const torsoX = cx - Math.floor(torsoW / 2);
    const torsoY = headY + headH;
    const torsoH = 9;
    const legY = torsoY + torsoH;
    const legLen = 6;

    // ── legs ──
    const legCol = style.trousers ? gDark : skinShade;
    px(g, legCol, torsoX + 1, legY, 2, legLen);
    px(g, legCol, torsoX + torsoW - 3, legY, 2, legLen);
    px(g, 0x2c2018, torsoX, legY + legLen - 1, 3, 1); // feet/shoes
    px(g, 0x2c2018, torsoX + torsoW - 3, legY + legLen - 1, 3, 1);

    // ── torso skin base, then clothing ──
    px(g, skin, torsoX, torsoY, torsoW, torsoH);
    const dressTop = torsoY + (style.cut === "hide" ? 2 : 0);
    const dressH =
      style.cut === "hide" ? Math.round(3 + p.fur * 3)
      : style.cut === "robe" ? torsoH + 2
      : torsoH;
    if (!(style.cut === "hide" && p.fur < 0.3)) {
      px(g, garment, torsoX, dressTop, torsoW, dressH);
      px(g, gLight, torsoX, dressTop, torsoW, 1); // top highlight
      px(g, gDark, torsoX, dressTop + dressH - 1, torsoW, 1); // hem shadow
      if (style.cut === "robe") px(g, garment, torsoX + 1, legY, torsoW - 2, 3); // skirt of robe
      if (style.cut === "coat") px(g, gDark, cx, dressTop, 1, dressH); // coat seam
      if (style.cut === "shirt") px(g, gLight, cx - 1, dressTop + 1, 1, 2); // collar
    }

    // ── arms ──
    const sleeve = style.cut === "hide" ? skin : garment;
    px(g, sleeve, torsoX - 1, torsoY + 1, 1, torsoH - 2);
    px(g, sleeve, torsoX + torsoW, torsoY + 1, 1, torsoH - 2);
    px(g, skinShade, torsoX - 1, torsoY + torsoH - 1, 1, 1); // hands
    px(g, skinShade, torsoX + torsoW, torsoY + torsoH - 1, 1, 1);

    // ── neck + head ──
    px(g, skinShade, cx - 1, torsoY - 1, 2, 1);
    px(g, skin, headX, headY, headW, headH);
    px(g, skinShade, headX, headY, 1, headH); // face shade side
    // brow ridge for archaic forms; higher forehead for modern
    if ((1 - p.modernity) > 0.3) px(g, skinShade, headX + 1, headY + 2, headW - 1, 1);
    // eyes
    px(g, 0x14100c, headX + 2, headY + 3, 1, 1);
    px(g, 0x14100c, headX + 4, headY + 3, 1, 1);

    // ── hair / headwear ──
    if (style.hat !== undefined) {
      px(g, style.hat, headX - 1, headY - 2, headW + 2, 2); // brimmed hat
      px(g, style.hat, headX + 1, headY - 4, headW - 2, 2);
    } else {
      const hairTop = headY - (p.modernity > 0.5 ? 2 : 1);
      px(g, hair, headX, hairTop, headW, 2);
      px(g, hair, headX, headY, 1, 3); // side hair
      px(g, hair, headX + headW - 1, headY, 1, 2);
      if (p.eraIdx >= 4 && p.eraIdx <= 5) px(g, hair, headX, headY, headW, 1); // tidier
    }

    // ── held tool, advancing with the era ──
    const handY = torsoY + torsoH - 1;
    const tx = torsoX - 2;
    switch (style.tool) {
      case "spear": px(g, 0x6e472d, tx, headY, 1, handY - headY + 2); px(g, 0xcfd3d6, tx, headY, 1, 2); break;
      case "stick": px(g, 0x7d6a48, tx, torsoY, 1, handY - torsoY + 2); break;
      case "sickle": px(g, 0x7d6a48, tx, torsoY + 2, 1, 5); px(g, 0xcfd3d6, tx - 1, torsoY + 1, 2, 1); break;
      case "sword": px(g, 0xcfd3d6, tx, torsoY + 1, 1, 6); px(g, 0xb08a4a, tx - 1, torsoY + 6, 3, 1); break;
      case "scroll": px(g, 0xe8e0cf, tx, handY - 2, 2, 3); break;
      case "hammer": px(g, 0x6e472d, tx, torsoY + 2, 1, 5); px(g, 0x9a958f, tx - 1, torsoY + 1, 3, 2); break;
      case "wrench": px(g, 0xbfc6cc, tx, torsoY + 2, 1, 5); break;
      case "case": px(g, 0x3a2a1c, tx - 1, handY - 1, 3, 3); break;
      case "device": px(g, 0x202830, tx, handY - 2, 2, 3); px(g, 0x67d6ff, tx, handY - 2, 2, 1); break;
      default: break;
    }
  });
  return key;
}
