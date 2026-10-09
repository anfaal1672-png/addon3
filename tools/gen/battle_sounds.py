"""Extra sound effects for the battle addon (same procedural style as sounds.py)."""
import numpy as np
from sounds import SR, t, noise, lowpass, bandpass, env, sweep, decay, mixs, reverb, norm, soft, fade


def s_whoosh():
    n = noise(0.45)
    e = np.sin(np.linspace(0, np.pi, len(n))) ** 2
    x = bandpass(n, 500, 3500) * e
    return fade(norm(reverb(x, 0.3, 0.15), 0.8))


def s_gong():
    tt = t(3.0)
    x = sum(np.sin(2 * np.pi * f * tt) * a * decay(3.0, d) for f, a, d in
            ((110, 1.0, 1.2), (164.8, 0.6, 1.6), (220.5, 0.5, 2.0), (277, 0.3, 2.6), (392, 0.2, 3.0)))
    hit = lowpass(noise(3.0), 900) * decay(3.0, 18) * 0.8
    return fade(norm(reverb(mixs(x, hit), 1.2, 0.35), 0.85), 0.002, 0.4)


def s_cheer():
    sec = 3.2
    n = noise(sec)
    swell = env(len(n), a=0.5, d=0.6, s=0.8, r=1.2)
    crowd = bandpass(n, 300, 2400) * swell
    claps = np.zeros(len(n))
    rng = np.random.default_rng(7)
    for _ in range(140):
        i = rng.integers(0, len(n) - 2000)
        claps[i:i + 1200] += bandpass(noise(1200 / SR), 1200, 5000) * np.exp(-np.arange(1200) / 120) * rng.uniform(0.2, 0.6)
    return fade(norm(mixs(crowd * 0.8, claps * swell), 0.8), 0.05, 0.6)


def s_countdown():
    tt = t(0.22)
    x = np.sin(2 * np.pi * 880 * tt) * decay(0.22, 14) + 0.3 * np.sin(2 * np.pi * 1760 * tt) * decay(0.22, 20)
    return fade(norm(x, 0.6))


def s_go():
    tt = t(0.7)
    x = np.sin(2 * np.pi * 1320 * tt) * decay(0.7, 4) + 0.4 * np.sin(2 * np.pi * 1980 * tt) * decay(0.7, 6)
    return fade(norm(reverb(x, 0.5, 0.25), 0.7))


def s_rumble():
    sec = 2.4
    n = lowpass(noise(sec), 140)
    crack = bandpass(noise(sec), 200, 1800) * (np.random.default_rng(3).uniform(0, 1, len(n)) > 0.9985) * 6
    e = env(len(n), a=0.3, d=0.4, s=0.8, r=0.9)
    return fade(norm(soft(mixs(n * 1.4, lowpass(crack, 2500)) * e, 1.6), 0.9), 0.05, 0.5)


def s_struggle():
    sec = 1.6
    hum = sweep(70, 90, sec, "saw") * 0.6 + sweep(140, 180, sec, "saw") * 0.3
    hiss = bandpass(noise(sec), 1500, 6000) * 0.25
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * 9 * t(sec))
    return fade(norm(soft(mixs(lowpass(hum, 900), hiss) * trem, 1.8), 0.85), 0.05, 0.2)


def s_impact():
    sec = 0.9
    thump = sweep(160, 38, sec, "sin", 0.4) * decay(sec, 7)
    crunch = bandpass(noise(sec), 400, 4000) * decay(sec, 22)
    return fade(norm(soft(mixs(thump * 1.2, crunch * 0.8), 2.4), 0.95))


SOUNDS = {
    "whoosh": (s_whoosh, 0.8), "gong": (s_gong, 1.0), "cheer": (s_cheer, 0.8), "countdown": (s_countdown, 0.7),
    "go": (s_go, 0.9), "rumble": (s_rumble, 1.0), "struggle": (s_struggle, 1.0), "impact": (s_impact, 1.0),
}
