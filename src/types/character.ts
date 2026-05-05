export interface CharacterMeta {
  name: string;
  author: string;
  version: string;
  size: number;
  dir: string;
}

export type AnimationState =
  | "idle" | "walk" | "run" | "sit" | "dance" | "sway"
  | "stretch" | "sleep" | "think" | "talk" | "happy"
  | "sad" | "drag" | "surprised" | "impatient";
