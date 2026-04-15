// ══════════════════════════════════════════════
//  CONFIGURAZIONE — modifica qui
// ══════════════════════════════════════════════
const CONFIG = {
  repeater: {
    name:       "R4A",
    callsign:   "IQ4RE",
    locator:    "JN54fm",
    freq:       "145.7125 MHz",
    subtone:    "88.5 Hz",
    modo:       "FM",
    localita:   "Casina (RE)",
    altitudine: "600 m"
  },

  // Sostituisci con l'URL CSV del tuo Google Sheet pubblicato
  // Es: "https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=0"
  sheetCSV: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQW2sgttYh4W0Uis7n637u4VMtM-Uzay0PIF4wdokJRWn892eUxL4b_l0nsShz4YZSzH7SNMJeAFt3f/pub?gid=0&single=true&output=csv",

  refreshMinutes: 5,  // ricarica dati ogni N minuti

  // Fasce di potenza — ordine dalla più alta alla più bassa
  // weight: spessore linea (px); dash: pattern tratteggio SVG (null = linea piena)
  powerBands: [
    { label: '> 50 W',    minW: 50,           weight: 3,   dash: null  },
    { label: '10 – 50 W', minW: 10, maxW: 50, weight: 2,   dash: '8,4' },
    { label: '< 10 W',   maxW: 10,            weight: 1.5, dash: '4,6' },
  ],

  // Soglie RST — ordine decrescente, la prima che corrisponde vince
  rstBands: [
    { min: 59, color: '#3fb950', label: '59'    },
    { min: 57, color: '#58a6ff', label: '57–58' },
    { min: 55, color: '#d29922', label: '55–56' },
    { min: 0,  color: '#f85149', label: '≤54'   },
  ],

  // Modalità — per filtri e legenda
  modalita: ['portatile', 'mobile', 'fisso'],
};

// ══════════════════════════════════════════════
//  DATI DI ESEMPIO — visibili SOLO in locale
// ══════════════════════════════════════════════
const SAMPLE_DATA = [
  { callsign:"IK2ABC",  lat:45.464, lon:9.190,  rst_rx:"59", power:5,  modalita:"portatile", operatore:"IQ4RE",  note:"Cima Monte Barro", data:"2025-04-01 14:32" },
  { callsign:"IZ1DEF",  lat:44.407, lon:8.934,  rst_rx:"57", power:25, modalita:"fisso",     operatore:"",       note:"Antenna yagi 9el", data:"2025-04-02 10:15" },
  { callsign:"HB9GHI",  lat:46.948, lon:7.447,  rst_rx:"55", power:10, modalita:"mobile",    operatore:"IW4TND", note:"Da Berna!",         data:"2025-04-03 18:44" },
  { callsign:"IW4JKL",  lat:44.498, lon:11.354, rst_rx:"58", power:5,  modalita:"portatile", operatore:"",       note:"Monte Cimone",      data:"2025-04-04 09:00" },
  { callsign:"I2MNO",   lat:45.070, lon:7.687,  rst_rx:"54", power:50, modalita:"fisso",     operatore:"IQ4RE",  note:"",                  data:"2025-04-05 16:20" },
  { callsign:"IU3PQR",  lat:45.840, lon:11.050, rst_rx:"56", power:5,  modalita:"portatile", operatore:"",       note:"Monte Grappa",      data:"2025-04-06 11:10" },
];

// ══════════════════════════════════════════════
//  MATH UTILS
// ══════════════════════════════════════════════
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function azimuth(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2-lon1);
  const y = Math.sin(dLon)*Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) - Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function greatCirclePoints(lat1, lon1, lat2, lon2, n=80) {
  const φ1=toRad(lat1), λ1=toRad(lon1), φ2=toRad(lat2), λ2=toRad(lon2);
  const d = 2*Math.asin(Math.sqrt(Math.sin((φ2-φ1)/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin((λ2-λ1)/2)**2));
  const pts = [];
  for (let i=0; i<=n; i++) {
    const f = i/n;
    if (d < 0.0001) { pts.push([lat1,lon1]); continue; }
    const A=Math.sin((1-f)*d)/Math.sin(d), B=Math.sin(f*d)/Math.sin(d);
    const x=A*Math.cos(φ1)*Math.cos(λ1)+B*Math.cos(φ2)*Math.cos(λ2);
    const y=A*Math.cos(φ1)*Math.sin(λ1)+B*Math.cos(φ2)*Math.sin(λ2);
    const z=A*Math.sin(φ1)+B*Math.sin(φ2);
    pts.push([toDeg(Math.atan2(z,Math.sqrt(x*x+y*y))), toDeg(Math.atan2(y,x))]);
  }
  return pts;
}

// ══════════════════════════════════════════════
//  COORDINATE
// ══════════════════════════════════════════════
function maidenheadToLatLon(loc) {
  loc = (loc || '').trim().toUpperCase();
  if (loc.length < 4) return null;
  let lon = (loc.charCodeAt(0) - 65) * 20 - 180;
  let lat = (loc.charCodeAt(1) - 65) * 10 - 90;
  lon += parseInt(loc[2]) * 2;
  lat += parseInt(loc[3]);
  if (loc.length >= 6) {
    lon += (loc.charCodeAt(4) - 65) * (2/24) + 1/24;
    lat += (loc.charCodeAt(5) - 65) * (1/24) + 1/48;
  } else {
    lon += 1;
    lat += 0.5;
  }
  return { lat, lon };
}

// ══════════════════════════════════════════════
//  COLORI / STILI DA CONFIG
// ══════════════════════════════════════════════
function modalitaColor(m) {
  switch ((m || '').toLowerCase()) {
    case 'portatile': return '#3fb950';
    case 'mobile':    return '#d29922';
    case 'fisso':     return '#a5d6ff';
    default:          return '#8b949e';
  }
}

function rstColor(rst) {
  const r = parseInt(rst);
  for (const b of CONFIG.rstBands) { if (r >= b.min) return b.color; }
  return CONFIG.rstBands[CONFIG.rstBands.length - 1].color;
}

function getPowerBandIndex(power) {
  for (let i = 0; i < CONFIG.powerBands.length; i++) {
    const b = CONFIG.powerBands[i];
    if ((b.minW == null || power >= b.minW) && (b.maxW == null || power < b.maxW)) return i;
  }
  return CONFIG.powerBands.length - 1;
}

function powerLineStyle(power) {
  const b = CONFIG.powerBands[getPowerBandIndex(power)];
  return { weight: b.weight, dashArray: b.dash };
}

// ══════════════════════════════════════════════
//  CSV PARSER
//  atteso: data_ora,callsign,locator,rst_rx,potenza_w,modalità,operatore,note
// ══════════════════════════════════════════════
function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  // normalize handles accented headers: «modalità» → «modalita»
  const headers = splitCSVLine(lines[0]).map(h =>
    h.trim().toLowerCase().replace(/"/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  );
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const obj  = {};
    headers.forEach((h,i) => { obj[h] = (vals[i]||'').replace(/^"|"$/g,'').trim(); });
    let lat = parseFloat(obj.lat);
    let lon = parseFloat(obj.lon);
    if ((isNaN(lat) || isNaN(lon)) && obj.locator) {
      const ll = maidenheadToLatLon(obj.locator);
      if (ll) { lat = ll.lat; lon = ll.lon; }
    }
    return {
      callsign:  obj.callsign  || '',
      lat,
      lon,
      rst_rx:    obj.rst_rx    || '55',
      power:     parseFloat(obj.potenza_w) || 0,
      modalita:  obj.modalita  || '',
      operatore: obj.operatore || '',
      note:      obj.note      || '',
      data:      obj.data_ora  || ''
    };
  }).filter(c => !isNaN(c.lat) && !isNaN(c.lon) && c.callsign);
}

// ══════════════════════════════════════════════
//  MAP INIT
// ══════════════════════════════════════════════
const map = L.map('map', { zoomControl: true }).setView([45.2, 9.0], 7);

const TILE_LAYERS = {
  dark:      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',    { attribution: '© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:19 }),
  light:     L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',   { attribution: '© OpenStreetMap © CARTO', subdomains:'abcd', maxZoom:19 }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri World Imagery', maxZoom:19 }),
};
let activeLayer = 'light';
TILE_LAYERS.light.addTo(map);

// Marker ponte — emoji 📡
const repIcon = L.divIcon({
  html: `<span style="font-size:22px;line-height:1;display:block;filter:drop-shadow(0 0 4px rgba(88,166,255,0.6))">📡</span>`,
  className: '', iconAnchor: [11, 11]
});
const rep = CONFIG.repeater;
if (rep.lat == null || rep.lon == null) {
  const ll = maidenheadToLatLon(rep.locator);
  if (ll) { rep.lat = ll.lat; rep.lon = ll.lon; }
}
L.marker([rep.lat, rep.lon], { icon: repIcon, zIndexOffset: 1000 })
  .addTo(map)
  .bindPopup(`
    <div class="popup-call">${rep.callsign}</div>
    <table class="popup-table">
      <tr><td>Locator</td><td>${rep.locator.toUpperCase()}</td></tr>
      <tr><td>Frequenza</td><td>${rep.freq}</td></tr>
      <tr><td>Subtono</td><td>${rep.subtone}</td></tr>
      <tr><td>Modo</td><td>${rep.modo}</td></tr>
      ${rep.localita   ? `<tr><td>Località</td><td>${rep.localita}</td></tr>`     : ''}
      ${rep.altitudine ? `<tr><td>Altitudine</td><td>${rep.altitudine}</td></tr>` : ''}
    </table>
  `);

let contactLayer = L.layerGroup().addTo(map);

// ══════════════════════════════════════════════
//  RENDER CONTACTS
// ══════════════════════════════════════════════
function renderContacts(contacts, fitView = true) {
  contactLayer.clearLayers();
  let maxDist = 0, totalDist = 0, bestScore = 0;

  contacts.forEach(c => {
    const dist  = haversine(rep.lat, rep.lon, c.lat, c.lon);
    const az    = azimuth(rep.lat, rep.lon, c.lat, c.lon);
    const score = c.power > 0 ? dist / c.power : 0;
    if (dist > maxDist)    maxDist   = dist;
    if (score > bestScore) bestScore = score;
    totalDist += dist;

    const color = rstColor(c.rst_rx);
    const { weight, dashArray } = powerLineStyle(c.power);
    const pts = greatCirclePoints(rep.lat, rep.lon, c.lat, c.lon);

    // Linea geodetica
    const line = L.polyline(pts, { color, weight, dashArray, opacity: 0.85 });
    contactLayer.addLayer(line);

    // Popup
    const modTag = c.modalita
      ? `<span class="tag tag-${c.modalita.toLowerCase()}">${c.modalita}</span>`
      : '';
    const popHtml = `
      <div class="popup-call">${c.callsign}</div>
      ${modTag ? `<div style="margin-bottom:8px">${modTag}</div>` : ''}
      <table class="popup-table">
        <tr><td>Distanza</td><td>${Math.round(dist)} km</td></tr>
        <tr><td>Azimuth</td><td>${Math.round(az)}°</td></tr>
        <tr><td>RST</td><td>${c.rst_rx}</td></tr>
        <tr><td>Potenza Tx</td><td>${c.power} W</td></tr>
        ${score > 0 ? `<tr><td>Indice DX</td><td>${Math.round(score)} km/W</td></tr>` : ''}
        ${c.operatore ? `<tr><td>Operatore</td><td>${c.operatore}</td></tr>` : ''}
        ${c.note      ? `<tr><td>Note</td><td>${c.note}</td></tr>`           : ''}
        ${c.data      ? `<tr><td>Data/ora</td><td>${c.data}</td></tr>`       : ''}
      </table>
    `;
    line.bindPopup(popHtml);

    // Marker stazione — colore per modalità
    const dotColor = modalitaColor(c.modalita);
    const stIcon = L.divIcon({
      html: `<div style="width:9px;height:9px;background:${dotColor};border:1.5px solid #0d1117;border-radius:50%"></div>`,
      className: '', iconAnchor: [4,4]
    });
    const marker = L.marker([c.lat, c.lon], { icon: stIcon });
    marker.bindPopup(popHtml);
    contactLayer.addLayer(marker);

    // Etichetta a fianco del pallino
    const lblIcon = L.divIcon({
      className: '', iconSize: [1,1], iconAnchor: [-10,8],
      html: `<span style="display:inline-block;white-space:nowrap;font-family:'Share Tech Mono',monospace;font-size:11px;background:rgba(13,17,23,0.82);border:1px solid #30363d;border-radius:4px;padding:1px 6px;color:#e6edf3;cursor:pointer;">${Math.round(dist)} km — ${c.power > 0 ? c.power + ' W' : '—'}</span>`
    });
    const lblMarker = L.marker([c.lat, c.lon], { icon: lblIcon });
    lblMarker.bindPopup(popHtml);
    contactLayer.addLayer(lblMarker);
  });

  // Aggiorna stats header (desktop)
  const n = contacts.length;
  document.getElementById('h-total').textContent   = n;
  document.getElementById('h-maxdist').textContent = n ? Math.round(maxDist) + ' km' : '—';
  document.getElementById('h-avgdist').textContent = n ? Math.round(totalDist / n) + ' km' : '—';
  document.getElementById('h-best').textContent    = bestScore > 0 ? Math.round(bestScore) + ' km/W' : '—';
  // Aggiorna stats pannello mobile
  document.getElementById('h-total-m').textContent   = n;
  document.getElementById('h-maxdist-m').textContent = n ? Math.round(maxDist) + ' km' : '—';
  document.getElementById('h-avgdist-m').textContent = n ? Math.round(totalDist / n) + ' km' : '—';
  document.getElementById('h-best-m').textContent    = bestScore > 0 ? Math.round(bestScore) + ' km/W' : '—';

  const lu = document.getElementById('last-update');
  if (lu) lu.textContent = 'aggiornato: ' + new Date().toLocaleTimeString('it-IT');

  if (fitView && n) {
    const allPoints = [[rep.lat, rep.lon], ...contacts.map(c => [c.lat, c.lon])];
    map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] });
  }
}

// ══════════════════════════════════════════════
//  DATA LOADING
// ══════════════════════════════════════════════
function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function isLocalDev() {
  const h = location.hostname;
  return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '';
}

let allContacts    = [];
let filterPower    = null;
let filterModalita = null;

function applyFilters(fitView = false) {
  const knownMods = CONFIG.modalita.map(m => m.toLowerCase());
  const filtered = allContacts.filter(c => {
    if (filterPower !== null && !filterPower.has(getPowerBandIndex(c.power))) return false;
    const mod = (c.modalita || '').toLowerCase();
    if (filterModalita !== null && knownMods.includes(mod) && !filterModalita.has(mod)) return false;
    return true;
  });
  renderContacts(filtered, fitView);
}

async function loadData() {
  if (!CONFIG.sheetCSV) {
    if (isLocalDev()) { allContacts = SAMPLE_DATA; applyFilters(true); }
    return;
  }
  try {
    const res = await fetch(CONFIG.sheetCSV);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const data = parseCSV(text);
    if (!data.length) throw new Error('Nessun dato valido nel foglio');
    allContacts = data;
    applyFilters(true);
  } catch(e) {
    if (isLocalDev()) {
      showError('Errore Sheet: ' + e.message + ' — dati mock (solo in locale)');
      allContacts = SAMPLE_DATA;
      applyFilters(true);
    } else {
      showError('Errore caricamento dati: ' + e.message);
    }
  }
}

// ══════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════
window.addEventListener('load', async () => {
  document.getElementById('logo-main').innerHTML =
    `${rep.name} by ${rep.callsign}<br><span>${rep.freq}</span>`;

  // Stats panel toggle (mobile)
  const statsBtn   = document.getElementById('stats-btn');
  const statsPanel = document.getElementById('stats-panel');
  const statsClose = document.getElementById('stats-close');
  statsBtn.addEventListener('click',  () => statsPanel.classList.toggle('hidden'));
  statsClose.addEventListener('click', () => statsPanel.classList.add('hidden'));

  // Init stato filtri — tutto attivo
  filterPower    = new Set(CONFIG.powerBands.map((_, i) => i));
  filterModalita = new Set(CONFIG.modalita.map(m => m.toLowerCase()));

  // ─ Genera sidebar (legenda + filtri) da CONFIG ─
  const sidebar   = document.getElementById('sidebar');
  const filterBtn = document.getElementById('filter-btn');

  const rstLeg = CONFIG.rstBands.map(b =>
    `<div class="leg-item"><div class="leg-dash" style="background:${b.color}"></div>${b.label}</div>`
  ).join('');

  const powerLeg = CONFIG.powerBands.map(b => {
    const sw = b.weight * 1.4;
    const h  = Math.max(Math.round(sw + 4), 8);
    const y  = h / 2;
    const da = b.dash ? ` stroke-dasharray="${b.dash}"` : '';
    return `<div class="leg-item"><svg width="22" height="${h}" style="flex-shrink:0"><line x1="0" y1="${y}" x2="22" y2="${y}" stroke="var(--muted)" stroke-width="${sw}"${da}/></svg>${b.label}</div>`;
  }).join('');

  const modLeg = CONFIG.modalita.map(m =>
    `<div class="leg-item"><div class="leg-dot" style="background:${modalitaColor(m)}"></div>${m.charAt(0).toUpperCase()+m.slice(1)}</div>`
  ).join('');

  const powerFlt = CONFIG.powerBands.map((b, i) =>
    `<label class="filter-item"><input type="checkbox" class="flt-power" data-idx="${i}" checked> ${b.label}</label>`
  ).join('');

  const modFlt = CONFIG.modalita.map(m =>
    `<label class="filter-item"><input type="checkbox" class="flt-mod" data-mod="${m}" checked> ${m.charAt(0).toUpperCase()+m.slice(1)}</label>`
  ).join('');

  sidebar.innerHTML = `
    <button id="sidebar-close" title="Chiudi">✕</button>
    <div class="sb-title">Legenda</div>
    <div class="sb-sublabel">RST (linea)</div>
    ${rstLeg}
    <div class="sb-sublabel">Potenza (tratto)</div>
    ${powerLeg}
    <div class="sb-sublabel">Modalità (pallino)</div>
    ${modLeg}
    <div class="leg-item"><span style="font-size:14px;line-height:1">📡</span>Ponte</div>
    <div class="sb-sep"></div>
    <div class="sb-title">Filtri</div>
    <div class="sb-sublabel">Potenza</div>
    ${powerFlt}
    <div class="sb-sublabel">Modalità</div>
    ${modFlt}
    <div id="last-update">aggiornato: —</div>
  `;

  sidebar.querySelectorAll('.flt-power').forEach(cb => {
    cb.addEventListener('change', () => {
      filterPower = new Set([...sidebar.querySelectorAll('.flt-power:checked')].map(el => +el.dataset.idx));
      applyFilters();
    });
  });
  sidebar.querySelectorAll('.flt-mod').forEach(cb => {
    cb.addEventListener('change', () => {
      filterModalita = new Set([...sidebar.querySelectorAll('.flt-mod:checked')].map(el => el.dataset.mod.toLowerCase()));
      applyFilters();
    });
  });

  document.getElementById('sidebar-close').addEventListener('click', () => sidebar.classList.remove('open'));
  filterBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  // Chiudi drawer toccando la mappa (mobile)
  document.getElementById('map-area').addEventListener('click', e => {
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== filterBtn)
      sidebar.classList.remove('open');
  });

  // Layer switcher
  document.querySelectorAll('[data-layer]').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      if (!layer || layer === activeLayer) return;
      map.removeLayer(TILE_LAYERS[activeLayer]);
      TILE_LAYERS[layer].addTo(map);
      activeLayer = layer;
      document.querySelectorAll('[data-layer]').forEach(b =>
        b.classList.toggle('active', b.dataset.layer === layer)
      );
    });
  });

  await loadData();
  document.getElementById('loader').classList.add('hidden');
  if (CONFIG.refreshMinutes > 0) {
    setInterval(loadData, CONFIG.refreshMinutes * 60 * 1000);
  }
});
