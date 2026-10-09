"""Procedural sound effects rendered to .ogg (vorbis) with ffmpeg."""
import os
import subprocess
import tempfile
import wave
import numpy as np

SR = 44100
rng = np.random.default_rng(1234)


def t(sec):
    return np.arange(int(SR * sec)) / SR


def noise(sec):
    return rng.uniform(-1, 1, int(SR * sec))


def lowpass(x, cutoff):
    """FFT brick-ish lowpass with soft knee; cutoff may be an array (applied in chunks)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def highpass(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 - 1 / (1 + (f / max(1, cutoff)) ** 4)
    return np.fft.irfft(X, len(x))


def bandpass(x, lo, hi):
    return highpass(lowpass(x, hi), lo)


def env(n, a=0.01, d=0.1, s=0.7, r=0.2, total=None):
    total = total or n / SR
    tt = np.arange(n) / SR
    e = np.ones(n) * s
    e[tt < a] = tt[tt < a] / max(a, 1e-4)
    m = (tt >= a) & (tt < a + d)
    e[m] = 1 - (1 - s) * (tt[m] - a) / max(d, 1e-4)
    rs = total - r
    m2 = tt >= rs
    e[m2] = s * np.clip(1 - (tt[m2] - rs) / max(r, 1e-4), 0, 1)
    return e


def sweep(f0, f1, sec, shape="sin", curve=1.0):
    tt = t(sec)
    k = (tt / sec) ** curve
    f = f0 + (f1 - f0) * k
    ph = 2 * np.pi * np.cumsum(f) / SR
    if shape == "sin":
        return np.sin(ph)
    if shape == "saw":
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if shape == "square":
        return np.sign(np.sin(ph))
    return np.sin(ph)


def decay(sec, rate):
    return np.exp(-t(sec) * rate)


def pad(x, sec):
    n = int(SR * sec)
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros(n - len(x))])


def mixs(*xs):
    n = max(len(x) for x in xs)
    out = np.zeros(n)
    for x in xs:
        out[:len(x)] += x
    return out


def reverb(x, sec=0.8, amount=0.3):
    ir = noise(sec) * decay(sec, 6.0)
    ir = lowpass(ir, 5000)
    y = np.convolve(x, ir)[:len(x) + int(SR * sec)]
    y /= max(1e-6, np.max(np.abs(y)))
    return mixs(x, y * amount * np.max(np.abs(x)))


def crackle(sec, density=60, amp=1.0):
    x = np.zeros(int(SR * sec))
    n = int(density * sec)
    for _ in range(n):
        p = rng.integers(0, len(x) - 400)
        L = rng.integers(40, 400)
        x[p:p + L] += rng.uniform(-1, 1, L) * np.exp(-np.arange(L) / (L / 4)) * amp
    return x


def norm(x, peak=0.9):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def soft(x, drive=2.0):
    return np.tanh(x * drive) / np.tanh(drive)


def fade(x, fi=0.005, fo=0.05):
    n = len(x)
    a = int(SR * fi)
    b = int(SR * fo)
    e = np.ones(n)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if b:
        e[-b:] = np.linspace(1, 0, b)
    return x * e


# ----------------------------------------------------------------------------------- sound designs
def s_charge():
    sec = 2.5
    rumble = lowpass(noise(sec), 180) * 3
    hum = sweep(70, 95, sec) * 0.5 + sweep(140, 190, sec) * 0.25
    hiss = bandpass(noise(sec), 2000, 6000) * 0.25 * (0.6 + 0.4 * np.sin(t(sec) * 30))
    x = mixs(rumble, hum, hiss, crackle(sec, 25, 0.25))
    return fade(norm(soft(x, 1.5)), 0.2, 0.3)


def s_aura_burst():
    sec = 1.6
    boom = lowpass(noise(sec), 300) * decay(sec, 3) * 4
    whoosh = bandpass(noise(sec), 400, 4000) * env(int(SR * sec), 0.05, 0.3, 0.4, 1.0)
    tone = sweep(60, 220, sec, curve=0.5) * decay(sec, 2) * 0.6
    return fade(norm(soft(reverb(mixs(boom, whoosh, tone), 1.0, 0.4), 2.0)), 0.002, 0.3)


def s_blast():
    sec = 0.6
    z = sweep(1600, 300, sec, "saw", 0.6) * decay(sec, 7) * 0.5
    w = bandpass(noise(sec), 800, 5000) * decay(sec, 9)
    b = lowpass(noise(sec), 250) * decay(sec, 10) * 2
    return fade(norm(soft(mixs(z, w, b), 1.8)), 0.001, 0.1)


def s_beam_charge():
    sec = 2.4
    k = (t(sec) / sec)
    tone = sweep(200, 900, sec, "saw", 1.4) * 0.25 * (0.3 + k)
    shim = np.sin(2 * np.pi * (1800 + 600 * k) * t(sec)) * 0.08 * (0.5 + 0.5 * np.sin(t(sec) * 40))
    hiss = bandpass(noise(sec), 3000, 9000) * 0.25 * k
    rum = lowpass(noise(sec), 120) * 2 * k
    return fade(norm(soft(mixs(tone, shim, hiss, rum), 1.4)), 0.05, 0.1)


def s_beam_fire():
    sec = 2.8
    blast = lowpass(noise(sec), 400) * env(int(SR * sec), 0.01, 0.4, 0.6, 1.0) * 3
    roar = bandpass(noise(sec), 300, 3500) * env(int(SR * sec), 0.02, 0.5, 0.7, 1.2)
    buzz = sweep(110, 90, sec, "saw") * 0.35 * env(int(SR * sec), 0.01, 0.2, 0.8, 1.0)
    return fade(norm(soft(reverb(mixs(blast, roar, buzz), 0.8, 0.3), 2.2)), 0.003, 0.5)


def s_explosion(big=False):
    sec = 3.5 if big else 2.0
    low = lowpass(noise(sec), 140 if big else 220) * decay(sec, 1.4 if big else 2.5) * 5
    mid = bandpass(noise(sec), 300, 2500) * decay(sec, 3 if big else 5) * 1.5
    cr = crackle(sec, 80, 0.5) * decay(sec, 1.5)
    x = mixs(low, mid, cr)
    return fade(norm(soft(reverb(x, 1.5 if big else 0.8, 0.5), 2.5)), 0.001, 0.6)


def s_punch(heavy=False):
    sec = 0.45 if heavy else 0.25
    thump = sweep(160 if heavy else 220, 45, sec, curve=0.4) * decay(sec, 14 if heavy else 22) * 1.4
    slap = bandpass(noise(sec), 800, 6000) * decay(sec, 40) * 0.9
    x = mixs(thump, slap)
    if heavy:
        x = mixs(x, lowpass(noise(sec), 200) * decay(sec, 8) * 2)
    return fade(norm(soft(x, 2.5)), 0.0005, 0.05)


def s_clash():
    sec = 0.9
    crack = bandpass(noise(sec), 1500, 9000) * decay(sec, 18) * 1.5
    thud = lowpass(noise(sec), 180) * decay(sec, 6) * 4
    ring = (np.sin(2 * np.pi * 820 * t(sec)) + np.sin(2 * np.pi * 1310 * t(sec))) * decay(sec, 7) * 0.2
    return fade(norm(soft(reverb(mixs(crack, thud, ring), 0.7, 0.4), 2)), 0.0005, 0.2)


def s_dash():
    sec = 0.5
    k = np.sin(np.pi * t(sec) / sec)
    w = bandpass(noise(sec), 500, 5000) * k
    return fade(norm(w), 0.005, 0.05)


def s_teleport():
    sec = 0.5
    z = sweep(300, 2400, sec * 0.3, curve=0.5)
    z = pad(z, sec) * decay(sec, 8)
    s = bandpass(noise(sec), 4000, 10000) * decay(sec, 15) * 0.5
    return fade(norm(mixs(z * 0.6, s)), 0.001, 0.1)


def s_transform():
    sec = 3.0
    rise = sweep(50, 160, sec, "saw", 0.7) * 0.35 * env(int(SR * sec), 0.3, 0.5, 0.9, 0.6)
    roar = lowpass(noise(sec), 500) * 3 * env(int(SR * sec), 0.4, 0.4, 0.8, 0.8)
    burst = pad(np.zeros(int(SR * 1.6)), 1.6)
    burst = np.concatenate([burst, lowpass(noise(sec - 1.6), 300) * decay(sec - 1.6, 2.5) * 6])
    cr = crackle(sec, 70, 0.6) * env(int(SR * sec), 0.8, 0.3, 0.8, 0.6)
    return fade(norm(soft(reverb(mixs(rise, roar, burst, cr), 1.2, 0.4), 2.4)), 0.05, 0.5)


def s_lightning():
    sec = 0.8
    x = crackle(sec, 300, 1.0) * decay(sec, 5)
    x = mixs(x, bandpass(noise(sec), 2000, 10000) * decay(sec, 20))
    return fade(norm(soft(x, 2)), 0.0005, 0.1)


def s_beep(f=1800, n=2):
    parts = []
    for i in range(n):
        b = np.sin(2 * np.pi * f * t(0.07)) * 0.6
        parts.append(fade(b, 0.002, 0.01))
        parts.append(np.zeros(int(SR * 0.05)))
    return norm(np.concatenate(parts), 0.6)


def s_scouter_explode():
    sec = 1.0
    x = mixs(pad(s_beep(2600, 3), sec), np.concatenate([np.zeros(int(SR * 0.35)), s_punch(True)]),
             np.concatenate([np.zeros(int(SR * 0.35)), crackle(0.65, 200, 0.8) * decay(0.65, 6)]))
    return fade(norm(x), 0.001, 0.1)


def s_radar():
    x = np.sin(2 * np.pi * 1250 * t(0.12)) * decay(0.12, 25)
    return fade(norm(pad(x, 0.3), 0.5), 0.001, 0.05)


def s_summon():
    sec = 6.0
    rum = lowpass(noise(sec), 90) * 4 * env(int(SR * sec), 1.5, 1, 0.9, 1.5)
    chord = sum(np.sin(2 * np.pi * f * t(sec)) for f in (110, 164.8, 220, 277.2)) * 0.12 * env(int(SR * sec), 2, 1, 0.8, 1.5)
    thunder = np.concatenate([np.zeros(int(SR * 2.5)), s_explosion(True)[:int(SR * 3.5)]])
    return fade(norm(soft(reverb(mixs(rum, chord, thunder * 0.6), 1.5, 0.5), 1.5)), 0.5, 1.0)


def s_roar():
    sec = 2.5
    base = sweep(90, 60, sec, "saw") * 0.6
    base = bandpass(base + noise(sec) * 0.6, 80, 1800)
    vib = 1 + 0.3 * np.sin(2 * np.pi * 9 * t(sec))
    return fade(norm(soft(reverb(base * vib * env(int(SR * sec), 0.3, 0.5, 0.8, 0.8), 1.5, 0.5), 2)), 0.1, 0.6)


def s_chime(freqs=(880, 1108.7, 1318.5, 1760), step=0.09, tail=1.2):
    out = np.zeros(int(SR * (step * len(freqs) + tail)))
    for i, f in enumerate(freqs):
        s = (np.sin(2 * np.pi * f * t(tail)) + 0.3 * np.sin(2 * np.pi * 2 * f * t(tail))) * decay(tail, 4)
        p = int(SR * step * i)
        out[p:p + len(s)] += s
    return fade(norm(reverb(out, 1.0, 0.3), 0.7), 0.001, 0.2)


def s_senzu():
    sec = 0.35
    x = crackle(sec, 120, 1.0) * env(int(SR * sec), 0.01, 0.1, 0.6, 0.15)
    return fade(norm(bandpass(x, 600, 5000)), 0.001, 0.05)


def s_capsule():
    sec = 1.2
    pop = sweep(900, 200, 0.12) * decay(0.12, 30)
    puff = bandpass(noise(sec), 300, 3000) * env(int(SR * sec), 0.02, 0.3, 0.3, 0.8)
    return fade(norm(mixs(pad(pop, sec) * 1.2, puff)), 0.001, 0.3)


def s_boss():
    sec = 3.0
    hit = mixs(lowpass(noise(sec), 120) * decay(sec, 1.5) * 4)
    brass = sum(sweep(f, f * 0.98, sec, "saw") for f in (73.4, 110, 146.8)) * 0.25 * env(int(SR * sec), 0.05, 0.6, 0.6, 1.5)
    brass = lowpass(brass, 1500)
    return fade(norm(soft(reverb(mixs(hit, brass), 1.5, 0.5), 1.8)), 0.002, 0.8)


def s_flash():
    sec = 0.9
    x = sweep(2000, 6000, 0.15) * decay(0.15, 10)
    shimmer = bandpass(noise(sec), 5000, 12000) * decay(sec, 4) * 0.8
    return fade(norm(mixs(pad(x, sec), shimmer)), 0.001, 0.2)


def s_disc():
    sec = 1.5
    x = sweep(1200, 1000, sec, "saw") * 0.3 * (1 + 0.5 * np.sin(2 * np.pi * 25 * t(sec)))
    x = bandpass(x + noise(sec) * 0.2, 500, 6000)
    return fade(norm(x), 0.05, 0.3)


def s_gather():
    sec = 3.0
    pad_ = sum(np.sin(2 * np.pi * f * t(sec) + i) for i, f in enumerate((220, 277.2, 329.6, 440))) * 0.2
    sh = bandpass(noise(sec), 3000, 8000) * 0.2 * (0.5 + 0.5 * np.sin(2 * np.pi * 3 * t(sec)))
    return fade(norm(reverb(mixs(pad_, sh), 1.5, 0.5)), 0.5, 0.8)


def s_wind():
    sec = 2.0
    x = bandpass(noise(sec), 200, 2500) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.8 * t(sec)))
    return fade(norm(x, 0.6), 0.3, 0.3)


def s_guard():
    sec = 0.4
    x = mixs(sweep(500, 380, sec) * decay(sec, 12) * 0.6, bandpass(noise(sec), 1500, 6000) * decay(sec, 25))
    return fade(norm(x), 0.0005, 0.05)


def s_just_guard():
    return norm(mixs(s_guard(), pad(s_chime((1568, 2093), 0.05, 0.4), 0.5) * 0.6))


def s_levelup():
    return s_chime((523.3, 659.3, 784, 1046.5, 1318.5), 0.08, 1.4)


def s_learn():
    return s_chime((659.3, 830.6, 987.8, 1318.5), 0.12, 1.6)


def s_click():
    x = np.sin(2 * np.pi * 1400 * t(0.05)) * decay(0.05, 60)
    return norm(pad(x, 0.1), 0.5)


def s_fusion():
    sec = 3.0
    a = s_chime((392, 523.3, 659.3, 784, 1046.5), 0.15, 1.5)
    b = s_aura_burst()
    return norm(mixs(pad(a, sec), np.concatenate([np.zeros(int(SR * 1.0)), b])[:int(SR * sec)]))


def s_ko():
    sec = 1.5
    x = mixs(s_punch(True), pad(lowpass(noise(sec), 100) * decay(sec, 2) * 2, sec))
    return fade(norm(reverb(x, 1.0, 0.5)), 0.001, 0.3)


SOUNDS = {
    "charge": (s_charge, 0.8), "aura_burst": (s_aura_burst, 1.0), "blast": (s_blast, 0.8),
    "beam_charge": (s_beam_charge, 0.9), "beam_fire": (s_beam_fire, 1.0), "explosion": (s_explosion, 1.0),
    "big_explosion": (lambda: s_explosion(True), 1.0), "punch": (s_punch, 0.8), "punch_heavy": (lambda: s_punch(True), 1.0),
    "clash": (s_clash, 1.0), "dash": (s_dash, 0.7), "teleport": (s_teleport, 0.8), "transform": (s_transform, 1.0),
    "lightning": (s_lightning, 0.7), "scouter_beep": (lambda: s_beep(1800, 2), 0.6), "scouter_explode": (s_scouter_explode, 0.9),
    "radar": (s_radar, 0.6), "summon": (s_summon, 1.0), "roar": (s_roar, 1.0), "wish": (lambda: s_chime((523.3, 659.3, 784, 1046.5, 1568), 0.18, 2.0), 0.9),
    "senzu": (s_senzu, 0.8), "capsule": (s_capsule, 0.9), "boss": (s_boss, 1.0), "flash": (s_flash, 0.9),
    "disc": (s_disc, 0.8), "gather": (s_gather, 0.8), "wind": (s_wind, 0.5), "guard": (s_guard, 0.8),
    "just_guard": (s_just_guard, 0.9), "levelup": (s_levelup, 0.8), "learn": (s_learn, 0.8), "click": (s_click, 0.5),
    "fusion": (s_fusion, 1.0), "ko": (s_ko, 0.9),
}


def write_ogg(x, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        wav_path = tf.name
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-c:a", "libvorbis", "-q:a", "4", path], check=True)
    os.unlink(wav_path)


def build(out_dir):
    defs = {}
    for name, (fn, vol) in SOUNDS.items():
        write_ogg(fn(), os.path.join(out_dir, "sounds", "dbz", f"{name}.ogg"))
        defs[f"dbz.{name}"] = {"category": "player", "max_distance": 48.0 if "explosion" not in name else 96.0,
                               "sounds": [{"name": f"sounds/dbz/{name}", "volume": vol, "load_on_low_memory": True}]}
    return defs
