import Phaser from "phaser";
import { GameController } from "./game/controller.js";
import { MainScene, WORLD_W, WORLD_H } from "./game/MainScene.js";
import { UIOverlay } from "./ui/overlay.js";

const controller = new GameController();

// Phaser owns the world render; the DOM owns the UI. They share `controller`.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: WORLD_W,
  height: WORLD_H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: "#22381f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MainScene],
});
game.registry.set("controller", controller);

const ui = new UIOverlay(document.getElementById("ui-root")!, controller);

// The DOM UI repaints every animation frame from the shared controller state;
// the sim itself only advances inside MainScene.update at the chosen speed.
const loop = () => {
  ui.render();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
