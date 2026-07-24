#!/usr/bin/env python3
"""Generate the social preview image and the apple-touch-icon.

Same visual language as favicon.svg: a real RAID 5 left-* parity placement on
four disks, in the site's own palette. Nothing here states a fact about the
project that isn't true.
"""
from PIL import Image, ImageDraw, ImageFont

BG      = (10, 14, 20)      # --bg-primary  #0a0e14
CARD    = (19, 25, 32)      # --bg-card     #131920
DATA    = (0, 255, 159)     # --color-data  #00ff9f
PARITY  = (255, 170, 51)    # --color-parity #ffaa33
MIRROR  = (77, 166, 255)    # --color-mirror #4da6ff
TEXT    = (230, 230, 230)   # --text-primary
MUTED   = (138, 138, 138)   # --text-secondary

MONO_B = "/usr/share/fonts/truetype/noto/NotoSansMono-Bold.ttf"
MONO_R = "/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", size)


def raid5_grid(draw, x0, y0, cell, gap, disks=4, stripes=4, radius=6):
    """Draw a RAID 5 grid. Parity starts on the last disk and walks left one
    disk per stripe — the left-* placement, as in drivers/md/raid5.c."""
    for row in range(stripes):
        parity_col = (disks - 1 - row) % disks
        for col in range(disks):
            x = x0 + col * (cell + gap)
            y = y0 + row * (cell + gap)
            colour = PARITY if col == parity_col else DATA
            draw.rounded_rectangle([x, y, x + cell, y + cell], radius=radius, fill=colour)


def make_og(path):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # A hairline accent along the top, the same green the app uses for data.
    d.rectangle([0, 0, W, 6], fill=DATA)

    f_title = font(MONO_B, 76)
    f_sub   = font(MONO_R, 30)
    f_meta  = font(MONO_R, 24)

    d.text((80, 150), "RAID Sandbox", font=f_title, fill=TEXT)
    d.text((80, 260), "Build an array. See where the", font=f_sub, fill=MUTED)
    d.text((80, 302), "data actually lands.", font=f_sub, fill=MUTED)

    # Legend — only the roles the grid to the right actually contains. The app
    # also colours mirrors (MIRROR), but a RAID 5 grid has none, so listing it
    # here would label something the reader cannot find in the picture.
    ly = 440
    for label, colour in (("data", DATA), ("parity", PARITY)):
        d.rounded_rectangle([80, ly, 100, ly + 20], radius=3, fill=colour)
        d.text((112, ly - 3), label, font=f_meta, fill=MUTED)
        ly += 40

    # The grid: a card holding a real RAID 5 parity walk.
    card_x, card_y, card_w, card_h = 700, 130, 420, 370
    d.rounded_rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                        radius=12, fill=CARD)
    raid5_grid(d, card_x + 40, card_y + 45, cell=72, gap=14)

    d.text((80, 552), "raid-sandbox.dev", font=f_meta, fill=DATA)

    img.save(path, "PNG", optimize=True)
    print("wrote", path, img.size)


def make_touch_icon(path):
    S = 180
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    raid5_grid(d, 18, 18, cell=32, gap=6, radius=4)
    img.save(path, "PNG", optimize=True)
    print("wrote", path, img.size)


if __name__ == "__main__":
    import sys
    make_og(sys.argv[1])
    make_touch_icon(sys.argv[2])
