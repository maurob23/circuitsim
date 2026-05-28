/**
 * Component registry shared by frontend modules.
 *
 * This is the frontend side of the platform contract: canvas editing,
 * netlist generation, toolbars, and future plugins should derive component
 * metadata from this object instead of duplicating definitions.
 */

'use strict';

window.CIRCUIT_COMPONENT_REGISTRY = Object.freeze({
  resistor: {
    label: 'Resistenza',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'b', lx: 80, ly: 0 },
    ],
    defaultValue: 10_000,
    unit: '\u03a9',
    netlistType: 'resistor',
    prefix: 'R',
    toolMessage: 'Resistenza: clicca sulla canvas per piazzare (R)',
  },
  potentiometer: {
    label: 'Potenziometro',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'w', lx: 40, ly: -34 },
      { id: 'b', lx: 80, ly: 0 },
    ],
    defaultValue: 10_000,
    unit: '\u03a9',
    netlistType: null,
    prefix: 'RV',
    toolMessage: 'Potenziometro: tre terminali per partitori regolabili (P)',
  },
  switch_spst: {
    label: 'Interruttore',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'b', lx: 80, ly: 0 },
    ],
    defaultValue: 1,
    unit: '',
    netlistType: null,
    prefix: 'SW',
    toolMessage: 'Interruttore: aperto/chiuso dal pannello componente (X)',
  },
  capacitor: {
    label: 'Condensatore',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'b', lx: 80, ly: 0 },
    ],
    defaultValue: 47e-9,
    unit: 'F',
    netlistType: 'capacitor',
    prefix: 'C',
    toolMessage: 'Condensatore: clicca per piazzare (C)',
  },
  vsource: {
    label: 'Generatore V',
    terminals: [
      { id: 'pos', lx: 0,  ly: 0 },
      { id: 'neg', lx: 80, ly: 0 },
    ],
    defaultValue: 1,
    unit: 'V',
    netlistType: 'voltage_source',
    prefix: 'V',
    toolMessage: 'Generatore di tensione: clicca per piazzare (V)',
  },
  gnd: {
    label: 'Massa',
    terminals: [
      { id: 'g', lx: 0, ly: 0 },
    ],
    defaultValue: null,
    unit: '',
    netlistType: null,
    prefix: 'GND',
    toolMessage: 'Massa: clicca per piazzare il riferimento (G)',
  },
  inductor: {
    label: 'Induttore',
    terminals: [
      { id: 'a', lx:  0, ly: 0 },
      { id: 'b', lx: 80, ly: 0 },
    ],
    defaultValue: 1e-3,
    unit: 'H',
    netlistType: 'inductor',
    prefix: 'L',
    toolMessage: 'Induttore: clicca per piazzare (L)',
  },
  bjt_npn: {
    label: 'BJT NPN',
    terminals: [
      { id: 'b', lx:  0, ly:  0 },
      { id: 'c', lx: 40, ly: -40 },
      { id: 'e', lx: 40, ly:  40 },
    ],
    defaultValue: 100,
    unit: '\u03b2',
    netlistType: 'bjt_npn',
    prefix: 'Q',
    toolMessage: 'BJT NPN: clicca per piazzare il transistore (Q)',
  },
  led_red: {
    label: 'LED rosso',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'k', lx: 80, ly: 0 },
    ],
    defaultValue: 1.8,
    unit: 'Vf',
    netlistType: null,
    prefix: 'D',
    toolMessage: 'LED rosso: modello semplificato con caduta diretta',
  },
  led_green: {
    label: 'LED verde',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'k', lx: 80, ly: 0 },
    ],
    defaultValue: 2.1,
    unit: 'Vf',
    netlistType: null,
    prefix: 'D',
    toolMessage: 'LED verde: modello semplificato con caduta diretta',
  },
  led_yellow: {
    label: 'LED giallo',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'k', lx: 80, ly: 0 },
    ],
    defaultValue: 2.0,
    unit: 'Vf',
    netlistType: null,
    prefix: 'D',
    toolMessage: 'LED giallo: modello semplificato con caduta diretta',
  },
  led_blue: {
    label: 'LED blu',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'k', lx: 80, ly: 0 },
    ],
    defaultValue: 3.2,
    unit: 'Vf',
    netlistType: null,
    prefix: 'D',
    toolMessage: 'LED blu: modello semplificato con caduta diretta',
  },
  led_white: {
    label: 'LED bianco',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'k', lx: 80, ly: 0 },
    ],
    defaultValue: 3.2,
    unit: 'Vf',
    netlistType: null,
    prefix: 'D',
    toolMessage: 'LED bianco: modello semplificato con caduta diretta',
  },
});

window.CIRCUIT_MANUAL_REGISTRY = Object.freeze({
  passivi: {
    title: 'Componenti passivi',
    url: '/static/docs/practical-electronics-for-inventors.pdf#page=71',
  },
  attivi: {
    title: 'Componenti attivi',
    url: '/static/docs/practical-electronics-for-inventors.pdf#page=423',
  },
  alimentatori: {
    title: 'Alimentatori e sorgenti',
    url: '/static/docs/practical-electronics-for-inventors.pdf#page=847',
  },
  trasformatori: {
    title: 'Trasformatori',
    url: '/static/docs/practical-electronics-for-inventors.pdf#page=879',
  },
  mcu: {
    title: 'Microcontrollori',
    url: '/static/docs/practical-electronics-for-inventors.pdf#page=1019',
  },
  digitale: {
    title: 'Elettronica digitale',
    url: '/static/docs/practical-electronics-for-inventors.pdf#page=941',
  },
  strumenti: {
    title: 'Strumenti di misura',
    url: '/static/docs/practical-electronics-for-inventors.pdf#page=1125',
  },
});
