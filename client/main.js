import { io } from "./node_modules/socket.io-client/dist/socket.io.esm.min.js";

const socket = io();

// =====================
// 🔥 GLOBAL DEBUG LOGS (Safari fix)
// =====================
const log = (...args) => {
  console.log("[SHTORM]", ...args);
};

window.onerror = (msg, src, line, col, err) => {
  console.log("[JS ERROR]", msg, line, col, err);
};

window.onunhandledrejection = (e) => {
  console.log("[PROMISE ERROR]", e.reason);
};

// =====================
// UI
// =====================
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const copyBtn = document.getElementById("copyBtn");
const screenBtn = document.getElementById("screenBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const roomText = document.getElementById("roomText");

// =====================
// STATE
// =====================
let peerConnection;
let localStream;
let screenStream;

let isCaller = false;
let pendingCandidates = [];

// =====================
// ICE CONFIG (TURN OK)
// =====================
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
// ROOM
// =====================
let roomId = new URLSearchParams(location.search).get("room");

if (!roomId) {
  roomId = Math.random().toString(36).slice(2, 8);
  location.search = `?room=${roomId}`;
}

roomText.innerText = `Room: ${roomId}`;
log("ROOM:", roomId);

// =====================
// INIT PEER
// =====================
async function initPeer() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(config);

  peerConnection.oniceconnectionstatechange = () => {
    log("ICE STATE:", peerConnection.iceConnectionState);
  };

  peerConnection.onconnectionstatechange = () => {
    log("CONNECTION STATE:", peerConnection.connectionState);
  };

  peerConnection.onsignalingstatechange = () => {
    log("SIGNALING STATE:", peerConnection.signalingState);
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      log("SEND ICE:", e.candidate.type);
      socket.emit("ice-candidate", {
        roomId,
        candidate: e.candidate
      });
    }
  };

  peerConnection.ontrack = (e) => {
    log("REMOTE STREAM RECEIVED");
    remoteVideo.srcObject = e.streams[0];
  };
}

// =====================
// MEDIA
// =====================
async function initMedia() {
  await initPeer();

  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;

    localStream.getTracks().forEach(t => {
      peerConnection.addTrack(t, localStream);
    });

    log("LOCAL STREAM READY");
  }
}

// =====================
// SOCKET
// =====================
socket.on("connect", () => {
  log("SOCKET CONNECTED");
  socket.emit("join-room", roomId);
});

// IMPORTANT FIX: only one caller
socket.on("ready-to-call", async () => {
  log("READY TO CALL");

  await initMedia();

  if (isCaller) return;
  isCaller = true;

  log("CREATING OFFER");

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("offer", { roomId, offer });
});

socket.on("offer", async (offer) => {
  log("RECEIVED OFFER");

  await initMedia();

  await peerConnection.setRemoteDescription(offer);

  log("CREATING ANSWER");

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId, answer });

  flushIce();
});

socket.on("answer", async (answer) => {
  log("RECEIVED ANSWER");

  await peerConnection.setRemoteDescription(answer);

  flushIce();
});

socket.on("ice-candidate", async (c) => {
  const ice = new RTCIceCandidate(c);

  if (peerConnection?.remoteDescription) {
    await peerConnection.addIceCandidate(ice);
  } else {
    pendingCandidates.push(ice);
  }
});

function flushIce() {
  log("FLUSH ICE:", pendingCandidates.length);

  for (const c of pendingCandidates) {
    peerConnection.addIceCandidate(c).catch(err =>
      log("ICE ERROR:", err)
    );
  }

  pendingCandidates = [];
}

// =====================
// CONTROLS
// =====================
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

// =====================
// SCREEN SHARE
// =====================
screenBtn.onclick = async () => {
  if (!screenStream) {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true
    });

    const track = screenStream.getVideoTracks()[0];

    const sender = peerConnection
      .getSenders()
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

  const sender = peerConnection
    .getSenders()
    .find(s => s.track?.kind === "video");

  sender?.replaceTrack(track);

  screenStream?.getTracks().forEach(t => t.stop());

  screenStream = null;
  localStream = cam;
  localVideo.srcObject = cam;
}

// =====================
// START
// =====================
initPeer();