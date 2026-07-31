/**
 * WASHING MACHINE BOOKING - BACKEND
 * Paste this entire file into Extensions > Apps Script in your Google Sheet.
 */

const SHEET_NAME = 'Bookings';
const MACHINES = ['Washing Machine 1', 'Washing Machine 2'];
const MAX_QUEUE_PER_MACHINE = 4;   // stop people from booking too far ahead
const MAX_DURATION_MIN = 180;      // 3 hours max per booking

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'status') return jsonResponse(getStatus());
  return jsonResponse({ error: 'unknown action' });
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var action = data.action;
  var result;
  if (action === 'book') result = bookMachine(data.name, data.room, data.machine, data.duration);
  else if (action === 'finish') result = finishNow(data.id);
  else if (action === 'cancel') result = cancelBooking(data.id);
  else result = { error: 'unknown action' };
  return jsonResponse(result);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['ID', 'Name', 'Room', 'Machine', 'StartTime', 'EndTime', 'Status', 'CreatedAt']);
  }
  return sheet;
}

function getStatus() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var result = {};
  MACHINES.forEach(function (m) {
    result[m] = { status: 'FREE', currentUser: null, freeAt: null, queue: [] };
  });

  var active = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[0], name = row[1], room = row[2], machine = row[3], start = row[4], end = row[5], status = row[6];
    if (status === 'Cancelled') continue;
    if (new Date(end) <= now) continue;
    active.push({ id: id, name: name, room: room, machine: machine, start: start, end: end });
  }

  MACHINES.forEach(function (m) {
    var forMachine = active.filter(function (b) { return b.machine === m; });
    forMachine.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
    if (forMachine.length > 0) {
      var current = forMachine[0];
      result[m].status = 'IN USE';
      result[m].currentUser = { id: current.id, name: current.name, room: current.room, start: current.start, end: current.end };
      result[m].freeAt = current.end;
      result[m].queue = forMachine.slice(1).map(function (b) {
        return { id: b.id, name: b.name, room: b.room, start: b.start, end: b.end };
      });
    }
  });

  return { machines: result, serverTime: now };
}

function bookMachine(name, room, machine, duration) {
  if (!name || !machine || !duration) return { error: 'Missing fields' };
  if (MACHINES.indexOf(machine) === -1) return { error: 'Invalid machine' };
  duration = parseInt(duration, 10);
  if (!duration || duration <= 0 || duration > MAX_DURATION_MIN) {
    return { error: 'Duration must be between 1 and ' + MAX_DURATION_MIN + ' minutes' };
  }

  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var lastEnd = now;
  var queueCount = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[3] === machine && row[6] !== 'Cancelled' && new Date(row[5]) > now) {
      queueCount++;
      var end = new Date(row[5]);
      if (end > lastEnd) lastEnd = end;
    }
  }

  if (queueCount >= MAX_QUEUE_PER_MACHINE) {
    return { error: 'Queue is full for this machine. Please try again later.' };
  }

  var startTime = lastEnd;
  var endTime = new Date(startTime.getTime() + duration * 60000);
  var id = Utilities.getUuid().slice(0, 8);

  sheet.appendRow([id, name, room || '', machine, startTime, endTime, 'Active', now]);

  var waitMinutes = Math.max(0, Math.round((startTime - now) / 60000));
  return { success: true, id: id, startTime: startTime, endTime: endTime, waitMinutes: waitMinutes };
}

function finishNow(id) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      var now = new Date();
      if (new Date(data[i][5]) > now) {
        sheet.getRange(i + 1, 6).setValue(now); // EndTime column
      }
      return { success: true };
    }
  }
  return { error: 'Booking not found' };
}

function cancelBooking(id) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 7).setValue('Cancelled'); // Status column
      return { success: true };
    }
  }
  return { error: 'Booking not found' };
}

/**
 * OPTIONAL: run this once and set up a daily time-driven trigger
 * (Triggers > Add Trigger > cleanupOldRows > Time-driven > Day timer)
 * to keep the sheet from growing forever.
 */
function cleanupOldRows() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  for (var i = data.length - 1; i >= 1; i--) {
    if (new Date(data[i][7]) < cutoff) {
      sheet.deleteRow(i + 1);
    }
  }
}
