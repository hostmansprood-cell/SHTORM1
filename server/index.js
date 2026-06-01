io.on("connection", (socket) => {

  socket.on("join-room", (roomId) => {
    const clients = io.sockets.adapter.rooms.get(roomId);

    const size = clients ? clients.size : 0;

    socket.join(roomId);

    console.log("JOIN ROOM:", roomId, "size:", size + 1);

    // если 1 человек — ждёт
    if (size === 0) {
      socket.emit("room-waiting");
    }

    // если 2-й человек — стартуем звонок
    if (size === 1) {
      socket.emit("ready-to-call");
      socket.to(roomId).emit("ready-to-call");
    }

    if (size > 1) {
      socket.emit("room-full");
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