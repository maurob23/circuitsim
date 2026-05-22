/**
 * calculator.js — Calcolatrice (standard + formule elettroniche).
 */
'use strict';

class Calculator {
  constructor() {
    this._overlay = document.getElementById('calc-overlay');
    this._display = document.getElementById('calc-display');
    if (!this._overlay || !this._display) return;

    this._value   = '0';
    this._acc     = null;
    this._op      = null;
    this._fresh   = true;
    this._mode    = 'std';

    document.getElementById('calc-close')?.addEventListener('click', () => this.close());
    this._overlay.addEventListener('click', e => {
      if (e.target === this._overlay) this.close();
    });
    document.addEventListener('keydown', e => {
      if (this._overlay.style.display === 'none') return;
      if (e.key === 'Escape') this.close();
    });

    this._overlay.querySelectorAll('[data-calc-tab]').forEach(tab => {
      tab.addEventListener('click', () => this._setMode(tab.dataset.calcTab));
    });

    this._overlay.querySelectorAll('[data-calc]').forEach(btn => {
      btn.addEventListener('click', () => this._onKey(btn.dataset.calc));
    });

    this._bindElec();
    this._render();
  }

  open() {
    if (this._overlay) {
      this._overlay.style.display = 'flex';
      this._render();
    }
  }

  close() {
    if (this._overlay) this._overlay.style.display = 'none';
  }

  _setMode(mode) {
    this._mode = mode;
    this._overlay.querySelectorAll('[data-calc-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.calcTab === mode);
    });
    this._overlay.querySelectorAll('.calc-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.calcPanel === mode);
    });
  }

  _render() {
    if (this._display) this._display.textContent = this._value;
  }

  _num() {
    const n = parseFloat(this._value);
    return Number.isFinite(n) ? n : 0;
  }

  _setValue(v) {
    const s = String(v);
    this._value = s.length > 14 ? Number(v).toExponential(6) : s;
    this._render();
  }

  _onKey(k) {
    if (k === 'C') {
      this._value = '0'; this._acc = null; this._op = null; this._fresh = true;
    } else if (k === 'CE') {
      this._value = '0'; this._fresh = true;
    } else if (k === '⌫') {
      if (this._fresh) { this._value = '0'; this._fresh = false; }
      else this._value = this._value.length <= 1 ? '0' : this._value.slice(0, -1);
    } else if (k === '±') {
      if (this._value !== '0') this._value = this._value.startsWith('-')
        ? this._value.slice(1) : '-' + this._value;
    } else if (k === '.') {
      if (this._fresh) { this._value = '0.'; this._fresh = false; }
      else if (!this._value.includes('.')) this._value += '.';
    } else if ('+-*/'.includes(k)) {
      this._applyPending();
      this._acc = this._num();
      this._op = k;
      this._fresh = true;
    } else if (k === '=') {
      this._applyPending();
      this._acc = null; this._op = null; this._fresh = true;
    } else if (/^\d$/.test(k)) {
      if (this._fresh) { this._value = k; this._fresh = false; }
      else if (this._value === '0' && k !== '.') this._value = k;
      else this._value += k;
    }
    this._render();
  }

  _applyPending() {
    if (this._acc === null || !this._op) return;
    const b = this._num();
    let r = this._acc;
    switch (this._op) {
      case '+': r = this._acc + b; break;
      case '-': r = this._acc - b; break;
      case '*': r = this._acc * b; break;
      case '/': r = b === 0 ? NaN : this._acc / b; break;
    }
    this._setValue(Number.isFinite(r) ? r : 'Errore');
    this._acc = null;
    this._op = null;
  }

  _bindElec() {
    const run = (id, fn) => {
      document.getElementById(id)?.addEventListener('click', () => {
        const out = document.getElementById(id + '-out');
        try {
          const v = fn();
          if (out) out.textContent = v;
        } catch (e) {
          if (out) out.textContent = '—';
        }
      });
    };

    run('calc-fc-rc', () => {
      const R = parseFloat(document.getElementById('calc-rc-r')?.value);
      const C = parseFloat(document.getElementById('calc-rc-c')?.value);
      if (!R || !C) throw 0;
      const fc = 1 / (2 * Math.PI * R * C);
      return `fc = ${fc >= 1000 ? (fc / 1000).toFixed(3) + ' kHz' : fc.toFixed(2) + ' Hz'}`;
    });

    run('calc-tau-rc', () => {
      const R = parseFloat(document.getElementById('calc-rc-r')?.value);
      const C = parseFloat(document.getElementById('calc-rc-c')?.value);
      if (!R || !C) throw 0;
      const tau = R * C;
      return `τ = ${tau >= 1 ? tau.toFixed(4) + ' s' : (tau * 1000).toFixed(3) + ' ms'}`;
    });

    run('calc-db', () => {
      const db = parseFloat(document.getElementById('calc-db-in')?.value);
      if (!Number.isFinite(db)) throw 0;
      const ratio = Math.pow(10, db / 20);
      return `${db} dB → rapporto ${ratio.toFixed(4)} (${(ratio * 100).toFixed(1)}%)`;
    });

    run('calc-ratio-db', () => {
      const r = parseFloat(document.getElementById('calc-ratio-in')?.value);
      if (!r || r <= 0) throw 0;
      const db = 20 * Math.log10(r);
      return `rapporto ${r} → ${db.toFixed(2)} dB`;
    });

    run('calc-r-par', () => {
      const a = parseFloat(document.getElementById('calc-r1')?.value);
      const b = parseFloat(document.getElementById('calc-r2')?.value);
      if (!a || !b) throw 0;
      const rp = (a * b) / (a + b);
      return `Rpar = ${rp >= 1000 ? (rp / 1000).toFixed(3) + ' kΩ' : rp.toFixed(2) + ' Ω'}`;
    });

    run('calc-xl', () => {
      const f = parseFloat(document.getElementById('calc-xl-f')?.value);
      const L = parseFloat(document.getElementById('calc-xl-l')?.value);
      if (!f || !L) throw 0;
      const xl = 2 * Math.PI * f * L;
      return `XL = ${xl.toFixed(2)} Ω`;
    });

    run('calc-xc', () => {
      const f = parseFloat(document.getElementById('calc-xc-f')?.value);
      const C = parseFloat(document.getElementById('calc-xc-c')?.value);
      if (!f || !C) throw 0;
      const xc = 1 / (2 * Math.PI * f * C);
      return `Xc = ${xc.toFixed(2)} Ω`;
    });
  }
}

window.Calculator = Calculator;
