/**
 * ============================================================================
 *  I11 PG — WASHING MACHINE BOOKING — BACKEND
 *  Paste this ENTIRE file into Extensions > Apps Script in your Google Sheet.
 *  You should not need to edit anything below except the two constants
 *  right under this comment (and even those can be changed later from the
 *  Admin tab on the website instead).
 * ============================================================================
 */

// If your PG is not in India, change this to your IANA timezone name AND the
// matching numeric offset below. India has no daylight saving, so a fixed
// offset is safe here — most timezones are NOT this simple, so if you change
// this, make sure the offset is correct for your location year-round.
const TIMEZONE = 'Asia/Kolkata';
const TIMEZONE_OFFSET = '+05:30';

// First-run defaults. After the first run, all of these live in the
// "Settings" sheet tab and are editable from the website's Admin tab —
// editing them here again does nothing once the sheet has been created.
const SETTINGS_DEFAULTS = {
  ADMIN_PIN: '1234',            // CHANGE THIS after first login (Admin tab)
  MAX_DURATION_MIN: 180,        // longest single booking, in minutes
  MIN_DURATION_MIN: 10,         // shortest single booking, in minutes
  MAX_QUEUE_PER_MACHINE: 6,     // max bookings waiting on one machine at once
  MAX_ADVANCE_DAYS: 7,          // how far ahead "Schedule for later" allows
  QUIET_HOURS_START: '',        // e.g. '22:00' — blank means no restriction
  QUIET_HOURS_END: ''           // e.g. '07:00'
};

const SHEET_BOOKINGS = 'Bookings';
const SHEET_MACHINES = 'Machines';
const SHEET_SETTINGS = 'Settings';

const BOOKINGS_HEADER = ['ID', 'Name', 'Room', 'MachineID', 'StartTime', 'EndTime', 'Status', 'Mode', 'CreatedAt'];
const MACHINES_HEADER = ['MachineID', 'Name', 'Status', 'Note', 'CreatedAt'];
const SETTINGS_HEADER = ['Key', 'Value'];

const MACHINES_SEED = [
  ['m1', 'Washing Machine 1', 'Active', ''],
  ['m2', 'Washing Machine 2', 'Active', '']
];

// =========================== ENTRY POINTS ==================================

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'status') return jsonResponse_(getStatus_());
    if (action === 'agenda') return jsonResponse_(getAgenda_());
    return jsonResponse_({ error: 'Unknown action.' });
  } catch (err) {
    return jsonResponse_({ error: 'Server error: ' + err.message });
  }
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ error: 'Bad request.' });
  }
  try {
    let result;
    switch (data.action) {
      case 'book': result = bookMachine_(data); break;
      case 'finish': result = finishNow_(data.id); break;
      case 'cancel': result = cancelBooking_(data.id); break;
      case 'admin_login': result = adminLogin_(data.pin); break;
      case 'admin_add_machine': result = adminAddMachine_(data.pin, data.name); break;
      case 'admin_update_machine': result = adminUpdateMachine_(data.pin, data.machineId, data.fields || {}); break;
      case 'admin_cancel_booking': result = adminCancelBooking_(data.pin, data.id); break;
      case 'admin_update_settings': result = adminUpdateSettings_(data.pin, data.settings || {}); break;
      default: result = { error: 'Unknown action.' };
    }
    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({ error: 'Server error: ' + err.message });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// =========================== SHEET HELPERS ==================================

function getSheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getMachinesRaw_() {
  const sheet = getSheet_(SHEET_MACHINES, MACHINES_HEADER);
  let data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    const now = new Date();
    MACHINES_SEED.forEach(function (row) {
      sheet.appendRow([row[0], row[1], row[2], row[3], now]);
    });
    data = sheet.getDataRange().getValues();
  }
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    out.push({
      id: String(data[i][0]),
      name: String(data[i][1] || ''),
      status: String(data[i][2] || 'Active'),
      note: String(data[i][3] || ''),
      createdAt: data[i][4] || null
    });
  }
  return out;
}

function getBookingsRaw_() {
  const sheet = getSheet_(SHEET_BOOKINGS, BOOKINGS_HEADER);
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    out.push({
      rowIndex: i + 1,
      id: String(row[0]),
      name: String(row[1] || ''),
      room: String(row[2] || ''),
      machineId: String(row[3] || ''),
      start: new Date(row[4]),
      end: new Date(row[5]),
      status: String(row[6] || 'Active'),
      mode: String(row[7] || 'queue')
    });
  }
  return out;
}

function getSettings_() {
  const sheet = getSheet_(SHEET_SETTINGS, SETTINGS_HEADER);
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) map[String(data[i][0])] = data[i][1];
  }
  Object.keys(SETTINGS_DEFAULTS).forEach(function (k) {
    if (!(k in map)) {
      sheet.appendRow([k, SETTINGS_DEFAULTS[k]]);
      map[k] = SETTINGS_DEFAULTS[k];
    }
  });
  return {
    ADMIN_PIN: String(map.ADMIN_PIN),
    MAX_DURATION_MIN: parseInt(map.MAX_DURATION_MIN, 10) || SETTINGS_DEFAULTS.MAX_DURATION_MIN,
    MIN_DURATION_MIN: parseInt(map.MIN_DURATION_MIN, 10) || SETTINGS_DEFAULTS.MIN_DURATION_MIN,
    MAX_QUEUE_PER_MACHINE: parseInt(map.MAX_QUEUE_PER_MACHINE, 10) || SETTINGS_DEFAULTS.MAX_QUEUE_PER_MACHINE,
    MAX_ADVANCE_DAYS: parseInt(map.MAX_ADVANCE_DAYS, 10) || SETTINGS_DEFAULTS.MAX_ADVANCE_DAYS,
    QUIET_HOURS_START: (map.QUIET_HOURS_START || '').toString().trim(),
    QUIET_HOURS_END: (map.QUIET_HOURS_END || '').toString().trim()
  };
}

function setSettingValue_(sheet, key, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function publicSettings_(s) {
  return {
    maxDurationMin: s.MAX_DURATION_MIN,
    minDurationMin: s.MIN_DURATION_MIN,
    maxQueuePerMachine: s.MAX_QUEUE_PER_MACHINE,
    maxAdvanceDays: s.MAX_ADVANCE_DAYS,
    quietHoursStart: s.QUIET_HOURS_START || null,
    quietHoursEnd: s.QUIET_HOURS_END || null
  };
}

function machinePublicAdmin_(m) {
  return {
    id: m.id, name: m.name, status: m.status, note: m.note,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null
  };
}

function bookingPublic_(b) {
  return { id: b.id, name: b.name, room: b.room, start: b.start.toISOString(), end: b.end.toISOString(), mode: b.mode };
}

// ===================== TIME / SCHEDULING MATH ===============================

// Builds the Date instant for HH:mm on a given yyyy-MM-dd, in TIMEZONE.
function zonedDate_(yyyyMmDd, hhMm) {
  return new Date(yyyyMmDd + 'T' + hhMm + ':00' + TIMEZONE_OFFSET);
}

function mergeIntervals_(intervals) {
  const sorted = intervals.slice().sort(function (a, b) { return a.start - b.start; });
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const iv = sorted[i];
    if (out.length === 0) {
      out.push({ start: new Date(iv.start), end: new Date(iv.end) });
      continue;
    }
    const last = out[out.length - 1];
    if (iv.start <= last.end) {
      if (iv.end > last.end) last.end = new Date(iv.end);
    } else {
      out.push({ start: new Date(iv.start), end: new Date(iv.end) });
    }
  }
  return out;
}

// Quiet-hour blocked windows (as absolute instants) inside [horizonStart, horizonEnd].
function quietIntervalsInRange_(horizonStart, horizonEnd, settings) {
  if (!settings.QUIET_HOURS_START || !settings.QUIET_HOURS_END) return [];
  const out = [];
  let cursor = new Date(horizonStart.getTime() - 24 * 3600 * 1000);
  const endMs = horizonEnd.getTime();
  let guard = 0;
  while (cursor.getTime() <= endMs && guard < 400) {
    guard++;
    const dayStr = Utilities.formatDate(cursor, TIMEZONE, 'yyyy-MM-dd');
    const startInstant = zonedDate_(dayStr, settings.QUIET_HOURS_START);
    let endInstant = zonedDate_(dayStr, settings.QUIET_HOURS_END);
    if (endInstant.getTime() <= startInstant.getTime()) {
      endInstant = new Date(endInstant.getTime() + 24 * 3600 * 1000);
    }
    if (endInstant > horizonStart && startInstant < horizonEnd) {
      out.push({ start: startInstant, end: endInstant });
    }
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  }
  return out;
}

function getBlockedIntervals_(machineId, horizonStart, horizonEnd, settings, excludeId) {
  const bookings = getBookingsRaw_();
  const out = [];
  bookings.forEach(function (b) {
    if (b.machineId !== machineId) return;
    if (b.status === 'Cancelled') return;
    if (excludeId && b.id === excludeId) return;
    if (b.end <= horizonStart || b.start >= horizonEnd) return;
    out.push({ start: b.start, end: b.end });
  });
  quietIntervalsInRange_(horizonStart, horizonEnd, settings).forEach(function (iv) { out.push(iv); });
  return out;
}

// Earliest free gap of `durationMs` at/after `searchFrom`. Returns null if none within horizonEnd.
function findEarliestGap_(blocked, searchFrom, durationMs, horizonEnd) {
  const merged = mergeIntervals_(blocked);
  let candidate = new Date(searchFrom);
  for (let i = 0; i < merged.length; i++) {
    const iv = merged[i];
    if (iv.end <= candidate) continue;
    if (iv.start.getTime() - candidate.getTime() >= durationMs) {
      return { start: new Date(candidate), end: new Date(candidate.getTime() + durationMs) };
    }
    if (iv.end > candidate) candidate = new Date(iv.end);
  }
  if (horizonEnd && candidate.getTime() + durationMs > horizonEnd.getTime()) return null;
  return { start: new Date(candidate), end: new Date(candidate.getTime() + durationMs) };
}

function findConflict_(blocked, start, end) {
  const merged = mergeIntervals_(blocked);
  for (let i = 0; i < merged.length; i++) {
    const iv = merged[i];
    if (start < iv.end && end > iv.start) return iv;
  }
  return null;
}

// =========================== READ ENDPOINTS =================================

function getStatus_() {
  const settings = getSettings_();
  const now = new Date();
  const machines = getMachinesRaw_().filter(function (m) { return m.status !== 'Retired'; });
  const bookings = getBookingsRaw_();

  const result = machines.map(function (m) {
    const active = bookings
      .filter(function (b) { return b.machineId === m.id && b.status !== 'Cancelled' && b.end > now; })
      .sort(function (a, b) { return a.start - b.start; });
    const current = active.length ? active[0] : null;
    return {
      id: m.id,
      name: m.name,
      status: m.status,
      note: m.note,
      current: current ? bookingPublic_(current) : null,
      freeAt: current ? current.end.toISOString() : null,
      queue: active.slice(1).map(bookingPublic_)
    };
  });

  return { serverTime: now.toISOString(), settings: publicSettings_(settings), machines: result };
}

function getAgenda_() {
  const now = new Date();
  const settings = getSettings_();
  const horizonStart = new Date(now.getTime() - 12 * 3600 * 1000);
  const horizonEnd = new Date(now.getTime() + (settings.MAX_ADVANCE_DAYS + 1) * 24 * 3600 * 1000);
  const machines = getMachinesRaw_().filter(function (m) { return m.status !== 'Retired'; });
  const bookings = getBookingsRaw_()
    .filter(function (b) { return b.status !== 'Cancelled' && b.end > horizonStart && b.start < horizonEnd; })
    .sort(function (a, b) { return a.start - b.start; });

  return {
    serverTime: now.toISOString(),
    settings: publicSettings_(settings),
    machines: machines.map(function (m) { return { id: m.id, name: m.name, status: m.status, note: m.note }; }),
    bookings: bookings.map(function (b) {
      return { id: b.id, name: b.name, room: b.room, machineId: b.machineId, start: b.start.toISOString(), end: b.end.toISOString(), mode: b.mode };
    })
  };
}

// ============================ BOOKING ACTIONS ================================

function bookMachine_(p) {
  const name = (p.name || '').toString().trim().slice(0, 40);
  const room = (p.room || '').toString().trim().slice(0, 10);
  const machineId = (p.machineId || '').toString();
  const mode = p.mode === 'schedule' ? 'schedule' : 'queue';
  let duration = parseInt(p.duration, 10);

  if (!name) return { error: 'Enter your name.' };
  if (!machineId) return { error: 'Choose a machine.' };

  const settings = getSettings_();
  if (!duration || isNaN(duration)) return { error: 'Choose a duration.' };
  duration = Math.round(duration);
  if (duration < settings.MIN_DURATION_MIN || duration > settings.MAX_DURATION_MIN) {
    return { error: 'Duration must be between ' + settings.MIN_DURATION_MIN + ' and ' + settings.MAX_DURATION_MIN + ' minutes.' };
  }

  const machine = getMachinesRaw_().find(function (m) { return m.id === machineId; });
  if (!machine || machine.status === 'Retired') return { error: 'That machine no longer exists.' };
  if (machine.status === 'Maintenance') return { error: machine.name + ' is under maintenance right now.' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { error: 'Server is busy — please try again in a moment.' };

  try {
    const now = new Date();
    const durationMs = duration * 60000;
    const horizonEnd = new Date(now.getTime() + (settings.MAX_ADVANCE_DAYS + 1) * 24 * 3600 * 1000);

    const forMachineCount = getBookingsRaw_().filter(function (b) {
      return b.machineId === machineId && b.status !== 'Cancelled' && b.end > now;
    }).length;
    if (forMachineCount >= settings.MAX_QUEUE_PER_MACHINE) {
      return { error: 'The queue is full for ' + machine.name + '. Try again once it frees up.' };
    }

    const blocked = getBlockedIntervals_(machineId, now, horizonEnd, settings);
    let start, end;

    if (mode === 'schedule') {
      if (!p.startTime) return { error: 'Choose a start time.' };
      start = new Date(p.startTime);
      if (isNaN(start.getTime())) return { error: 'That start time is invalid.' };
      if (start.getTime() < now.getTime() - 60000) return { error: 'Pick a time that has not already passed.' };
      if (start.getTime() > horizonEnd.getTime()) {
        return { error: 'You can only schedule up to ' + settings.MAX_ADVANCE_DAYS + ' days ahead.' };
      }
      end = new Date(start.getTime() + durationMs);
      const conflict = findConflict_(blocked, start, end);
      if (conflict) {
        const gap = findEarliestGap_(blocked, start, durationMs, horizonEnd);
        return {
          error: 'That slot overlaps another booking (' + conflict.start.toISOString() + ' to ' + conflict.end.toISOString() + ').',
          conflictStart: conflict.start.toISOString(),
          conflictEnd: conflict.end.toISOString(),
          nextFreeStart: gap ? gap.start.toISOString() : null
        };
      }
    } else {
      const gap = findEarliestGap_(blocked, now, durationMs, horizonEnd);
      if (!gap) return { error: 'No free slot in the next ' + settings.MAX_ADVANCE_DAYS + ' days for that duration. Try a shorter time.' };
      start = gap.start;
      end = gap.end;
    }

    const id = Utilities.getUuid().slice(0, 8);
    const sheet = getSheet_(SHEET_BOOKINGS, BOOKINGS_HEADER);
    sheet.appendRow([id, name, room, machineId, start, end, 'Active', mode, now]);

    const waitMinutes = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60000));
    return { success: true, id: id, start: start.toISOString(), end: end.toISOString(), waitMinutes: waitMinutes };
  } finally {
    lock.releaseLock();
  }
}

function finishNow_(id) {
  if (!id) return { error: 'Missing booking id.' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { error: 'Server is busy — try again.' };
  try {
    const sheet = getSheet_(SHEET_BOOKINGS, BOOKINGS_HEADER);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        const now = new Date();
        if (data[i][6] !== 'Cancelled' && new Date(data[i][5]) > now) {
          sheet.getRange(i + 1, 6).setValue(now);
        }
        return { success: true };
      }
    }
    return { error: 'Booking not found.' };
  } finally {
    lock.releaseLock();
  }
}

function cancelBooking_(id) {
  if (!id) return { error: 'Missing booking id.' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { error: 'Server is busy — try again.' };
  try {
    const sheet = getSheet_(SHEET_BOOKINGS, BOOKINGS_HEADER);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i + 1, 7).setValue('Cancelled');
        return { success: true };
      }
    }
    return { error: 'Booking not found.' };
  } finally {
    lock.releaseLock();
  }
}

// ============================== ADMIN ACTIONS ================================

function requirePin_(pin) {
  const settings = getSettings_();
  if (!pin || String(pin) !== String(settings.ADMIN_PIN)) return null;
  return settings;
}

function adminLogin_(pin) {
  const settings = requirePin_(pin);
  if (!settings) return { error: 'Incorrect PIN.' };
  return { success: true, machines: getMachinesRaw_().map(machinePublicAdmin_), settings: publicSettings_(settings) };
}

function adminAddMachine_(pin, name) {
  const settings = requirePin_(pin);
  if (!settings) return { error: 'Incorrect PIN.' };
  name = (name || '').toString().trim().slice(0, 40);
  if (!name) return { error: 'Enter a name for the new machine.' };
  const sheet = getSheet_(SHEET_MACHINES, MACHINES_HEADER);
  const id = 'm' + new Date().getTime();
  sheet.appendRow([id, name, 'Active', '', new Date()]);
  return { success: true, machines: getMachinesRaw_().map(machinePublicAdmin_) };
}

function adminUpdateMachine_(pin, machineId, fields) {
  const settings = requirePin_(pin);
  if (!settings) return { error: 'Incorrect PIN.' };
  if (!machineId) return { error: 'Missing machine id.' };

  const sheet = getSheet_(SHEET_MACHINES, MACHINES_HEADER);
  const data = sheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(machineId)) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return { error: 'Machine not found.' };

  let cancelledCount = 0;
  if (typeof fields.name === 'string') {
    const newName = fields.name.trim().slice(0, 40);
    if (newName) sheet.getRange(rowIdx + 1, 2).setValue(newName);
  }
  if (typeof fields.note === 'string') {
    sheet.getRange(rowIdx + 1, 4).setValue(fields.note.slice(0, 140));
  }
  if (fields.status && ['Active', 'Maintenance', 'Retired'].indexOf(fields.status) !== -1) {
    sheet.getRange(rowIdx + 1, 3).setValue(fields.status);
    if (fields.status !== 'Active') {
      cancelledCount = cancelFutureBookingsForMachine_(machineId);
    }
  }
  return { success: true, machines: getMachinesRaw_().map(machinePublicAdmin_), cancelledCount: cancelledCount };
}

function cancelFutureBookingsForMachine_(machineId) {
  const sheet = getSheet_(SHEET_BOOKINGS, BOOKINGS_HEADER);
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3]) === String(machineId) && data[i][6] !== 'Cancelled' && new Date(data[i][5]) > now) {
      sheet.getRange(i + 1, 7).setValue('Cancelled');
      count++;
    }
  }
  return count;
}

function adminCancelBooking_(pin, id) {
  const settings = requirePin_(pin);
  if (!settings) return { error: 'Incorrect PIN.' };
  return cancelBooking_(id);
}

function adminUpdateSettings_(pin, partial) {
  const settings = requirePin_(pin);
  if (!settings) return { error: 'Incorrect PIN.' };

  const sheet = getSheet_(SHEET_SETTINGS, SETTINGS_HEADER);
  const numericKeys = ['MAX_DURATION_MIN', 'MIN_DURATION_MIN', 'MAX_QUEUE_PER_MACHINE', 'MAX_ADVANCE_DAYS'];
  const stringKeys = ['QUIET_HOURS_START', 'QUIET_HOURS_END'];

  Object.keys(partial || {}).forEach(function (key) {
    if (key === 'ADMIN_PIN') {
      const v = (partial[key] || '').toString().trim();
      if (v.length >= 4) setSettingValue_(sheet, key, v);
      return;
    }
    if (numericKeys.indexOf(key) !== -1) {
      const n = parseInt(partial[key], 10);
      if (!isNaN(n) && n > 0) setSettingValue_(sheet, key, n);
      return;
    }
    if (stringKeys.indexOf(key) !== -1) {
      setSettingValue_(sheet, key, (partial[key] || '').toString().trim());
    }
  });

  return { success: true, settings: publicSettings_(getSettings_()) };
}

// ============================ MAINTENANCE (SHEET HYGIENE) =====================

/**
 * OPTIONAL: run once, then add a time-driven trigger
 * (Triggers > Add Trigger > cleanupOldRows > Time-driven > Day timer)
 * to stop the Bookings sheet from growing forever.
 */
function cleanupOldRows() {
  const sheet = getSheet_(SHEET_BOOKINGS, BOOKINGS_HEADER);
  const data = sheet.getDataRange().getValues();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  for (let i = data.length - 1; i >= 1; i--) {
    const created = data[i][8] ? new Date(data[i][8]) : null;
    if (created && created < cutoff) sheet.deleteRow(i + 1);
  }
}
