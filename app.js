// ======= SET THIS AFTER YOU DEPLOY THE APPS SCRIPT WEB APP =======
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyDYCCZstBzfh3yXshIJf5zSEdvrWKfck_ktyQSi8K3tL7dof0mLxwofwumHDjreh4/exec";
// ===================================================================

let currentMachine = null;
const REFRESH_MS = 15000;

function myBookingIds() {
  return JSON.parse(localStorage.getItem('myBookings') || '[]');
}
function saveMyBooking(id, machine) {
  const list = myBookingIds();
  list.push({ id, machine, ts: Date.now() });
  localStorage.setItem('myBookings', JSON.stringify(list));
}
function removeMyBooking(id) {
  const list = myBookingIds().filter(b => b.id !== id);
  localStorage.setItem('myBookings', JSON.stringify(list));
}

function fmtTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

async function loadStatus() {
  try {
    const res = await fetch(APPS_SCRIPT_URL + '?action=status');
    const data = await res.json();
    renderMachines(data.machines);
    renderMyBookings(data.machines);
  } catch (err) {
    document.getElementById('machinesContainer').innerHTML =
      '<div class="card"><p class="msg error">Could not load status. Check your internet, or the app is not set up yet.</p></div>';
  }
}

function renderMachines(machines) {
  const container = document.getElementById('machinesContainer');
  container.innerHTML = '';
  Object.keys(machines).forEach((name) => {
    const m = machines[name];
    const isFree = m.status === 'FREE';
    const card = document.createElement('div');
    card.className = 'card';
    let html = `
      <div class="card-top">
        <h2>${name}</h2>
        <span class="badge ${isFree ? 'free' : 'busy'}">${isFree ? 'FREE' : 'IN USE'}</span>
      </div>`;
    if (!isFree) {
      html += `<div class="status-line">Used by <b>${m.currentUser.name}</b>${m.currentUser.room ? ' (Room ' + m.currentUser.room + ')' : ''} until <b>${fmtTime(m.freeAt)}</b></div>`;
    } else {
      html += `<div class="status-line">Ready to use right now</div>`;
    }
    if (m.queue && m.queue.length > 0) {
      html += `<div class="queue-list"><b>Queue (${m.queue.length}):</b>`;
      m.queue.forEach((q, i) => {
        html += `<div>${i + 1}. ${q.name} — ${fmtTime(q.start)} to ${fmtTime(q.end)}</div>`;
      });
      html += `</div>`;
    }
    html += `<button class="btn btn-primary" onclick="openModal('${name}')">${isFree ? 'Book Now' : 'Join Queue'}</button>`;
    card.innerHTML = html;
    container.appendChild(card);
  });
}

function renderMyBookings(machines) {
  const mine = myBookingIds();
  const box = document.getElementById('myBookingsContainer');
  const list = document.getElementById('myBookingsList');
  if (mine.length === 0) { box.style.display = 'none'; return; }

  // find full info for each of my bookings from current machine data
  const allBookings = [];
  Object.keys(machines).forEach((name) => {
    const m = machines[name];
    if (m.currentUser) allBookings.push(Object.assign({ machine: name }, m.currentUser));
    (m.queue || []).forEach(q => allBookings.push(Object.assign({ machine: name }, q)));
  });

  const relevant = mine.map(mb => allBookings.find(b => b.id === mb.id)).filter(Boolean);

  // clean up expired ones from localStorage
  const stillValidIds = relevant.map(r => r.id);
  mine.forEach(mb => { if (!stillValidIds.includes(mb.id)) removeMyBooking(mb.id); });

  if (relevant.length === 0) { box.style.display = 'none'; return; }

  box.style.display = 'block';
  list.innerHTML = '';
  relevant.forEach(b => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="status-line"><b>${b.machine}</b><br>${fmtTime(b.start)} - ${fmtTime(b.end)}</div>
      <div class="toolbar">
        <button class="btn btn-secondary" onclick="finishNow('${b.id}')">Mark Done Early</button>
        <button class="btn btn-danger" onclick="cancelBooking('${b.id}')">Cancel</button>
      </div>`;
    list.appendChild(card);
  });
}

function openModal(machine) {
  currentMachine = machine;
  document.getElementById('bookMachineTitle').textContent = 'Book: ' + machine;
  document.getElementById('bookMsg').textContent = '';
  document.getElementById('inpName').value = localStorage.getItem('lastName') || '';
  document.getElementById('inpRoom').value = localStorage.getItem('lastRoom') || '';
  document.getElementById('bookOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('bookOverlay').classList.remove('open');
}

async function submitBooking() {
  const name = document.getElementById('inpName').value.trim();
  const room = document.getElementById('inpRoom').value.trim();
  const duration = document.getElementById('inpDuration').value;
  const msg = document.getElementById('bookMsg');

  if (!name) { msg.textContent = 'Please enter your name'; msg.className = 'msg error'; return; }

  msg.textContent = 'Booking...'; msg.className = 'msg';

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'book', name, room, machine: currentMachine, duration })
    });
    const data = await res.json();
    if (data.error) {
      msg.textContent = data.error; msg.className = 'msg error';
      return;
    }
    localStorage.setItem('lastName', name);
    localStorage.setItem('lastRoom', room);
    saveMyBooking(data.id, currentMachine);
    msg.textContent = data.waitMinutes > 0
      ? `Booked! Your turn starts in ~${data.waitMinutes} min.`
      : 'Booked! It\'s free now, go ahead.';
    msg.className = 'msg success';
    setTimeout(() => { closeModal(); loadStatus(); }, 1200);
  } catch (err) {
    msg.textContent = 'Something went wrong. Try again.'; msg.className = 'msg error';
  }
}

async function finishNow(id) {
  await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'finish', id })
  });
  loadStatus();
}

async function cancelBooking(id) {
  await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'cancel', id })
  });
  removeMyBooking(id);
  loadStatus();
}

// init
loadStatus();
setInterval(loadStatus, REFRESH_MS);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
