import { io } from "./node_modules/socket.io-client/dist/socket.io.esm.min.js";

const socket = io();

// =====================
const log = (...args) => console.log("[SHTORM]", ...args);

window.onerror = (m, s, l, c, e) => log("[JS ERROR]", m);
window.onunhandledrejection = (e) => log("[PROMISE ERROR]", e.reason);

// ===================== UI
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const copyBtn = document.getElementById("copyBtn");
const screenBtn = document.getElementById("screenBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const roomText = document.getElementById("roomText");

// =====================
let peerConnection;
let localStream;
let screenStream;

let isCaller = false;
let started = false;
let pendingCandidates = [];

// ===================== ICE
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

// =====================
let roomId = new URLSearchParams(location.search).get("room");

if (!roomId) {
  roomId = Math.random().toString(36).slice(2, 8);
  location.search = `?room=${roomId}`;
}

roomText.innerText = `Room: ${roomId}`;
log("ROOM:", roomId);

// ===================== INIT PEER
async function initPeer() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(config);

  peerConnection.oniceconnectionstatechange = () =>
    log("ICE:", peerConnection.iceConnectionState);

  peerConnection.onconnectionstatechange = () =>
    log("CONNECTION:", peerConnection.connectionState);

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", {
        roomId,
        candidate: e.candidate
      });
    }
  };

  peerConnection.ontrack = (e) => {
    log("REMOTE STREAM");
    remoteVideo.srcObject = e.streams[0];
  };
}

// ===================== INIT MEDIA (FIXED)
async function initMedia() {
  await initPeer();

  if (!localStream) {
    log("REQUEST CAMERA");

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;

    localStream.getTracks().forEach(t => {
      peerConnection.addTrack(t, localStream);
    });

    log("CAMERA READY");
  }
}

// ===================== START (🔥 FIX IMPORTANT)
async function start() {
  if (started) return;
  started = true;

  await initMedia();

  socket.emit("join-room", roomId);
  log("JOINED ROOM");
}

// ===================== SOCKET
socket.on("connect", () => {
  log("SOCKET CONNECTED");
});

// server triggers
socket.on("ready-to-call", async () => {
  await start();

  if (isCaller) return;
  isCaller = true;

  log("CREATE OFFER");

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("offer", { roomId, offer });
});

socket.on("offer", async (offer) => {
  await start();

  await peerConnection.setRemoteDescription(offer);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId, answer });

  flush();
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(answer);
  flush();
});

socket.on("ice-candidate", async (c) => {
  const ice = new RTCIceCandidate(c);

  if (peerConnection?.remoteDescription) {
    await peerConnection.addIceCandidate(ice);
  } else {
    pendingCandidates.push(ice);
  }
});

function flush() {
  for (const c of pendingCandidates) {
    peerConnection.addIceCandidate(c).catch(log);
  }
  pendingCandidates = [];
}

// ===================== CONTROLS
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

screenBtn.onclick = async () => {
  if (!screenStream) {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    const track = screenStream.getVideoTracks()[0];

    const sender = peerConnection.getSenders()
      .find(s => s.track?.kind === "video");

    sender?.replaceTrack(track);

    localVideo.srcObject = screenStream;

    track.onended = stopScreen;
  } else stopScreen();
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

// ===================== BOOTSTRAP (🔥 CRITICAL FIX)
document.addEventListener("click", start, { once: true });
document.addEventListener("touchstart", start, { once: true });