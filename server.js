const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { Server } = require('socket.io');

const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---------- File upload ----------
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^\w.\- ]/g, '_');
    cb(null, Date.now() + '-' + safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500 MB

function listFiles() {
  return fs
    .readdirSync(UPLOAD_DIR)
    .map((id) => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, id));
      return {
        id,
        name: id.slice(id.indexOf('-') + 1),
        size: stat.size,
        time: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.time - a.time);
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/files', (req, res) => res.json(listFiles()));

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  io.emit('files', listFiles());
  postMessage({ type: 'system', text: `File shared: ${req.file.filename.slice(req.file.filename.indexOf('-') + 1)}`, time: Date.now() });
  res.json({ ok: true });
});

app.get('/download/:id', (req, res) => {
  const id = path.basename(req.params.id);
  const filePath = path.join(UPLOAD_DIR, id);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
  res.download(filePath, id.slice(id.indexOf('-') + 1));
});

const ADMIN_PASSWORD = 'gtasan';

app.delete('/api/files/:id', (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Wrong password' });
  }
  const id = path.basename(req.params.id);
  const filePath = path.join(UPLOAD_DIR, id);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  fs.unlinkSync(filePath);
  io.emit('files', listFiles());
  postMessage({
    type: 'system',
    text: `File deleted: ${id.slice(id.indexOf('-') + 1)}`,
    time: Date.now(),
  });
  res.json({ ok: true });
});

// Handle upload errors (e.g. file too large)
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

// ---------- Chat ----------
const users = new Map(); // socket.id -> name
const history = [];      // last 100 messages (kept in memory)

function postMessage(msg) {
  history.push(msg);
  if (history.length > 100) history.shift();
  io.emit('message', msg);
}

io.on('connection', (socket) => {
  socket.emit('history', history);
  socket.emit('files', listFiles());
  socket.emit('users', [...users.values()]);

  socket.on('join', (name) => {
    name = String(name || '').trim().slice(0, 20) || 'Guest';
    users.set(socket.id, name);
    io.emit('users', [...users.values()]);
    postMessage({ type: 'system', text: `${name} joined`, time: Date.now() });
  });

  socket.on('message', (text) => {
    const name = users.get(socket.id);
    if (!name) return;
    text = String(text || '').trim().slice(0, 1000);
    if (!text) return;
    postMessage({ type: 'chat', name, text, time: Date.now() });
  });

  socket.on('disconnect', () => {
    const name = users.get(socket.id);
    if (!name) return;
    users.delete(socket.id);
    io.emit('users', [...users.values()]);
    postMessage({ type: 'system', text: `${name} left`, time: Date.now() });
  });
});

// ---------- Start ----------
server.listen(PORT, '0.0.0.0', () => {
  console.log('LocalShare running. Open one of these on a connected device:');
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  http://${i.address}:${PORT}`);
    }
  }
});
