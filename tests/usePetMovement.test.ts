import { describe, it, expect } from "vitest";
import { clampToScreen, getFixedAreaBounds } from "../src/hooks/usePetMovement";

describe("clampToScreen", () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1080 };

  it("clamps negative position to zero", () => {
    const result = clampToScreen({ x: -10, y: -5 }, 80, screen);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("clamps right and bottom edges", () => {
    const result = clampToScreen({ x: 2000, y: 1200 }, 80, screen);
    expect(result.x).toBe(1840);
    expect(result.y).toBe(1000);
  });

  it("does not clamp valid position", () => {
    const result = clampToScreen({ x: 500, y: 300 }, 80, screen);
    expect(result.x).toBe(500);
    expect(result.y).toBe(300);
  });
});

describe("getFixedAreaBounds", () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1080 };

  it("FixedTop returns top 10% band", () => {
    const bounds = getFixedAreaBounds("FixedTop", screen);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxY).toBe(108);
  });

  it("FixedBottom returns bottom 10% band", () => {
    const bounds = getFixedAreaBounds("FixedBottom", screen);
    expect(bounds.minY).toBe(972);
    expect(bounds.maxY).toBe(1080);
  });

  it("FixedLeft returns left 10% band", () => {
    const bounds = getFixedAreaBounds("FixedLeft", screen);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(192);
  });

  it("FixedRight returns right 10% band", () => {
    const bounds = getFixedAreaBounds("FixedRight", screen);
    expect(bounds.minX).toBe(1728);
    expect(bounds.maxX).toBe(1920);
  });
});
