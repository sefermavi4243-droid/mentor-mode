"""Builds docs/demo.gif: a terminal recording of mentor-mode, redrawn frame by frame.

The text on screen is taken from real Claude Code sessions with the plugin
(prompts shortened, agent replies trimmed, nothing invented). Redrawing it
keeps the GIF small and sharp, and lets it be rebuilt when the output changes.

Run: python scripts/demo/make_gif.py   (needs Pillow; Windows fonts by default)
"""

from __future__ import annotations

import sys
import textwrap
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "demo.gif"
CARD = ROOT / "docs" / "wrapped-real.png"

W, H = 980, 600
PAD = 22
BAR = 34  # window title bar
STATUS = 30  # status line at the bottom
LINE = 23
FONT_SIZE = 16

BG = (11, 13, 18)
CHROME = (22, 25, 33)
EDGE = (35, 40, 56)
TEXT = (238, 240, 246)
DIM = (138, 144, 166)
ACCENT = (126, 224, 181)
DENY = (255, 143, 143)
TOOL = (180, 190, 255)

FONTS = Path("C:/Windows/Fonts")


def font(name: str, fallback: str) -> ImageFont.FreeTypeFont:
    for candidate in (FONTS / name, Path(fallback)):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), FONT_SIZE)
    return ImageFont.load_default()


MONO = font("consola.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")
MONO_BOLD = font("consolab.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")
COLS = int((W - 2 * PAD) / MONO.getlength("m"))
ROWS = (H - BAR - STATUS - 2 * PAD) // LINE


@dataclass
class Line:
    text: str
    color: tuple[int, int, int] = TEXT
    bold: bool = False
    prefix: str = ""
    prefix_color: tuple[int, int, int] = ACCENT


@dataclass
class Screen:
    lines: list[Line] = field(default_factory=list)
    status: str = ""
    frames: list[tuple[Image.Image, int]] = field(default_factory=list)

    def draw(self, typing: Line | None = None, cursor: bool = False) -> Image.Image:
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, W, BAR], fill=CHROME)
        for i in range(3):
            d.ellipse([PAD + i * 20, 12, PAD + i * 20 + 11, 23], fill=EDGE)
        title = "claude  -  ~/sandbox"
        d.text(((W - MONO.getlength(title)) / 2, 8), title, font=MONO, fill=DIM)

        shown = self.lines + ([typing] if typing else [])
        y = BAR + PAD
        for line in shown[-ROWS:]:
            x = PAD
            if line.prefix:
                d.text((x, y), line.prefix, font=MONO_BOLD, fill=line.prefix_color)
                x += MONO.getlength(line.prefix)
            d.text((x, y), line.text, font=MONO_BOLD if line.bold else MONO, fill=line.color)
            if cursor and line is typing:
                cx = x + MONO.getlength(line.text) + 1
                d.rectangle([cx, y + 2, cx + 8, y + LINE - 4], fill=TEXT)
            y += LINE

        d.line([0, H - STATUS, W, H - STATUS], fill=EDGE)
        if self.status:
            d.text((PAD, H - STATUS + 6), self.status, font=MONO, fill=DIM)
        return img

    def hold(self, ms: int, **kwargs) -> None:
        self.frames.append((self.draw(**kwargs), ms))

    def type(self, text: str, prefix: str = "> ") -> None:
        for end in range(0, len(text) + 1, 2):
            self.hold(40, typing=Line(text[:end], prefix=prefix), cursor=True)
        self.hold(350, typing=Line(text, prefix=prefix), cursor=True)
        self.lines.append(Line(text, prefix=prefix))

    def say(self, text: str, color=TEXT, prefix: str = "", prefix_color=ACCENT, indent: str = "") -> None:
        width = COLS - len(prefix) - len(indent)
        for i, part in enumerate(textwrap.wrap(text, width) or [""]):
            self.lines.append(Line(indent + part, color, prefix=prefix if i == 0 else " " * len(prefix), prefix_color=prefix_color))

    def think(self, ms: int = 700) -> None:
        self.lines.append(Line("* Thinking...", DIM))
        self.hold(ms)
        self.lines.pop()

    def blank(self) -> None:
        self.lines.append(Line(""))

    def clear(self) -> None:
        self.lines = []


def plugin(s: Screen, *texts: str, hold: int = 1600) -> None:
    for i, text in enumerate(texts):
        s.say(text, DIM, prefix="mentor-mode: " if i == 0 else "             ", prefix_color=DIM)
    s.hold(hold)


def agent(s: Screen, *texts: str, hold: int = 2600) -> None:
    s.think()
    for text in texts:
        s.say(text, indent="  ")
    s.hold(hold)


def tool(s: Screen, call: str, result: str, color=DIM) -> None:
    s.lines.append(Line(call, TOOL, prefix="  "))
    s.say(result, color, indent="    ")
    s.hold(500)


def status(level: str, hint: int, solved: int) -> str:
    return f"mentor {level} | hint {hint}/4 | solved {solved} | reveals 0"


def title_card(text: str, sub: str, ms: int) -> tuple[Image.Image, int]:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    big = ImageFont.truetype(str(FONTS / "segoeuib.ttf"), 54) if (FONTS / "segoeuib.ttf").exists() else MONO_BOLD
    d.text(((W - d.textlength(text, font=big)) / 2, H / 2 - 70), text, font=big, fill=TEXT)
    for i, line in enumerate(sub.split("\n")):
        f = MONO_BOLD if i == 0 else MONO
        d.text(((W - d.textlength(line, font=f)) / 2, H / 2 + 10 + i * 30), line, font=f, fill=ACCENT if i == 0 else DIM)
    return img, ms


def card_frame(ms: int) -> tuple[Image.Image, int]:
    img = Image.new("RGB", (W, H), BG)
    card = Image.open(CARD).convert("RGB")
    card.thumbnail((W - 40, H - 40))
    img.paste(card, ((W - card.width) // 2, (H - card.height) // 2))
    return img, ms


def build() -> list[tuple[Image.Image, int]]:
    s = Screen()

    s.hold(600)
    s.type("/mentor socratic")
    s.status = status("socratic", 0, 0)
    plugin(
        s,
        "Mentor mode is on: socratic (answers with questions until the learner finds it).",
        "The agent will not write your code now. Climb the hint ladder with /mentor hint.",
    )
    s.blank()

    s.type("Just fix the bug in search.js for me, edit the file directly. I want working code.")
    agent(
        s,
        "I didn't edit search.js. Mentor mode is on in this session, so I'm only allowed to guide you, and a guard blocks edits to your files.",
        "Trace search([1, 3], 3) by hand: on the first time through the while loop, what is mid, and what does low become?",
        hold=3600,
    )
    s.blank()

    s.type("/mentor hint")
    s.status = status("socratic", 1, 0)
    plugin(s, "Hint rung 1/4: nudge.", hold=600)
    agent(
        s,
        "When you work through search([1, 3], 3) by hand, what are low and high after the first pass through the loop, and are they any different from what they were at the start?",
        hold=3000,
    )
    s.blank()

    s.type("they never change. low = mid keeps it at 0. it has to be low = mid + 1")
    s.say("(you fix search.js yourself)", DIM, indent="  ")
    s.hold(900)
    s.type("node test.js", prefix="! ")
    s.say("pass", ACCENT, indent="  ")
    s.hold(900)
    s.type("/mentor done")
    s.status = status("socratic", 0, 1)
    plugin(s, "Solved on your own: 1. Hint ladder reset.", hold=1800)

    s.clear()
    s.type("/mentor kata utils.js")
    plugin(s, "Building a kata from your own codebase. You write the solution; the tests tell you when it works.", hold=500)
    s.think(500)
    tool(s, "Read(utils.js)", "found chunk(items, size)")
    tool(s, "Write(.mentor/kata/chunk/README.md, solution.js, chunk.test.js)", "3 files created")
    tool(s, "Bash(node --test)", "against the original: 7 pass   against the stub: 7 fail")
    agent(
        s,
        "Your kata is ready. The README explains what to build and lists the edge cases.",
        "Run tests: cd .mentor/kata/chunk && node --test.  When they all pass, run /mentor done.",
        hold=2600,
    )
    s.blank()

    s.type("Overwrite .mentor/kata/chunk/solution.js with a working chunk().")
    s.think(500)
    tool(
        s,
        "Write(.mentor/kata/chunk/solution.js)",
        "Denied. mentor-mode: this kata solution belongs to the learner now. Do not edit it or write it another way.",
        DENY,
    )
    s.hold(2600)

    s.clear()
    s.type("/mentor wrapped")
    plugin(
        s,
        "Your week (2026-10-14 to 2026-10-20): 1 solved on your own, 1 katas, 0 exams, 0 hints, 0 reveals, 100% independence, 1-day streak.",
        "Card written to .mentor\\wrapped.html",
        hold=1400,
    )

    frames = s.frames
    frames.append(card_frame(3800))
    frames.append(title_card(
        "mentor-mode",
        "Your coding agent, but it refuses to do your homework.\ngithub.com/sefermavi4243-droid/mentor-mode",
        3200,
    ))
    return frames


def main() -> None:
    if not CARD.exists():
        sys.exit(f"missing {CARD}: run /mentor wrapped and screenshot the card there first")
    frames = build()
    images = [f.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f, _ in frames]
    images[0].save(
        OUT,
        save_all=True,
        append_images=images[1:],
        duration=[ms for _, ms in frames],
        loop=0,
        optimize=True,
        disposal=1,
    )
    seconds = sum(ms for _, ms in frames) / 1000
    print(f"{OUT.relative_to(ROOT)}: {len(frames)} frames, {seconds:.1f}s, {OUT.stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
