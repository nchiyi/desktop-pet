import React, { useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { General } from "./tabs/General";
import { Movement } from "./tabs/Movement";
import { Animation } from "./tabs/Animation";
import { CliConfig } from "./tabs/CliConfig";

type Tab = "general" | "movement" | "animation" | "cli";
const TABS: { key: Tab; label: string }[] = [
  { key: "general",   label: "一般設定" },
  { key: "movement",  label: "移動模式" },
  { key: "animation", label: "動畫設定" },
  { key: "cli",       label: "CLI 設定" },
];

export function SettingsApp() {
  const [tab, setTab] = useState<Tab>("general");
  const { load } = useSettingsStore();
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ width: 120, borderRight: "1px solid #eee", padding: "16px 0" }}>
        {TABS.map((t) => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{ padding: "10px 16px", cursor: "pointer", fontSize: 13, background: tab === t.key ? "#EBF4FF" : "transparent", color: tab === t.key ? "#4A90D9" : "#444", fontWeight: tab === t.key ? 600 : 400 }}>
            {t.label}
          </div>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {tab === "general"   && <General />}
        {tab === "movement"  && <Movement />}
        {tab === "animation" && <Animation />}
        {tab === "cli"       && <CliConfig />}
      </main>
    </div>
  );
}
