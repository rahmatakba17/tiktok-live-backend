const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const PORT = process.env.PORT || 3000;

const wss = new WebSocket.Server({ noServer: true });
let messages = [];
let giftSenders = {};
let saweriaDonors = [];
let totalDonasi = 0;

try {
  const data = JSON.parse(fs.readFileSync('data.json'));
  messages = data.comments || [];
  giftSenders = data.giftSenders || {};
  saweriaDonors = data.saweriaDonors || [];
  totalDonasi = data.total || 0;
} catch (err) {
  console.log('Tidak bisa load data.json, mulai baru.');
}

const tiktokUsername = "catscript03"; // Ganti dengan username TikTok Anda
let tiktok = new WebcastPushConnection(tiktokUsername);

tiktok.connect().then(() => console.log(`Terhubung ke TikTok live @${tiktokUsername}`))
.catch(err => console.error('Gagal terhubung:', err));

tiktok.on('chat', (data) => {
  const msg = { nickname: data.uniqueId, comment: data.comment };
  messages.push(msg);
  broadcast({ type: 'chat', data: msg });
  saveData();
});

tiktok.on('gift', (data) => {
  const { uniqueId, giftName, repeatCount } = data;
  if (!giftSenders[uniqueId]) giftSenders[uniqueId] = {};
  giftSenders[uniqueId][giftName] = (giftSenders[uniqueId][giftName] || 0) + repeatCount;

  broadcast({ type: 'gift', data: { nickname: uniqueId, giftName, repeatCount } });
  broadcast({ type: 'gift-senders', data: giftSenders });
  saveData();
});

tiktok.on('follow', (data) => {
  const msg = { nickname: data.uniqueId };
  broadcast({ type: 'follow', data: msg });
});

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify({
    comments: messages,
    giftSenders,
    saweriaDonors,
    total: totalDonasi
  }, null, 2));
}

function broadcast(data) {
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  });
}

app.use(express.json());

app.post('/saweria-webhook', (req, res) => {
  const { data } = req.body;
  if (data && data.donor_name && data.amount) {
    const donor = { nickname: data.donor_name, amount: data.amount };
    totalDonasi += parseInt(data.amount);
    saweriaDonors.push(donor);
    broadcast({ type: 'saweria', data: donor });
    broadcast({ type: 'donation-total', data: totalDonasi });
    broadcast({ type: 'saweria-donors', data: saweriaDonors });
    saveData();
  }
  res.sendStatus(200);
});

const server = app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
    ws.send(JSON.stringify({ type: 'history', data: messages }));
    ws.send(JSON.stringify({ type: 'donation-total', data: totalDonasi }));
    ws.send(JSON.stringify({ type: 'gift-senders', data: giftSenders }));
    ws.send(JSON.stringify({ type: 'saweria-donors', data: saweriaDonors }));
  });
});
