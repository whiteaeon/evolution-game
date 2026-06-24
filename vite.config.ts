/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { port: 5173, open: false },
  build: { target: "es2021" },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
