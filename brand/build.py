from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import cairosvg, os

VERM, ORANGE, AMBER, INK, PEACH = "#E8431C","#F07A1D","#F5B32B","#17130F","#FFF3E9"

def text_path(txt, font_path, size, x, y, tracking=0):
    f = TTFont(font_path); gs = f.getGlyphSet(); cmap = f.getBestCmap()
    upem = f['head'].unitsPerEm; s = size/upem
    kern = {}
    d=[]; cx=x
    for ch in txt:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen,(s,0,0,-s,cx,y)))
        d.append(pen.getCommands())
        cx += gs[g].width*s + tracking
    return " ".join(d), cx

BOLD="inter/extras/ttf/InterDisplay-Bold.ttf"
SEMI="inter/extras/ttf/InterDisplay-SemiBold.ttf"

GRAD = f'''<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{VERM}"/><stop offset=".55" stop-color="{ORANGE}"/><stop offset="1" stop-color="{AMBER}"/></linearGradient>'''

# ---------- MARK: page with folded corner + I-beam cursor ----------
def mark(fill="url(#g)", cursor="#fff", fold=None, bg=None, size=96, pad=0):
    fold = fold or ("#FFFFFF" if fill in ("url(#g)",INK) else "#17130F")
    foldop = {"#FFFFFF":".38","#17130F":".14"}.get(fold,"1")
    # page in a 96 box
    body = "M24 10 H58 L82 34 V82 a8 8 0 0 1 -8 8 H24 a8 8 0 0 1 -8 -8 V18 a8 8 0 0 1 8 -8 Z"
    foldp = "M58 10 V26 a8 8 0 0 0 8 8 H82 Z"
    cur = f'<g fill="{cursor}"><rect x="45.5" y="40" width="5" height="32" rx="2.5"/><rect x="37" y="38" width="22" height="5" rx="2.5"/><rect x="37" y="69" width="22" height="5" rx="2.5"/></g>'
    bgr = f'<rect width="96" height="96" rx="22" fill="{bg}"/>' if bg else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="{size}" height="{size}"><defs>{GRAD}</defs>{bgr}<path d="{body}" fill="{fill}"/><path d="{foldp}" fill="{fold}" opacity="{foldop}"/>{cur}</svg>'''

# App icon: gradient tile, white page, gradient cursor
def app_icon():
    body = "M24 10 H58 L82 34 V82 a8 8 0 0 1 -8 8 H24 a8 8 0 0 1 -8 -8 V18 a8 8 0 0 1 8 -8 Z"
    foldp = "M58 10 V26 a8 8 0 0 0 8 8 H82 Z"
    inner = mark(fill="#fff", cursor=VERM, fold="#FBD5BF")
    inner = inner[inner.index("<path"):inner.rindex("</svg>")]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="512" height="512"><defs>{GRAD}</defs><rect width="96" height="96" rx="22" fill="url(#g)"/><g transform="translate(48 48) scale(.82) translate(-48 -48)">{inner}</g></svg>'''

# ---------- WORDMARK ----------
def wordmark(dark=True, with_mark=True, stacked=False):
    ink = INK if dark else "#fff"
    size=40
    x0 = 62 if with_mark else 0
    p1,x1 = text_path("actually", SEMI, size, x0, 48, -0.6)
    p2,x2 = text_path("free",     BOLD, size, x1+2, 48, -0.6)
    p3,x3 = text_path("pdfeditor",SEMI, size, x2+2, 48, -0.6)
    W = int(x3+4)
    m = ""
    if with_mark:
        m = f'<g transform="translate(0 14) scale(.5)">{mark()[mark().index("<path"):mark().rindex("</svg>")]}</g>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 64" width="{W}" height="64"><defs>{GRAD}</defs>{m}<path d="{p1}" fill="{ink}"/><path d="{p2}" fill="url(#g)"/><path d="{p3}" fill="{ink}"/></svg>'''

def wordmark_mono(color=INK):
    size=40
    p1,x1 = text_path("actually", SEMI, size, 62, 48, -0.6)
    p2,x2 = text_path("free",     BOLD, size, x1+2, 48, -0.6)
    p3,x3 = text_path("pdfeditor",SEMI, size, x2+2, 48, -0.6)
    W=int(x3+4)
    mk = mark(fill=color, cursor=("#fff" if color==INK else INK))
    mk = mk[mk.index("<path"):mk.rindex("</svg>")]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 64" width="{W}" height="64"><g transform="translate(0 14) scale(.5)">{mk}</g><path d="{p1}" fill="{color}"/><path d="{p2}" fill="{color}"/><path d="{p3}" fill="{color}"/></svg>'''

files = {
 "mark-gradient.svg": mark(),
 "mark-mono-ink.svg": mark(fill=INK, cursor="#fff"),
 "mark-mono-white.svg": mark(fill="#fff", cursor=INK),
 "app-icon.svg": app_icon(),
 "wordmark-ink.svg": wordmark(True),
 "wordmark-white.svg": wordmark(False),
 "wordmark-mono-ink.svg": wordmark_mono(INK),
 "wordmark-mono-white.svg": wordmark_mono("#fff"),
 "wordmark-typeonly.svg": wordmark(True, with_mark=False),
}
for k,v in files.items():
    open(f"out/{k}","w").write(v)
cairosvg.svg2png(bytestring=files["app-icon.svg"].encode(), write_to="out/app-icon-512.png", output_width=512, output_height=512)
cairosvg.svg2png(bytestring=files["mark-gradient.svg"].encode(), write_to="out/favicon-64.png", output_width=64, output_height=64)

# ---------- PREVIEW SHEET ----------
def embed(svg, x, y, w):
    inner = svg[svg.index(">")+1:svg.rindex("</svg>")]
    vb = svg.split('viewBox="')[1].split('"')[0].split()
    sc = w/float(vb[2])
    return f'<g transform="translate({x} {y}) scale({sc})">{inner}</g>'
sheet = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 860" width="1200" height="860">
<rect width="1200" height="860" fill="#FAF7F3"/>
<rect x="0" y="0" width="1200" height="470" fill="{PEACH}"/>
{embed(files["wordmark-ink.svg"], 80, 80, 560)}
{embed(files["app-icon.svg"], 80, 220, 128)}
{embed(files["mark-gradient.svg"], 240, 236, 96)}
{embed(files["mark-mono-ink.svg"], 360, 236, 96)}
{embed(files["wordmark-typeonly.svg"], 560, 400, 420)}
{embed(files["wordmark-mono-ink.svg"], 80, 400, 420)}
<rect x="0" y="470" width="1200" height="390" fill="{INK}"/>
{embed(files["wordmark-white.svg"], 80, 550, 560)}
{embed(files["mark-mono-white.svg"], 80, 680, 96)}
{embed(files["wordmark-mono-white.svg"], 220, 700, 420)}
<g font-family="sans-serif" font-size="13" fill="{INK}" opacity=".55"><text x="80" y="64">PRIMARY</text><text x="80" y="206">MARKS</text><text x="80" y="388">MONO</text><text x="560" y="388">TYPE ONLY</text></g>
<g font-family="sans-serif" font-size="13" fill="#fff" opacity=".55"><text x="80" y="520">ON DARK</text></g>
<g transform="translate(760 120)">
<g font-family="sans-serif" font-size="13" fill="{INK}" opacity=".55"><text y="0">PALETTE</text></g>
<rect y="16" width="80" height="80" rx="12" fill="{VERM}"/><rect x="92" y="16" width="80" height="80" rx="12" fill="{ORANGE}"/><rect x="184" y="16" width="80" height="80" rx="12" fill="{AMBER}"/><rect x="276" y="16" width="80" height="80" rx="12" fill="{INK}"/>
<g font-family="monospace" font-size="12" fill="{INK}"><text y="116">{VERM}</text><text x="92" y="116">{ORANGE}</text><text x="184" y="116">{AMBER}</text><text x="276" y="116">{INK}</text></g>
</g>
</svg>'''
open("out/preview-sheet.svg","w").write(sheet)
cairosvg.svg2png(bytestring=sheet.encode(), write_to="out/preview-sheet.png", output_width=1800)
print("done")
