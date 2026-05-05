import { useSettingsStore } from "../../../stores/settingsStore";
import { MovementMode } from "../../../types/settings";

const MODES: { value: MovementMode; label: string }[] = [
  { value: "FullScreen",  label: "全畫面隨機遊走" },
  { value: "FixedTop",    label: "固定上方" },
  { value: "FixedBottom", label: "固定下方" },
  { value: "FixedLeft",   label: "固定左側" },
  { value: "FixedRight",  label: "固定右側" },
  { value: "Fixed",       label: "定點模式" },
];

export function Movement() {
  const { config, save } = useSettingsStore();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>移動模式</h2>
      {MODES.map((m) => (
        <label key={m.value} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
          <input type="radio" name="movement" value={m.value} checked={config.movement_mode === m.value} onChange={() => save({ ...config, movement_mode: m.value })} />
          {m.label}
        </label>
      ))}
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, marginTop: 12 }}>
        <span>多螢幕：允許跨螢幕遊走</span>
        <input type="checkbox" checked={config.multi_monitor} onChange={(e) => save({ ...config, multi_monitor: e.target.checked })} />
      </label>
    </div>
  );
}
