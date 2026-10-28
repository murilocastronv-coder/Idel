// MU Idle Legends — efeitos sonoros e ambiente gerados com Web Audio (sem arquivos de áudio)
'use strict';
(function () {
  let ac = null, master = null, sfxBus = null, ambBus = null, ambNodes = [], ambTheme = null, ambTimer = null;
  const store = (() => { try { return window.localStorage; } catch (_) { return null; } })();
  const get = (k, d) => { try { const v = store && store.getItem(k); return v === null || v === undefined ? d : v; } catch (_) { return d; } };
  const set = (k, v) => { try { if (store) store.setItem(k, v); } catch (_) { /* sem armazenamento */ } };
  let volume = Number(get('mui_vol', '0.6'));
  let muted = get('mui_mute', '0') === '1';
  let recent = [];

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain(); master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      ambBus = ac.createGain(); ambBus.gain.value = 0.35; ambBus.connect(master);
      apply();
    }
    if (ac.state === 'suspended') ac.resume();
    return true;
  }
  function apply() { if (master) master.gain.value = muted ? 0 : volume; }
  function allowed() {
    // limita a quantidade de sons por segundo (evita barulho e travamentos)
    const now = performance.now();
    recent = recent.filter((t) => now - t < 1000);
    if (recent.length > 14) return false;
    recent.push(now);
    return true;
  }
  function tone(freq, dur, { type = 'square', gain = 0.12, slide = 0, delay = 0, bus } = {}) {
    if (!ac || muted) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || sfxBus); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  let noiseBuf = null;
  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function noise(dur, { gain = 0.15, freq = 1200, q = 1, type = 'lowpass', delay = 0, slide = 0 } = {}) {
    if (!ac || muted) return;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer();
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t0); src.stop(t0 + dur + 0.05);
  }

  const S = {
    unlock() { ensure(); },
    get volume() { return volume; },
    get muted() { return muted; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); set('mui_vol', String(volume)); apply(); },
    setMuted(m) { muted = !!m; set('mui_mute', muted ? '1' : '0'); apply(); if (!muted && ambTheme) S.ambient(ambTheme, true); },
    hit(heavy) { if (!ac || !allowed()) return; noise(0.09, { gain: heavy ? 0.22 : 0.14, freq: heavy ? 900 : 1600, slide: 0.4 }); tone(heavy ? 120 : 180, 0.08, { type: 'square', gain: 0.05, slide: 0.5 }); },
    crit() { if (!ac || !allowed()) return; noise(0.14, { gain: 0.25, freq: 2400, slide: 0.3 }); tone(660, 0.12, { type: 'square', gain: 0.07, slide: 1.6 }); },
    hurt() { if (!ac || !allowed()) return; tone(220, 0.12, { type: 'sawtooth', gain: 0.06, slide: 0.5 }); },
    cast(fx) {
      if (!ac || !allowed()) return;
      if (fx === 'fire' || fx === 'meteor') noise(0.3, { gain: 0.14, freq: 600, slide: 3, type: 'bandpass', q: 0.8 });
      else if (fx === 'ice') { tone(1200, 0.18, { type: 'triangle', gain: 0.06, slide: 1.5 }); tone(1800, 0.12, { type: 'sine', gain: 0.04, delay: 0.05 }); }
      else if (fx === 'lightning') { noise(0.25, { gain: 0.2, freq: 3000, type: 'highpass' }); tone(90, 0.2, { type: 'sawtooth', gain: 0.06, slide: 0.6 }); }
      else if (fx === 'arrow' || fx === 'arrow3') noise(0.08, { gain: 0.1, freq: 3000, type: 'highpass', slide: 0.5 });
      else if (fx === 'dark' || fx === 'spirit') tone(300, 0.25, { type: 'sine', gain: 0.07, slide: 0.5 });
      else tone(500, 0.15, { type: 'triangle', gain: 0.06, slide: 1.8 });
    },
    buff() { if (!ac) return; [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.07, delay: i * 0.07 })); },
    heal() { if (!ac) return; [660, 880].forEach((f, i) => tone(f, 0.2, { type: 'sine', gain: 0.06, delay: i * 0.08 })); },
    levelUp() { if (!ac) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'square', gain: 0.07, delay: i * 0.09 })); },
    drop(rarity) {
      if (!ac) return;
      const rich = ['epic', 'legendary', 'ancestral'].includes(rarity);
      tone(rich ? 880 : 740, 0.1, { type: 'triangle', gain: 0.08 });
      tone(rich ? 1320 : 990, 0.16, { type: 'triangle', gain: 0.07, delay: 0.08 });
      if (rich) tone(1760, 0.3, { type: 'sine', gain: 0.06, delay: 0.18 });
    },
    coin() { if (!ac || !allowed()) return; tone(1400, 0.06, { type: 'square', gain: 0.03 }); tone(2100, 0.08, { type: 'square', gain: 0.03, delay: 0.05 }); },
    boss() { if (!ac) return; tone(70, 1.2, { type: 'sawtooth', gain: 0.12, slide: 0.6 }); noise(1.0, { gain: 0.12, freq: 300 }); },
    warn() { if (!ac) return; tone(440, 0.15, { type: 'square', gain: 0.05 }); tone(440, 0.15, { type: 'square', gain: 0.05, delay: 0.25 }); },
    slam() { if (!ac) return; noise(0.6, { gain: 0.3, freq: 400, slide: 0.2 }); tone(55, 0.5, { type: 'sine', gain: 0.2, slide: 0.5 }); },
    death() { if (!ac) return; tone(330, 0.5, { type: 'triangle', gain: 0.08, slide: 0.4 }); },
    duel() { if (!ac) return; [392, 523].forEach((f, i) => tone(f, 0.25, { type: 'square', gain: 0.07, delay: i * 0.15 })); },
    click() { if (!ac || !allowed()) return; tone(900, 0.04, { type: 'square', gain: 0.03 }); },

    // Som ambiente contínuo de cada região
    ambient(theme, force) {
      if (!ensure()) return;
      if (ambTheme === theme && !force) return;
      ambTheme = theme;
      ambNodes.forEach((n) => { try { n.stop(); } catch (_) { /* já parado */ } });
      ambNodes = [];
      clearInterval(ambTimer);
      if (muted) return;
      const loopNoise = (freq, type, gain, lfo) => {
        const src = ac.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
        const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.7;
        const g = ac.createGain(); g.gain.value = gain;
        if (lfo) { const o = ac.createOscillator(); const og = ac.createGain(); o.frequency.value = lfo; og.gain.value = gain * 0.8; o.connect(og); og.connect(g.gain); o.start(); ambNodes.push(o); }
        src.connect(f); f.connect(g); g.connect(ambBus); src.start(); ambNodes.push(src);
      };
      if (theme === 'snow') loopNoise(700, 'bandpass', 0.18, 0.12);
      else if (theme === 'lava') { loopNoise(160, 'lowpass', 0.35, 0.3); }
      else if (theme === 'dungeon') { loopNoise(220, 'lowpass', 0.18, 0.05); }
      else if (theme === 'water') { loopNoise(300, 'lowpass', 0.3, 0.2); }
      else if (theme === 'desert' || theme === 'sky') { loopNoise(theme === 'sky' ? 1200 : 600, 'bandpass', 0.2, 0.15); }
      else if (theme === 'tower' || theme === 'void') { loopNoise(140, 'lowpass', 0.22, 0.07); }
      else if (theme === 'darkforest') { loopNoise(900, 'bandpass', 0.06, 0.1); }
      else loopNoise(1800, 'bandpass', 0.05, 0.08);
      // detalhes aleatórios: pássaros, gotas, estalos
      ambTimer = setInterval(() => {
        if (muted || document.hidden) return;
        if (theme === 'town' || theme === 'noria' || theme === 'darkforest') { if (Math.random() < 0.5) { const f = 2200 + Math.random() * 1400; tone(f, 0.06, { type: 'sine', gain: 0.025, slide: 1.3, bus: ambBus }); tone(f * 1.1, 0.06, { type: 'sine', gain: 0.02, delay: 0.09, slide: 0.9, bus: ambBus }); } }
        else if (theme === 'dungeon' || theme === 'tower' || theme === 'void') { if (Math.random() < 0.4) tone(1600 + Math.random() * 600, 0.08, { type: 'sine', gain: 0.03, slide: 0.5, bus: ambBus }); }
        else if (theme === 'lava') { if (Math.random() < 0.6) noise(0.08, { gain: 0.05, freq: 2500, type: 'highpass' }); }
      }, 1800);
    },
  };
  window.Sfx = S;
  const unlock = () => { S.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
})();
