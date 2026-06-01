const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

// client static
app.use(express.static(path.join(__dirname, "../client")));

const server = http.createServer(app);

// 🔥 ВОТ ЭТО ОБЯЗАТЕЛЬНО
const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔥 ТЕПЕРЬ МОЖНО io.on
io.on("connection", (socket) => {
  console.log("user connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    const clients = io.sockets.adapter.rooms.get(roomId);

    if (clients && clients.size === 2) {
      io.to(roomId).emit("ready-to-call");
    }
  });

  socket.on("offer", (data) => {
    socket.to(data.roomId).emit("offer", data.offer);
  });

  socket.on("answer", (data) => {
    socket.to(data.roomId).emit("answer", data.answer);
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.roomId).emit("ice-candidate", data.candidate);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("SHTORM running on", PORT);
});