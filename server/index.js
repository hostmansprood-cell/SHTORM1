const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, "../client")));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// 👉 контролируем кто в комнате
const rooms = {};

io.on("connection", (socket) => {

  socket.on("join-room", (roomId) => {

    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    rooms[roomId].push(socket.id);

    // 👉 если уже есть 1 человек — второй триггерит call
    if (rooms[roomId].length === 2) {
      io.to(rooms[roomId][0]).emit("ready-to-call");
      io.to(rooms[roomId][1]).emit("ready-to-call");
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

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
    }
  });

});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("SHTORM running on", PORT);
});