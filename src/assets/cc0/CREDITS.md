# CC0 art credits

Every sprite the renderer shows for **terrain/biomes, decor, structures, animals,
food and the hearth** is sourced from the public-domain (CC0) packs below. The
only hand-authored art that remains is the **hominin era-morph** (`textures.ts`
`ensureHomininTexture`) — a nine-stage human that ages from archaic to modern
with era clothing and tools, for which no CC0 equivalent exists.

The pixels are baked into Phaser textures at runtime from a generated data module
(`src/game/art-cc0-data.ts`); see `tools/extract-cc0-art.py` for how that module
is produced from the source files in this folder.

| Pack | Author | License | Source | Used for |
| --- | --- | --- | --- | --- |
| Roguelike/RPG pack | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/roguelike-rpg-pack | biome ground, trees/bush/rock, tents & buildings (shelters), farmland/crop, food, hearth/fire |
| Pixel Animals 16x16 | GrumpyDiamond | CC0 1.0 | https://opengameart.org/content/pixel-animals-16x16 | cow, sheep |
| Dog Sprites | Shepardskin | CC0 1.0 | https://opengameart.org/content/dog-sprites | dog |

CC0 1.0 (Public Domain Dedication): https://creativecommons.org/publicdomain/zero/1.0/

Per-pack license texts are kept alongside each pack's files in this folder.
