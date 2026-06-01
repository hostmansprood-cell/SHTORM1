import { io } from "./node_modules/socket.io-client/dist/socket.io.esm.min.js";

const socket = io();

const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const copyBtn = document.getElementById("copyBtn");
const screenBtn = document.getElementById("screenBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const roomText = document.getElementById("roomText");

let peerConnection;
let localStream;
let screenStream;

let isCaller = false;
let remoteReady = false;

let pendingCandidates = [];

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },

    {
      urls: "turn:global.relay.metered.ca:80",
      username: "364220d702b99621ed50afaf",
      credential: "1+Wf1HFsEI3FFw4w"
    },
    {
      urls: "turns:global.relay.metered.ca:443",
      username: "364220d702b99621ed50afaf",
      credential: "1+Wf1HFsEI3FFw4w"
    }
  ]
};

// ROOM
let roomId = new URLSearchParams(location.search).get("room");

if (!roomId) {
  roomId = Math.random().toString(36).slice(2, 8);
  location.search = `?room=${roomId}`;
}

roomText.innerText = `Room: ${roomId}`;

// INIT MEDIA
async function initMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", { roomId, candidate: e.candidate });
    }
  };

  peerConnection.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  localStream.getTracks().forEach(t => {
    peerConnection.addTrack(t, localStream);
  });
}

// SOCKET
socket.on("ready-to-call", async () => {
  await initMedia();
  socket.emit("join-ready", roomId);
});

socket.on("offer", async (offer) => {

  if (!peerConnection) await initMedia();

  await peerConnection.setRemoteDescription(offer);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId, answer });

  remoteReady = true;

  for (const c of pendingCandidates) {
    await peerConnection.addIceCandidate(c);
  }
  pendingCandidates = [];
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(answer);

  for (const c of pendingCandidates) {
    await peerConnection.addIceCandidate(c);
  }
  pendingCandidates = [];
});

socket.on("ice-candidate", async (c) => {
  const ice = new RTCIceCandidate(c);

  if (peerConnection?.remoteDescription) {
    await peerConnection.addIceCandidate(ice);
  } else {
    pendingCandidates.push(ice);
  }
});

// JOIN
socket.emit("join-room", roomId);

// CALL TRIGGER
socket.on("ready-to-call", async () => {

  if (!isCaller) {
    isCaller = true;

    await initMedia();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", { roomId, offer });
  }
});

// CONTROLS
muteBtn.onclick = () => {
  localStream.getAudioTracks()[0].enabled =
    !localStream.getAudioTracks()[0].enabled;
};

cameraBtn.onclick = () => {
  localStream.getVideoTracks()[0].enabled =
    !localStream.getVideoTracks()[0].enabled;
};

copyBtn.onclick = async () => {
  await navigator.clipboard.writeText(location.href);
};

// SCREEN SHARE FIXED
screenBtn.onclick = async () => {
  if (!screenStream) {

    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true
    });

    const track = screenStream.getVideoTracks()[0];

    const sender = peerConnection.getSenders()
      .find(s => s.track?.kind === "video");

    sender?.replaceTrack(track);

    localVideo.srcObject = screenStream;

    track.onended = stopScreen;
  } else {
    stopScreen();
  }
};

async function stopScreen() {

  const cam = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  const track = cam.getVideoTracks()[0];

  const sender = peerConnection.getSenders()
    .find(s => s.track?.kind === "video");

  sender?.replaceTrack(track);

  screenStream?.getTracks().forEach(t => t.stop());

  screenStream = null;
  localStream = cam;
  localVideo.srcObject = cam;
}

initMedia();