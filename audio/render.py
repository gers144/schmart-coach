import json, os, subprocess, sys, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("kokoro-v1.0.int8.onnx", "voices-v1.0.bin")
scripts = json.load(open("scripts.json"))
TITLES = ["The card", "The story behind it", "A fresh idea", "Your action for today"]
idx = json.load(open("out/index.json")) if os.path.exists("out/index.json") else {}
for cid, parts in scripts.items():
    if cid in idx and os.path.exists(f"out/{cid}.mp3"): continue
    sr = 24000; chunks = []; chapters = []; t = 0.0
    titles = TITLES if len(parts) == 4 else TITLES[:2] + TITLES[3:]
    for title, text in zip(titles, parts):
        a, sr = k.create(text, voice="am_michael", speed=1.0, lang="en-us")
        chapters.append({"title": title, "start": round(t, 1)})
        pause = np.zeros(int(sr * 0.6), dtype=a.dtype)
        chunks += [a, pause]; t += (len(a) + len(pause)) / sr
    audio = np.concatenate(chunks)
    sf.write(f"out/{cid}.wav", audio, sr)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"out/{cid}.wav", "-ac", "1", "-b:a", "64k", f"out/{cid}.mp3"], check=True)
    os.remove(f"out/{cid}.wav")
    idx[cid] = {"duration": round(len(audio) / sr, 1), "chapters": chapters, "transcript": parts}
    json.dump(idx, open("out/index.json", "w"), indent=1, ensure_ascii=False)
    print(cid, idx[cid]["duration"], flush=True)
print("DONE", len(idx), flush=True)
