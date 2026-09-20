"""Wireframes for every screen of the Mission Engine (student + teacher).

Screen list is the merged one agreed with Gemini's UX review: 11 student screens
(Briefing folded into the map drawer, situation card as an overlay, consequence
flipping in place, stage check + result on one screen, leaderboard as a report
tab) and 5 teacher screens.

Run:  python build_wireframes.py            (html only)
      python build_wireframes.py --png      (also renders png via headless Chrome)
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wireframe_kit import (ACCENT, ACCENT_SOFT, CANVAS, FILL_SOFT, FILL_SOFTER, FONT_LINK, GOOD,
                           INK, LINE, MONO, MUTED, PAPER, SANS, SERIF, SOFT, Screen, WARN, esc, tw)

OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 1280, 800


# ---------------------------------------------------------------- shared chrome
def mission_chrome(s, mission="SDG 13-1 · Taiwan's Path to Net Zero", stage=3, energy=7, evidence=2,
                   meters=(("排放", 4, ACCENT), ("能源安全", 6, INK), ("經濟", 5, INK))):
    """56px persistent header: exit, stage progress, resources, glossary, audio."""
    s.rect(0, 36, W, 56, CANVAS, None, 0)
    s.line(0, 92, W, 92)
    s.btn(16, 50, 84, 28, "暫停 / 離開", "ghost")
    s.text(112, 62, mission, 12, 600, INK)
    s.text(112, 80, f"Stage {stage}/6 · Problem", 10, 500, SOFT, family=MONO)
    for i in range(6):
        cx = 300 + i * 18
        done, cur = i < stage - 1, i == stage - 1
        s.rect(cx, 72, 12, 6, ACCENT if cur else (INK if done else FILL_SOFT), None, 3)
    s.text(452, 58, "ENERGY", 9, 500, SOFT, family=MONO, ls="0.12em")
    s.text(452, 78, f"⚡ {energy}", 16, 600, INK)
    s.text(528, 58, "EVIDENCE", 9, 500, SOFT, family=MONO, ls="0.12em")
    s.text(528, 78, f"📄 {evidence}", 16, 600, INK)
    x = 628
    for label, val, col in meters:
        s.text(x, 58, label, 10, 500, MUTED)
        s.rect(x, 64, 104, 8, FILL_SOFT, None, 4)
        s.rect(x, 64, max(6, 104 * val / 10), 8, col, None, 4)
        s.text(x + 110, 72, str(val), 10, 600, SOFT, family=MONO)
        x += 132
    s.btn(W - 210, 50, 88, 28, "字彙表", "ghost")
    s.btn(W - 114, 50, 98, 28, "🔊 語音 開", "ghost")


def teacher_chrome(s, active="班級總覽"):
    s.rect(0, 36, 200, H - 36, "#eef0f3", None, 0)
    s.line(200, 36, 200, H)
    s.text(24, 70, "CardLearn", 15, 600, INK)
    s.text(24, 88, "教師後台", 11, 400, SOFT)
    items = ["班級總覽", "學生個人", "單字 / 題目分析", "錄音", "匯出", "題庫（現行）"]
    for i, it in enumerate(items):
        y = 120 + i * 40
        if it == active:
            s.rect(12, y - 20, 176, 32, CANVAS, None, 6)
            s.rect(12, y - 20, 3, 32, ACCENT, None, 2)
        s.text(28, y, it, 12, 600 if it == active else 400, INK if it == active else MUTED)
    s.text(24, H - 40, "教師可見學生真名", 10, 400, SOFT, family=MONO)
    s.rect(200, 36, W - 200, 56, CANVAS, None, 0)
    s.line(200, 92, W, 92)
    s.text(224, 70, active, 16, 600, INK)
    s.btn(W - 260, 50, 112, 30, "2026 秋 · 三年甲班", "ghost")
    s.btn(W - 140, 50, 116, 30, "匯出 CSV", "ghost")


# ---------------------------------------------------------------- student screens
def s01_login():
    s = Screen("s01", "S1 登入與班級代碼", "讓學生用 Email 登入並綁定班級，最短路徑進到 Mission Map。")
    s.browser("cardlearn-sdgs.vercel.app/pages/login.html")
    s.rect(0, 36, 520, H - 36, "#eef0f3", None, 0)
    s.text(56, 150, "CardLearn SDGs", 30, 600, INK, family=SERIF)
    s.text(56, 186, "用英文完成一場 SDGs 演講任務", 15, 400, MUTED)
    for i, t in enumerate(["9 個 SDG 任務 · A2 / B1 / B2 三種難度",
                           "每場 30 分鐘：讀、聽、決策、上台",
                           "手機、平板、電腦都能玩"]):
        s.text(56, 250 + i * 30, "—  " + t, 13, 400, MUTED)
    s.placeholder(56, 380, 408, 220, "插圖：任務地圖預覽")
    s.rect(632, 150, 480, 460, CANVAS, LINE, 10)
    s.text(664, 200, "登入", 20, 600, INK)
    for i, (lab, ph) in enumerate([("Email", "student@example.edu.tw"), ("密碼", "••••••••")]):
        y = 240 + i * 82
        s.text(664, y, lab, 11, 500, MUTED)
        s.rect(664, y + 10, 416, 44, CANVAS, LINE, 6)
        s.text(680, y + 38, ph, 13, 400, SOFT)
    s.text(664, 404, "班級代碼（老師給的，可略過）", 11, 500, MUTED)
    s.rect(664, 414, 416, 44, CANVAS, LINE, 6)
    s.text(680, 442, "C2026A", 13, 400, SOFT, family=MONO)
    s.btn(664, 486, 416, 48, "登入並進入任務地圖")
    s.text(872, 566, "還沒有帳號？註冊（需 Email 驗證）", 12, 400, MUTED, "middle")
    s.note(1, 1096, 436)
    s.note(2, 1096, 510)
    s.notes = [(1, "班級代碼只綁班級，不影響個人資料；沒有代碼也能玩，之後可在設定補填。"),
               (2, "登入後一律直達 Mission Map，不再有中間頁。")]
    s.states = ["錯誤：密碼錯誤時錯誤訊息貼在欄位下方，不跳彈窗。",
                "已登入：自動導向，不顯示此頁。"]
    s.mobile = "單欄；左側說明收成標題 + 一行；表單滿版，按鈕固定在底部安全區上方。"
    return s


def s02_map():
    s = Screen("s02", "S2 Mission Map（含任務簡報抽屜）", "消除選擇焦慮：一眼看到推薦的下一關與 9 個任務的進度。")
    s.browser("cardlearn-sdgs.vercel.app/pages/mission_map.html")
    s.appbar("任務地圖", [("待複習 12 個字", "ghost"), ("我的成就", "ghost")])
    s.text(24, 128, "已解鎖 3 / 9 個任務", 12, 600, INK)
    s.rect(24, 140, 500, 8, FILL_SOFT, None, 4)
    s.rect(24, 140, 166, 8, ACCENT, None, 4)
    s.text(24, 182, "推薦下一關", 11, 500, SOFT, family=MONO)
    groups = [("SDG 4 · 教育", ["4-1 Quality Education", "4-2 Digital Equity"]),
              ("SDG 5 · 性別平權", ["5-1 A Fair World", "5-2 Sports & Media"]),
              ("SDG 13 · 氣候", ["13-1 Net Zero", "13-2 Climate Resilience"]),
              ("SDG 9 · AI 素養", ["9-1 Trust AI", "9-2 Better Prompts", "9-3 Human Edge"])]
    y = 200
    for gname, missions in groups:
        s.text(24, y + 12, gname, 12, 600, MUTED)
        x = 190
        for m in missions:
            active = m.startswith("13-1")
            done = m.startswith("4-1")
            s.rect(x, y - 12, 190, 76, ACCENT_SOFT if active else CANVAS, ACCENT if active else LINE, 8,
                   sw=1.4 if active else 1)
            s.text(x + 14, y + 10, m[:4], 13, 600, ACCENT if active else INK)
            s.text(x + 14, y + 28, m[4:].strip()[:22], 11, 400, SOFT)
            s.text(x + 14, y + 50, ("★★★" if done else ("★☆☆" if active else "☆☆☆")), 12, 600,
                   GOOD if done else SOFT)
            s.text(x + 166, y + 50, "A2 B1 B2", 9, 500, SOFT, "end", MONO)
            x += 206
        y += 100
    s.rect(852, 110, 404, H - 140, CANVAS, LINE, 10)
    s.text(880, 150, "SDG 13-1 · Net Zero", 17, 600, INK)
    s.text(880, 172, "你的角色：城市能源規劃師", 12, 500, ACCENT)
    s.para(880, 202, ["台灣要在 2050 年達成淨零。你要在有限預算下，",
                      "決定先投資哪些能源方案，並在最後用英文",
                      "向市民說明你的理由。"], 12, MUTED, 20)
    s.line(880, 276, 1228, 276)
    s.text(880, 302, "選擇難度", 11, 500, MUTED)
    for i, (lv, desc) in enumerate([("A2", "句子短、提示多"), ("B1", "標準"), ("B2", "有干擾選項")]):
        x = 880 + i * 116
        sel = lv == "B1"
        s.rect(x, 314, 108, 58, ACCENT_SOFT if sel else CANVAS, ACCENT if sel else LINE, 8)
        s.text(x + 54, 340, lv, 15, 600, ACCENT if sel else INK, "middle")
        s.text(x + 54, 358, desc, 10, 400, SOFT, "middle")
    s.text(880, 410, "這一關包含", 11, 500, MUTED)
    for i, t in enumerate(["6 個 Stage · 20 張 slide", "36 個目標單字", "1 次能源投資決策", "約 30 分鐘"]):
        s.text(880, 436 + i * 24, "·  " + t, 12, 400, MUTED)
    s.rect(880, 546, 348, 58, FILL_SOFTER, LINE, 8, dash="4,3")
    s.text(896, 570, "上次進度：Stage 2 未完成", 12, 500, MUTED)
    s.text(896, 590, "可以接續，或重新開始", 11, 400, SOFT)
    s.btn(880, 626, 348, 52, "接續任務 · Stage 2")
    s.btn(880, 690, 348, 40, "從頭開始", "ghost")
    s.note(1, 372, 396)
    s.note(2, 1236, 130)
    s.notes = [(1, "推薦關卡用底色與外框標示，永遠只有一個；其餘任務維持中性樣式。"),
               (2, "Gemini 建議：任務簡報不另開頁，點卡片就從右側滑出抽屜（含難度選擇與開始鈕）。")]
    s.states = ["未解鎖任務：卡片灰階 + 鎖頭，點擊顯示解鎖條件。",
                "全部完成：頂部進度條換成「挑戰更高難度」提示。"]
    s.mobile = "抽屜改為由下往上的 Bottom Sheet；任務卡改單欄列表，分組標題吸頂。"
    return s


def s03_placement():
    s = Screen("s03", "S3 分級前測", "15 分鐘內給出建議難度，同時留下研究用的基準線。")
    s.browser("cardlearn-sdgs.vercel.app/pages/placement.html")
    s.appbar("分級前測", [("稍後再測", "ghost")])
    s.text(24, 128, "第 8 題 / 共 30 題", 12, 600, INK)
    s.rect(24, 140, 1232, 6, FILL_SOFT, None, 3)
    s.rect(24, 140, 328, 6, ACCENT, None, 3)
    s.text(24, 170, "沒有時間限制，不確定就按「跳過」。", 12, 400, SOFT)
    s.rect(240, 200, 800, 420, CANVAS, LINE, 10)
    s.text(272, 244, "READING · 細節", 10, 500, SOFT, family=MONO, ls="0.14em")
    s.para(272, 286, ["In 1990, there were 300,000 births in Taiwan,",
                      "but recently it dropped to under 140,000."], 18, INK, 30, 500)
    s.text(272, 356, "How many births were there recently?", 15, 600, INK)
    for i, (opt, sel) in enumerate([("300,000", False), ("under 140,000", True),
                                    ("30%", False), ("1990", False)]):
        y = 386 + i * 52
        s.rect(272, y, 736, 44, ACCENT_SOFT if sel else CANVAS, ACCENT if sel else LINE, 8)
        s.text(292, y + 28, chr(65 + i), 12, 600, ACCENT if sel else SOFT, family=MONO)
        s.text(320, y + 28, opt, 14, 500 if sel else 400, INK)
    s.btn(240, 650, 380, 52, "下一題")
    s.btn(660, 650, 380, 52, "跳過這題", "ghost")
    s.note(1, 1020, 222)
    s.notes = [(1, "前測題不會出現在遊戲裡（錨題），避免練習效果污染成效比較。")]
    s.states = ["結束頁：顯示建議難度與各技能雷達，學生可自行改級別。",
                "中途離開：進度保留，下次接續。"]
    s.mobile = "題幹與選項同為單欄；下一題按鈕固定底部。"
    return s


def s04_situation():
    s = Screen("s04", "S4 Stage 情境卡（Overlay）", "10 秒內建立角色身分與這個 Stage 的任務目標。")
    s.browser("cardlearn-sdgs.vercel.app/pages/mission.html")
    mission_chrome(s)
    s.rect(0, 92, W, H - 92, "#f0f1f3", None, 0)
    s.placeholder(120, 140, 1040, 560, "下層：卡牌工作台（暫時變暗）")
    s.rect(0, 92, W, H - 92, "#2d3142", None, 0)
    s.body[-1] = s.body[-1].replace('fill="#2d3142"', 'fill="#2d3142" opacity="0.62"')
    s.rect(300, 200, 680, 400, CANVAS, LINE, 12)
    s.text(332, 246, "STAGE 3 / 6 · ACHIEVEMENTS", 10, 500, SOFT, family=MONO, ls="0.14em")
    w = s.chip(332, 262, "你的角色：城市能源規劃師", ACCENT_SOFT, ACCENT, 26)
    s.para(332, 340, ["Taiwan already cut coal use and grew solar power.",
                      "Find the evidence you can quote in your talk."], 21, INK, 34, 500)
    s.text(332, 452, "找出可以引用的三項成果，並收集數據卡。", 13, 400, MUTED)
    s.btn(332, 500, 400, 52, "開始這個 Stage（空白鍵）")
    s.btn(748, 500, 200, 52, "中 / EN 對照", "ghost")
    s.note(1, 960, 216)
    s.note(2, 332, 580)
    s.notes = [(1, "Gemini 建議：情境不另開頁，改成半透明 Overlay，關掉就直接開始，避免多一次換頁。"),
               (2, "永遠可以切中文；A2 預設同時顯示中文一行。")]
    s.states = ["第二次進入同一 Stage：Overlay 縮成一行提示，不再全屏。"]
    s.mobile = "Overlay 改為滿版卡片，按鈕置底。"
    return s


def s05_vocab():
    s = Screen("s05", "S5 單字暖身（3 題）", "先掃除本 Stage 的生詞，用答對換 Energy 建立資源感。")
    s.browser("cardlearn-sdgs.vercel.app/pages/mission.html")
    mission_chrome(s, stage=3, energy=8)
    s.text(24, 126, "單字暖身", 15, 600, INK)
    s.text(110, 126, "第 2 題 / 3", 11, 500, SOFT, family=MONO)
    for i in range(3):
        s.rect(24 + i * 30, 138, 22, 6, ACCENT if i < 2 else FILL_SOFT, None, 3)
    s.rect(160, 176, 420, 420, CANVAS, LINE, 10)
    s.text(192, 244, "efficient", 34, 600, INK)
    s.text(192, 274, "/ɪˈfɪʃ(ə)nt/ · adj. · B1", 12, 400, SOFT, family=MONO)
    s.rect(192, 300, 200, 56, ACCENT_SOFT, ACCENT, 8)
    s.text(292, 334, "🔊 聽發音", 15, 600, ACCENT, "middle")
    s.text(192, 396, "中文", 11, 500, MUTED)
    s.text(192, 420, "有效率的", 16, 600, INK)
    s.text(192, 460, "常見搭配", 11, 500, MUTED)
    s.text(192, 484, "energy efficient · efficient system", 13, 400, MUTED, family=MONO)
    s.rect(620, 176, 500, 420, CANVAS, LINE, 10)
    s.text(652, 216, "把字放回講稿原句", 13, 600, INK)
    s.para(652, 262, ["This STEM solution reduces waste and makes",
                      "our energy system much more ______ ."], 17, INK, 28, 500)
    for i, (opt, state) in enumerate([("efficient", "idle"), ("expensive", "idle"), ("electric", "idle")]):
        y = 344 + i * 62
        s.rect(652, y, 436, 50, CANVAS, LINE, 8)
        s.text(672, y + 31, chr(65 + i), 12, 600, SOFT, family=MONO)
        s.text(700, y + 31, opt, 15, 500, INK)
    s.text(652, 556, "答錯不扣分，會自動加入複習清單。", 11, 400, SOFT)
    s.rect(1000, 110, 232, 44, "#eef5f2", GOOD, 8)
    s.text(1016, 138, "✓  +1 Energy", 14, 600, GOOD)
    s.note(1, 1220, 132)
    s.note(2, 392, 328)
    s.notes = [(1, "答對：綠框 + 卡片微彈 + 「+1 Energy」飛向頂部 HUD（吵雜教室以視覺為主，音效可關）。"),
               (2, "TTS 按鈕做大；語速可切 0.8x / 1.0x。沒有英文語音的裝置改播預先產生的音檔。")]
    s.states = ["答錯：琥珀色外框 + 橫向微震 + 「已加入複習 📋」，不扣分、不擋前進。",
                "全部答完：自動滑入卡牌工作台。"]
    s.mobile = "上下堆疊：單字卡在上、填空與選項在下；選項高度 48px。"
    return s


def s06_cardbuild():
    s = Screen("s06", "S6 卡牌工作台（核心畫面）", "聽讀句子卡並指派到對應的 slide 標題，順手收集數據卡。")
    s.browser("cardlearn-sdgs.vercel.app/pages/mission.html")
    mission_chrome(s, stage=3, energy=8, evidence=2)
    s.text(24, 126, "把句子放進正確的投影片", 15, 600, INK)
    s.text(1256, 126, "Card 3 of 8", 11, 500, SOFT, "end", MONO)
    slots = [("Slide 7", "Government Action", 1, 2),
             ("Slide 8", "Renewable Energy Growth", 0, 2),
             ("Slide 9", "Public Awareness", 1, 1)]
    for i, (num, title, filled, cap) in enumerate(slots):
        x = 24 + i * 306
        active = i == 1
        s.rect(x, 148, 286, 290, ACCENT_SOFT if active else CANVAS, ACCENT if active else LINE, 10,
               dash="5,4" if active else None, sw=1.4 if active else 1)
        s.text(x + 16, 176, num, 10, 500, SOFT, family=MONO, ls="0.12em")
        s.text(x + 16, 200, title, 14, 600, INK)
        s.text(x + 270, 176, f"{filled}/{cap}", 10, 600, ACCENT if active else SOFT, "end", MONO)
        for k in range(filled):
            s.rect(x + 16, 220 + k * 54, 254, 44, "#eef5f2", GOOD, 6)
            s.text(x + 28, 248 + k * 54, "✓ Taiwan set a 2050 net-zero goal…", 11, 400, MUTED)
        if active:
            s.text(x + 143, 330, "放這裡（按 2）", 13, 600, ACCENT, "middle")
    s.rect(942, 148, 314, 290, CANVAS, LINE, 10)
    s.text(958, 176, "數據卡 EVIDENCE", 10, 500, SOFT, family=MONO, ls="0.12em")
    for i, (val, label, got) in enumerate([("300,000 → 140,000", "出生數", True),
                                           ("30%", "城鄉資源差距", True),
                                           ("?", "尚未取得", False)]):
        y = 196 + i * 68
        s.rect(958, y, 282, 56, CANVAS if got else FILL_SOFTER, GOOD if got else LINE, 8,
               dash=None if got else "4,3")
        s.text(974, y + 24, val, 15, 600, INK if got else SOFT, family=MONO)
        s.text(974, y + 44, label, 11, 400, SOFT)
    s.text(958, 424, "數據卡可解鎖更強的決策選項", 10, 400, SOFT)
    s.rect(24, 462, 902, 156, CANVAS, LINE, 10)
    s.text(48, 494, "SENTENCE CARD", 10, 500, SOFT, family=MONO, ls="0.14em")
    w = s.chip(180, 478, "含數據 · 可得 Evidence", "#eef5f2", GOOD, 22)
    s.para(48, 536, ["Renewable energy is growing fast: solar power in Taiwan",
                     "grew to 12 GW, and offshore wind farms keep expanding."], 19, INK, 30, 500)
    s.btn(48, 578, 120, 36, "🔊 重播", "ghost")
    s.btn(176, 578, 120, 36, "語速 0.8x", "ghost")
    s.btn(304, 578, 132, 36, "提示（1 ⚡）", "quiet")
    for i, (num, title) in enumerate([("1", "Government Action"), ("2", "Renewable Growth"), ("3", "Public Awareness")]):
        x = 942 + 0
        y = 462 + i * 54
        s.rect(942, y, 314, 46, CANVAS, ACCENT if i == 1 else LINE, 8, sw=1.4 if i == 1 else 1)
        s.rect(954, y + 11, 24, 24, FILL_SOFT, None, 4)
        s.text(966, y + 28, num, 12, 600, INK, "middle", MONO)
        s.text(990, y + 28, f"放到「{title}」", 13, 500, INK)
    s.text(24, 648, "沒有拖曳：點卡片再點槽位，或直接按鍵盤 1–3。", 12, 500, MUTED)
    s.text(24, 672, "答錯不扣分，該句會回到牌堆並加入複習清單。", 12, 400, SOFT)
    s.note(1, 906, 480)
    s.note(2, 1240, 470)
    s.note(3, 320, 660)
    s.notes = [(1, "句子卡字級 19–20px、一行 ≤ 40 字元；含數字的卡標示「可得 Evidence」，把閱讀動機接到決策。"),
               (2, "Gemini 的關鍵修正：平板拖曳容易失誤，改成「點卡片 → 點槽位 / 按數字鍵」。"),
               (3, "永遠先聽後看不強制；但先聽再指派會多 +1 Talk Strength（有耳機時才提示）。")]
    s.states = ["答對：卡片沿弧線飛進槽位、綠框、槽位計數 +1。",
                "答錯：橫向微震 + 琥珀框 + 「已加入複習」；卡片回牌堆。",
                "槽位滿：外框變實線並鎖定，防止誤點。"]
    s.mobile = "槽位改成頂部水平輪播，句子卡在中間，指派改為底部 Bottom Sheet 的三個大按鈕。"
    return s


def s07_decision():
    s = Screen("s07", "S7 決策卡（Stage 4）與後果", "讀懂三個英文方案，用 Energy 與 Evidence 換取 SDG 指標變化。")
    s.browser("cardlearn-sdgs.vercel.app/pages/mission.html")
    mission_chrome(s, stage=4, energy=6, evidence=3)
    s.text(24, 132, "今年的預算只夠投資兩項。你要先做哪些？", 20, 600, INK)
    s.text(24, 160, "You can fund two of these this year. Read the trade-offs before you choose.", 13, 400, MUTED)
    cards = [
        ("Smart grids", "Use AI to balance the grid and cut waste.", 3, 1, [("排放", -2), ("能源安全", +2), ("經濟", 0)], "ready"),
        ("Carbon capture", "Catch CO2 at factory chimneys and store it.", 4, 2, [("排放", -3), ("能源安全", 0), ("經濟", -1)], "locked"),
        ("Electric scooters", "Swappable batteries for crowded cities.", 2, 0, [("排放", -1), ("能源安全", 0), ("經濟", +2)], "ready"),
    ]
    for i, (title, desc, cost, need, effects, state) in enumerate(cards):
        x = 24 + i * 336
        locked = state == "locked"
        s.rect(x, 200, 316, 404, FILL_SOFTER if locked else CANVAS, LINE, 10)
        s.rect(x, 200, 316, 44, FILL_SOFT if locked else ACCENT_SOFT, None, 10)
        s.rect(x, 232, 316, 12, FILL_SOFTER if locked else CANVAS, None, 0)
        s.text(x + 16, 228, f"⚡ {cost}", 13, 600, SOFT if locked else ACCENT)
        s.text(x + 300, 228, f"需要 📄 {need}" if need else "無門檻", 11, 500, SOFT, "end")
        s.text(x + 16, 280, title, 17, 600, SOFT if locked else INK)
        cut = desc.rfind(" ", 0, 36)
        s.para(x + 16, 312, [desc[:cut], desc[cut + 1:]], 13, MUTED, 20)
        s.line(x + 16, 366, x + 300, 366)
        s.text(x + 16, 392, "預期影響", 11, 500, MUTED)
        for k, (label, delta) in enumerate(effects):
            y = 418 + k * 26
            s.text(x + 16, y, label, 12, 400, MUTED)
            col = GOOD if (delta < 0 and label == "排放") or (delta > 0 and label != "排放") else (SOFT if delta == 0 else WARN)
            arrow = "▼" if delta < 0 else ("▲" if delta > 0 else "—")
            s.text(x + 300, y, f"{arrow} {abs(delta) if delta else ''}", 12, 600, col, "end")
        if locked:
            s.rect(x + 16, 508, 284, 44, FILL_SOFT, None, 8)
            s.text(x + 158, 536, "需要 2 張數據卡才能解鎖", 12, 600, SOFT, "middle")
            s.text(x + 158, 574, "回到 Stage 3 收集排放數據", 11, 400, SOFT, "middle")
        else:
            s.btn(x + 16, 508, 284, 44, "選這個方案")
            s.text(x + 158, 574, "選擇後會立刻看到後果", 11, 400, SOFT, "middle")
    s.rect(24, 624, 1232, 96, CANVAS, LINE, 10, dash="5,4")
    s.text(48, 654, "選擇後：卡片原地翻面 → 顯示後果敘述 → 三個指標動畫變化（不換頁）", 13, 600, INK)
    s.text(48, 680, "例：You funded smart grids. Peak-hour blackouts fell, but factories complained about the cost.",
           12, 400, MUTED)
    s.text(48, 702, "排放 ▼2 · 能源安全 ▲2 · 經濟 —", 12, 600, ACCENT)
    s.note(1, 664, 252)
    s.note(2, 1240, 640)
    s.notes = [(1, "鎖定條件寫在卡面上，讓 Stage 3 的努力與這裡的收益產生因果連結（Gemini 指出的重點）。"),
               (2, "後果就地翻面，不另開頁；指標變化用填色條掃過 + 浮動標籤 1.2 秒。")]
    s.states = ["Energy 不足：便宜方案仍可選，昂貴方案顯示「Energy 不足」。",
                "Stage 5 事件卡沿用同一版面，只有兩個選項。"]
    s.mobile = "三張卡改為垂直堆疊，可左右滑動；影響區固定在卡片底部。"
    return s


def s08_check():
    s = Screen("s08", "S8 Stage 小測與結算（同一頁）", "兩題檢查理解，答完就地解鎖 slide 並給下一步。")
    s.browser("cardlearn-sdgs.vercel.app/pages/mission.html")
    mission_chrome(s, stage=3, energy=9, evidence=3)
    s.text(24, 128, "Stage 小測", 15, 600, INK)
    s.text(110, 128, "2 題 · 答對加 Talk Strength", 11, 400, SOFT)
    s.rect(24, 152, 760, 150, CANVAS, LINE, 10)
    s.text(48, 182, "Q1 · 理解", 10, 500, SOFT, family=MONO, ls="0.14em")
    s.text(48, 212, "Why does Taiwan need smart grids?", 15, 600, INK)
    s.rect(48, 232, 712, 44, "#eef5f2", GOOD, 8)
    s.text(68, 260, "✓  To manage electricity and reduce waste", 14, 500, INK)
    s.text(48, 292, "答對 · +1 Talk Strength", 11, 500, GOOD)
    s.rect(24, 318, 760, 286, CANVAS, ACCENT, 10, sw=1.4)
    s.text(48, 348, "Q2 · 語言形式（Part 5 條件句）", 10, 500, ACCENT, family=MONO, ls="0.14em")
    s.text(48, 380, "If we don't fix the grid, blackouts ______ more often.", 16, 600, INK)
    for i, opt in enumerate(["will happen", "happened", "are happening"]):
        y = 404 + i * 56
        s.rect(48, y, 712, 46, CANVAS, LINE, 8)
        s.text(68, y + 29, chr(65 + i), 12, 600, SOFT, family=MONO)
        s.text(96, y + 29, opt, 15, 400, INK)
    s.text(48, 588, "這一題對應 Part 5 的語言功能：用條件句推論後果。", 11, 400, SOFT)
    s.rect(808, 152, 448, 452, CANVAS, LINE, 10)
    s.text(836, 186, "Stage 3 結算", 16, 600, INK)
    s.placeholder(836, 206, 392, 150, "解鎖的 slide 縮圖：Renewable Energy Growth")
    for i, (label, val) in enumerate([("Talk Strength", "+2 ★"), ("Evidence", "+1 📄"), ("Energy", "+3 ⚡（下個 Stage）")]):
        y = 396 + i * 34
        s.text(836, y, label, 12, 400, MUTED)
        s.text(1228, y, val, 13, 600, INK, "end")
    s.line(836, 500, 1228, 500)
    s.text(836, 528, "已加入複習：efficient、grid", 12, 500, MUTED)
    s.btn(836, 546, 392, 48, "前往 Stage 4 · 決策")
    s.note(1, 800, 168)
    s.note(2, 1240, 560)
    s.notes = [(1, "Gemini 建議合併：小測與結算同頁，右欄即時更新，不再多一次換頁。"),
               (2, "結算只講三件事：解鎖了什麼、拿到什麼、下一步是什麼。不列秒數與點擊數。")]
    s.states = ["兩題都答完才顯示「前往下一個 Stage」；答錯不擋，只加入複習。",
                "第 6 個 Stage 完成後，按鈕變成「進入 Showtime」。"]
    s.mobile = "右欄結算移到題目下方，隨答題即時展開。"
    return s


def s09_showtime():
    s = Screen("s09", "S9 Showtime（20 秒節奏 + 錄音）", "用真實 Pecha Kucha 節奏講完自己組出來的演講。")
    s.browser("cardlearn-sdgs.vercel.app/pages/showtime.html")
    s.rect(0, 36, W, H - 36, "#1f2230", None, 0)
    s.text(24, 70, "Showtime · SDG 13-1", 13, 600, "#f5f5f5")
    s.text(1256, 70, "Slide 7 / 20", 12, 500, "#aab0bd", "end", MONO)
    s.rect(140, 96, 1000, 496, "#2b2f3d", "#3b4050", 10)
    s.text(180, 160, "Renewable Energy Growth", 30, 600, "#ffffff", family=SERIF)
    s.placeholder(180, 190, 920, 250, "")
    s.body[-1] = s.body[-1].replace(f'fill="{FILL_SOFTER}"', 'fill="#333848"').replace(f'stroke="{LINE}"', 'stroke="#454b5e"')
    s.text(640, 320, "投影片視覺（教材圖或 SDG 圖示）", 12, 400, "#8891a3", "middle", MONO)
    s.rect(180, 462, 920, 100, "#242837", None, 8)
    s.text(200, 494, "提詞機", 10, 500, "#7a8399", family=MONO, ls="0.14em")
    s.text(200, 524, "Renewable energy is growing fast: solar power grew to 12 GW,", 17, 500, "#ffffff")
    s.text(200, 548, "and offshore wind farms keep expanding.", 17, 500, "#8891a3")
    s.body.append(f'<circle cx="228" cy="660" r="44" fill="none" stroke="#3b4050" stroke-width="8"/>')
    s.body.append(f'<path d="M228 616 A44 44 0 1 1 186 672" fill="none" stroke="{ACCENT}" stroke-width="8" stroke-linecap="round"/>')
    s.text(228, 668, "12s", 18, 600, "#ffffff", "middle", MONO)
    s.text(228, 726, "這張還有", 11, 400, "#8891a3", "middle")
    s.rect(300, 620, 420, 80, "#242837", None, 10)
    s.text(320, 648, "錄音中", 12, 600, ACCENT)
    s.body.append('<path d="M320 676 l10 -14 l10 26 l10 -32 l10 22 l10 -18 l10 24 l10 -28 l10 16 l10 -10 l10 18 l10 -22 l10 12" '
                  'fill="none" stroke="#8891a3" stroke-width="2"/>')
    s.text(700, 648, "01:42", 13, 500, "#aab0bd", "end", MONO)
    s.text(700, 676, "語速 118 wpm", 11, 400, "#8891a3", "end", MONO)
    s.rect(740, 620, 150, 80, "#242837", None, 10)
    s.text(815, 654, "⏸", 22, 600, "#ffffff", "middle")
    s.text(815, 682, "暫停", 11, 400, "#aab0bd", "middle")
    s.rect(906, 620, 150, 80, "#242837", None, 10)
    s.text(981, 654, "⏭", 22, 600, "#ffffff", "middle")
    s.text(981, 682, "下一張", 11, 400, "#aab0bd", "middle")
    s.rect(1072, 620, 168, 80, "#242837", None, 10)
    s.text(1156, 654, "🎙 關閉錄音", 13, 600, "#ffffff", "middle")
    s.text(1156, 682, "改成靜音排練", 11, 400, "#aab0bd", "middle")
    s.note(1, 268, 612)
    s.note(2, 1240, 604)
    s.notes = [(1, "Gemini 的提醒：一定要有暫停鍵。20 秒到了不強制切頁，只提示「可以進下一張」。"),
               (2, "沒有麥克風或不想錄音：切成靜音排練，完成後用 3 題自評，仍可完成任務。")]
    s.states = ["錄音權限被拒：直接切靜音排練模式，不顯示錯誤彈窗。",
                "錄完：上傳（永久保存）並顯示時長與語速；教師端可聽。"]
    s.mobile = "橫向優先；直向時投影片在上、控制列在下，提詞機字級不縮。"
    return s


def s10_report():
    s = Screen("s10", "S10 Mission 報告（含排行榜分頁）", "揭曉結局、指出弱點，然後把學生推向複習。")
    s.browser("cardlearn-sdgs.vercel.app/pages/mission_report.html")
    s.appbar("任務報告 · SDG 13-1", [("回任務地圖", "ghost")])
    for i, (t, sel) in enumerate([("結果", True), ("排行榜", False), ("成就", False)]):
        x = 24 + i * 110
        s.text(x + 40, 124, t, 13, 600 if sel else 400, INK if sel else MUTED, "middle")
        if sel:
            s.rect(x, 134, 80, 3, ACCENT, None, 2)
    s.line(24, 137, 1256, 137)
    s.rect(24, 160, 560, 440, CANVAS, LINE, 10)
    s.placeholder(56, 192, 496, 180, "結局插圖：穩健轉型的城市")
    s.text(56, 408, "ENDING 2 / 3", 10, 500, SOFT, family=MONO, ls="0.14em")
    s.text(56, 438, "穩健轉型", 24, 600, INK, family=SERIF)
    s.para(56, 470, ["你把預算放在智慧電網與電動運輸，排放下降，",
                     "但產業轉型的成本讓部分企業抱怨。",
                     "2030 年的台北，空氣變好了，電價也高了一點。"], 13, MUTED, 22)
    for i, (label, val, col) in enumerate([("排放", 3, GOOD), ("能源安全", 7, INK), ("經濟", 5, INK)]):
        y = 548 + i * 0
        x = 56 + i * 170
        s.text(x, 546, label, 11, 500, MUTED)
        s.rect(x, 554, 140, 8, FILL_SOFT, None, 4)
        s.rect(x, 554, 140 * val / 10, 8, col, None, 4)
        s.text(x, 580, f"{val}/10", 10, 500, SOFT, family=MONO)
    s.rect(608, 160, 648, 200, CANVAS, LINE, 10)
    s.text(640, 196, "Talk Strength", 12, 500, MUTED)
    s.text(640, 232, "★★★★☆", 26, 600, ACCENT)
    s.text(800, 232, "A 級 · 共 18 / 24 分", 14, 500, INK)
    s.para(640, 268, ["六段結構都完成了，轉折詞用得不錯；",
                      "數據引用還可以再精準一點。"], 13, MUTED, 22)
    s.rect(608, 376, 648, 224, CANVAS, LINE, 10)
    s.text(640, 412, "這場的弱點", 12, 500, MUTED)
    for i, (skill, val, col) in enumerate([("Reading 細節", 60, WARN), ("Vocabulary", 80, INK), ("Language pattern", 90, GOOD)]):
        y = 440 + i * 34
        s.text(640, y, skill, 12, 400, MUTED)
        s.rect(800, y - 9, 300, 8, FILL_SOFT, None, 4)
        s.rect(800, y - 9, 300 * val / 100, 8, col, None, 4)
        s.text(1224, y, f"{val}%", 11, 600, INK, "end", MONO)
    s.text(640, 560, "最常錯的字：efficient · grid · capture", 12, 500, MUTED)
    s.btn(608, 624, 400, 56, "開始針對性複習（8 分鐘）")
    s.btn(1024, 624, 232, 56, "用 B2 再挑戰", "ghost")
    s.text(24, 640, "下一個推薦任務：SDG 13-2 氣候韌性", 12, 500, MUTED)
    s.text(24, 664, "本關排行榜（匿名）：你在前 25%", 12, 400, SOFT)
    s.note(1, 1240, 176)
    s.note(2, 1024, 612)
    s.notes = [(1, "只留三件事：結局、實力、弱點。不列秒數、點擊數等沒有行動意義的統計。"),
               (2, "主要 CTA 永遠是複習；排行榜被降級成分頁，避免競爭壓過學習。")]
    s.states = ["未完成即離開：報告顯示「未完成」，仍給弱點與複習入口。",
                "同一關重玩：顯示與上次的差異（進步幅度）。"]
    s.mobile = "單欄：結局 → 實力 → 弱點 → CTA；排行榜分頁維持。"
    return s


def s11_review():
    s = Screen("s11", "S11 個人化複習路徑", "8 分鐘的微複習：弱點 → 單字 → 迷你挑戰，過關才回遊戲。")
    s.browser("cardlearn-sdgs.vercel.app/pages/review.html")
    s.appbar("針對性複習", [("稍後再做", "ghost")])
    s.text(24, 128, "系統判斷：Reading 細節是這場最弱的一項（60%）", 13, 600, INK)
    s.text(24, 152, "預估 8 分鐘 · 完成可獲得 1 張 Evidence 帶進下一場", 12, 400, SOFT)
    steps = [("1", "弱點回顧", "重讀有數據的兩張 slide，附中文註解", "open"),
             ("2", "單字複習", "efficient · grid · capture（Leitner 第 1 格）", "next"),
             ("3", "迷你挑戰", "5 題混合題，答對 4 題過關", "locked")]
    y = 196
    for num, title, desc, state in steps:
        open_ = state == "open"
        h = 300 if open_ else 84
        s.rect(280, y, 720, h, CANVAS, ACCENT if open_ else LINE, 10, sw=1.4 if open_ else 1)
        s.body.append(f'<circle cx="316" cy="{y + 42}" r="16" fill="{ACCENT if open_ else FILL_SOFT}"/>')
        s.text(316, y + 47, num, 13, 600, "#ffffff" if open_ else SOFT, "middle", MONO)
        s.text(348, y + 38, title, 15, 600, INK if open_ or state == "next" else SOFT)
        s.text(348, y + 60, desc, 12, 400, SOFT)
        if state == "locked":
            s.text(972, y + 48, "🔒", 14, 400, SOFT, "end")
        if state == "next":
            s.text(972, y + 48, "接下來", 11, 500, SOFT, "end")
        if open_:
            s.rect(316, y + 88, 652, 120, FILL_SOFTER, LINE, 8)
            s.text(336, y + 116, "原句", 10, 500, SOFT, family=MONO, ls="0.12em")
            s.text(336, y + 144, "Solar power grew to 12 GW, and offshore wind keeps expanding.", 15, 500, INK)
            s.text(336, y + 172, "太陽能達到 12 GW，離岸風電持續擴張。", 12, 400, MUTED)
            s.text(316, y + 238, "剛才你把「12 GW」看成了成本數字。這一題再試一次：", 12, 400, MUTED)
            s.btn(316, y + 252, 300, 40, "再試一次這一題")
            s.btn(632, y + 252, 160, 40, "我懂了", "ghost")
        y += h + 16
    s.note(1, 1012, 238)
    s.notes = [(1, "Gemini 的提醒：不要把所有錯題打包成一張長考卷；一次只展開一步，過了才往下。")]
    s.states = ["迷你挑戰沒過：回到步驟 1，但題目換一組，不重複同一題。",
                "全部完成：回到任務地圖並帶著 +1 Evidence。"]
    s.mobile = "步驟卡滿版；展開的練習題佔整個視窗高度。"
    return s


# ---------------------------------------------------------------- teacher screens
def t01_class():
    s = Screen("t01", "T1 班級總覽", "巡堂 5 秒內看出誰卡住、全班共同的弱點是什麼。", actor="teacher")
    s.browser("cardlearn-sdgs.vercel.app/pages/teacher_dashboard.html#class")
    teacher_chrome(s, "班級總覽")
    kpis = [("上線中", "23 / 30"), ("平均進度", "Stage 3.4"), ("平均 Talk Strength", "3.6 ★"), ("卡關警示", "4 人")]
    for i, (label, val) in enumerate(kpis):
        x = 224 + i * 198
        s.rect(x, 116, 190, 84, CANVAS, LINE, 10)
        s.text(x + 16, 146, label, 11, 500, MUTED)
        s.text(x + 16, 178, val, 20, 600, ACCENT if label == "卡關警示" else INK)
    s.text(224, 234, "學生進度（依停留時間排序）", 13, 600, INK)
    s.btn(608, 216, 96, 28, "依姓名", "ghost")
    s.btn(712, 216, 96, 28, "依進度", "ghost")
    names = [("王小明", "Stage 3", "卡 8 分鐘", "warn"), ("李佳穎", "Stage 5", "順利", "ok"),
             ("陳建宏", "Stage 2", "卡 12 分鐘", "warn"), ("林宜蓁", "Showtime", "錄音中", "ok"),
             ("張雅婷", "Stage 4", "順利", "ok"), ("黃冠廷", "未開始", "未登入", "off"),
             ("吳思妤", "Stage 6", "順利", "ok"), ("鄭承翰", "Stage 3", "重試 3 次", "warn")]
    for i, (name, stage, note, st) in enumerate(names):
        x = 224 + (i % 4) * 196
        y = 260 + (i // 4) * 104
        col = {"warn": WARN, "ok": GOOD, "off": SOFT}[st]
        s.rect(x, y, 184, 88, CANVAS, LINE, 8)
        s.body.append(f'<circle cx="{x + 18}" cy="{y + 24}" r="5" fill="{col}"/>')
        s.text(x + 32, y + 28, name, 13, 600, INK)
        s.text(x + 16, y + 52, stage, 11, 500, MUTED, family=MONO)
        s.text(x + 16, y + 72, note, 11, 400, col)
    s.rect(224, 484, 784, 120, CANVAS, LINE, 10)
    s.text(248, 514, "課堂提示", 12, 600, INK)
    s.text(248, 542, "· 全班最常錯的字：efficient（62%）、capture（54%）、grid（41%）", 12, 400, MUTED)
    s.text(248, 566, "· 最常錯的題型：Part 5 條件句（58%）——建議上課帶一次", 12, 400, MUTED)
    s.btn(224, 624, 240, 44, "全班暫停並廣播")
    s.btn(480, 624, 200, 44, "開啟班級排行榜", "ghost")
    s.rect(1032, 116, 224, 552, CANVAS, LINE, 10)
    s.text(1056, 146, "需要關注", 12, 600, INK)
    for i, (n, why) in enumerate([("陳建宏", "同一張卡錯 4 次"), ("王小明", "8 分鐘沒有動作"),
                                  ("鄭承翰", "連續 3 場低於 60%"), ("黃冠廷", "本週未登入")]):
        y = 180 + i * 72
        s.rect(1056, y, 176, 56, "#fdf6ee", WARN, 8)
        s.text(1072, y + 24, n, 12, 600, INK)
        s.text(1072, y + 42, why, 11, 400, MUTED)
    s.text(1056, 520, "教師可見真名；研究匯出一律去識別化。", 11, 400, SOFT)
    s.note(1, 1246, 132)
    s.notes = [(1, "重點是「誰需要幫忙」，不是資料表；警示卡片永遠固定在右欄。")]
    s.states = ["未開課：顯示班級代碼與加入人數。", "排行榜預設關閉，老師按下才開。"]
    s.mobile = "教師端以平板橫向為主；直向時警示欄移到最上方。"
    return s


def t02_student():
    s = Screen("t02", "T2 學生個人頁", "看一個學生的技能、任務歷程與錄音。", actor="teacher")
    s.browser("cardlearn-sdgs.vercel.app/pages/teacher_dashboard.html#student")
    teacher_chrome(s, "學生個人")
    s.text(224, 128, "王小明", 22, 600, INK)
    s.text(300, 128, "三年甲班 · 目前級別 B1 · 最近上線 10 分鐘前", 12, 400, SOFT)
    s.rect(224, 152, 500, 300, CANVAS, LINE, 10)
    s.text(248, 184, "六項技能", 12, 600, INK)
    skills = [("Vocabulary", 80), ("Reading", 60), ("Listening", 72), ("Discourse", 68),
              ("Language pattern", 90), ("Speaking", 55)]
    for i, (k, v) in enumerate(skills):
        y = 216 + i * 36
        s.text(248, y, k, 12, 400, MUTED)
        s.rect(420, y - 9, 240, 8, FILL_SOFT, None, 4)
        s.rect(420, y - 9, 240 * v / 100, 8, WARN if v < 65 else INK, None, 4)
        s.text(700, y, f"{v}%", 11, 600, INK, "end", MONO)
    s.rect(748, 152, 508, 300, CANVAS, LINE, 10)
    s.text(772, 184, "任務歷程", 12, 600, INK)
    for i, (m, lv, res, when) in enumerate([("13-1 Net Zero", "B1", "穩健轉型 · ★★★★☆", "今天"),
                                            ("4-1 Quality Education", "B1", "★★★☆☆", "上週"),
                                            ("9-1 Trust AI", "A2", "★★★★★", "上週")]):
        y = 216 + i * 72
        s.rect(772, y - 6, 460, 60, FILL_SOFTER, None, 8)
        s.text(788, y + 18, m, 13, 600, INK)
        s.text(788, y + 38, f"{lv} · {res}", 11, 400, MUTED)
        s.text(1216, y + 18, when, 11, 400, SOFT, "end")
    s.rect(224, 476, 1032, 192, CANVAS, LINE, 10)
    s.text(248, 508, "最近錯題與錄音", 12, 600, INK)
    for i, (item, detail) in enumerate([("Part 5 條件句", "錯 3 次 · 最後答對"),
                                        ("efficient（單字）", "Leitner 第 1 格"),
                                        ("Showtime 錄音 · Slide 7", "01:42 · 118 wpm")]):
        y = 540 + i * 40
        s.text(248, y, item, 12, 500, INK)
        s.text(560, y, detail, 12, 400, MUTED)
        if "錄音" in item:
            s.btn(1100, y - 20, 132, 30, "▶ 播放", "ghost")
    s.notes = [(1, "教師端顯示真名，匯出研究檔時換成匿名 ID。")]
    s.note(1, 700, 140)
    s.states = ["學生無錄音：該區顯示「尚未錄音」。"]
    s.mobile = "三塊區域改為垂直堆疊。"
    return s


def t03_analysis():
    s = Screen("t03", "T3 單字與題目分析", "找出全班共同的弱點，以及該退役的題目。", actor="teacher")
    s.browser("cardlearn-sdgs.vercel.app/pages/teacher_dashboard.html#analysis")
    teacher_chrome(s, "單字 / 題目分析")
    s.text(224, 128, "單字弱點 Top 10", 13, 600, INK)
    s.rect(224, 148, 620, 480, CANVAS, LINE, 10)
    heads = ["單字", "錯誤率", "出現在", "動作"]
    for i, hd in enumerate(heads):
        s.text(248 + i * 150, 178, hd, 11, 500, SOFT, family=MONO)
    s.line(248, 190, 820, 190)
    rows = [("efficient", "62%", "13-1 Stage 3", "加入全班複習"),
            ("capture", "54%", "13-1 Stage 4", "加入全班複習"),
            ("subsidy", "51%", "4-1 Stage 3", "加入全班複習"),
            ("stereotype", "47%", "5-1 Stage 5", "—"),
            ("hallucination", "44%", "9-1 Stage 2", "—")]
    for i, r in enumerate(rows):
        y = 220 + i * 46
        for k, cell in enumerate(r):
            col = WARN if k == 1 and int(r[1][:-1]) > 50 else (ACCENT if k == 3 and cell != "—" else MUTED)
            s.text(248 + k * 150, y, cell, 12, 600 if k == 0 else 400, INK if k == 0 else col,
                   family=MONO if k == 1 else SANS)
        s.line(248, y + 14, 820, y + 14, "#eceef1")
    s.text(868, 128, "題目健康度", 13, 600, INK)
    s.rect(868, 148, 388, 480, CANVAS, LINE, 10)
    for i, (label, n, tone) in enumerate([("太難（答對率 < 30%）", "6 題", WARN),
                                          ("太簡單（> 90%）", "11 題", SOFT),
                                          ("鑑別度低", "3 題", WARN),
                                          ("待審核的 AI 草稿", "24 題", ACCENT)]):
        y = 188 + i * 92
        s.rect(892, y, 340, 68, FILL_SOFTER, LINE, 8)
        s.text(912, y + 28, label, 12, 500, INK)
        s.text(1212, y + 28, n, 14, 600, tone, "end", MONO)
        s.text(912, y + 50, "點擊查看題目清單", 11, 400, SOFT)
    s.btn(868, 640, 388, 44, "審核 AI 草稿題目")
    s.note(1, 836, 164)
    s.notes = [(1, "AI 產生的題目一律先進「草稿」，教師按過才會出現在遊戲裡。")]
    s.states = ["資料不足（< 30 次作答）時顯示「樣本不足」而不是假的百分比。"]
    s.mobile = "表格改為卡片列表。"
    return s


def t04_recordings():
    s = Screen("t04", "T4 錄音清單", "聽學生的 Showtime 錄音並給分。", actor="teacher")
    s.browser("cardlearn-sdgs.vercel.app/pages/teacher_dashboard.html#recordings")
    teacher_chrome(s, "錄音")
    s.text(224, 128, "Showtime 錄音 · 本週 34 筆", 13, 600, INK)
    s.btn(1000, 112, 120, 30, "只看未評分", "ghost")
    s.btn(1128, 112, 128, 30, "下載全部", "ghost")
    for i, (name, mission, slide, dur, wpm, score) in enumerate([
            ("王小明", "13-1", "Slide 7", "01:42", "118 wpm", None),
            ("李佳穎", "13-1", "全場", "06:38", "132 wpm", 3),
            ("陳建宏", "4-1", "Slide 3", "00:22", "96 wpm", None),
            ("林宜蓁", "9-1", "全場", "04:05", "124 wpm", 2)]):
        y = 168 + i * 116
        s.rect(224, y, 1032, 100, CANVAS, LINE, 10)
        s.text(248, y + 32, name, 14, 600, INK)
        s.text(248, y + 56, f"{mission} · {slide}", 11, 400, SOFT, family=MONO)
        s.body.append(f'<path d="M360 {y + 50} ' + " ".join(
            f"l6 {-14 if k % 3 else 10} l6 {12 if k % 2 else -10}" for k in range(16)) +
            f'" fill="none" stroke="#c9ccd4" stroke-width="2"/>')
        s.btn(776, y + 34, 90, 32, "▶ 播放", "ghost")
        s.text(890, y + 40, dur, 12, 500, MUTED, family=MONO)
        s.text(956, y + 40, wpm, 12, 400, SOFT, family=MONO)
        if score:
            s.chip(1060, y + 26, f"已評 {score} 分", "#eef5f2", GOOD, 26)
        else:
            s.btn(1060, y + 26, 172, 40, "評分 1 / 2 / 3", "ghost")
    s.text(224, 660, "錄音永久保存（你的決定 D9）；學生可在設定頁要求刪除自己的錄音。", 11, 400, SOFT)
    s.note(1, 1246, 184)
    s.notes = [(1, "AI 自動評分未啟用時，這裡只顯示時長與語速；設定 AI_API_KEY 後才會多一欄建議分數。")]
    s.states = ["檔案損毀或格式不支援：顯示下載連結而不是壞掉的播放器。"]
    s.mobile = "每筆錄音改為兩行卡片，播放鍵放大。"
    return s


def t05_export():
    s = Screen("t05", "T5 匯出", "把資料帶走：教學用含姓名，研究用去識別化。", actor="teacher")
    s.browser("cardlearn-sdgs.vercel.app/pages/teacher_dashboard.html#export")
    teacher_chrome(s, "匯出")
    s.rect(224, 128, 640, 420, CANVAS, LINE, 10)
    s.text(248, 162, "要匯出什麼", 13, 600, INK)
    opts = [("班級成績總表（含姓名）", "CSV · 每人一列", True),
            ("逐題作答紀錄", "CSV · 每題一列，含作答時間", True),
            ("遊戲決策與結局", "CSV · 每場一列", False),
            ("學習事件日誌", "JSONL · 研究用，量大", False),
            ("錄音檔", "ZIP · 依學生分資料夾", False)]
    for i, (label, desc, on) in enumerate(opts):
        y = 196 + i * 62
        s.rect(248, y, 24, 24, ACCENT if on else CANVAS, ACCENT if on else LINE, 4)
        if on:
            s.text(260, y + 17, "✓", 13, 700, "#ffffff", "middle")
        s.text(288, y + 12, label, 13, 500, INK)
        s.text(288, y + 32, desc, 11, 400, SOFT)
    s.line(248, 508, 840, 508)
    s.rect(224, 568, 640, 100, CANVAS, LINE, 10)
    s.text(248, 600, "去識別化", 12, 600, INK)
    s.text(248, 626, "研究用匯出會把姓名換成該研究專用的雜湊 ID，", 12, 400, MUTED)
    s.text(248, 648, "並移除 Email、班級代碼與錄音檔名中的姓名。", 12, 400, MUTED)
    s.rect(888, 128, 368, 300, CANVAS, LINE, 10)
    s.text(912, 162, "範圍", 13, 600, INK)
    for i, (label, val) in enumerate([("班級", "三年甲班"), ("期間", "2026-09-01 ～ 今天"), ("任務", "全部 9 個")]):
        y = 200 + i * 62
        s.text(912, y, label, 11, 500, MUTED)
        s.rect(912, y + 10, 320, 40, CANVAS, LINE, 6)
        s.text(928, y + 36, val, 12, 400, INK)
    s.btn(888, 448, 368, 52, "產生並下載")
    s.text(888, 524, "上次匯出：2026-09-13 · 由你", 11, 400, SOFT)
    s.note(1, 856, 588)
    s.notes = [(1, "教學用與研究用是兩個按鈕，避免不小心把姓名帶進研究檔。")]
    s.states = ["資料量大時：背景產生，完成後寄連結到教師 Email。"]
    s.mobile = "選項改為單欄核取清單。"
    return s


SCREENS = [s01_login, s02_map, s03_placement, s04_situation, s05_vocab, s06_cardbuild,
           s07_decision, s08_check, s09_showtime, s10_report, s11_review,
           t01_class, t02_student, t03_analysis, t04_recordings, t05_export]


# ---------------------------------------------------------------- pages
CSS = f"""
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{background:{PAPER};color:{INK};font-family:{SANS};line-height:1.6}}
.wrap{{max-width:1360px;margin:0 auto;padding:3rem 1.5rem 4rem}}
.eyebrow{{font:500 .66rem {MONO};letter-spacing:.18em;text-transform:uppercase;color:{MUTED};margin-bottom:.5rem}}
h1{{font:400 clamp(1.6rem,2.4vw + .8rem,2.2rem)/1.15 {SERIF};margin-bottom:.75rem}}
h2{{font:400 1.45rem/1.25 {SERIF};margin-bottom:.35rem}}
.sub{{color:{MUTED};max-width:64ch;margin-bottom:1.5rem}}
section{{padding:2.25rem 0;border-bottom:1px solid rgba(45,49,66,.12)}}
.job{{color:{MUTED};margin-bottom:1rem}}
.fig{{overflow-x:auto;border:1px solid rgba(45,49,66,.12);border-radius:8px;background:{CANVAS}}}
.fig svg{{display:block;min-width:1100px;width:100%}}
.meta{{display:grid;grid-template-columns:1.2fr 1fr;gap:1.5rem;margin-top:1rem}}
.meta h3{{font:600 .8rem {SANS};letter-spacing:.02em;margin-bottom:.4rem}}
.meta ol,.meta ul{{color:{MUTED};font-size:.86rem;padding-left:1.1rem}}
.meta li{{margin-bottom:.3rem}}
.tag{{display:inline-block;font:500 .66rem {MONO};letter-spacing:.14em;text-transform:uppercase;
  color:{SOFT};border:1px solid rgba(45,49,66,.18);border-radius:3px;padding:.15rem .45rem;margin-left:.5rem}}
.toc{{list-style:none;display:grid;grid-template-columns:repeat(2,1fr);gap:.25rem 2rem;
  padding:1rem 0;border-top:1px solid rgba(45,49,66,.12);border-bottom:1px solid rgba(45,49,66,.12);margin-bottom:2rem}}
.toc a{{color:{INK};text-decoration:none;font-size:.9rem}} .toc a:hover{{color:{ACCENT}}}
footer{{margin-top:2rem;font:400 .7rem {MONO};color:{SOFT}}}
@media(max-width:820px){{.meta,.toc{{grid-template-columns:1fr}}}}
"""


def page_all(screens):
    toc = "".join(f'<li><a href="#{s.sid}">{esc(s.title)}</a></li>' for s in screens)
    secs = []
    for s in screens:
        notes = "".join(f"<li>{esc(t)}</li>" for _, t in s.notes)
        states = "".join(f"<li>{esc(t)}</li>" for t in s.states)
        secs.append(f"""
<section id="{s.sid}">
  <h2>{esc(s.title)}<span class="tag">{'teacher' if s.actor == 'teacher' else 'student'}</span></h2>
  <p class="job">{esc(s.job)}</p>
  <div class="fig">{s.svg()}</div>
  <div class="meta">
    <div><h3>標註說明</h3><ol>{notes}</ol></div>
    <div><h3>狀態與邊界</h3><ul>{states}<li>手機／平板：{esc(s.mobile)}</li></ul></div>
  </div>
</section>""")
    return f"""<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mission Engine UI/UX 線框圖</title><link href="{FONT_LINK}" rel="stylesheet"><style>{CSS}</style></head>
<body><main class="wrap">
<p class="eyebrow">UI/UX Wireframes · v1 · 待審</p>
<h1>Mission Engine 每一個畫面</h1>
<p class="sub">11 個學生畫面 + 5 個教師畫面，1280×800 桌機版。畫面清單已依 Gemini 的 UX 審查合併：
任務簡報收進地圖抽屜、情境卡改成 Overlay、決策後果就地翻面、小測與結算同頁、排行榜降級為報告分頁。</p>
<ul class="toc">{toc}</ul>
{''.join(secs)}
<footer>Generated by docs/ux/build_wireframes.py · 2026-09-20</footer>
</main></body></html>"""


def page_one(s):
    return f"""<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>{esc(s.title)}</title>
<link href="{FONT_LINK}" rel="stylesheet"><style>{CSS}
body{{padding:24px 28px;width:{s.W + 56}px}}</style></head><body>
<p class="eyebrow">{esc(s.sid.upper())} · Mission Engine wireframe</p>
<h1 style="font-size:1.8rem">{esc(s.title)}</h1>
<div style="width:{s.W}px;border:1px solid rgba(45,49,66,.12);border-radius:8px;overflow:hidden">{s.svg()}</div>
</body></html>"""


def build(png=False):
    screens = [fn() for fn in SCREENS]
    with open(os.path.join(OUT, "wireframes.html"), "w", encoding="utf-8") as fh:
        fh.write(page_all(screens))
    os.makedirs(os.path.join(OUT, "png"), exist_ok=True)
    src_dir = os.path.join(OUT, "_png_src")
    os.makedirs(src_dir, exist_ok=True)
    for s in screens:
        src = os.path.join(src_dir, f"{s.sid}.html")
        with open(src, "w", encoding="utf-8") as fh:
            fh.write(page_one(s))
        if png:
            chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
            out = os.path.join(OUT, "png", f"{s.sid}.png")
            subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                            f"--window-size={s.W + 56},{s.H + 130}", "--force-device-scale-factor=2",
                            "--virtual-time-budget=8000", f"--screenshot={out}",
                            "file:///" + src.replace("\\", "/")],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"ok {len(screens)} screens")


if __name__ == "__main__":
    build(png="--png" in sys.argv)
