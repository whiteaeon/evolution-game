import Phaser from "phaser";
import { GameController } from "./game/controller.js";
import { WorldScene, VIEW_W, VIEW_H } from "./game/WorldScene.js";

const controller = new GameController();

// Phaser owns the interactive world; the camera follows the player chieftain.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: VIEW_W,
  height: VIEW_H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: "#1d2a17",
  render: { preserveDrawingBuffer: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [WorldScene],
});
game.registry.set("controller", controller);

// Dev-only handle so the running game can be inspected/driven from the console.
// Stripped from production builds by the import.meta.env.DEV guard.
if ((import.meta as unknown as { env: { DEV: boolean } }).env.DEV) {
  (window as unknown as Record<string, unknown>).__game = game;
}
