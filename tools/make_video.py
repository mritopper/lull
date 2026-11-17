"""Assemble the Lull demo video from emulator recordings.

Inputs (from tools/record-chain.sh): .recording/night1.mp4, .recording/night2.mp4
Output: .recording/lull-demo.mp4 (1920x1080, 30 fps, AAC audio)
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..', '.recording')
OUT = os.path.join(ROOT, 'video')
os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080
URL = sys.argv[1] if len(sys.argv) > 1 else ''

FONT = '/System/Library/Fonts/Avenir Next.ttc'


def font(size, bold=False):
    # Avenir Next.ttc: index 0 regular-ish, 2 demi bold, 5 medium (varies by OS); fall back safely.
    for idx in ([2, 0] if bold else [5, 0]):
        try:
            return ImageFont.truetype(FONT, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


def card(path, lines, sub=None):
    img = Image.new('RGB', (W, H), (13, 11, 23))
    glow = Image.new('RGB', (W, H), (13, 11, 23))
    g = ImageDraw.Draw(glow)
    g.ellipse([W / 2 - 120, 300 - 120, W / 2 + 120, 300 + 120], fill=(255, 170, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    img = Image.blend(img, glow, 0.55)
    d = ImageDraw.Draw(img)
    d.ellipse([W / 2 - 34, 300 - 34, W / 2 + 34, 300 + 34], fill=(255, 210, 150))
    y = 420
    for text, size, color, bold in lines:
        f = font(size, bold)
        w = d.textlength(text, font=f)
        d.text(((W - w) / 2, y), text, font=f, fill=color)
        y += int(size * 1.45)
    if sub:
        f = font(34)
        for s in sub:
            w = d.textlength(s, font=f)
            d.text(((W - w) / 2, y + 20), s, font=f, fill=(185, 176, 214))
            y += 50
    img.save(path)


def caption(path, text):
    """Transparent lower-third caption PNG."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(40, bold=False)
    # wrap to ~60 chars
    words, lines, cur = text.split(), [], ''
    for wd in words:
        if len(cur) + len(wd) + 1 > 62:
            lines.append(cur)
            cur = wd
        else:
            cur = (cur + ' ' + wd).strip()
    lines.append(cur)
    lh = 56
    box_h = lh * len(lines) + 40
    widths = [d.textlength(l, font=f) for l in lines]
    box_w = max(widths) + 80
    x0, y0 = (W - box_w) / 2, H - 90 - box_h
    d.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h], radius=28, fill=(14, 12, 24, 190))
    for i, l in enumerate(lines):
        d.text(((W - widths[i]) / 2, y0 + 20 + i * lh), l, font=f, fill=(255, 244, 230, 255))
    img.save(path)


# ---- cards ---------------------------------------------------------------
card(os.path.join(OUT, 'title.png'), [
    ('Lull', 120, (255, 244, 230), True),
    ('Five quiet minutes at your desk to put the day down.', 44, (255, 226, 190), False),
], sub=['A hands-first, seated mixed reality wind-down ritual for Meta Quest',
        'Recorded in the Immersive Web SDK emulator (IWER), real-time, no AI-generated footage'])

end_sub = [
    'Hands only, end to end  ·  Seated, everything within a two-foot reach',
    'Plane detection puts the jars on your real desk  ·  Passthrough dims as you breathe',
    'A star for every night, seven make a constellation  ·  One-handed breathing supported',
    'Built with Immersive Web SDK + WebXR  ·  Runs in Meta Quest Browser',
]
if URL:
    end_sub.append(URL)
card(os.path.join(OUT, 'end.png'), [
    ('Lull', 110, (255, 244, 230), True),
    ('Set the day down. Come back tomorrow.', 44, (255, 226, 190), False),
], sub=end_sub)

# ---- footage plan (source, start, end, captions[(rel_start, rel_end, text)]) -----
N1 = os.path.join(ROOT, 'night1.mp4')
N2 = os.path.join(ROOT, 'night2.mp4')
clips = [
    (N1, 0.0, 34.0, [
        (0.3, 6.5, 'Pinch the ember to begin. No controllers, ever.'),
        (6.5, 14.0, 'Lull finds your real desk with plane detection and sets three jars on it.'),
        (14.0, 24.0, 'Pinch a thought out of the air and carry it to a jar: Tomorrow, Let it rest, or Not mine to carry.'),
        (24.0, 34.0, 'Released thoughts drift away as fireflies. Everything sits within a seated, two-foot reach.'),
    ]),
    (N1, 38.0, 66.0, [
        (0.0, 12.0, 'Breathe with the lantern: open your hands to breathe in, bring them together to breathe out.'),
        (12.0, 28.0, 'Your real room slowly dims around you as your breath slows. One raised hand works too.'),
    ]),
    (N1, 76.0, 103.0, [
        (0.0, 10.0, 'Until it is just you, the lantern, and a night sky.'),
        (10.0, 27.0, 'Tonight becomes a star in your constellation. Pinch the moon to say goodnight.'),
    ]),
    (N2, 0.8, 12.0, [
        (0.0, 11.2, "Night 2: Lull remembers. Last night's 'Tomorrow' thoughts are waiting in their jar."),
    ]),
]

CROP = 'crop=1360:765:120:100,scale=1920:1080:flags=lanczos,setsar=1,fps=30,format=yuv420p'
parts = []
parts.append(('img', os.path.join(OUT, 'title.png'), 5.0))
for i, (src, a, b, caps) in enumerate(clips):
    parts.append(('clip', (src, a, b, caps, i), b - a))
parts.append(('img', os.path.join(OUT, 'end.png'), 8.0))

seg_files = []
for k, (kind, data, dur) in enumerate(parts):
    seg = os.path.join(OUT, f'seg{k}.mp4')
    if kind == 'img':
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-t', str(dur), '-i', data,
               '-vf', 'fps=30,format=yuv420p,fade=t=in:st=0:d=0.8,fade=t=out:st=%.2f:d=0.8' % (dur - 0.8),
               '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', seg]
    else:
        src, a, b, caps, ci = data
        inputs = ['-ss', str(a), '-t', str(b - a), '-i', src]
        filt = f'[0:v]{CROP},fade=t=in:st=0:d=0.6,fade=t=out:st={dur - 0.6:.2f}:d=0.6[v0]'
        last = 'v0'
        for j, (s, e, text) in enumerate(caps):
            p = os.path.join(OUT, f'cap{ci}_{j}.png')
            caption(p, text)
            inputs += ['-loop', '1', '-t', str(b - a), '-i', p]
            nxt = f'v{j + 1}'
            filt += (f';[{j + 1}:v]format=rgba,fade=t=in:st={s:.2f}:d=0.4:alpha=1,'
                     f'fade=t=out:st={max(s, e - 0.4):.2f}:d=0.4:alpha=1[c{j}]'
                     f';[{last}][c{j}]overlay=0:0:enable=\'between(t,{s:.2f},{e:.2f})\'[{nxt}]')
            last = nxt
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', filt, '-map', f'[{last}]',
               '-t', str(b - a), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', seg]
    subprocess.run(cmd, check=True)
    seg_files.append(seg)

listf = os.path.join(OUT, 'list.txt')
with open(listf, 'w') as fh:
    for s in seg_files:
        fh.write(f"file '{s}'\n")
silent = os.path.join(OUT, 'silent.mp4')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listf, '-c', 'copy', silent], check=True)
total = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', silent]).decode().strip())

# ---- soundtrack: the same detuned A-major pad Lull plays in-app (src/audio.ts) ----
freqs = [110, 164.81, 220, 277.18, 329.63]
terms = '+'.join(f'sin(2*PI*{f}*0.9983*t)+sin(2*PI*{f}*1.0017*t)' for f in freqs)
expr = f'0.045*(0.75+0.25*sin(2*PI*0.05*t))*({terms})'
pad = os.path.join(OUT, 'pad.wav')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
                f'aevalsrc={expr}:s=48000:d={total:.2f}',
                '-af', f'lowpass=f=900,afade=t=in:d=3,afade=t=out:st={total - 3:.2f}:d=3,volume=1.4',
                pad], check=True)
final = os.path.join(ROOT, 'lull-demo.mp4')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', pad, '-c:v', 'copy', '-c:a', 'aac',
                '-b:a', '160k', '-shortest', '-movflags', '+faststart', final], check=True)
print(final, round(total, 1), 'seconds')
