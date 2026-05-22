/**
 * SimAnalyst — Analista automatico dei risultati di simulazione.
 *
 * Genera commenti contestuali basati su regole a partire dai dati restituiti
 * dal solver (metriche, tracce, tipo di analisi). Zero dipendenze esterne.
 *
 * Struttura di un'osservazione:
 *   { level: 'ok'|'info'|'warn'|'danger', title, detail }
 */

'use strict';

// ─── Icone per livello ───────────────────────────────────────────────────────
const OBS_ICON = { ok: '✓', info: 'ℹ', warn: '⚠', danger: '✗' };

// ─── Formattatori locali ─────────────────────────────────────────────────────
function _fHz(hz) {
  if (hz >= 1e6) return (hz / 1e6).toPrecision(4) + ' MHz';
  if (hz >= 1e3) return (hz / 1e3).toPrecision(4) + ' kHz';
  return hz.toPrecision(4) + ' Hz';
}
function _fDb(db) { return db.toFixed(2) + ' dB'; }
function _fPct(r) { return (Math.abs(r) * 100).toFixed(1) + '%'; }

// ─── Analisi per tipo ────────────────────────────────────────────────────────

function analyzeAC(metrics, components) {
  const obs = [];
  const fc  = metrics.cutoff_frequency_hz;
  const dc  = metrics.dc_gain_db ?? 0;

  if (!fc) {
    obs.push({ level: 'warn', title: 'Frequenza di taglio non calcolata',
      detail: 'Verifica che il circuito formi un filtro completo (R+C o R+L collegati correttamente).' });
    return obs;
  }

  // ── Frequenza di taglio ──────────────────────────────────────────────────
  obs.push({ level: 'ok', title: `Frequenza di taglio: ${_fHz(fc)}`,
    detail: `A questa frequenza il guadagno scende a −3.01 dB e la fase è −45°. ` +
            `La costante di tempo τ = ${(1000 / (2 * Math.PI * fc)).toFixed(3)} ms.` });

  // ── Guadagno DC ─────────────────────────────────────────────────────────
  if (Math.abs(dc) < 0.1) {
    obs.push({ level: 'ok', title: 'Guadagno DC: 0 dB (passivo)',
      detail: 'Il circuito non amplifica — guadagno unitario a bassa frequenza, come atteso per un filtro passivo.' });
  } else if (dc > 0) {
    obs.push({ level: 'info', title: `Guadagno DC: ${_fDb(dc)}`,
      detail: 'Guadagno positivo a DC — potrebbe indicare una topologia con amplificazione attiva.' });
  }

  // ── Classificazione banda ────────────────────────────────────────────────
  if (fc < 10) {
    obs.push({ level: 'info', title: 'Filtro a banda molto stretta (fc < 10 Hz)',
      detail: 'La frequenza di taglio è estremamente bassa. Utile per filtrare il ripple di alimentazione o segnali lentissimi.' });
  } else if (fc < 300) {
    obs.push({ level: 'info', title: 'Filtro audio / sub-audio',
      detail: `fc = ${_fHz(fc)} — in banda audio bassa. Tipico per accoppiamento AC o filtri passa-alto audio.` });
  } else if (fc >= 300 && fc <= 20000) {
    obs.push({ level: 'ok', title: 'Banda audio (300 Hz – 20 kHz)',
      detail: `fc = ${_fHz(fc)} — nella banda audio standard. Ideale per elaborazione segnali audio.` });
  } else if (fc > 100e3) {
    obs.push({ level: 'info', title: 'Filtro RF / alta frequenza',
      detail: `fc = ${_fHz(fc)} — applicazione RF o alta velocità. Attenzione ai parassiti di layout (induttanza stray).` });
  }

  // ── Roll-off ─────────────────────────────────────────────────────────────
  const nC = components.filter(c => c.type === 'capacitor').length;
  const nL = components.filter(c => c.type === 'inductor').length;
  const poles = nC + nL;
  if (poles === 1) {
    obs.push({ level: 'info', title: 'Filtro del 1° ordine (−20 dB/decade)',
      detail: 'Con un solo elemento reattivo la risposta decade a −20 dB/dec (6 dB/ottava) oltre fc.' });
  } else if (poles === 2) {
    obs.push({ level: 'info', title: 'Filtro del 2° ordine (−40 dB/decade)',
      detail: 'Due elementi reattivi producono −40 dB/dec. Verifica Q e smorzamento nel pannello Parametri.' });
  } else if (poles > 2) {
    obs.push({ level: 'info', title: `Filtro del ${poles}° ordine (−${poles * 20} dB/decade)`,
      detail: 'Risposta altamente selettiva. Attenzione alla stabilità nei circuiti in retroazione.' });
  }

  return obs;
}

function analyzeSinusoidal(metrics, components) {
  const obs = [];
  const { gain_db, phase_deg, frequency_hz, cutoff_frequency_hz: fc } = metrics;

  if (gain_db === undefined) return obs;

  // ── Guadagno alla frequenza simulata ────────────────────────────────────
  const ratio = gain_db < -0.1 ? Math.pow(10, gain_db / 20) : 1;
  if (gain_db > -0.5) {
    obs.push({ level: 'ok', title: `Guadagno: ${_fDb(gain_db)} — segnale quasi integro`,
      detail: 'La frequenza simulata è molto al di sotto della frequenza di taglio: l\'attenuazione è trascurabile.' });
  } else if (gain_db >= -3.5 && gain_db <= -2.5) {
    obs.push({ level: 'ok', title: `Guadagno: ${_fDb(gain_db)} — punto di taglio (−3 dB)`,
      detail: `La frequenza simulata (${_fHz(frequency_hz)}) coincide con fc. ` +
              `L'ampiezza in uscita è ${_fPct(ratio)} di quella in ingresso.` });
  } else if (gain_db < -3.5 && gain_db > -20) {
    obs.push({ level: 'info', title: `Guadagno: ${_fDb(gain_db)} — attenuazione moderata`,
      detail: `Il segnale è ridotto al ${_fPct(ratio)} dell'ampiezza originale. ` +
              `Siamo ${fc ? 'a ' + (frequency_hz / fc).toFixed(1) + '× sopra fc' : 'oltre la frequenza di taglio'}.` });
  } else if (gain_db <= -20) {
    obs.push({ level: 'warn', title: `Guadagno: ${_fDb(gain_db)} — forte attenuazione`,
      detail: `Solo il ${_fPct(ratio)} del segnale raggiunge l'uscita. ` +
              `A questa frequenza il filtro sopprime efficacemente il segnale.` });
  }

  // ── Fase ─────────────────────────────────────────────────────────────────
  if (phase_deg !== undefined) {
    const absPhase = Math.abs(phase_deg);
    if (absPhase < 5) {
      obs.push({ level: 'ok', title: `Fase: ${phase_deg.toFixed(1)}° — sfasamento trascurabile`,
        detail: 'La frequenza è molto al di sotto di fc. Ingresso e uscita sono praticamente in fase.' });
    } else if (absPhase >= 40 && absPhase <= 50) {
      obs.push({ level: 'info', title: `Fase: ${phase_deg.toFixed(1)}° — punto di taglio`,
        detail: '−45° indica che ci troviamo esattamente alla frequenza di taglio fc.' });
    } else if (absPhase > 80) {
      obs.push({ level: 'info', title: `Fase: ${phase_deg.toFixed(1)}° — quasi quadratura`,
        detail: 'Lo sfasamento si avvicina a −90°: siamo lontani dalla banda passante del filtro.' });
    } else {
      obs.push({ level: 'info', title: `Fase: ${phase_deg.toFixed(1)}°`,
        detail: `Sfasamento nella zona di transizione del filtro.` });
    }
  }

  // ── Transitorio vs regime ────────────────────────────────────────────────
  obs.push({ level: 'info', title: 'Visualizzazione: transitorio + regime permanente',
    detail: 'Le prime oscillazioni mostrano il transitorio di avvio. Il segnale si stabilizza al regime sinusoidale dopo circa 3–5 costanti di tempo τ.' });

  return obs;
}

function analyzeTransient(metrics) {
  const obs = [];
  const { time_constant_ms, final_voltage_v, t_end_ms } = metrics;

  if (time_constant_ms) {
    obs.push({ level: 'ok', title: `Costante di tempo τ = ${time_constant_ms.toFixed(3)} ms`,
      detail: `Il condensatore si carica al 63.2% della tensione finale in τ. ` +
              `Si considera a regime dopo ~5τ = ${(time_constant_ms * 5).toFixed(2)} ms.` });
  }

  if (final_voltage_v !== undefined && t_end_ms) {
    const tEnd5tau = time_constant_ms ? time_constant_ms * 5 : null;
    if (tEnd5tau && t_end_ms < tEnd5tau * 0.9) {
      obs.push({ level: 'warn', title: 'Finestra temporale troppo breve',
        detail: `La simulazione dura ${t_end_ms.toFixed(2)} ms ma il regime si raggiunge dopo ${tEnd5tau.toFixed(2)} ms (5τ). ` +
                `Aumenta il tempo di simulazione per vedere la carica completa.` });
    } else {
      obs.push({ level: 'ok', title: 'Finestra temporale sufficiente',
        detail: `La simulazione copre l'intera carica del circuito fino al regime stazionario.` });
    }
  }

  return obs;
}

function analyzeRLC(metrics, components) {
  const obs = [];
  const R = components.find(c => c.type === 'resistor')?.value;
  const L = components.find(c => c.type === 'inductor')?.value;
  const C = components.find(c => c.type === 'capacitor')?.value;
  if (!R || !L || !C) return obs;

  const f0    = 1 / (2 * Math.PI * Math.sqrt(L * C));
  const Q     = (1 / R) * Math.sqrt(L / C);
  const zeta  = 1 / (2 * Q);

  const fHz0 = f0 >= 1000 ? (f0 / 1000).toPrecision(3) + ' kHz' : f0.toPrecision(3) + ' Hz';

  if (zeta < 0.5) {
    obs.push({ level: 'warn', title: `Q = ${Q.toPrecision(3)} — circuito sottosviluppato (risonante)`,
      detail: `ζ = ${zeta.toPrecision(2)} < 0.5: presenza di picco di risonanza a ${fHz0}. ` +
              `Il guadagno al picco è ${(20 * Math.log10(Q)).toFixed(1)} dB. ` +
              `In transitorio si osserveranno oscillazioni smorzate.` });
  } else if (zeta >= 0.5 && zeta < 0.8) {
    obs.push({ level: 'info', title: `Q = ${Q.toPrecision(3)} — risposta quasi critica`,
      detail: `ζ = ${zeta.toPrecision(2)}: leggero overshoot in transitorio, risposta relativamente piatta in frequenza.` });
  } else if (zeta >= 0.8 && zeta <= 1.2) {
    obs.push({ level: 'ok', title: `Q = ${Q.toPrecision(3)} — smorzamento critico`,
      detail: `ζ ≈ 1: risposta ottimale al gradino senza overshoot, massima velocità di risposta.` });
  } else {
    obs.push({ level: 'info', title: `Q = ${Q.toPrecision(3)} — circuito sovrasmorzato`,
      detail: `ζ = ${zeta.toPrecision(2)} > 1: nessuna oscillazione, risposta lenta. Per aumentare la reattività riduci R.` });
  }

  obs.push({ level: 'info', title: `Frequenza di risonanza: ${fHz0}`,
    detail: `A f₀ l'impedenza del tank LC è teoricamente zero (serie) o infinita (parallelo). ` +
            `Banda passante −3 dB: ${(f0 / Q).toPrecision(3)} Hz.` });

  return obs;
}

function analyzeBJT(metrics, components) {
  const obs = [];
  const bjt = components.find(c => c.type === 'bjt_npn');
  if (!bjt) return obs;

  const beta = bjt.value || 100;
  const icQ  = bjt.ic_q_ma || 1.0;
  const VT   = 0.02585;
  const gm   = (icQ * 1e-3) / VT;
  const rpi  = beta / gm;

  obs.push({ level: 'ok', title: `Punto di lavoro: I_C = ${icQ} mA`,
    detail: `g_m = ${(gm * 1000).toPrecision(3)} mA/V, r_π = ${(rpi / 1000).toPrecision(3)} kΩ. ` +
            `Modello hybrid-π linearizzato attorno al punto Q.` });

  if (icQ < 0.1) {
    obs.push({ level: 'warn', title: 'Corrente di polarizzazione bassa',
      detail: `I_C = ${icQ} mA — g_m molto bassa (${(gm * 1000).toFixed(2)} mA/V). Il guadagno sarà limitato.` });
  } else if (icQ > 10) {
    obs.push({ level: 'warn', title: 'Corrente di polarizzazione elevata',
      detail: `I_C = ${icQ} mA — dissipazione termica significativa. Verifica il punto di lavoro nel datasheet.` });
  }

  if (beta < 50) {
    obs.push({ level: 'info', title: `β basso (${beta})`,
      detail: 'Transistore con β basso: alta corrente di base necessaria. r_π piccola, minor impedenza d\'ingresso.' });
  } else if (beta > 500) {
    obs.push({ level: 'ok', title: `β elevato (${beta}) — alta g_m`,
      detail: 'β > 500: transistore ad alta efficienza con ottima amplificazione di corrente.' });
  }

  return obs;
}

// ─── Osservazioni generiche (sempre presenti) ────────────────────────────────

function generalObs(analysisType, components) {
  const obs = [];
  const nComp = components.length;

  if (nComp === 0) return obs;

  // Verifica GND
  const hasGnd = components.some(c => c.type === 'gnd');
  if (!hasGnd) {
    obs.push({ level: 'warn', title: 'Massa (GND) non trovata',
      detail: 'Assicurati di avere un riferimento di massa nel circuito per una simulazione corretta.' });
  }

  // Verifica sorgente
  const hasSrc = components.some(c => c.type === 'voltage_source' || c.type === 'current_source');
  if (!hasSrc) {
    obs.push({ level: 'warn', title: 'Nessuna sorgente di segnale',
      detail: 'Il circuito non ha generatori. Aggiungi una sorgente di tensione o corrente per simulare.' });
  }

  return obs;
}

// ─── Rendering HTML ──────────────────────────────────────────────────────────

function renderObservations(observations) {
  if (observations.length === 0) {
    return '<div class="analyst-empty">Nessuna osservazione disponibile.</div>';
  }
  return observations.map(o => `
    <div class="analyst-obs analyst-obs-${o.level}">
      <span class="analyst-icon">${OBS_ICON[o.level]}</span>
      <div class="analyst-body">
        <div class="analyst-title">${o.title}</div>
        ${o.detail ? `<div class="analyst-detail">${o.detail}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// ─── Classe principale ───────────────────────────────────────────────────────

class SimAnalyst {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  /**
   * Analizza i risultati e aggiorna il pannello.
   * @param {string} analysisType  'ac'|'sinusoidal'|'transient'|'dc'
   * @param {object} metrics       Oggetto metriche dal solver
   * @param {array}  components    Array componenti dal canvas
   */
  analyze(analysisType, metrics, components) {
    if (!this.container) return;

    const obs = [
      ...generalObs(analysisType, components),
    ];

    // Analisi per topologia RLC (sempre utile se c'è un RLC)
    const hasR = components.some(c => c.type === 'resistor');
    const hasL = components.some(c => c.type === 'inductor');
    const hasC = components.some(c => c.type === 'capacitor');
    const hasBJT = components.some(c => c.type === 'bjt_npn');

    if (hasR && hasL && hasC) {
      obs.push(...analyzeRLC(metrics, components));
    }
    if (hasBJT) {
      obs.push(...analyzeBJT(metrics, components));
    }

    // Analisi per tipo di simulazione
    switch (analysisType) {
      case 'ac':
        obs.push(...analyzeAC(metrics, components));
        break;
      case 'sinusoidal':
        obs.push(...analyzeSinusoidal(metrics, components));
        break;
      case 'transient':
        obs.push(...analyzeTransient(metrics));
        break;
      case 'dc': {
        const vNodes = Object.entries(metrics)
          .filter(([k]) => k !== 'solver')
          .map(([k, v]) => `${k} = ${typeof v === 'number' ? v.toFixed(4) + ' V' : v}`);
        if (vNodes.length) {
          obs.push({ level: 'ok', title: 'Punto di lavoro DC calcolato',
            detail: vNodes.join(' · ') });
        }
        break;
      }
    }

    // Suggerimento finale adattivo
    this._addSuggestion(obs, analysisType, metrics, components);

    const label = { ac: 'AC Sweep', sinusoidal: 'Sinusoide', transient: 'Transitorio', dc: 'DC' };
    this.container.innerHTML = `
      <div class="analyst-header">
        <span class="analyst-badge">Analisi ${label[analysisType] ?? analysisType}</span>
        <span class="analyst-count">${obs.length} osservazioni</span>
      </div>
      ${renderObservations(obs)}
    `;
  }

  _addSuggestion(obs, type, metrics, components) {
    const fc = metrics.cutoff_frequency_hz;
    const R  = components.find(c => c.type === 'resistor')?.value;
    const C  = components.find(c => c.type === 'capacitor')?.value;

    if (fc && R && C && (type === 'ac' || type === 'sinusoidal')) {
      const fc2 = fc * 2;
      const fc05 = fc / 2;
      const R2 = R / 2;
      const C2 = C / 2;
      const fmt = v => v >= 1000 ? (v / 1000).toPrecision(3) + ' kΩ' : v.toPrecision(3) + ' Ω';
      const fmtC = v => v < 1e-6 ? (v * 1e9).toPrecision(3) + ' nF' : (v * 1e6).toPrecision(3) + ' µF';
      obs.push({ level: 'info', title: '💡 Suggerimento di ottimizzazione',
        detail: `Per portare fc a ${_fHz(fc2)}: imposta R = ${fmt(R2)} oppure C = ${fmtC(C2)}. ` +
                `Per portare fc a ${_fHz(fc05)}: imposta R = ${fmt(R * 2)} oppure C = ${fmtC(C * 2)}.` });
    }
  }

  clear() {
    if (this.container) this.container.innerHTML = '<div class="analyst-empty">Esegui una simulazione per vedere l\'analisi.</div>';
  }
}
