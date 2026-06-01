const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// STATIC CLIENT
app.use(express.static(path.join(__dirname, "../client")));

const rooms = new Map(); // roomId -> users count

io.on("connection", (socket) => {

  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    const count = (rooms.get(roomId) || 0) + 1;
    rooms.set(roomId, count);

    console.log("JOIN:", roomId, "users:", count);

    // второй пользователь запускает call flow
    if (count === 2) {
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
    for (const [roomId, count] of rooms.entries()) {
      const newCount = Math.max(0, count - 1);
      if (newCount === 0) rooms.delete(roomId);
      else rooms.set(roomId, newCount);
    }
  });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log("SHTORM running on", PORT);
});