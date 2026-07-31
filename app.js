/* ============================================================================
   I11 PG — LAUNDRY — FRONTEND
   Set APPS_SCRIPT_URL below after deploying Code.gs (see README Part 2).
   ============================================================================ */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyDYCCZstBzfh3yXshIJf5zSEdvrWKfck_ktyQSi8K3tL7dof0mLxwofwumHDjreh4/exec";
const NEEDS_SETUP = APPS_SCRIPT_URL.indexOf('PASTE_YOUR') !== -1;

const STATUS_POLL_MS = 20000;
const TICK_MS = 1000;

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

const state = {
  statusData: null,
  agendaData: null,
  activeTab: 'home',
  calDate: startOfDay(new Date()),
  calGrid: null,
  upcomingFilter: 'all',
  adminPin: localStorage.getItem('adminPin') || null,
  adminMachines: null,
  adminSettings: null,
  bookMode: 'queue'
};

let toastTimer = null;

// =============================== UTILITIES ==================================

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a, b) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function hhmm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDayLabel(date) {
  const today = startOfDay(new Date());
  const d = startOfDay(date);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtDateTime(iso) { return fmtDayLabel(new Date(iso)) + ' ' + fmtTime(iso); }

function hourLabel(h) {
  const hh = ((h % 24) + 24) % 24;
  if (hh === 0) return '12 AM';
  if (hh === 12) return '12 PM';
  return hh < 12 ? hh + ' AM' : (hh - 12) + ' PM';
}

function countdownText(endIso) {
  const ms = new Date(endIso).getTime() - Date.now();
  if (ms <= 0) return 'Finishing up…';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'Less than a minute left';
  if (mins < 60) return '~' + mins + ' min left';
  const h = Math.floor(mins / 60), m = mins % 60;
  return '~' + h + 'h ' + (m ? m + 'm ' : '') + 'left';
}

function emptyStateHTML(title, body) {
  return '<div class="empty-state"><h3>' + esc(title) + '</h3><p>' + esc(body) + '</p></div>';
}

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

function showToast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
}

// ------------------------- "my bookings" (localStorage) ----------------------

function myBookingIds() {
  try { return JSON.parse(localStorage.getItem('myBookings') || '[]'); } catch (e) { return []; }
}
function saveMyBooking(id, machineId) {
  const list = myBookingIds();
  list.push({ id: id, machineId: machineId, ts: Date.now() });
  localStorage.setItem('myBookings', JSON.stringify(list));
}
function removeMyBooking(id) {
  localStorage.setItem('myBookings', JSON.stringify(myBookingIds().filter(function (b) { return b.id !== id; })));
}
function isMine(id) {
  return myBookingIds().some(function (b) { return b.id === id; });
}

// ================================ NETWORKING =================================

async function getJSON(action) {
  const res = await fetch(APPS_SCRIPT_URL + '?action=' + action, { cache: 'no-store' });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function postJSON(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  return res.json();
}

function setLive(kind, text) {
  const dot = document.getElementById('liveDot');
  dot.className = 'live-dot' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  document.getElementById('liveText').textContent = text;
}

let lastFetchOk = false;
let lastFetchTime = 0;

async function fetchAll() {
  if (NEEDS_SETUP) {
    setLive('err', 'Setup needed');
    document.getElementById('homeList').innerHTML = emptyStateHTML(
      'One more step', 'Open app.js and paste your Apps Script web app URL in APPS_SCRIPT_URL — see README Part 2.'
    );
    return;
  }
  try {
    const results = await Promise.all([getJSON('status'), getJSON('agenda')]);
    state.statusData = results[0];
    state.agendaData = results[1];
    lastFetchOk = true;
    lastFetchTime = Date.now();
    updateLiveText();
    renderAll();
  } catch (err) {
    lastFetchOk = false;
    lastFetchTime = Date.now();
    updateLiveText();
  }
}

function updateLiveText() {
  if (!lastFetchTime) { setLive('', 'Connecting…'); return; }
  const secs = Math.round((Date.now() - lastFetchTime) / 1000);
  const when = secs < 5 ? 'just now' : secs < 60 ? secs + 's ago' : Math.round(secs / 60) + 'm ago';
  setLive(lastFetchOk ? 'ok' : 'err', (lastFetchOk ? 'Updated ' : 'Offline · last update ') + when);
}

function renderAll() {
  renderHome();
  if (state.activeTab === 'calendar') renderCalendar();
  if (state.activeTab === 'upcoming') renderUpcoming();
}

// ================================== TABS =====================================

function setTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = p.dataset.tab !== tab; });
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tabBtn === tab); });
  if (tab === 'calendar') renderCalendar();
  if (tab === 'upcoming') renderUpcoming();
  if (tab === 'admin') renderAdmin();
  document.getElementById('tab-' + tab).scrollTop = 0;
}

// =================================== HOME ====================================

function ringSVG(fraction, kind) {
  const r = 30, c = 2 * Math.PI * r;
  if (kind === 'maint') {
    return '<svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="' + r + '" fill="none" stroke="var(--coral-dim)" stroke-width="5"/></svg>' +
      '<div class="mc-ring-glyph">Maint.</div>';
  }
  const drawn = kind === 'free' ? c : c * clamp(fraction, 0, 1);
  const color = kind === 'free' ? 'var(--teal)' : 'var(--amber)';
  const label = kind === 'free' ? 'Free' : Math.round(clamp(fraction, 0, 1) * 100) + '%';
  return '<svg viewBox="0 0 72 72">' +
    '<circle cx="36" cy="36" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="5"/>' +
    '<circle cx="36" cy="36" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" ' +
    'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c - drawn).toFixed(2) + '"/></svg>' +
    '<div class="mc-ring-glyph">' + label + '</div>';
}

function machineCardHTML(m) {
  const isMaint = m.status === 'Maintenance';
  const isFree = !isMaint && !m.current;
  const fraction = (!isMaint && m.current)
    ? (Date.now() - new Date(m.current.start).getTime()) / (new Date(m.current.end).getTime() - new Date(m.current.start).getTime())
    : 0;
  const ring = ringSVG(fraction, isMaint ? 'maint' : (isFree ? 'free' : 'busy'));

  let detail;
  if (isMaint) {
    detail = '<p class="mc-detail">Not available right now</p>' + (m.note ? '<p class="mc-note">' + esc(m.note) + '</p>' : '');
  } else if (isFree) {
    detail = '<p class="mc-detail">Ready to use right now</p>';
  } else {
    detail = '<p class="mc-detail">Used by <b>' + esc(m.current.name) + '</b>' + (m.current.room ? ' (Room ' + esc(m.current.room) + ')' : '') + '</p>' +
      '<p class="mc-detail">Free at <b>' + fmtTime(m.current.end) + '</b></p>' +
      '<p class="mc-countdown">' + countdownText(m.current.end) + '</p>';
  }

  let queueHtml = '';
  if (!isMaint && m.queue && m.queue.length) {
    const shown = m.queue.slice(0, 3);
    queueHtml = '<div class="mc-queue"><b>Queue · ' + m.queue.length + ' waiting</b>' +
      shown.map(function (q) {
        return '<div class="mc-queue-item"><span>' + (isMine(q.id) ? 'You' : esc(q.name)) + '</span><span>' + fmtTime(q.start) + '–' + fmtTime(q.end) + '</span></div>';
      }).join('') +
      (m.queue.length > shown.length ? '<div class="mc-queue-item"><span>+' + (m.queue.length - shown.length) + ' more</span><span></span></div>' : '') +
      '</div>';
  }

  const btnLabel = isMaint ? 'Under maintenance' : (isFree ? 'Book now' : 'Join queue');
  return '<div class="machine-card ' + (isMaint ? 'is-maintenance' : '') + '">' +
    '<div class="mc-top">' +
    '<div class="mc-ring ' + (!isMaint && !isFree ? 'glow' : '') + '">' + ring + '</div>' +
    '<div class="mc-info">' +
    '<div class="mc-name-row"><span class="mc-name">' + esc(m.name) + '</span>' +
    '<span class="badge ' + (isMaint ? 'maint' : (isFree ? 'free' : 'busy')) + '">' + (isMaint ? 'Maintenance' : (isFree ? 'Free' : 'In use')) + '</span></div>' +
    detail +
    '</div></div>' +
    queueHtml +
    '<button class="btn btn-primary mc-cta" data-action="book" data-machine-id="' + m.id + '" ' + (isMaint ? 'disabled' : '') + '>' + btnLabel + '</button>' +
    '</div>';
}

function renderHome() {
  if (!state.statusData) return;
  const list = document.getElementById('homeList');
  const machines = state.statusData.machines;
  if (!machines.length) {
    list.innerHTML = emptyStateHTML('No machines yet', 'An admin can add one from the Admin tab.');
    return;
  }
  list.innerHTML = machines.map(machineCardHTML).join('');
}

// ================================= CALENDAR ==================================

function renderCalendar() {
  document.getElementById('calDateLabel').textContent = fmtDayLabel(state.calDate);
  const inner = document.getElementById('calInner');
  const scroll = document.getElementById('calScroll');
  const hint = document.getElementById('calHint');
  if (!state.agendaData) return;

  const machines = state.agendaData.machines;
  if (!machines.length) {
    scroll.style.display = 'none';
    hint.textContent = 'No machines yet — an admin can add one from the Admin tab.';
    inner.innerHTML = '';
    return;
  }
  scroll.style.display = '';
  hint.textContent = 'Tap an open slot to schedule that machine.';

  const dayStart = startOfDay(state.calDate);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const dayBookings = state.agendaData.bookings.filter(function (b) {
    return new Date(b.start) < dayEnd && new Date(b.end) > dayStart;
  });

  let minHour = 6, maxHour = 24;
  dayBookings.forEach(function (b) {
    const sH = (new Date(b.start) - dayStart) / 3600000;
    const eH = (new Date(b.end) - dayStart) / 3600000;
    minHour = Math.min(minHour, Math.max(0, Math.floor(sH)));
    maxHour = Math.max(maxHour, Math.min(24, Math.ceil(eH)));
  });

  const pxPerMin = 1.05;
  const gridStart = new Date(dayStart.getTime() + minHour * 3600000);
  const totalMin = (maxHour - minHour) * 60;
  const totalPx = totalMin * pxPerMin;
  state.calGrid = { gridStart: gridStart, pxPerMin: pxPerMin, totalMin: totalMin };

  const headerHtml = '<div class="cal-axis-corner"></div>' + machines.map(function (m) {
    const dotColor = m.status === 'Maintenance' ? 'var(--coral)' : 'var(--teal)';
    return '<div class="cal-machine-head"><span><i class="dot" style="background:' + dotColor + '"></i>' + esc(m.name) + '</span></div>';
  }).join('');

  let axisHtml = '';
  for (let h = minHour; h <= maxHour; h++) {
    axisHtml += '<div class="cal-hour-label" style="top:' + ((h - minHour) * 60 * pxPerMin) + 'px">' + hourLabel(h) + '</div>';
  }

  const nowMs = Date.now();
  const isToday = sameDay(state.calDate, new Date());
  const gridLineCss = 'repeating-linear-gradient(to bottom, var(--line-soft) 0, var(--line-soft) 1px, transparent 1px, transparent ' + (60 * pxPerMin) + 'px)';

  const colsHtml = machines.map(function (m) {
    if (m.status === 'Maintenance') {
      return '<div class="cal-machine-col maintenance" style="height:' + totalPx + 'px">' +
        '<div class="cal-maint-overlay"></div><div class="cal-maint-label">Under<br>maintenance</div></div>';
    }
    const blocks = dayBookings.filter(function (b) { return b.machineId === m.id; }).map(function (b) {
      const s = new Date(b.start), e = new Date(b.end);
      const top = Math.max(0, (s - gridStart) / 60000) * pxPerMin;
      const bottom = Math.min(totalMin, (e - gridStart) / 60000) * pxPerMin;
      const height = Math.max(30, bottom - top);
      const mine = isMine(b.id);
      return '<div class="cal-block ' + (mine ? 'mine' : '') + '" style="top:' + top + 'px;height:' + height + 'px" ' +
        'data-booking-id="' + b.id + '" data-name="' + esc(b.name) + '" data-room="' + esc(b.room || '') + '" data-start="' + b.start + '" data-end="' + b.end + '">' +
        '<b>' + (mine ? 'You' : esc(b.name)) + '</b><span class="t">' + fmtTime(b.start) + '–' + fmtTime(b.end) + '</span></div>';
    }).join('');

    let nowLine = '';
    if (isToday) {
      const nowTop = ((nowMs - gridStart.getTime()) / 60000) * pxPerMin;
      if (nowTop >= 0 && nowTop <= totalPx) nowLine = '<div class="cal-now-line" style="top:' + nowTop + 'px"><span class="cal-now-dot"></span></div>';
    }
    return '<div class="cal-machine-col" data-machine-id="' + m.id + '" style="height:' + totalPx + 'px;background-image:' + gridLineCss + '">' + blocks + nowLine + '</div>';
  }).join('');

  inner.innerHTML = '<div class="cal-header-row">' + headerHtml + '</div>' +
    '<div class="cal-body-row"><div class="cal-axis-col" style="height:' + totalPx + 'px">' + axisHtml + '</div>' + colsHtml + '</div>';
}

// ================================= UPCOMING ==================================

function renderUpcoming() {
  const list = document.getElementById('upcomingList');
  if (!state.agendaData) return;
  const now = Date.now();
  let bookings = state.agendaData.bookings.filter(function (b) { return new Date(b.end).getTime() > now; });
  if (state.upcomingFilter === 'mine') bookings = bookings.filter(function (b) { return isMine(b.id); });
  // defensive sort so day-grouping below is correct even if the source data isn't pre-sorted
  bookings = bookings.slice().sort(function (a, b) { return new Date(a.start) - new Date(b.start); });

  if (!bookings.length) {
    list.innerHTML = state.upcomingFilter === 'mine'
      ? emptyStateHTML('Nothing booked', 'Your laundry, your call — book a machine from Home.')
      : emptyStateHTML('All clear', 'No one has a machine booked right now.');
    return;
  }

  const machines = state.agendaData.machines;
  function machineName(id) { const m = machines.find(function (x) { return x.id === id; }); return m ? m.name : 'Machine'; }

  let html = '', lastDay = null;
  bookings.forEach(function (b) {
    const day = fmtDayLabel(new Date(b.start));
    if (day !== lastDay) { html += '<div class="day-heading">' + day + '</div>'; lastDay = day; }
    const mine = isMine(b.id);
    const showAdminCancel = !!state.adminPin;
    html += '<div class="upcoming-row ' + (mine ? 'mine' : '') + '">' +
      '<div class="ur-time">' + fmtTime(b.start) + '<br>' + fmtTime(b.end) + '</div>' +
      '<div class="ur-main"><div class="ur-machine">' + esc(machineName(b.machineId)) + '</div>' +
      '<div class="ur-who">' + (mine ? '<span class="you">You</span>' : esc(b.name)) + (b.room ? ' · Room ' + esc(b.room) : '') + '</div></div>' +
      '<div class="ur-actions">' +
      (mine ? '<button data-action="finish" data-id="' + b.id + '" title="Mark done early">' + ICON_CHECK + '</button>' : '') +
      ((mine || showAdminCancel) ? '<button class="danger" data-action="cancel" data-id="' + b.id + '" title="Cancel">' + ICON_X + '</button>' : '') +
      '</div></div>';
  });
  list.innerHTML = html;
}

// ================================== ADMIN ====================================

function renderAdmin() {
  if (state.adminPin) {
    postJSON({ action: 'admin_login', pin: state.adminPin }).then(function (res) {
      if (res.error) {
        state.adminPin = null;
        localStorage.removeItem('adminPin');
        document.getElementById('adminLocked').hidden = false;
        document.getElementById('adminPanel').hidden = true;
        return;
      }
      state.adminMachines = res.machines;
      state.adminSettings = res.settings;
      showAdminPanel();
    });
  } else {
    document.getElementById('adminLocked').hidden = false;
    document.getElementById('adminPanel').hidden = true;
  }
}

function showAdminPanel() {
  document.getElementById('adminLocked').hidden = true;
  document.getElementById('adminPanel').hidden = false;
  renderAdminMachines();
  fillSettingsForm(state.adminSettings);
}

function renderAdminMachines() {
  const box = document.getElementById('adminMachineList');
  box.innerHTML = state.adminMachines.map(function (m) {
    let buttons;
    if (m.status === 'Active') {
      buttons = '<button class="warn" data-action="set-maint">Set maintenance</button><button class="danger" data-action="set-retired">Retire</button>';
    } else if (m.status === 'Maintenance') {
      buttons = '<button class="ok" data-action="set-active">Reactivate</button><button class="danger" data-action="set-retired">Retire</button>';
    } else {
      buttons = '<button class="ok" data-action="set-active">Reactivate</button>';
    }
    const badgeClass = m.status === 'Active' ? 'free' : m.status === 'Maintenance' ? 'busy' : 'maint';
    return '<div class="admin-machine-row" data-id="' + m.id + '">' +
      '<div class="amr-top"><input type="text" value="' + esc(m.name) + '" data-field="name" maxlength="40">' +
      '<span class="badge ' + badgeClass + '">' + m.status + '</span></div>' +
      '<div class="amr-note"><input type="text" value="' + esc(m.note || '') + '" data-field="note" maxlength="140" placeholder="Note (optional) — shown to residents"></div>' +
      '<div class="amr-buttons">' + buttons + '<button class="save" data-action="save-fields">Save</button></div>' +
      '</div>';
  }).join('');
}

function fillSettingsForm(s) {
  document.getElementById('setMaxDuration').value = s.maxDurationMin;
  document.getElementById('setMinDuration').value = s.minDurationMin;
  document.getElementById('setMaxQueue').value = s.maxQueuePerMachine;
  document.getElementById('setMaxAdvance').value = s.maxAdvanceDays;
  document.getElementById('setQuietStart').value = s.quietHoursStart || '';
  document.getElementById('setQuietEnd').value = s.quietHoursEnd || '';
  document.getElementById('setNewPin').value = '';
}

// ============================== BOOKING MODAL ================================

function populateMachineSelect(selectedId) {
  const sel = document.getElementById('inpMachine');
  const machines = (state.statusData && state.statusData.machines) || [];
  sel.innerHTML = machines.map(function (m) {
    return '<option value="' + m.id + '" ' + (m.status === 'Maintenance' ? 'disabled' : '') + ' ' + (m.id === selectedId ? 'selected' : '') + '>' +
      esc(m.name) + (m.status === 'Maintenance' ? ' (maintenance)' : '') + '</option>';
  }).join('');
}

function populateDurationSelect() {
  const sel = document.getElementById('inpDuration');
  const s = (state.statusData && state.statusData.settings) || { minDurationMin: 10, maxDurationMin: 180 };
  const candidates = [15, 30, 45, 60, 90, 120, 150, 180, 210, 240];
  let options = candidates.filter(function (v) { return v >= s.minDurationMin && v <= s.maxDurationMin; });
  if (!options.length) options = [s.maxDurationMin];
  sel.innerHTML = options.map(function (v) {
    const label = v < 60 ? v + ' min' : (v % 60 === 0 ? (v / 60) + ' hr' : (v / 60).toFixed(1) + ' hr');
    return '<option value="' + v + '" ' + (v === 60 ? 'selected' : '') + '>' + label + '</option>';
  }).join('');
}

function setBookMode(mode) {
  state.bookMode = mode;
  document.querySelectorAll('#modeSegment .seg-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === mode); });
  document.getElementById('scheduleFields').hidden = mode !== 'schedule';
}

function openBookModal(opts) {
  populateMachineSelect(opts.machineId);
  populateDurationSelect();
  setBookMode(opts.mode || 'queue');
  document.getElementById('inpName').value = localStorage.getItem('lastName') || '';
  document.getElementById('inpRoom').value = localStorage.getItem('lastRoom') || '';

  const now = new Date();
  document.getElementById('inpDate').value = opts.date || ymd(now);
  document.getElementById('inpTime').value = opts.time || hhmm(new Date(now.getTime() + 15 * 60000));
  document.getElementById('inpDate').min = ymd(now);

  document.getElementById('bookMsg').textContent = '';
  document.getElementById('bookSubmitBtn').disabled = false;
  document.getElementById('bookOverlay').classList.add('open');
}

function closeModal() { document.getElementById('bookOverlay').classList.remove('open'); }

async function submitBooking() {
  const name = document.getElementById('inpName').value.trim();
  const room = document.getElementById('inpRoom').value.trim();
  const machineId = document.getElementById('inpMachine').value;
  const duration = document.getElementById('inpDuration').value;
  const mode = state.bookMode;
  const msg = document.getElementById('bookMsg');
  const submitBtn = document.getElementById('bookSubmitBtn');

  if (!name) { showMsg(msg, 'Enter your name.', 'error'); return; }
  if (!machineId) { showMsg(msg, 'Choose a machine.', 'error'); return; }

  let startTime = null;
  if (mode === 'schedule') {
    const dateVal = document.getElementById('inpDate').value;
    const timeVal = document.getElementById('inpTime').value;
    if (!dateVal || !timeVal) { showMsg(msg, 'Choose a date and time.', 'error'); return; }
    const parts = dateVal.split('-').map(Number);
    const tparts = timeVal.split(':').map(Number);
    const local = new Date(parts[0], parts[1] - 1, parts[2], tparts[0], tparts[1], 0, 0);
    startTime = local.toISOString();
  }

  submitBtn.disabled = true;
  showMsg(msg, mode === 'schedule' ? 'Scheduling…' : 'Booking…', '');

  try {
    const res = await postJSON({ action: 'book', name: name, room: room, machineId: machineId, duration: duration, mode: mode, startTime: startTime });
    if (res.error) {
      showMsg(msg, res.error + (res.nextFreeStart ? ' Next free: ' + fmtDateTime(res.nextFreeStart) + '.' : ''), 'error');
      submitBtn.disabled = false;
      return;
    }
    localStorage.setItem('lastName', name);
    if (room) localStorage.setItem('lastRoom', room);
    saveMyBooking(res.id, machineId);
    showMsg(msg, res.waitMinutes > 0 ? 'Booked — starts in ~' + res.waitMinutes + ' min.' : 'Booked — it is free now, go ahead.', 'success');
    setTimeout(function () { closeModal(); fetchAll(); submitBtn.disabled = false; }, 1100);
  } catch (err) {
    showMsg(msg, 'Something went wrong. Try again.', 'error');
    submitBtn.disabled = false;
  }
}

// ============================ EVENT WIRING (once) ============================

function wireEvents() {
  document.querySelectorAll('[data-tab-btn]').forEach(function (btn) {
    btn.addEventListener('click', function () { setTab(btn.dataset.tabBtn); });
  });

  document.getElementById('homeList').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action="book"]');
    if (btn && !btn.disabled) openBookModal({ machineId: btn.dataset.machineId, mode: 'queue' });
  });

  document.getElementById('calPrev').addEventListener('click', function () {
    state.calDate = new Date(state.calDate.getTime() - 86400000); renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', function () {
    state.calDate = new Date(state.calDate.getTime() + 86400000); renderCalendar();
  });
  document.getElementById('calDateLabel').addEventListener('click', function () {
    state.calDate = startOfDay(new Date()); renderCalendar();
  });

  document.getElementById('calInner').addEventListener('click', function (e) {
    const block = e.target.closest('.cal-block');
    if (block) {
      const mine = isMine(block.dataset.bookingId);
      showToast((mine ? 'You' : block.dataset.name || 'Someone') + (block.dataset.room ? ' (Room ' + block.dataset.room + ')' : '') +
        ' · ' + fmtTime(block.dataset.start) + '–' + fmtTime(block.dataset.end));
      return;
    }
    const col = e.target.closest('.cal-machine-col');
    if (!col || col.classList.contains('maintenance') || !state.calGrid) return;
    const rect = col.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutesFromStart = offsetY / state.calGrid.pxPerMin;
    const clicked = new Date(state.calGrid.gridStart.getTime() + minutesFromStart * 60000);
    const snappedMs = Math.round(clicked.getTime() / (15 * 60000)) * (15 * 60000);
    const snapped = new Date(snappedMs);
    if (snapped.getTime() < Date.now() - 5 * 60000) { showToast('That time has already passed.'); return; }
    openBookModal({ machineId: col.dataset.machineId, mode: 'schedule', date: ymd(snapped), time: hhmm(snapped) });
  });

  document.querySelectorAll('.chip-row .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      state.upcomingFilter = c.dataset.filter;
      document.querySelectorAll('.chip-row .chip').forEach(function (x) { x.classList.toggle('active', x === c); });
      renderUpcoming();
    });
  });

  document.getElementById('upcomingList').addEventListener('click', async function (e) {
    const finishBtn = e.target.closest('[data-action="finish"]');
    const cancelBtn = e.target.closest('[data-action="cancel"]');
    if (finishBtn) {
      finishBtn.disabled = true;
      const res = await postJSON({ action: 'finish', id: finishBtn.dataset.id });
      if (res.error) { showToast(res.error); finishBtn.disabled = false; } else { showToast('Marked done — thanks for freeing it up early.'); fetchAll(); }
    } else if (cancelBtn) {
      cancelBtn.disabled = true;
      const id = cancelBtn.dataset.id;
      const mine = isMine(id);
      const res = mine ? await postJSON({ action: 'cancel', id: id }) : await postJSON({ action: 'admin_cancel_booking', pin: state.adminPin, id: id });
      if (res.error) { showToast(res.error); cancelBtn.disabled = false; } else { if (mine) removeMyBooking(id); showToast('Booking cancelled.'); fetchAll(); }
    }
  });

  document.querySelectorAll('#modeSegment .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { setBookMode(b.dataset.mode); });
  });
  document.getElementById('bookCancelBtn').addEventListener('click', closeModal);
  document.getElementById('bookSubmitBtn').addEventListener('click', submitBooking);
  document.getElementById('bookOverlay').addEventListener('click', function (e) { if (e.target.id === 'bookOverlay') closeModal(); });

  document.getElementById('adminUnlockBtn').addEventListener('click', async function () {
    const pinInput = document.getElementById('adminPinInput');
    const msg = document.getElementById('adminLoginMsg');
    const pin = pinInput.value.trim();
    if (!pin) { showMsg(msg, 'Enter the PIN.', 'error'); return; }
    showMsg(msg, 'Checking…', '');
    const res = await postJSON({ action: 'admin_login', pin: pin });
    if (res.error) { showMsg(msg, res.error, 'error'); return; }
    state.adminPin = pin;
    localStorage.setItem('adminPin', pin);
    state.adminMachines = res.machines;
    state.adminSettings = res.settings;
    showAdminPanel();
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', function () {
    state.adminPin = null;
    localStorage.removeItem('adminPin');
    document.getElementById('adminLocked').hidden = false;
    document.getElementById('adminPanel').hidden = true;
    document.getElementById('adminPinInput').value = '';
  });

  document.getElementById('adminMachineList').addEventListener('click', async function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const row = btn.closest('.admin-machine-row');
    const id = row.dataset.id;
    const action = btn.dataset.action;
    btn.disabled = true;
    let res;
    if (action === 'save-fields') {
      const name = row.querySelector('[data-field="name"]').value.trim();
      const note = row.querySelector('[data-field="note"]').value.trim();
      res = await postJSON({ action: 'admin_update_machine', pin: state.adminPin, machineId: id, fields: { name: name, note: note } });
    } else {
      const status = action === 'set-maint' ? 'Maintenance' : action === 'set-retired' ? 'Retired' : 'Active';
      res = await postJSON({ action: 'admin_update_machine', pin: state.adminPin, machineId: id, fields: { status: status } });
    }
    if (res.error) { showToast(res.error); btn.disabled = false; return; }
    state.adminMachines = res.machines;
    renderAdminMachines();
    showToast(res.cancelledCount ? ('Saved. ' + res.cancelledCount + ' upcoming booking' + (res.cancelledCount > 1 ? 's' : '') + ' cancelled.') : 'Saved.');
    fetchAll();
  });

  document.getElementById('addMachineBtn').addEventListener('click', async function () {
    const input = document.getElementById('newMachineName');
    const name = input.value.trim();
    if (!name) return;
    const btn = document.getElementById('addMachineBtn');
    btn.disabled = true;
    const res = await postJSON({ action: 'admin_add_machine', pin: state.adminPin, name: name });
    btn.disabled = false;
    if (res.error) { showToast(res.error); return; }
    input.value = '';
    state.adminMachines = res.machines;
    renderAdminMachines();
    showToast(esc(name) + ' added.');
    fetchAll();
  });

  document.getElementById('saveSettingsBtn').addEventListener('click', async function () {
    const msg = document.getElementById('adminSettingsMsg');
    const settings = {
      MAX_DURATION_MIN: document.getElementById('setMaxDuration').value,
      MIN_DURATION_MIN: document.getElementById('setMinDuration').value,
      MAX_QUEUE_PER_MACHINE: document.getElementById('setMaxQueue').value,
      MAX_ADVANCE_DAYS: document.getElementById('setMaxAdvance').value,
      QUIET_HOURS_START: document.getElementById('setQuietStart').value,
      QUIET_HOURS_END: document.getElementById('setQuietEnd').value
    };
    const newPin = document.getElementById('setNewPin').value.trim();
    if (newPin) {
      if (newPin.length < 4) { showMsg(msg, 'New PIN must be at least 4 digits.', 'error'); return; }
      settings.ADMIN_PIN = newPin;
    }
    showMsg(msg, 'Saving…', '');
    const res = await postJSON({ action: 'admin_update_settings', pin: state.adminPin, settings: settings });
    if (res.error) { showMsg(msg, res.error, 'error'); return; }
    state.adminSettings = res.settings;
    if (newPin) { state.adminPin = newPin; localStorage.setItem('adminPin', newPin); }
    fillSettingsForm(res.settings);
    showMsg(msg, 'Settings saved.', 'success');
    fetchAll();
  });

  document.addEventListener('visibilitychange', function () { if (!document.hidden) fetchAll(); });
}

// ==================================== INIT ====================================

function tick() {
  updateLiveText();
  if (state.activeTab === 'home' && state.statusData) renderHome();
}

function init() {
  wireEvents();
  fetchAll();
  setInterval(fetchAll, STATUS_POLL_MS);
  setInterval(tick, TICK_MS);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
}

init();
