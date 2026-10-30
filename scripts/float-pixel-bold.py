# Float Pixel's bold (float/client/art/groove/groove.css): Pixelify Sans
# (OFL, public/fonts/pixelify-sans-OFL.txt) instanced at weight 700, with
# its 3 and C opened. The variable font's bold closes the 3's hook gaps and
# the C's mouth to about 35 units, so under an outline "3rd" and "+0.03"
# read as 8s and "Chug" as "Ohug". Moves only existing points (same
# contours), so the glyphs keep their pixel grid.
#
#   python scripts/float-pixel-bold.py
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC = "public/fonts/pixelify-sans-latin.woff2"
OUT = "public/fonts/float-pixel-bold.woff2"

font = instantiateVariableFont(TTFont(SRC), {"wght": 700})
glyf, cmap = font["glyf"], font.getBestCmap()

def patch(ch, moves):
    glyph = glyf[cmap[ord(ch)]]
    coords = glyph.coordinates
    for i, point in enumerate(coords):
        if tuple(point) in moves:
            coords[i] = moves[tuple(point)]
    glyph.recalcBounds(glyf)

# 3: the hooks' inner edges away from the middle bar (35 -> 121 units: a whole pixel, so an outline never closes it)
patch("3", {(61, 211):(61, 125), (188, 211):(188, 125), (188, 416):(188, 501), (61, 416):(61, 501)})
# 2, 5 and S: the same hooks, the same 35-unit gaps (2 read as 8, 5 and S as 6)
patch("2", {(188, 416):(188, 501), (61, 416):(61, 501), (414, 211):(414, 125), (542, 211):(542, 125)})
patch("5", {(61, 211):(61, 125), (188, 211):(188, 125), (542, 331):(542, 380), (414, 331):(414, 380)})
patch("S", {(61, 211):(61, 125), (188, 211):(188, 125), (542, 416):(542, 501), (414, 416):(414, 501)})
# B: the waist notch on the right taller (34 -> 92 units), so "Ben" never reads "Gen"
patch("B", {(542, 331):(542, 360), (453, 331):(453, 360), (453, 297):(453, 268), (542, 297):(542, 268)})
# C: the mouth open (34 -> 130 units)
patch("C", {(542, 297):(542, 250), (414, 297):(414, 250), (542, 331):(542, 380), (414, 331):(414, 380)})

font["name"].setName("Float Pixel Bold", 1, 3, 1, 0x409)
font["name"].setName("Bold", 2, 3, 1, 0x409)
font["OS/2"].usWeightClass = 700
font.flavor = "woff2"
font.save(OUT)
print(OUT)
