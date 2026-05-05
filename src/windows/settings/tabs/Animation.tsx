import React from "react";
import { useSettingsStore } from "../../../stores/settingsStore";

export function Animation() {
  const { config, save } = useSettingsStore();
  const sliders = [
    { label: "角色大小（px）",         key: "character_size" as const,          min: 40,  max: 200, step: 4 },
    { label: "移動速度",               key: "movement_speed" as const,          min: 0.2, max: 3,   step: 0.1 },
    { label: "偶發動畫最短間隔（秒）",  key: "idle_anim_interval_min" as const,  min: 10,  max: 300, step: 5 },
    { label: "偶發動畫最長間隔（秒）",  key: "idle_anim_interval_max" as const,  min: 10,  max: 600, step: 5 },
    { label: "氣泡顯示時間（秒）",      key: "bubble_duration_secs" as const,    min: 3,   max: 30,  step: 1 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>動畫設定</h2>
      {sliders.map(({ label, key, min, max, step }) => (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          {label}：{config[key]}
          <input type="range" min={min} max={max} step={step} value={config[key]} onChange={(e) => save({ ...config, [key]: +e.target.value })} />
        </label>
      ))}
    </div>
  );
}
