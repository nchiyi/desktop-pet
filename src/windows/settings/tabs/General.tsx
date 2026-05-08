import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../../stores/settingsStore";

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13 };
const inputStyle: React.CSSProperties = { border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 };

/** Captures a global-shortcut-style key combination from the keyboard event. */
function combineHotkey(e: React.KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.metaKey)  mods.push("Meta");
  if (e.ctrlKey)  mods.push("Control");
  if (e.altKey)   mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  const key = e.key;
  if (["Meta", "Control", "Alt", "Shift"].includes(key)) return null;
  const mapped = key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
  return [...mods, mapped].join("+");
}

interface HotkeyFieldProps {
  label: string;
  hint: string;
  recordingLabel: string;
  value: string;
  onCommit: (next: string) => void;
}

function HotkeyField({ label, hint, recordingLabel, value, onCommit }: HotkeyFieldProps) {
  const [recording, setRecording] = useState(false);
  return (
    <label style={labelStyle}>
      <span>{label}</span>
      <div
        tabIndex={0}
        style={{
          ...inputStyle,
          cursor: "pointer",
          background: recording ? "#e8f0ff" : "white",
          outline: recording ? "2px solid #4A90D9" : "none",
          userSelect: "none",
          minHeight: 34,
          display: "flex",
          alignItems: "center",
        }}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          e.stopPropagation();
          const combo = combineHotkey(e);
          if (combo) {
            onCommit(combo);
            setRecording(false);
          }
        }}
      >
        {recording ? recordingLabel : value}
      </div>
      <span style={{ fontSize: 11, color: "#888" }}>{hint}</span>
    </label>
  );
}

export function General() {
  const { config, save } = useSettingsStore();
  const { t, i18n } = useTranslation();

  const handleLanguageChange = async (lang: string) => {
    const actualLang = await invoke<string>("set_language", { language: lang });
    i18n.changeLanguage(actualLang);
    save({ ...config, language: lang });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>{t("settings.general")}</h2>

      <label style={labelStyle}>
        {t("settings.language")}
        <select
          value={config.language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          style={inputStyle}
        >
          <option value="system">{t("settings.language_system")}</option>
          <option value="zh-TW">{t("settings.language_zh")}</option>
          <option value="en">{t("settings.language_en")}</option>
        </select>
      </label>

      <HotkeyField
        label={t("settings.hotkey")}
        hint={t("settings.hotkey_hint")}
        recordingLabel={t("settings.hotkey_recording")}
        value={config.hotkey}
        onCommit={(hotkey) => save({ ...config, hotkey })}
      />

      <HotkeyField
        label={t("settings.toggle_hotkey")}
        hint={t("settings.toggle_hotkey_hint")}
        recordingLabel={t("settings.hotkey_recording")}
        value={config.toggle_hotkey}
        onCommit={(toggle_hotkey) => save({ ...config, toggle_hotkey })}
      />

      <label style={labelStyle}>
        <span>{t("settings.always_on_top")}</span>
        <input type="checkbox" checked={config.always_on_top} onChange={(e) => save({ ...config, always_on_top: e.target.checked })} />
      </label>
      <label style={labelStyle}>
        <span>{t("settings.autostart")}</span>
        <input type="checkbox" checked={config.launch_at_startup} onChange={(e) => save({ ...config, launch_at_startup: e.target.checked })} />
      </label>
      <label style={labelStyle}>
        <span>{t("settings.idle_bubble")}</span>
        <input type="checkbox" checked={config.show_idle_bubbles} onChange={(e) => save({ ...config, show_idle_bubbles: e.target.checked })} />
      </label>
      <label style={labelStyle}>
        <span>{t("settings.night_mode")}</span>
        <input type="checkbox" checked={config.night_sleep_mode} onChange={(e) => save({ ...config, night_sleep_mode: e.target.checked })} />
      </label>
      {config.night_sleep_mode && (
        <div style={{ display: "flex", gap: 12 }}>
          <label style={labelStyle}>
            {t("settings.night_start")}
            <input type="number" min={0} max={23} value={config.night_start_hour} onChange={(e) => save({ ...config, night_start_hour: +e.target.value })} style={{ ...inputStyle, width: 60 }} />
          </label>
          <label style={labelStyle}>
            {t("settings.night_end")}
            <input type="number" min={0} max={23} value={config.night_end_hour} onChange={(e) => save({ ...config, night_end_hour: +e.target.value })} style={{ ...inputStyle, width: 60 }} />
          </label>
        </div>
      )}
    </div>
  );
}
