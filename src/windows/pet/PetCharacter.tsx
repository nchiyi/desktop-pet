import React from "react";

interface Props {
  animPath: string;
  animState: string;
  size: number;
}

export function PetCharacter({ animPath, animState, size }: Props) {
  if (!animPath) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "rgba(100,160,255,0.7)",
        }}
      />
    );
  }

  const isSpriteSheet = animPath.includes("_sprite");

  if (isSpriteSheet) {
    return (
      <div
        data-anim={animState}
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${animPath})`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    );
  }

  return (
    <img
      src={animPath}
      alt={animState}
      width={size}
      height={size}
      style={{
        imageRendering: "pixelated",
        userSelect: "none",
        pointerEvents: "none",
        display: "block",
      }}
      draggable={false}
    />
  );
}
