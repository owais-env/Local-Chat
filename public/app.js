const socket = io();
const $ = (id) => document.getElementById(id);

let myName = '';
let joined = false;

$('nameInput').value = localStorage.getItem('name') || '';

function join() {
  const name = $('nameInput').value.trim();
  if (!name) return;
  myName = name;
  localStorage.setItem('name', name);
  socket.emit('join', name);
  joined = true;
  $('login').hidden = true;
  $('app').hidden = false;
}

$('joinBtn').onclick = join;
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

// Rejoin automatically if the connection drops and comes back
socket.on('connect', () => { if (joined) socket.emit('join', myName); });

// ---------- Chat ----------
function addMessage(m) {
  const box = $('messages');
  const div = document.createElement('div');

  if (m.type === 'system') {
    div.className = 'sys';
    div.textContent = m.text;
  } else {
    div.className = 'msg' + (m.name === myName ? ' me' : '');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${m.name} · ${new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const text = document.createElement('div');
    text.textContent = m.text;
    div.append(meta, text);
  }

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

socket.on('history', (list) => {
  $('messages').innerHTML = '';
  list.forEach(addMessage);
});
socket.on('message', addMessage);

$('msgForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('msgInput').value.trim();
  if (!text) return;
  socket.emit('message', text);
  $('msgInput').value = '';
});

// ---------- Users ----------
socket.on('users', (list) => {
  $('count').textContent = `${list.length} online`;
  $('users').innerHTML = '';
  list.forEach((name) => {
    const li = document.createElement('li');
    li.textContent = name;
    $('users').appendChild(li);
  });
});

// ---------- Files ----------
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

socket.on('files', (list) => {
  $('files').innerHTML = '';
  if (!list.length) {
    $('files').innerHTML = '<li>No files yet</li>';
    return;
  }
  list.forEach((f) => {
    const li = document.createElement('li');

    const a = document.createElement('a');
    a.href = '/download/' + encodeURIComponent(f.id);
    a.textContent = f.name;

    const small = document.createElement('small');
    small.textContent = formatSize(f.size);

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'del';
    del.onclick = async () => {
      const pw = prompt('Admin password to delete "' + f.name + '":');
      if (!pw) return;
      const res = await fetch('/api/files/' + encodeURIComponent(f.id), {
        method: 'DELETE',
        headers: { 'x-admin-password': pw },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Delete failed');
      }
    };

    li.append(a, small, del);
    $('files').appendChild(li);
  });
});

$('fileInput').addEventListener('change', () => {
  const file = $('fileInput').files[0];
  if (!file) return;

  const form = new FormData();
  form.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');

  $('progress').hidden = false;
  $('progress').value = 0;
  $('uploadStatus').textContent = 'Uploading...';

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) $('progress').value = (e.loaded / e.total) * 100;
  };
  xhr.onload = () => {
    $('progress').hidden = true;
    $('uploadStatus').textContent = xhr.status === 200 ? 'Upload complete' : 'Upload failed';
    $('fileInput').value = '';
  };
  xhr.onerror = () => {
    $('progress').hidden = true;
    $('uploadStatus').textContent = 'Upload failed';
  };
  xhr.send(form);
});
