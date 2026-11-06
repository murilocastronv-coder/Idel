// MU Idle Legends — músicas originais de cada mapa, compostas na hora com Web Audio (sem arquivos de áudio).
// Cada mapa tem um perfil (escala, andamento, progressão de acordes e instrumentos) e uma melodia
// gerada por um sorteio com semente fixa: o mesmo mapa toca sempre a mesma música.
'use strict';
(function () {
  const store = (() => { try { return window.localStorage; } catch (_) { return null; } })();
  const get = (k, d) => { try { const v = store && store.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
  const set = (k, v) => { try { if (store) store.setItem(k, v); } catch (_) { /* sem armazenamento */ } };

  let ac = null, out = null, verb = null, dry = null, timer = null, song = null, wanted = null;
  let enabled = get('mui_music', '1') === '1';

  // ---------- escalas (semitons) ----------
  const SCALE = {
    major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
    phrygDom: [0, 1, 4, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10],
  };
  // perfis: raiz (MIDI), escala, BPM, progressão (graus 0-6), instrumentos e percussão
  const P = {
    town: { root: 62, scale: 'major', bpm: 84, prog: [0, 3, 5, 4, 0, 3, 4, 0], lead: 'flute', arp: 'harp', pad: 'strings', perc: 'soft' },
    noria: { root: 67, scale: 'lydian', bpm: 74, prog: [0, 1, 0, 4, 5, 1, 4, 0], lead: 'bell', arp: 'harp', pad: 'air', perc: null },
    devias: { root: 64, scale: 'dorian', bpm: 70, prog: [0, 3, 0, 6, 5, 3, 6, 0], lead: 'bell', arp: 'harp', pad: 'strings', perc: null },
    dungeon: { root: 50, scale: 'harmonic', bpm: 64, prog: [0, 5, 3, 4, 0, 5, 1, 4], lead: 'choir', arp: null, pad: 'organ', perc: 'deep' },
    tower: { root: 59, scale: 'harmonic', bpm: 66, prog: [0, 3, 5, 4, 0, 1, 5, 4], lead: 'bell', arp: 'harp', pad: 'choir', perc: 'deep' },
    lava: { root: 50, scale: 'phrygian', bpm: 98, prog: [0, 1, 0, 6, 0, 1, 5, 6], lead: 'brass', arp: null, pad: 'organ', perc: 'tribal' },
    water: { root: 65, scale: 'dorian', bpm: 72, prog: [0, 6, 3, 0, 5, 6, 3, 4], lead: 'bell', arp: 'harp', pad: 'air', perc: null },
    desert: { root: 57, scale: 'phrygDom', bpm: 92, prog: [0, 1, 0, 6, 0, 1, 6, 0], lead: 'lute', arp: 'lute', pad: 'drone', perc: 'tribal' },
    sky: { root: 60, scale: 'lydian', bpm: 88, prog: [0, 1, 4, 5, 0, 1, 3, 4], lead: 'flute', arp: 'harp', pad: 'strings', perc: 'soft' },
    darkforest: { root: 64, scale: 'aeolian', bpm: 68, prog: [0, 5, 6, 0, 3, 5, 6, 4], lead: 'flute', arp: 'harp', pad: 'strings', perc: 'soft' },
    void: { root: 49, scale: 'phrygian', bpm: 58, prog: [0, 1, 0, 1, 5, 6, 1, 0], lead: 'choir', arp: null, pad: 'drone', perc: 'deep' },
    snow: { root: 57, scale: 'aeolian', bpm: 80, prog: [0, 5, 2, 6, 0, 3, 6, 4], lead: 'brass', arp: 'harp', pad: 'strings', perc: 'march' },
    crystal: { root: 66, scale: 'lydian', bpm: 74, prog: [0, 4, 1, 5, 0, 4, 5, 1], lead: 'bell', arp: 'harp', pad: 'air', perc: null },
    glacier: { root: 59, scale: 'dorian', bpm: 70, prog: [0, 3, 6, 0, 5, 3, 6, 4], lead: 'bell', arp: 'harp', pad: 'strings', perc: 'soft' },
    abyss: { root: 48, scale: 'harmonic', bpm: 90, prog: [0, 5, 1, 4, 0, 5, 3, 4], lead: 'brass', arp: null, pad: 'choir', perc: 'war' },
    cave: { root: 52, scale: 'aeolian', bpm: 62, prog: [0, 6, 5, 6, 0, 3, 5, 4], lead: 'bell', arp: null, pad: 'drone', perc: 'deep' },
    castle: { root: 52, scale: 'harmonic', bpm: 120, prog: [0, 5, 3, 4, 0, 5, 1, 4], lead: 'brass', arp: null, pad: 'strings', perc: 'war' },
    devilsq: { root: 50, scale: 'phrygian', bpm: 126, prog: [0, 1, 6, 1, 0, 1, 5, 4], lead: 'brass', arp: null, pad: 'organ', perc: 'war' },
  };

  function rng(seed) { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- áudio ----------
  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      out = ac.createGain(); out.connect(ac.destination);
      dry = ac.createGain(); dry.gain.value = 0.8; dry.connect(out);
      // reverberação simples (sala de pedra) gerada por ruído que some aos poucos
      verb = ac.createConvolver();
      const len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      verb.buffer = ir; const wet = ac.createGain(); wet.gain.value = 0.35; verb.connect(wet); wet.connect(out);
      vol();
    }
    if (ac.state === 'suspended') ac.resume();
    return true;
  }
  function vol() {
    if (!out) return;
    const sfx = window.Sfx, muted = sfx ? sfx.muted : false, v = sfx ? sfx.volume : 0.6;
    out.gain.value = enabled && !muted ? 0.28 * v : 0;
  }
  function send(node) { node.connect(dry); node.connect(verb); }

  // instrumentos sintetizados
  function voice(t, midi, dur, kind, gain) {
    const f = hz(midi), g = ac.createGain(), end = t + dur;
    const osc = (type, freq, det = 0) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; o.start(t); o.stop(end + 1.6); return o; };
    let src = [];
    const env = (a, r, sus = 1) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.setValueAtTime(gain * sus, Math.max(t + a, end - 0.02)); g.gain.exponentialRampToValueAtTime(0.0001, end + r); };
    if (kind === 'flute') {
      const o = osc('sine', f), o2 = osc('triangle', f * 2, 3); const g2 = ac.createGain(); g2.gain.value = 0.15; o2.connect(g2); g2.connect(g);
      const lfo = osc('sine', 5.2), lg = ac.createGain(); lg.gain.value = f * 0.006; lfo.connect(lg); lg.connect(o.frequency);
      src = [o]; env(0.06, 0.25, 0.85);
    } else if (kind === 'bell') {
      const o = osc('sine', f), o2 = osc('sine', f * 2.76), g2 = ac.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g);
      src = [o]; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(1.2, dur * 1.6));
    } else if (kind === 'harp' || kind === 'lute') {
      const o = osc(kind === 'lute' ? 'sawtooth' : 'triangle', f), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(kind === 'lute' ? 2600 : 4000, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.4);
      o.connect(lp); src = [lp]; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'lute' ? 0.5 : 1.1));
    } else if (kind === 'brass') {
      const o = osc('sawtooth', f), o2 = osc('sawtooth', f, 7), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1800, t + 0.12); lp.frequency.linearRampToValueAtTime(1100, end);
      o.connect(lp); o2.connect(lp); src = [lp]; env(0.05, 0.2, 0.8); g.gain.value = gain * 0.6;
    } else if (kind === 'choir') {
      const o = osc('sawtooth', f, -6), o2 = osc('sawtooth', f, 6), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 1.2;
      o.connect(bp); o2.connect(bp); src = [bp]; env(0.35, 0.8, 0.9);
    } else if (kind === 'strings' || kind === 'air') {
      const o = osc('sawtooth', f, -8), o2 = osc('sawtooth', f, 8), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'air' ? 900 : 1400;
      o.connect(lp); o2.connect(lp); src = [lp]; env(0.6, 1.2, 0.9);
    } else if (kind === 'organ' || kind === 'drone') {
      const o = osc('sine', f), o2 = osc(kind === 'organ' ? 'square' : 'triangle', f / 2), g2 = ac.createGain(); g2.gain.value = kind === 'organ' ? 0.12 : 0.35; o2.connect(g2); g2.connect(g);
      src = [o]; env(0.4, 1.0, 0.95);
    } else if (kind === 'bass') {
      const o = osc('triangle', f), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; o.connect(lp); src = [lp]; env(0.02, 0.3, 0.8);
    }
    src.forEach((s) => s.connect(g)); send(g);
  }
  let noiseBuf = null;
  function drum(t, kind, gain) {
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const g = ac.createGain();
    if (kind === 'kick' || kind === 'tom') {
      const o = ac.createOscillator(); o.type = 'sine'; const f0 = kind === 'kick' ? 110 : 160;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 42 : 80, t + 0.25);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); o.connect(g); o.start(t); o.stop(t + 0.5);
    } else {
      const n = ac.createBufferSource(); n.buffer = noiseBuf; const f = ac.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 6000 : 1800; f.Q.value = 0.9;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'hat' ? 0.05 : 0.18)); n.connect(f); f.connect(g); n.start(t); n.stop(t + 0.3);
    }
    send(g);
  }

  // ---------- composição ----------
  function compose(mapId, theme) {
    const base = P[theme] || P.town, r = rng(mapId + ':' + theme), sc = SCALE[base.scale];
    // cada mapa transpõe e mexe um pouco no andamento para não soar igual a outro do mesmo tema
    const root = base.root + [0, 0, 2, -2, 3, -3, 5][Math.floor(r() * 7)], bpm = Math.round(base.bpm * (0.94 + r() * 0.12));
    const deg = (d, oct = 0) => root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
    const chordOf = (d) => [deg(d), deg(d + 2), deg(d + 4)];
    // melodia: motivo de 2 compassos (8 tempos) em colcheias, repetido com variação (A A' B A)
    const motif = () => {
      const notes = []; let cur = 7 + Math.floor(r() * 3);
      for (let i = 0; i < 16; i++) {
        if (r() < (i % 4 === 0 ? 0.15 : 0.42)) { notes.push(null); continue; }
        cur += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(r() * 8)]; cur = Math.max(4, Math.min(13, cur));
        notes.push(cur);
      }
      return notes;
    };
    const A = motif(), B = motif(), A2 = A.map((n, i) => (n != null && i >= 8 && r() < 0.5 ? n + (r() < 0.5 ? 1 : -1) : n));
    const melody = [A, A2, B, A];
    const arpPat = [0, 1, 2, 1, 0, 2, 1, 2].map((x) => (r() < 0.2 ? (x + 1) % 3 : x));
    return { ...base, root, bpm, prog: base.prog, chordOf, deg, melody, arpPat, rest: r() < 0.5 };
  }

  // agenda as notas um pouco à frente (sem travar o jogo)
  function schedule() {
    if (!song || !ac) return;
    const spb = 60 / song.bpm, horizon = ac.currentTime + 0.6;
    while (song.next < horizon) {
      const t = song.next, step = song.step, beat = Math.floor(step / 2), bar = Math.floor(beat / 4) % song.prog.length;
      const ch = song.chordOf(song.prog[bar]);
      const phrase = Math.floor(beat / 8) % 4, inPhrase = step % 16;
      const silentLead = song.rest && Math.floor(beat / 32) % 2 === 1;   // metade das voltas sem melodia: dá respiro
      if (step % 8 === 0) {
        ch.forEach((n, i) => voice(t, n - 12 + (i ? 0 : 0), spb * 4, song.pad, 0.045));
        voice(t, song.chordOf(song.prog[bar])[0] - 24, spb * 2, 'bass', 0.12);
      }
      if (step % 8 === 4) voice(t, ch[0] - 24, spb * 2, 'bass', 0.09);
      if (song.arp && step % 1 === 0) { const n = ch[song.arpPat[step % 8]] + (step % 4 === 3 ? 12 : 0); voice(t, n, spb * 0.5, song.arp, 0.06); }
      if (!silentLead) { const m = song.melody[phrase][inPhrase]; if (m != null) voice(t, song.deg(m), spb * (song.lead === 'choir' ? 1.2 : 0.55), song.lead, song.lead === 'bell' ? 0.07 : 0.05); }
      const pc = song.perc, b = step % 8;
      if (pc === 'soft') { if (b === 0) drum(t, 'tom', 0.12); if (b === 4) drum(t, 'snare', 0.04); }
      else if (pc === 'deep') { if (step % 16 === 0) drum(t, 'kick', 0.3); if (step % 16 === 12) drum(t, 'tom', 0.15); }
      else if (pc === 'tribal') { if (b === 0 || b === 3 || b === 6) drum(t, 'tom', 0.16); if (b % 2) drum(t, 'hat', 0.03); }
      else if (pc === 'march') { if (b === 0) drum(t, 'kick', 0.22); if (b === 4 || b === 6) drum(t, 'snare', 0.06); }
      else if (pc === 'war') { if (b === 0 || b === 4) drum(t, 'kick', 0.28); if (b === 2 || b === 6) drum(t, 'snare', 0.08); drum(t, 'hat', 0.025); }
      song.next += spb / 2; song.step++;
    }
  }

  function play(mapId, theme) {
    wanted = [mapId, theme];
    if (!enabled || !ensure()) return;
    const key = mapId + ':' + theme;
    if (song && song.key === key) return;
    // troca suave: abaixa o volume, troca a música e volta
    const g = out.gain; vol(); const target = g.value;
    g.cancelScheduledValues(ac.currentTime); g.setTargetAtTime(0.0001, ac.currentTime, 0.25);
    clearInterval(timer);
    setTimeout(() => {
      song = { ...compose(mapId, theme), key, next: ac.currentTime + 0.1, step: 0 };
      g.cancelScheduledValues(ac.currentTime); g.setTargetAtTime(target, ac.currentTime, 0.6);
      timer = setInterval(() => { if (!document.hidden) schedule(); else if (song) song.next = ac.currentTime + 0.1; }, 120);
      schedule();
    }, 700);
  }
  function stop() { clearInterval(timer); timer = null; song = null; if (out) out.gain.value = 0; }

  window.Music = {
    play, stop,
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; set('mui_music', enabled ? '1' : '0'); if (!enabled) stop(); else if (wanted) play(...wanted); },
    refresh: vol,
  };
  // o navegador só libera som depois de um toque: começa a música pedida no primeiro toque
  const unlock = () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); if (wanted) { song = null; play(...wanted); } };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
})();
