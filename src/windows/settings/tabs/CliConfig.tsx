import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../../stores/settingsStore";
import { CliTool } from "../../../types/settings";

const CLI_OPTIONS: CliTool[] = ["Claude", "Gemini", "Codex"];

export function CliConfig() {
  const { config, save } = useSettingsStore();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<string>("test_cli_connection");
      setTestResult(result);
    } catch (e) {
      setTestResult(`❌ ${e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>CLI 設定</h2>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        使用的 CLI
        <select value={config.cli_tool} onChange={(e) => save({ ...config, cli_tool: e.target.value as CliTool })} style={{ border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
          {CLI_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        CLI 執行路徑（留空自動偵測）
        <input value={config.cli_path_override ?? ""} onChange={(e) => save({ ...config, cli_path_override: e.target.value || null })} style={{ border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 }} placeholder="/usr/local/bin/claude" />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        預設回覆語言
        <input value={config.reply_language} onChange={(e) => save({ ...config, reply_language: e.target.value })} style={{ border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 }} placeholder="繁體中文" />
      </label>
      <button onClick={testConnection} disabled={testing} style={{ background: "#4A90D9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, alignSelf: "flex-start" }}>
        {testing ? "測試中…" : "測試連線"}
      </button>
      {testResult && (
        <div style={{ fontSize: 13, padding: "8px 12px", background: "#f8f8f8", borderRadius: 8 }}>
          {testResult}
        </div>
      )}
    </div>
  );
}
