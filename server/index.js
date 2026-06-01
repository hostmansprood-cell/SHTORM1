const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, "../client")));

// room -> Set(socket.id)
const rooms = new Map();

io.on("connection", (socket) => {

  socket.on("join-room", (roomId) => {

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const room = rooms.get(roomId);
    room.add(socket.id);

    console.log("JOIN:", roomId, "users:", room.size);

    // 🔥 ВАЖНО: только когда 2 человека
    if (room.size === 2) {
      io.to(roomId).emit("ready-to-call");
    }
  });

  socket.on("offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("offer", offer);
  });

  socket.on("answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("answer", answer);
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice-candidate", candidate);
  });

  socket.on("disconnect", () => {

    for (const [roomId, room] of rooms.entries()) {
      room.delete(socket.id);

      if (room.size === 0) {
        rooms.delete(roomId);
      } else {
        console.log("ROOM UPDATE:", roomId, "users:", room.size);
      }
    }
  });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log("SHTORM running on", PORT);
});