/**
 * Pure stroke colour for the click-to-move destination ping.
 *
 * A plain "walk over here" order and a "walk over and harvest that node" order
 * used to ping in the identical warm tone, so the ripple confirmed *where* the
 * chieftain was sent but not *what* for. This tints the ping by the clicked
 * target: a bare ground order keeps the calm default, while a click on a
 * gatherable node pings in that resource's colour (see WorldScene's RES_COLOR),
 * so the confirmation reads "going to gather wood/food/stone" at a glance. Kept
 * Phaser-free so the mapping is unit-testable; the scene owns the ring object and
 * feeds it the returned 0xRRGGBB as the stroke colour.
 */

/**
 * The ping stroke colour for an order. A `null` kind is a plain walk and returns
 * `walk`; a non-null kind looks its colour up in `palette`, so the destination
 * ripple is tinted to the resource the chieftain was sent to gather.
 */
export function movePingColor<K extends string>(
  kind: K | null,
  palette: Record<K, number>,
  walk: number,
): number {
  return kind === null ? walk : palette[kind];
}
