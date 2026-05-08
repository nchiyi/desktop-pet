import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../../stores/settingsStore";

const ANIMATIONS: { key: string; label: string }[] = [
  { key: "idle",      label: "待機" },
  { key: "walk",      label: "走路" },
  { key: "run",       label: "跑步" },
  { key: "sit",       label: "坐下" },
  { key: "dance",     label: "跳舞" },
  { key: "sway",      label: "搖擺" },
  { key: "stretch",   label: "伸展" },
  { key: "sleep",     label: "睡覺" },
  { key: "think",     label: "思考" },
  { key: "talk",      label: "說話" },
  { key: "happy",     label: "開心" },
  { key: "sad",       label: "難過" },
  { key: "drag",      label: "被拖曳" },
  { key: "surprised", label: "驚訝" },
  { key: "impatient", label: "不耐煩" },
];

const IMAGE_EXTS = ["gif", "webp", "png", "jpg"];

export function Animation() {
  const { config, save } = useSettingsStore();
  const sliders = [
    { label: "角色大小（px）",         key: "character_size" as const,          min: 40,  max: 200, step: 4 },
    { label: "移動速度",               key: "movement_speed" as const,          min: 0.2, max: 3,   step: 0.1 },
    { label: "偶發動畫最短間隔（秒）",  key: "idle_anim_interval_min" as const,  min: 10,  max: 300, step: 5 },
    { label: "偶發動畫最長間隔（秒）",  key: "idle_anim_interval_max" as const,  min: 10,  max: 600, step: 5 },
    { label: "氣泡顯示時間（秒）",      key: "bubble_duration_secs" as const,    min: 3,   max: 30,  step: 1 },
  ];

  const charName = config.active_character;
  const [files, setFiles] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      const f = await invoke<string[]>("list_character_files", { charName });
      setFiles(f);
    } catch { setFiles([]); }
    try {
      const o = await invoke<Record<string, string>>("get_animation_overrides", { charName });
      setOverrides(o);
    } catch { setOverrides({}); }
  }, [charName]);

  useEffect(() => { reload(); }, [reload]);

  const handleChange = async (anim: string, value: string) => {
    try {
      await invoke("set_animation_override", {
        charName,
        anim,
        file: value === "" ? null : value,
      });
      await reload();
    } catch (e) {
      console.error("set_animation_override failed", e);
    }
  };

  const fileSet = new Set(files);
  const autoFor = (anim: string): string | null => {
    for (const ext of IMAGE_EXTS) {
      const f = `${anim}.${ext}`;
      if (fileSet.has(f)) return f;
    }
    return null;
  };
  const staticFor = (anim: string): string | null => {
    for (const ext of IMAGE_EXTS) {
      const f = `${anim}_static.${ext}`;
      if (fileSet.has(f)) return f;
    }
    return null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>動畫設定</h2>
      {sliders.map(({ label, key, min, max, step }) => (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          {label}：{config[key]}
          <input type="range" min={min} max={max} step={step} value={config[key]} onChange={(e) => save({ ...config, [key]: +e.target.value })} />
        </label>
      ))}

      <div style={{ borderTop: "1px solid #eee", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>動作圖檔對應</h3>
        <p style={{ margin: 0, fontSize: 12, color: "#777", lineHeight: 1.6 }}>
          在角色資料夾放入對應檔名的圖片即會自動套用。下列下拉可手動覆寫對應；
          再放一張 <code>&lt;動作&gt;_static.png</code> 可讓動作播完後維持靜態（例：<code>sit_static.png</code>）。
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ANIMATIONS.map(({ key, label }) => {
            const override = overrides[key];
            const auto = autoFor(key);
            const stat = staticFor(key);
            const current = override ?? "";
            return (
              <div key={key} style={{ display: "grid", gridTemplateColumns: "84px 1fr 1.2fr", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 500 }}>
                  {label}
                  <span style={{ color: "#aaa", marginLeft: 4, fontSize: 11 }}>{key}</span>
                </span>
                <select
                  value={current}
                  onChange={(e) => handleChange(key, e.target.value)}
                  style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #ddd", fontSize: 12 }}
                >
                  <option value="">
                    {auto ? `(自動：${auto})` : "(無檔，使用後備)"}
                  </option>
                  {files.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: "#888" }}>
                  預期：<code>{key}.gif/.webp/.png</code>
                  {stat ? <> · 靜態：<code>{stat}</code></> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
