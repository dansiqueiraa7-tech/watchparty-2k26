const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function makeRoomCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
}

function roomUsers(code) {
  const room = rooms.get(code);
  if (!room) return [];
  return [...room.users.values()].map(({ id, name }) => ({ id, name }));
}

io.on("connection", (socket) => {
  socket.on("create-room", ({ name }, callback) => {
    const code = makeRoomCode();
    rooms.set(code, {
      users: new Map(),
      video: { url: "", playing: false, time: 0, updatedAt: Date.now() },
      broadcaster: null
    });
    joinRoom(socket, code, name, callback);
  });

  socket.on("join-room", ({ code, name }, callback) => {
    const roomCode = String(code || "").trim().toUpperCase();
    if (!rooms.has(roomCode)) {
      return callback?.({ ok: false, error: "Sala não encontrada." });
    }
    joinRoom(socket, roomCode, name, callback);
  });

  socket.on("video-state", (state) => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;

    room.video = {
      url: String(state.url || ""),
      playing: !!state.playing,
      time: Number(state.time || 0),
      updatedAt: Date.now()
    };
    socket.to(code).emit("video-state", room.video);
  });

  socket.on("chat-message", ({ text }) => {
    const code = socket.data.room;
    const user = socket.data.name || "Visitante";
    if (!code || !rooms.has(code)) return;
    const clean = String(text || "").trim().slice(0, 500);
    if (!clean) return;
    io.to(code).emit("chat-message", {
      id: crypto.randomUUID(),
      name: user,
      text: clean,
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    });
  });

  // WebRTC signaling for screen sharing.
  socket.on("screen-offer", ({ to, offer }) => {
    if (to) io.to(to).emit("screen-offer", { from: socket.id, offer });
  });

  socket.on("screen-answer", ({ to, answer }) => {
    if (to) io.to(to).emit("screen-answer", { from: socket.id, answer });
  });

  socket.on("screen-ice", ({ to, candidate }) => {
    if (to) io.to(to).emit("screen-ice", { from: socket.id, candidate });
  });

  socket.on("screen-started", () => {
    const code = socket.data.room;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.broadcaster = socket.id;
    socket.to(code).emit("screen-started", { from: socket.id });
  });

  socket.on("screen-stopped", () => {
    const code = socket.data.room;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (room.broadcaster === socket.id) room.broadcaster = null;
    socket.to(code).emit("screen-stopped");
  });

  socket.on("get-screen-host", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (room?.broadcaster && room.broadcaster !== socket.id) {
      socket.emit("screen-host", { id: room.broadcaster });
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;

    room.users.delete(socket.id);
    if (room.broadcaster === socket.id) {
      room.broadcaster = null;
      socket.to(code).emit("screen-stopped");
    }

    io.to(code).emit("room-users", roomUsers(code));

    if (room.users.size === 0) rooms.delete(code);
  });
});

function joinRoom(socket, code, name, callback) {
  const room = rooms.get(code);
  const safeName = String(name || "Visitante").trim().slice(0, 30) || "Visitante";

  socket.join(code);
  socket.data.room = code;
  socket.data.name = safeName;
  room.users.set(socket.id, { id: socket.id, name: safeName });

  callback?.({
    ok: true,
    code,
    userId: socket.id,
    video: room.video,
    broadcaster: room.broadcaster
  });

  io.to(code).emit("room-users", roomUsers(code));
  socket.to(code).emit("user-joined", { id: socket.id, name: safeName });
}

server.listen(PORT, () => {
  console.log(`WatchParty 2K26 rodando na porta ${PORT}`);
});