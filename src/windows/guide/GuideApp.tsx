import { invoke } from "@tauri-apps/api/core";

interface ActionSpec {
  name: string;
  zh: string;
  frames: number;
  fps: number;
  breakdown: string[];
  prompt: string;
}

const ACTIONS: ActionSpec[] = [
  {
    name: "idle",
    zh: "待機",
    frames: 6,
    fps: 8,
    breakdown: [
      "F1 站姿基準：雙腳穩穩貼在畫面下緣，重心置中，眼神向前",
      "F2 吸氣微抬：肩膀與胸口上提 1–2 px，頭略上",
      "F3 吐氣回正：回到 F1，但眼睛輕閉一半（眨眼預備）",
      "F4 完整眨眼：眼睛閉合",
      "F5 張眼，重心微移到左腳",
      "F6 重心微移到右腳，再循環回 F1",
    ],
    prompt:
      "chibi mascot character, full body, 128x128 transparent PNG, standing on flat ground, feet firmly planted, soft cel-shading, clean lineart, 3/4 front view, neutral relaxed pose, single light source from upper left, no shadow plate, no background. Frame N of a 6-frame breathing+blink loop: <DESCRIBE FRAME>. Keep silhouette and outfit IDENTICAL across all frames; only chest/shoulders/eyelids change.",
  },
  {
    name: "walk",
    zh: "走路",
    frames: 4,
    fps: 10,
    breakdown: [
      "F1 接觸幀：右腳前掌觸地、左腳後跟離地，手臂自然反向擺",
      "F2 通過幀：身體微沉（-2 px），雙腿交會於中線，手臂垂直",
      "F3 接觸幀：左腳前掌觸地、右腳後跟離地，手臂反向擺",
      "F4 通過幀：身體微沉，雙腿再次交會",
    ],
    prompt:
      "Same chibi mascot, side view (profile), walking cycle frame N of 4. Feet touch the ground at the bottom of the frame — DO NOT float. Standard 4-pose game walk cycle: contact-passing-contact-passing. Camera locked, only the character's limbs and torso move. Transparent background, identical outfit, identical line weights. Body bobs down 2 px on passing frames.",
  },
  {
    name: "run",
    zh: "跑步",
    frames: 4,
    fps: 14,
    breakdown: [
      "F1 大步接觸：前腳遠伸、後腳完全離地，身體前傾 10°",
      "F2 推進通過：身體最低點，膝蓋彎曲，雙手大幅擺動",
      "F3 鏡像接觸",
      "F4 鏡像推進",
    ],
    prompt:
      "Same mascot side view, fast 4-frame run cycle. Body pitched forward 10°. On passing frames the character is briefly fully airborne (both feet off ground). Hair/cape/tail trails behind. Transparent background, no motion blur, no speed lines, no background.",
  },
  {
    name: "sit",
    zh: "坐下",
    frames: 4,
    fps: 6,
    breakdown: [
      "F1 站姿（同 idle F1）",
      "F2 屈膝下蹲，雙手前伸保持平衡",
      "F3 臀部觸地，雙腿盤起",
      "F4 完全坐定，雙手垂於腿側，輕微搖晃",
    ],
    prompt:
      "Mascot transitioning from standing to sitting on the floor, 4-frame sequence. Bottom of the character should always remain on the ground line at the same Y position. No jumping, no hovering. Frame N of 4: <DESCRIBE FRAME>. Transparent background.",
  },
  {
    name: "dance",
    zh: "跳舞",
    frames: 6,
    fps: 12,
    breakdown: [
      "F1 中立站姿，雙手腰側",
      "F2 重心移左，左手舉至肩高，腰擺左",
      "F3 雙手舉過頭，輕微跳起 2 px",
      "F4 落地，重心置中",
      "F5 重心移右，右手舉至肩高，腰擺右",
      "F6 落地回中立",
    ],
    prompt:
      "Mascot doing a happy dance, 6-frame loop. Feet stay anchored to the ground line except F3 where the character pops up 2 px. Hips and shoulders sway in opposite directions (counter-twist). Transparent background, no music notes, no glitter (those are added by the app).",
  },
  {
    name: "sway",
    zh: "搖擺",
    frames: 4,
    fps: 6,
    breakdown: [
      "F1 中立",
      "F2 身體略傾左 5°，頭跟著傾",
      "F3 中立",
      "F4 身體略傾右 5°",
    ],
    prompt:
      "Mascot gently swaying side to side as if humming, 4 frames. Feet stay planted (a slight pivot at ankles is OK). Eyes half-closed in contentment. Transparent background.",
  },
  {
    name: "stretch",
    zh: "伸展",
    frames: 5,
    fps: 6,
    breakdown: [
      "F1 站姿",
      "F2 雙手向兩側水平伸展",
      "F3 雙手向上伸至頭頂，腳尖踮起 2 px",
      "F4 雙手交握於頭頂，向後仰 5°",
      "F5 回到 F2，再回 F1",
    ],
    prompt:
      "Mascot doing a wake-up stretch, 5 frames. Arms move from down → out → up → arched. Tiptoe lift on F3 only. Transparent background. Optional small yawn on F3.",
  },
  {
    name: "sleep",
    zh: "睡覺",
    frames: 4,
    fps: 4,
    breakdown: [
      "F1 側躺，眼睛閉著，腹部平坦",
      "F2 吸氣，腹部與胸口微抬 1 px，第一個 Z 浮出",
      "F3 側躺基準（Z 漂高）",
      "F4 吐氣，第二個 Z 出現，頭微傾",
    ],
    prompt:
      "Mascot lying on its side asleep, 4-frame slow breathing loop. Eyes closed. Small floating ZZZ above head. Body lying directly on the ground line — no pillow, no bed. Transparent background.",
  },
  {
    name: "think",
    zh: "思考",
    frames: 4,
    fps: 6,
    breakdown: [
      "F1 一手摸下巴，眼睛望左上",
      "F2 眼珠移動到右上，眉毛挑起",
      "F3 一手摸下巴，眼睛閉，似在腦中翻找",
      "F4 眼睛睜開，眉毛回到中性，準備說話",
    ],
    prompt:
      "Mascot thinking, hand on chin, 4 frames. Only the eyes and eyebrows change between frames; body and hand stay still. No question mark or thought bubble (the app overlays those). Transparent background.",
  },
  {
    name: "talk",
    zh: "說話",
    frames: 4,
    fps: 10,
    breakdown: [
      "F1 嘴閉",
      "F2 嘴半開",
      "F3 嘴全開",
      "F4 嘴半開（回程）",
    ],
    prompt:
      "Mascot talking loop, 4 frames. ONLY the mouth shape changes (closed → half → open → half). Tiny head bob 1 px on the open frame. Eyes blink occasionally. Body and hands completely still. Transparent background.",
  },
  {
    name: "happy",
    zh: "開心",
    frames: 4,
    fps: 10,
    breakdown: [
      "F1 站姿，準備跳",
      "F2 屈膝蓄力",
      "F3 跳起 6 px，雙手舉高，眼睛變星星 ✨",
      "F4 落地緩衝，膝微彎",
    ],
    prompt:
      "Mascot expressing joy with a small jump, 4 frames. Feet leave the ground only on F3, by 6 px. Sparkle eyes / open smile on F3. Transparent background, no confetti (added by app).",
  },
  {
    name: "sad",
    zh: "難過",
    frames: 3,
    fps: 4,
    breakdown: [
      "F1 站姿，肩膀下垂，眉毛內八，嘴角下彎",
      "F2 一滴眼淚從右眼滑出（淚珠 2–3 px）",
      "F3 淚珠落到下巴，整個身體下沉 1 px（嘆氣）",
    ],
    prompt:
      "Sad mascot, 3 frames, very slow. Drooped shoulders, inverted-V eyebrows. A small tear forms on F2 and falls on F3. Body sinks 1 px on F3. Transparent background.",
  },
  {
    name: "drag",
    zh: "被拖曳",
    frames: 2,
    fps: 8,
    breakdown: [
      "F1 整個身體被由上方提起，雙腳離地，手腳放鬆下垂",
      "F2 與 F1 幾乎相同，但手腳隨慣性微擺（±2 px）",
    ],
    prompt:
      "Mascot being held up from the top by an invisible hand (pinch-grip). Body dangles, limbs limp, slightly surprised but not unhappy face. 2-frame gentle sway loop. Transparent background. Used while user drags the pet with the cursor.",
  },
  {
    name: "surprised",
    zh: "驚訝",
    frames: 3,
    fps: 8,
    breakdown: [
      "F1 站姿正常",
      "F2 突然全身一震、跳起 4 px，眼睛睜大、嘴張成 O",
      "F3 落地，身體微縮，雙手護胸",
    ],
    prompt:
      "Mascot startled, 3 frames. F2 only: body lifts 4 px, all features enlarged. Transparent background. No exclamation mark (overlay).",
  },
  {
    name: "impatient",
    zh: "不耐煩",
    frames: 4,
    fps: 6,
    breakdown: [
      "F1 雙手叉腰，右腳輕點地",
      "F2 右腳抬起",
      "F3 右腳放下（腳輕點地的瞬間）",
      "F4 同 F1，眉毛再皺一點",
    ],
    prompt:
      "Mascot tapping foot impatiently, hands on hips, 4-frame loop. Only the right foot and eyebrows move. Foot must visibly leave then return to the ground line. Transparent background.",
  },
];

export function GuideApp() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", overflowY: "auto", height: "100vh", color: "#222" }}>
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>角色製作說明</h2>
      <p style={{ fontSize: 12, color: "#666", marginBottom: 20, lineHeight: 1.6 }}>
        本指南目標：讓角色看起來像「真的踩在螢幕上活動」，而不是漂浮 + 換圖。每個動作都拆成多幀，
        並提供可直接複製到 Midjourney / DALL·E / Stable Diffusion 的 AI 提示詞模板。
      </p>

      <section style={{ marginBottom: 28, padding: 14, background: "#FFF8E1", borderRadius: 10 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>核心設計原則</h3>
        <ol style={{ fontSize: 12.5, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li><b>定錨地面（Ground Anchor）</b>：所有「站立 / 走路 / 坐下 / 跳舞 / 不耐煩」動作，
              <u>角色腳底必須對齊圖片下緣同一條 Y 軸線</u>。畫面中沒有地板影子，但角色必須像踩在地上。</li>
          <li><b>剪影一致（Silhouette Lock）</b>：同一角色的所有幀，<u>輪廓、髮型、配色、線條粗細都要完全一致</u>，
              避免換圖閃爍。AI 生成時把這條寫入 prompt。</li>
          <li><b>差異最小化（Minimal Diff）</b>：兩幀之間只動「該動的部分」（嘴、眼、單腳、單手），
              其他部位保持像素級一致。</li>
          <li><b>動作拆解（Action Breakdown）</b>：每個動作是 2–6 幀的循環或一次性序列，
              FPS 由 character.toml 控制；不是隨機切換多張靜圖。</li>
          <li><b>透明背景（PNG/WebP RGBA）</b>：絕對不要白底；AI 提示詞內務必寫
              <code> transparent background, no background</code>。</li>
        </ol>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>資料夾結構</h3>
        <pre style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 14px", fontSize: 12, overflowX: "auto" }}>{`my_character/
  character.toml
  thumbnail.png      ← 設定頁預覽（128×128）

  # 動畫：擇一格式即可（優先順序 .gif > .webp > .png）
  idle.gif           ← 必填，多幀循環
  walk.gif           ← 建議
  think.gif          ← 建議
  ...
  # 或：sprite sheet（單張橫向多幀 PNG，需附同名 .toml）
  walk_sprite.png    ← 4 幀橫排
  walk_sprite.toml   ← 設定 frames、fps`}</pre>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>character.toml</h3>
        <pre style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>{`name    = "我的角色"
author  = "你的名字"
version = "1.0"
size    = 100        # 螢幕顯示像素 (建議 80–120)

[animation]
idle_duration  = 3.0  # 待機切換到下一動作前的秒數
think_duration = 0    # 0 = 由 app 控制`}</pre>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>建議規格</h3>
        <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
          <li>畫布尺寸：<b>128×128 px</b>（角色實際內容約 80–110 px，下緣留 4–8 px 給腳）</li>
          <li>輸出格式：GIF 或 WebP（動畫）；PNG（單幀；不建議用於有動作的角色）</li>
          <li>幀數：每動作 2–6 幀；FPS 4–14（依動作激烈度，見下表）</li>
          <li>所有幀必須<b>對齊同一個畫布</b>（不要每幀重新裁切，會造成抖動）</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>動作拆解 + AI 提示詞</h3>
        {ACTIONS.map((a) => (
          <details
            key={a.name}
            style={{
              background: "#fafafa",
              border: "1px solid #eaeaea",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 8,
            }}
          >
            <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>
              <code style={{ background: "#eef3ff", padding: "2px 6px", borderRadius: 4, marginRight: 8 }}>{a.name}</code>
              {a.zh}
              <span style={{ color: "#888", fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                · {a.frames} 幀 · {a.fps} fps
              </span>
            </summary>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#444", marginBottom: 6 }}>動作拆解：</div>
              <ol style={{ fontSize: 12.5, lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
                {a.breakdown.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ol>
              <div style={{ fontSize: 12, color: "#444", marginTop: 10, marginBottom: 4 }}>AI 提示詞：</div>
              <pre style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 6, padding: "8px 10px", fontSize: 11.5, whiteSpace: "pre-wrap", margin: 0 }}>{a.prompt}</pre>
            </div>
          </details>
        ))}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>「真的在螢幕上活動」的進階技巧</h3>
        <ul style={{ fontSize: 13, lineHeight: 1.9, paddingLeft: 20 }}>
          <li><b>地面參考線</b>：在繪圖軟體的最底層拉一條輔助線（Y=120/128），所有「腳」都對齊這條線。
              walk / run 的「passing」幀身體下沉 2 px，模擬重量感。</li>
          <li><b>隨機微動（Idle Variation）</b>：把 idle 拆成 6 幀，眨眼安排在 F4，每次循環時加入 ±0.2 秒抖動，
              就不會看起來像復讀機。app 會在 idle_duration 到時自動切換到 sway / stretch / think 之一。</li>
          <li><b>過渡動作（Transition Frames）</b>：sit 的 F1 必須等於 idle 的 F1；happy 的 F4 必須等於 idle 的 F1。
              這樣動作之間切換時不會「跳格」。</li>
          <li><b>反作用力（Anticipation + Follow-through）</b>：跳之前先蹲（F2 蓄力），落地後膝蓋微彎（F4 緩衝）。
              少了這兩幀，動作會像紙片滑動。</li>
          <li><b>呼吸是免費的生命感</b>：所有「靜止」動作（idle / think / sleep）都加 1–2 px 的胸口起伏，
              不要做完全靜止的單張 PNG。</li>
        </ul>
      </section>

      <section style={{ marginBottom: 24, padding: 14, background: "#F0F8FF", borderRadius: 10 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>批次生成提示詞模板（給 AI 的 system prompt）</h3>
        <pre style={{ background: "#fff", border: "1px solid #d8e6f5", borderRadius: 6, padding: "10px 12px", fontSize: 11.5, whiteSpace: "pre-wrap", margin: 0 }}>{`你是 desktop pet 角色動畫設計師。請為角色「<NAME>」（風格：<STYLE>）
產出 15 個動作，每動作 2–6 幀，所有幀符合以下硬性規則：

1. 畫布固定 128×128，透明背景（RGBA），無陰影地板，無外框。
2. 角色剪影、配色、線寬、髮型在所有動作的所有幀完全一致。
3. 「站立 / 走路 / 跑步 / 坐下 / 跳舞 / 不耐煩」六個動作，
   角色腳底必須對齊畫布 Y=120 那條線（除明確跳起的單幀外）。
4. 每幀只變動「該動的部位」（嘴 / 眼 / 單腿 / 單手），其餘保持像素一致。
5. 不畫思考泡泡、不畫文字、不畫粒子特效（這些由 app overlay）。

請依下列動作清單依序輸出，每動作各幀獨立檔名 <action>_<frame>.png：
idle(6) walk(4) run(4) sit(4) dance(6) sway(4) stretch(5)
sleep(4) think(4) talk(4) happy(4) sad(3) drag(2) surprised(3) impatient(4)`}</pre>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>動畫名稱對照表</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ACTIONS.map((a) => (
            <code key={a.name} style={{ background: "#f0f0f0", borderRadius: 6, padding: "3px 8px", fontSize: 12 }}>
              {a.name} · {a.zh}
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
