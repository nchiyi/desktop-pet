export type MovementMode =
  | "FullScreen"
  | "FixedTop"
  | "FixedBottom"
  | "FixedLeft"
  | "FixedRight"
  | "Fixed";

export type CliTool = "Claude" | "Gemini" | "Codex";

export interface AppConfig {
  hotkey: string;
  movement_mode: MovementMode;
  active_character: string;
  character_size: number;
  movement_speed: number;
  idle_anim_interval_min: number;
  idle_anim_interval_max: number;
  bubble_duration_secs: number;
  show_idle_bubbles: boolean;
  night_sleep_mode: boolean;
  night_start_hour: number;
  night_end_hour: number;
  launch_at_startup: boolean;
  multi_monitor: boolean;
  cli_tool: CliTool;
  cli_path_override: string | null;
  reply_language: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  hotkey: "Alt+Space",
  movement_mode: "FullScreen",
  active_character: "default",
  character_size: 80,
  movement_speed: 1.0,
  idle_anim_interval_min: 30,
  idle_anim_interval_max: 120,
  bubble_duration_secs: 8,
  show_idle_bubbles: true,
  night_sleep_mode: false,
  night_start_hour: 22,
  night_end_hour: 8,
  launch_at_startup: false,
  multi_monitor: false,
  cli_tool: "Claude",
  cli_path_override: null,
  reply_language: "繁體中文",
};
