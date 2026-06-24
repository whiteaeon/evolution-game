import Phaser from "phaser";
import { SKIN, HAIR } from "./palette.js";
import type { Lineage } from "../sim/index.js";
import { CC0_ART, CC0_GROUPS } from "./art-cc0-data.js";

/**
 * Biomes, decor, structures, animals, food and the hearth are sourced from
 * public-domain (CC0) pixel-art packs — Kenney's Roguelike/RPG pack plus CC0
 * farm animals (see src/assets/cc0/CREDITS.md). Their pixels are baked here into
 * Phaser canvas textures under stable texture keys, so the scene never references
 * an asset directly. The only hand-authored art is the hominin era-morph below,
 * for which no CC0 equivalent exists; it is still painted into a Graphics and
 * baked the same way, behind the same key indirection.
 */

type G = Phaser.GameObjects.Graphics;

/** Bake one CC0 sprite (raw base64 RGBA) into a canvas texture under `key`. */
function blit(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const sprite = CC0_ART[key];
  if (!sprite) return;
  const tex = scene.textures.createCanvas(key, sprite.w, sprite.h);
  if (!tex) return;
  const bin = atob(sprite.data);
  const buf = new Uint8ClampedArray(sprite.w * sprite.h * 4);
  for (let i = 0; i < buf.length; i++) buf[i] = bin.charCodeAt(i);
  tex.context.putImageData(new ImageData(buf, sprite.w, sprite.h), 0, 0);
  tex.refresh();
}

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

// ── CC0-sourced art (biomes, decor, animals, shelters, hearth) ────────────────
// Every key below is baked from the CC0 packs in src/assets/cc0/ (see CREDITS.md)
// via the generated art-cc0-data.ts. The scene references only these keys.

export function makeBiomeTextures(scene: Phaser.Scene): void {
  for (const key of CC0_GROUPS.biome) blit(scene, key);
}

export function makeDecorTextures(scene: Phaser.Scene): void {
  for (const key of CC0_GROUPS.decor) blit(scene, key);
}

export function makeAnimalTextures(scene: Phaser.Scene): void {
  for (const key of CC0_GROUPS.animal) blit(scene, key);
}

export function makeShelterTextures(scene: Phaser.Scene): void {
  for (const key of CC0_GROUPS.shelter) blit(scene, key);
}

export function makeFireTextures(scene: Phaser.Scene): void {
  for (const key of CC0_GROUPS.fire) blit(scene, key);
}

// ── hominin morph (era + genome aware) — hand-authored, no CC0 equivalent ──────

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
  // Two frames per morph (a gentle 2-step walk cycle). Both derive from the same
  // morph signature, so dedup-by-key is preserved; `${key}_1` is just frame B.
  bake(scene, key, HOM_W, HOM_H, (g) => drawHominin(g, p, 0));
  bake(scene, `${key}_1`, HOM_W, HOM_H, (g) => drawHominin(g, p, 1));
  return key;
}

/** Draw one walk frame (0 = stride A, 1 = stride B) of the era/genome morph. */
function drawHominin(g: G, p: MorphParams, frame: 0 | 1): void {
  let skin: number = SKIN[p.skin % SKIN.length];
  if (p.lineage === "neanderthal") skin = lighten(skin, 8);
  if (p.lineage === "denisovan") skin = darken(skin, 8);
  const hair = HAIR[p.hair % HAIR.length];
  const skinShade = darken(skin, 16);
  const skinLight = lighten(skin, 12);
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

  // Walk cycle: legs swing apart on frame B, arms swing opposite to the legs.
  const step = frame; // 0 | 1
  const lLegX = torsoX + 1 - step; // trailing leg sweeps back
  const rLegX = torsoX + torsoW - 3 + step; // leading leg sweeps forward

  // ── legs (shaded for a rounder, cleaner silhouette) ──
  const legCol = style.trousers ? gDark : skinShade;
  const legLit = style.trousers ? garment : skin;
  px(g, legCol, lLegX, legY, 2, legLen);
  px(g, legLit, lLegX, legY, 1, legLen - 1); // lit front edge
  px(g, legCol, rLegX, legY, 2, legLen);
  px(g, legLit, rLegX, legY, 1, legLen - 1);
  px(g, 0x2c2018, lLegX - 1, legY + legLen - 1, 3, 1); // feet/shoes
  px(g, 0x2c2018, rLegX, legY + legLen - 1, 3, 1);

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
    px(g, gDark, torsoX + torsoW - 1, dressTop, 1, dressH); // shaded side (light from left)
    px(g, gDark, torsoX, dressTop + dressH - 1, torsoW, 1); // hem shadow
    // subtle two-tone dither so flat eras read as woven cloth, not a slab
    px(g, gDark, torsoX + 1, dressTop + 2, 1, 1);
    px(g, gLight, torsoX + torsoW - 2, dressTop + 3, 1, 1);
    if (style.cut === "robe") px(g, garment, torsoX + 1, legY, torsoW - 2, 3); // skirt of robe
    if (style.cut === "coat") px(g, gDark, cx, dressTop, 1, dressH); // coat seam
    if (style.cut === "shirt") px(g, gLight, cx - 1, dressTop + 1, 1, 2); // collar
  }

  // ── arms (swing opposite the legs) ──
  const sleeve = style.cut === "hide" ? skin : garment;
  const lArmY = torsoY + 1 + step;
  const rArmY = torsoY + 1 - step;
  px(g, sleeve, torsoX - 1, lArmY, 1, torsoH - 2);
  px(g, sleeve, torsoX + torsoW, rArmY, 1, torsoH - 2);
  px(g, skinShade, torsoX - 1, lArmY + torsoH - 2, 1, 1); // hands
  px(g, skinShade, torsoX + torsoW, rArmY + torsoH - 2, 1, 1);

  // ── neck + head ──
  px(g, skinShade, cx - 1, torsoY - 1, 2, 1);
  px(g, skin, headX, headY, headW, headH);
  px(g, skinLight, headX + 1, headY + 1, 1, headH - 2); // lit cheek (left)
  px(g, skinShade, headX + headW - 1, headY, 1, headH); // shaded jaw side (right)
  px(g, skinShade, headX + 1, headY + headH - 1, headW - 2, 1); // chin shadow rounds the head
  // brow ridge for archaic forms; higher forehead for modern
  if ((1 - p.modernity) > 0.3) px(g, skinShade, headX + 1, headY + 2, headW - 1, 1);
  // eyes
  px(g, 0x14100c, headX + 2, headY + 3, 1, 1);
  px(g, 0x14100c, headX + 4, headY + 3, 1, 1);

  // ── hair / headwear ──
  if (style.hat !== undefined) {
    px(g, style.hat, headX - 1, headY - 2, headW + 2, 2); // brimmed hat
    px(g, style.hat, headX + 1, headY - 4, headW - 2, 2);
    px(g, lighten(style.hat, 10), headX - 1, headY - 2, headW + 2, 1); // hat sheen
  } else {
    const hairTop = headY - (p.modernity > 0.5 ? 2 : 1);
    px(g, hair, headX, hairTop, headW, 2);
    px(g, lighten(hair, 12), headX + 1, hairTop, headW - 2, 1); // hair sheen
    px(g, hair, headX, headY, 1, 3); // side hair
    px(g, hair, headX + headW - 1, headY, 1, 2);
    if (p.eraIdx >= 4 && p.eraIdx <= 5) px(g, hair, headX, headY, headW, 1); // tidier
  }

  // ── held tool, advancing with the era (leading hand follows the arm swing) ──
  const handY = torsoY + torsoH - 1;
  const tx = torsoX - 2;
  switch (style.tool) {
    case "spear": px(g, 0x6e472d, tx, headY, 1, handY - headY + 2); px(g, 0xcfd3d6, tx, headY, 1, 2); break;
    case "stick": px(g, 0x7d6a48, tx, torsoY, 1, handY - torsoY + 2); break;
    case "sickle": px(g, 0x7d6a48, tx, torsoY + 2, 1, 5); px(g, 0xcfd3d6, tx - 1, torsoY + 1, 2, 1); break;
    case "sword": px(g, 0xcfd3d6, tx, torsoY + 1, 1, 6); px(g, 0xb08a4a, tx - 1, torsoY + 6, 3, 1); break;
    case "scroll": px(g, 0xe8e0cf, tx, handY - 2, 2, 3); px(g, 0xc9bfa3, tx, handY - 2, 2, 1); break;
    case "hammer": px(g, 0x6e472d, tx, torsoY + 2, 1, 5); px(g, 0x9a958f, tx - 1, torsoY + 1, 3, 2); break;
    case "wrench": px(g, 0xbfc6cc, tx, torsoY + 2, 1, 5); px(g, 0xe6ebef, tx, torsoY + 2, 1, 1); break;
    case "case": px(g, 0x3a2a1c, tx - 1, handY - 1, 3, 3); px(g, 0x6f6256, tx - 1, handY - 1, 3, 1); break;
    case "device": px(g, 0x202830, tx, handY - 2, 2, 3); px(g, 0x67d6ff, tx, handY - 2, 2, 1); break;
    default: break;
  }
}
