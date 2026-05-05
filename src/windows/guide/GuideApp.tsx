import React from "react";
import { invoke } from "@tauri-apps/api/core";

const ANIMATION_NAMES = [
  "idle","walk","run","sit","dance","sway",
  "stretch","sleep","think","talk","happy",
  "sad","drag","surprised","impatient",
];

export function GuideApp() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", overflowY: "auto", height: "100vh" }}>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>角色製作說明</h2>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>資料夾結構</h3>
        <pre style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 14px", fontSize: 12, overflowX: "auto" }}>{`my_character/
  character.toml   ← 必填
  idle.gif         ← 必填
  walk.gif         ← 建議
  think.gif        ← 建議
  happy.gif        ← 建議
  thumbnail.png    ← 設定頁預覽
  ...其他動畫      ← 選填`}</pre>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>character.toml 範例</h3>
        <pre style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>{`name = "我的角色"
author = "你的名字"
version = "1.0"
size = 80`}</pre>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>建議規格</h3>
        <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
          <li>圖片尺寸：128×128 px（可縮放）</li>
          <li>GIF / WebP 動畫：8~16 幀，12 fps</li>
          <li>PNG 靜態圖：透明背景（RGBA）</li>
          <li>Sprite Sheet：附同名 <code>.toml</code> 設定幀數</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>動畫名稱對照表</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ANIMATION_NAMES.map((n) => (
            <code key={n} style={{ background: "#f0f0f0", borderRadius: 6, padding: "3px 8px", fontSize: 12 }}>
              {n}
            </code>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => invoke("open_characters_folder").catch(console.error)}
          style={{ background: "#4A90D9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}
        >
          開啟角色資料夾
        </button>
      </div>
    </div>
  );
}
