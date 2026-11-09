#!/usr/bin/env python3
"""Render an original, reusable 1960s-inspired jukebox vinyl music video.

Requires ffmpeg, ffprobe, and Inkscape. Does not publish anything.
Example: python3 scripts/render-jukebox.py --audio song.mp3 --title "My Song" --output my-song.mp4
"""
import argparse
import html
import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path


def run(args):
    subprocess.run(args, check=True)


def svg_text(value):
    return html.escape(value, quote=True)


def build_art(title, artist, destination, portrait):
    width, height = (1080, 1920) if portrait else (1920, 1080)
    center_x, center_y = width / 2, height * (0.53 if portrait else 0.55)
    # Preserve margins for the permanent song caption and the jukebox header.
    radius = min(width * (0.34 if portrait else 0.41), height * (0.23 if portrait else 0.205))
    short_title = title.strip()[:64]
    if not short_title:
        raise ValueError("Song title cannot be empty")
    title_size = 39 if portrait else 36
    readable_title = svg_text(title.strip()[:90])
    # Text is drawn on the label itself so it rotates with the record.
    disc = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
      <circle cx="500" cy="500" r="492" fill="#0a0b11" stroke="#343743" stroke-width="9"/>
      {''.join(f'<circle cx="500" cy="500" r="{r}" fill="none" stroke="#3b3e47" stroke-opacity=".43" stroke-width="2"/>' for r in range(285,485,7))}
      <path d="M 140 155 A 460 460 0 0 1 410 48" fill="none" stroke="#b0c6cf" stroke-opacity=".22" stroke-width="11"/>
      <circle cx="500" cy="500" r="217" fill="#d0a552" stroke="#e9d6a2" stroke-width="5"/>
      <circle cx="500" cy="500" r="190" fill="#b63c3c" stroke="#682525" stroke-width="5"/>
      <circle cx="500" cy="500" r="167" fill="none" stroke="#f1c775" stroke-width="3"/>
      <text x="500" y="417" text-anchor="middle" fill="#fff1c3" font-family="DejaVu Sans" font-size="37" font-weight="bold">RE-MASTER</text>
      <text x="500" y="457" text-anchor="middle" fill="#fff1c3" font-family="DejaVu Sans" font-size="43" font-weight="bold">FREDDY</text>
      <text x="500" y="566" text-anchor="middle" fill="#ffffff" font-family="DejaVu Sans" font-size="{title_size}" font-weight="bold" textLength="{min(320,max(110,len(short_title)*20))}" lengthAdjust="spacingAndGlyphs">{svg_text(short_title)}</text>
      <text x="500" y="614" text-anchor="middle" fill="#ffe4af" font-family="DejaVu Sans" font-size="23">45 RPM · STEREO</text>
      <circle cx="500" cy="500" r="17" fill="#1b1b1b" stroke="#f8e8c3" stroke-width="4"/>
    </svg>'''
    background = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
      <defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="#132c37"/><stop offset="1" stop-color="#0b0b14"/></linearGradient>
      <linearGradient id="chrome"><stop stop-color="#9de7e5"/><stop offset=".5" stop-color="#e8ede0"/><stop offset="1" stop-color="#467e93"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect x="{width*.055}" y="{height*.06}" width="{width*.89}" height="{height*.88}" rx="{min(width,height)*.13}" fill="#571c24" stroke="url(#chrome)" stroke-width="22"/>
      <rect x="{width*.09}" y="{height*.095}" width="{width*.82}" height="{height*.81}" rx="{min(width,height)*.10}" fill="#14202a" stroke="#e1b45a" stroke-width="10"/>
      <path d="M {width*.15} {height*.18} Q {width*.5} {height*.02} {width*.85} {height*.18}" fill="none" stroke="#65d5d5" stroke-width="22"/>
      <path d="M {width*.155} {height*.188} Q {width*.5} {height*.028} {width*.845} {height*.188}" fill="none" stroke="#d4f9fa" stroke-opacity=".75" stroke-width="5"/>
      <path d="M {width*.115} {height*.23} V {height*.72} Q {width*.115} {height*.83} {width*.23} {height*.83}" fill="none" stroke="#e8bc72" stroke-opacity=".7" stroke-width="7"/>
      <path d="M {width*.885} {height*.23} V {height*.72} Q {width*.885} {height*.83} {width*.77} {height*.83}" fill="none" stroke="#e8bc72" stroke-opacity=".7" stroke-width="7"/>
      <path d="M {width*.14} {height*.24} V {height*.67}" fill="none" stroke="#5ce2e7" stroke-opacity=".55" stroke-width="9"/>
      <path d="M {width*.86} {height*.24} V {height*.67}" fill="none" stroke="#5ce2e7" stroke-opacity=".55" stroke-width="9"/>
      <rect x="{width*.13}" y="{height*.77}" width="{width*.74}" height="{height*.038}" rx="{height*.012}" fill="#1b2e3b" stroke="#c3a575" stroke-width="3"/>
      {''.join(f'<rect x="{width*(.155+i*.048)}" y="{height*.779}" width="{width*.024}" height="{height*.016}" rx="3" fill="#e4c78e" opacity=".8"/>' for i in range(15))}
      <text x="{width/2}" y="{height*.15}" fill="#f7d68b" font-family="DejaVu Sans" font-weight="bold" font-size="{48 if portrait else 47}" text-anchor="middle">RE-MASTER FREDDY</text>
      <circle cx="{center_x}" cy="{center_y}" r="{radius*1.09}" fill="#080a0f" stroke="#e6c570" stroke-width="18"/>
      <circle cx="{center_x}" cy="{center_y}" r="{radius*1.01}" fill="#151721" stroke="#68777f" stroke-width="7"/>
      <text x="{width/2}" y="{height*.845}" fill="#ffffff" font-family="DejaVu Sans" font-weight="bold" text-anchor="middle" font-size="{32 if portrait else 35}" textLength="{min(width*.78, max(180, len(title)*21))}" lengthAdjust="spacingAndGlyphs">{readable_title}</text>
      <text x="{width/2}" y="{height*.895}" fill="#ead6a9" font-family="DejaVu Sans" text-anchor="middle" font-size="{24 if portrait else 24}">JUKEBOX SINGLES · 1960s EDITION</text>
    </svg>'''
    # Fixed playback tonearm: an independent foreground overlay, not a record changer.
    # The stylus rests at the outer groove while the disc spins beneath it.
    pivot_x, pivot_y = center_x + radius * 1.04, center_y - radius * 1.10
    stylus_x, stylus_y = center_x + radius * .67, center_y - radius * .66
    tonearm = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
      <defs><linearGradient id="tone-metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f7f2df"/><stop offset=".48" stop-color="#9cb9c5"/><stop offset="1" stop-color="#425866"/></linearGradient></defs>
      <circle cx="{pivot_x}" cy="{pivot_y}" r="{radius*.10}" fill="#14222c" stroke="#d5b77e" stroke-width="{radius*.025}"/>
      <circle cx="{pivot_x}" cy="{pivot_y}" r="{radius*.055}" fill="#a5c3ca" stroke="#f5e8c8" stroke-width="{radius*.012}"/>
      <path d="M {pivot_x} {pivot_y} L {pivot_x-radius*.10} {pivot_y+radius*.15} L {stylus_x+radius*.06} {stylus_y-radius*.05}"
            fill="none" stroke="#08141b" stroke-width="{radius*.095}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M {pivot_x} {pivot_y} L {pivot_x-radius*.10} {pivot_y+radius*.15} L {stylus_x+radius*.06} {stylus_y-radius*.05}"
            fill="none" stroke="url(#tone-metal)" stroke-width="{radius*.060}" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="{stylus_x-radius*.095}" y="{stylus_y-radius*.075}" width="{radius*.19}" height="{radius*.15}" rx="{radius*.025}" fill="#c1d3d7" stroke="#273b49" stroke-width="{radius*.015}"/>
      <path d="M {stylus_x} {stylus_y+radius*.075} v {radius*.055}" stroke="#e4c27c" stroke-width="{radius*.015}" stroke-linecap="round"/>
    </svg>'''
    tonearm_svg = destination / "tonearm.svg"
    disc_svg = destination / "disc.svg"
    bg_svg = destination / "background.svg"
    tonearm_svg.write_text(tonearm, encoding="utf-8")
    disc_svg.write_text(disc, encoding="utf-8")
    bg_svg.write_text(background, encoding="utf-8")
    run(["inkscape", str(tonearm_svg), "--export-filename", str(destination / "tonearm.png")])
    run(["inkscape", str(disc_svg), "--export-filename", str(destination / "disc.png")])
    run(["inkscape", str(bg_svg), "--export-filename", str(destination / "background.png")])
    return width, height, round(radius * 2)


def render(audio, title, output, portrait, seconds=None, cabinet_image=None):
    for tool in ("ffmpeg", "ffprobe", "inkscape"):
        if not shutil.which(tool):
            raise RuntimeError(f"Required executable not found: {tool}")
    if cabinet_image is not None and not cabinet_image.is_file():
        raise FileNotFoundError(cabinet_image)
    if not audio.is_file():
        raise FileNotFoundError(audio)
    probe = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(audio)], text=True)
    available = float(json.loads(probe)["format"]["duration"])
    duration = min(available, seconds) if seconds else available
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Audio duration must be positive")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="remaster-jukebox-") as tmp:
        directory = Path(tmp)
        width, height, disc_size = build_art(title, "Re-master Freddy", directory, portrait)
        x, y = (width-disc_size)//2, int(height * (0.53 if portrait else 0.55)-disc_size/2)
        # The vinyl is already on the platter. No mechanical changer or sliding record.
        # A continuous 45 RPM spin avoids unrealistic motion and makes the loop reusable.
        # An optional photographic cabinet can replace the illustrated backdrop.
        # Keep vinyl and tonearm as separate layers so they remain animated.
        backdrop = cabinet_image if cabinet_image is not None else directory / "background.png"
        # Photo cabinets deliberately have an empty marquee. Render the current
        # track title as a separate transparent layer instead of baking it in.
        title_image = None
        if cabinet_image is not None:
            title_svg = directory / "marquee-title.svg"
            title_image = directory / "marquee-title.png"
            marquee_y = height * (0.32 if portrait else 0.31)
            font_size = 55 if portrait else 65
            title_svg.write_text(
                f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
                f'<text x="{width/2}" y="{marquee_y}" text-anchor="middle" '
                f'font-family="DejaVu Serif" font-style="italic" font-weight="bold" '
                f'font-size="{font_size}" fill="#39170e" '
                f'textLength="{min(width*.61, max(170, len(title)*font_size*.55))}" '
                f'lengthAdjust="spacingAndGlyphs">{svg_text(title.strip()[:90])}</text></svg>',
                encoding="utf-8")
            run(["inkscape", str(title_svg), "--export-filename", str(title_image)])
        filtergraph = (f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
                       f"crop={width}:{height},setsar=1,format=rgba[bg];"
                       f"[1:v]scale={disc_size}:{disc_size},format=rgba,"
                       f"rotate='-1.5*PI*t':ow=iw:oh=ih:c=none[record];"
                       f"[bg][record]overlay=x={x}:y={y}:shortest=1[deck];"
                       f"[2:v]format=rgba[tonearm];"
                       f"[deck][tonearm]overlay=0:0:shortest=1,format=yuv420p[v]")
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", str(backdrop),
                   "-loop", "1", "-i", str(directory/"disc.png"), "-loop", "1", "-i", str(directory/"tonearm.png"), "-i", str(audio),
                   "-filter_complex", filtergraph, "-map", "[v]", "-map", "3:a:0", "-t", f"{duration:.3f}",
                   "-r", "25", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "192k",
                   "-movflags", "+faststart", "-shortest", str(output)]
        if title_image is not None:
            # Insert transparent title layer before audio; update the audio index.
            audio_input_index = command.index("-filter_complex") - 2
            command[audio_input_index:audio_input_index] = ["-loop", "1", "-i", str(title_image)]
            command[command.index("-filter_complex") + 1] = filtergraph.replace(
                "format=yuv420p[v]", "format=rgba[witharm];[3:v]format=rgba[title];"
                "[witharm][title]overlay=0:0:shortest=1,format=yuv420p[v]")
            command[command.index("-map") + 3] = "4:a:0"
        run(command)
    return duration


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--portrait", action="store_true", help="1080x1920 vertical Short instead of 1920x1080")
    parser.add_argument("--seconds", type=float, default=None, help="Optional preview/Short duration")
    parser.add_argument("--cabinet-image", type=Path, help="Optional photographic cabinet backdrop (PNG/JPG); original illustrated cabinet remains the default")
    args = parser.parse_args()
    length = render(args.audio, args.title, args.output, args.portrait, args.seconds, args.cabinet_image)
    print(f"Rendered {args.output} ({length:.1f} seconds)")
