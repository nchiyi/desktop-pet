import React from "react";
import { useSettingsStore } from "../../../stores/settingsStore";

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13 };
const inputStyle: React.CSSProperties = { border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 };

export function General() {
  const { config, save } = useSettingsStore();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>一般設定</h2>
      <label style={labelStyle}>
        快速鍵
        <input value={config.hotkey} onChange={(e) => save({ ...config, hotkey: e.target.value })} style={inputStyle} placeholder="Alt+Space" />
      </label>
      <label style={labelStyle}>
        <span>開機自動啟動</span>
        <input type="checkbox" checked={config.launch_at_startup} onChange={(e) => save({ ...config, launch_at_startup: e.target.checked })} />
      </label>
      <label style={labelStyle}>
        <span>閒置氣泡對話</span>
        <input type="checkbox" checked={config.show_idle_bubbles} onChange={(e) => save({ ...config, show_idle_bubbles: e.target.checked })} />
      </label>
      <label style={labelStyle}>
        <span>深夜睡眠模式</span>
        <input type="checkbox" checked={config.night_sleep_mode} onChange={(e) => save({ ...config, night_sleep_mode: e.target.checked })} />
      </label>
      {config.night_sleep_mode && (
        <div style={{ display: "flex", gap: 12 }}>
          <label style={labelStyle}>
            開始時間
            <input type="number" min={0} max={23} value={config.night_start_hour} onChange={(e) => save({ ...config, night_start_hour: +e.target.value })} style={{ ...inputStyle, width: 60 }} />
          </label>
          <label style={labelStyle}>
            結束時間
            <input type="number" min={0} max={23} value={config.night_end_hour} onChange={(e) => save({ ...config, night_end_hour: +e.target.value })} style={{ ...inputStyle, width: 60 }} />
          </label>
        </div>
      )}
    </div>
  );
}
