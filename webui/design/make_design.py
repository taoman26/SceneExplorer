#!/usr/bin/env python3
"""Generate the WebUI mock-up images (PNG) with Pillow.

All titles / folders / tags are dummy data. Run:  python3 make_design.py
Outputs 01_login.png ... 06_mobile_library.png next to this script.
"""
import os, random
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONTB = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# ---- design tokens (keep in sync with design.md and client/src/styles.css)
C = dict(bg="#0f1218", surface="#171b24", surface2="#1f2430", border="#2a3140",
         text="#e6e9ef", muted="#8b93a5", accent="#4f8cff", accent_fg="#ffffff",
         danger="#ef5350", ok="#43a047", chip="#263049")


def f(size, bold=False):
    return ImageFont.truetype(FONTB if bold else FONT, size)


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Canvas:
    def __init__(self, w, h):
        self.im = Image.new("RGB", (w, h), C["bg"])
        self.d = ImageDraw.Draw(self.im)

    def rect(self, x, y, w, h, fill=None, outline=None, r=8):
        self.d.rounded_rectangle([x, y, x + w, y + h], r, fill=fill, outline=outline)

    def text(self, x, y, s, size=14, color="text", bold=False, anchor="la"):
        self.d.text((x, y), s, font=f(size, bold), fill=C.get(color, color), anchor=anchor)

    def tw(self, s, size=14, bold=False):
        return self.d.textlength(s, font=f(size, bold))

    def button(self, x, y, w, h, label, primary=False, danger=False, size=14):
        if primary:
            self.rect(x, y, w, h, C["accent"])
            self.text(x + w / 2, y + h / 2, label, size, "accent_fg", True, "mm")
        else:
            self.rect(x, y, w, h, C["surface2"], C["border"])
            self.text(x + w / 2, y + h / 2, label, size, "danger" if danger else "text", False, "mm")

    def field(self, x, y, w, h, value="", placeholder="", label=None, password=False):
        if label:
            self.text(x, y - 22, label, 13, "muted")
        self.rect(x, y, w, h, C["bg"], C["border"])
        if value:
            self.text(x + 14, y + h / 2, "•" * len(value) if password else value, 15, "text", False, "lm")
        else:
            self.text(x + 14, y + h / 2, placeholder, 15, "muted", False, "lm")

    def chip(self, x, y, label, active=False, size=13):
        w = self.tw(label, size) + 24
        self.rect(x, y, w, 28, C["accent"] if active else C["chip"], None, 14)
        self.text(x + 12, y + 14, label, size, "accent_fg" if active else "text", False, "lm")
        return w

    def save(self, name):
        self.im.save(os.path.join(OUT, name))


def thumb(seed, w, h):
    """Dummy gradient thumbnail with a play glyph."""
    rnd = random.Random(seed)
    a = [rnd.randint(30, 110) for _ in range(3)]
    b = [rnd.randint(60, 200) for _ in range(3)]
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            t = (x / w + y / h) / 2
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    d = ImageDraw.Draw(im)
    cx, cy, r = w // 2, h // 2, min(w, h) // 8
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0))
    d.polygon([(cx - r // 3, cy - r // 2), (cx - r // 3, cy + r // 2), (cx + r // 2, cy)], fill=(255, 255, 255))
    return im


def paste_round(cv, im, x, y, r=8):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0], im.size[1]], r, fill=255)
    cv.im.paste(im, (x, y), mask)


DIRS = [("すべて", 128), ("/media/videos/movies", 42), ("/media/videos/anime", 61), ("/mnt/nas/archive", 25)]
TAGS = [("旅行", 12), ("家族", 8), ("料理", 5), ("イベント", 9)]
VIDEOS = [
    ("夏の海辺で撮影した動画 2024.mp4", "01:23:45", "1920×1080", "2.4 GB", "h264"),
    ("運動会 リレー決勝.mov", "00:12:08", "1920×1080", "812 MB", "h264"),
    ("Sample_Movie_Trailer.mkv", "00:02:31", "3840×2160", "1.1 GB", "hevc"),
    ("料理教室 パスタ編.mp4", "00:48:20", "1280×720", "640 MB", "h264"),
    ("Holiday_2023_Part1.mp4", "00:35:02", "1920×1080", "1.7 GB", "h264"),
    ("京都旅行 vlog.mp4", "00:18:47", "1920×1080", "930 MB", "h264"),
    ("Birthday_Party.avi", "00:09:14", "640×480", "210 MB", "mpeg4"),
    ("ドライブレコーダー 0812.mp4", "00:30:00", "1920×1080", "1.2 GB", "h264"),
    ("Lecture_01_Intro.webm", "01:05:33", "1280×720", "420 MB", "vp9"),
    ("花火大会 2022.mp4", "00:06:52", "3840×2160", "1.5 GB", "hevc"),
    ("Concert_Live_Full.mkv", "02:01:10", "1920×1080", "6.3 GB", "h264"),
    ("子供の発表会.mp4", "00:22:41", "1920×1080", "1.0 GB", "h264"),
]


def header(cv, W, user="alice", q="", show_admin=True):
    cv.rect(0, 0, W, 60, C["surface"], r=0)
    cv.d.line([0, 60, W, 60], fill=C["border"])
    cv.text(24, 30, "▶ SceneExplorer", 19, "text", True, "lm")
    cv.field(300, 12, 520, 36, q, "タイトルを検索…")
    cv.text(W - 300, 30, "並び順:", 13, "muted", False, "lm")
    cv.rect(W - 245, 12, 130, 36, C["surface2"], C["border"])
    cv.text(W - 233, 30, "更新日時 ↓", 14, "text", False, "lm")
    cv.rect(W - 100, 12, 76, 36, C["surface2"], C["border"])
    cv.text(W - 62, 30, "👤 " + user if False else user, 14, "text", False, "mm")


def sidebar(cv, H, active=0, active_tag=None):
    cv.rect(0, 61, 240, H - 61, C["surface"], r=0)
    cv.d.line([240, 61, 240, H], fill=C["border"])
    cv.text(20, 84, "フォルダ", 12, "muted", True)
    y = 108
    for i, (n, c) in enumerate(DIRS):
        if i == active and active_tag is None:
            cv.rect(10, y - 4, 220, 34, C["chip"], r=6)
        cv.text(22, y + 13, n if len(n) < 22 else n[:21] + "…", 14, "text", i == active and active_tag is None, "lm")
        cv.text(222, y + 13, str(c), 12, "muted", False, "rm")
        y += 38
    y += 14
    cv.text(20, y, "タグ", 12, "muted", True)
    y += 24
    for i, (n, c) in enumerate(TAGS):
        if active_tag == i:
            cv.rect(10, y - 4, 220, 34, C["chip"], r=6)
        cv.text(22, y + 13, "# " + n, 14, "text", active_tag == i, "lm")
        cv.text(222, y + 13, str(c), 12, "muted", False, "rm")
        y += 38
    cv.text(22, y + 13, "タグなし", 14, "muted", False, "lm")
    cv.text(22, H - 30, "欠損ファイル", 13, "muted", False, "lm")


def card(cv, x, y, w, idx, tags=()):
    title, dur, res, size, codec = VIDEOS[idx % len(VIDEOS)]
    th = int(w * 140 / 187)
    paste_round(cv, thumb(idx, w, th), x, y, 8)
    cv.rect(x + w - 62, y + th - 26, 56, 20, "#000000", r=4)
    cv.text(x + w - 34, y + th - 16, dur, 11, "#ffffff", False, "mm")
    cv.text(x, y + th + 10, title if cv.tw(title, 14) < w else title[:15] + "…", 14, "text", True)
    cv.text(x, y + th + 34, f"{res} · {size} · {codec}", 12, "muted")
    tx = x
    for t in tags:
        tx += cv.chip(tx, y + th + 56, t, size=11) + 6
    return th + 90


def library(name="02_library_grid.png", W=1440, H=900):
    cv = Canvas(W, H)
    header(cv, W)
    sidebar(cv, H, 0)
    cv.text(272, 90, "すべて", 22, "text", True)
    cv.text(272 + cv.tw("すべて", 22, True) + 14, 98, "128 件", 13, "muted")
    x0, y0, cw, gap = 272, 132, 264, 20
    cols = (W - 272 - 32 + gap) // (cw + gap)
    tag_sets = [("旅行",), ("イベント", "家族"), (), ("料理",), ("旅行",), ("旅行", "家族")]
    for i in range(cols * 2):
        x = x0 + (i % cols) * (cw + gap)
        y = y0 + (i // cols) * 292
        card(cv, x, y, cw, i, tag_sets[i % len(tag_sets)])
    # pager
    py = H - 44
    cv.button(W // 2 - 150, py - 14, 60, 32, "‹ 前")
    cv.text(W // 2, py + 2, "1 / 11", 14, "text", False, "mm")
    cv.button(W // 2 + 90, py - 14, 60, 32, "次 ›")
    cv.save(name)


def detail():
    W, H = 1440, 900
    cv = Canvas(W, H)
    header(cv, W)
    sidebar(cv, H, 0)
    # dimmed content + modal
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 170))
    cv.im.paste(ov, (0, 0), ov)
    cv = _reattach(cv)
    mx, my, mw, mh = 200, 50, 1040, 800
    cv.rect(mx, my, mw, mh, C["surface"], C["border"], 12)
    title, dur, res, size, codec = VIDEOS[0]
    cv.text(mx + 28, my + 32, title, 20, "text", True, "lm")
    cv.text(mx + mw - 28, my + 32, "×", 24, "muted", False, "rm")
    # player
    pw, ph = 620, 349
    paste_round(cv, thumb(0, pw, ph), mx + 28, my + 68, 8)
    cv.rect(mx + 28, my + 68 + ph - 44, pw, 44, "#000000", r=0)
    cv.text(mx + 44, my + 68 + ph - 22, "▶", 16, "#ffffff", False, "lm")
    cv.rect(mx + 84, my + 68 + ph - 24, pw - 190, 4, "#555a66", r=2)
    cv.rect(mx + 84, my + 68 + ph - 24, 190, 4, C["accent"], r=2)
    cv.text(mx + 28 + pw - 14, my + 68 + ph - 22, "00:12:40 / " + dur, 12, "#ffffff", False, "rm")
    # thumbs strip 5x2
    tw_, th_ = 118, 88
    for i in range(10):
        tx = mx + 28 + (i % 5) * (tw_ + 7)
        ty = my + 68 + ph + 20 + (i // 5) * (th_ + 7)
        paste_round(cv, thumb(100 + i, tw_, th_), tx, ty, 4)
        cv.text(tx + 4, ty + th_ - 6, f"{i * 9 + 3:02d}:{(i * 17) % 60:02d}", 10, "#ffffff", False, "lb")
    # info panel
    ix = mx + 28 + pw + 32
    iw = mw - (ix - mx) - 28
    rows = [("パス", "/media/videos/movies/"), ("サイズ", size), ("解像度", res), ("長さ", dur),
            ("コーデック", "h264 / aac"), ("ビットレート", "4.1 Mbps"), ("FPS", "29.97"), ("更新日時", "2024-08-12 14:03"),
            ("再生回数", "3")]
    y = my + 68
    for k, v in rows:
        cv.text(ix, y, k, 12, "muted")
        cv.text(ix, y + 18, v, 14, "text")
        y += 46
    y += 4
    cv.text(ix, y, "タグ", 12, "muted")
    tx = ix
    for t, on in (("旅行", True), ("家族", False), ("料理", False), ("イベント", True)):
        if tx + cv.tw(t, 13) + 24 > ix + iw:
            tx = ix
            y += 34
        tx += cv.chip(tx, y + 20, t, active=on) + 6
    cv.button(ix, my + mh - 64, iw // 2 - 6, 38, "ダウンロード")
    cv.button(ix + iw // 2 + 6, my + mh - 64, iw // 2 - 6, 38, "全画面再生", primary=True)
    cv.save("03_detail.png")


def _reattach(cv):
    cv.d = ImageDraw.Draw(cv.im)
    return cv


def login():
    W, H = 1440, 900
    cv = Canvas(W, H)
    cx, cy, w, h = (W - 420) // 2, 190, 420, 500
    cv.rect(cx, cy, w, h, C["surface"], C["border"], 14)
    cv.text(W // 2, cy + 56, "▶ SceneExplorer", 26, "text", True, "mm")
    cv.text(W // 2, cy + 92, "サインインして動画ライブラリを開く", 13, "muted", False, "mm")
    cv.field(cx + 40, cy + 156, w - 80, 44, "alice", label="ユーザー名")
    cv.field(cx + 40, cy + 240, w - 80, 44, "password1", label="パスワード", password=True)
    cv.button(cx + 40, cy + 316, w - 80, 46, "サインイン", primary=True, size=15)
    cv.rect(cx + 40, cy + 386, w - 80, 40, "#3a1f22", C["danger"], 6)
    cv.text(cx + 56, cy + 406, "ユーザー名またはパスワードが違います", 13, "danger", False, "lm")
    cv.text(W // 2, cy + h - 32, "初回起動時は管理者アカウントの作成画面が表示されます", 12, "muted", False, "mm")
    cv.save("01_login.png")


def admin():
    W, H = 1440, 900
    cv = Canvas(W, H)
    header(cv, W, "admin")
    sidebar(cv, H, 0)
    cv.text(272, 90, "ユーザー管理", 22, "text", True)
    cv.button(W - 200, 82, 168, 38, "＋ ユーザーを追加", primary=True)
    tx, ty, tw_ = 272, 144, W - 272 - 32
    cv.rect(tx, ty, tw_, 44 + 56 * 4, C["surface"], C["border"], 10)
    cv.text(tx + 24, ty + 22, "ユーザー名", 12, "muted", True, "lm")
    cv.text(tx + 380, ty + 22, "権限", 12, "muted", True, "lm")
    cv.text(tx + 560, ty + 22, "最終ログイン", 12, "muted", True, "lm")
    cv.d.line([tx, ty + 44, tx + tw_, ty + 44], fill=C["border"])
    rows = [("admin", "管理者", "2026-09-26 15:01"), ("alice", "一般", "2026-09-26 14:32"),
            ("bob", "一般", "2026-09-20 21:10"), ("guest", "閲覧のみ", "—")]
    for i, (u, r, t) in enumerate(rows):
        y = ty + 44 + 56 * i
        if i:
            cv.d.line([tx + 16, y, tx + tw_ - 16, y], fill=C["border"])
        cv.text(tx + 24, y + 28, u, 15, "text", True, "lm")
        cv.chip(tx + 380 - 12, y + 14, r)
        cv.text(tx + 560, y + 28, t, 14, "muted", False, "lm")
        cv.button(tx + tw_ - 250, y + 10, 110, 36, "PW変更", size=13)
        cv.button(tx + tw_ - 130, y + 10, 100, 36, "削除", danger=True, size=13)
    cv.save("05_admin_users.png")


def mobile():
    W, H = 390, 844
    cv = Canvas(W, H)
    cv.rect(0, 0, W, 56, C["surface"], r=0)
    cv.d.line([0, 56, W, 56], fill=C["border"])
    cv.text(16, 28, "☰", 22, "text", False, "lm")
    cv.field(52, 10, W - 52 - 60, 36, "", "検索…")
    cv.text(W - 32, 28, "👤" if False else "alice", 12, "muted", False, "mm")
    x = 16
    for i, (n, _) in enumerate(DIRS[:3]):
        x += cv.chip(x, 68, n if len(n) < 10 else n[:9] + "…", active=i == 0) + 6
    cw = (W - 16 * 2 - 12) // 2
    for i in range(6):
        card_small(cv, 16 + (i % 2) * (cw + 12), 116 + (i // 2) * 232, cw, i)
    cv.save("06_mobile_library.png")


def card_small(cv, x, y, w, idx):
    title, dur, res, size, codec = VIDEOS[idx]
    th = int(w * 140 / 187)
    paste_round(cv, thumb(idx, w, th), x, y, 8)
    cv.rect(x + w - 56, y + th - 24, 50, 18, "#000000", r=4)
    cv.text(x + w - 31, y + th - 15, dur, 10, "#ffffff", False, "mm")
    cv.text(x, y + th + 8, title if cv.tw(title, 13, True) < w else title[:9] + "…", 13, "text", True)
    cv.text(x, y + th + 30, f"{res} · {size}", 11, "muted")


def library_list():
    W, H = 1440, 900
    cv = Canvas(W, H)
    header(cv, W)
    sidebar(cv, H, None or 0, active_tag=0)
    cv.text(272, 90, "# 旅行", 22, "text", True)
    cv.text(272 + cv.tw("# 旅行", 22, True) + 14, 98, "12 件", 13, "muted")
    y = 140
    for i in range(5):
        cv.rect(272, y, W - 272 - 32, 150, C["surface"], C["border"], 10)
        paste_round(cv, thumb(i, 187, 140), 278, y + 5, 6)
        cv.text(486, y + 22, VIDEOS[i][0], 16, "text", True)
        cv.text(486, y + 50, f"{VIDEOS[i][2]} · {VIDEOS[i][3]} · {VIDEOS[i][4]} · {VIDEOS[i][1]}", 13, "muted")
        for k in range(6):
            paste_round(cv, thumb(50 + i * 10 + k, 94, 70), 486 + k * 100, y + 74, 4)
        y += 162
    cv.save("04_library_thumbs.png")


if __name__ == "__main__":
    login()
    library()
    detail()
    library_list()
    admin()
    mobile()
    print("done")
