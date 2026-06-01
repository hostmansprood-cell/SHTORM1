const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

// 👉 ВАЖНО: отдаём клиент
app.use(express.static(path.join(__dirname, "../client")));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// socket logic
io.on("connection", (socket) => {

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined");
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

// fallback (очень важно для Render)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("SHTORM running on", PORT);
});