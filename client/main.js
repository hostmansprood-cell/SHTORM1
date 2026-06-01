const socket = window.io();

const log = (...args) => console.log("[SHTORM]", ...args);

// errors
window.onerror = (m) => log("JS ERROR:", m);
window.onunhandledrejection = (e) => log("PROMISE:", e.reason);

// UI
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const copyBtn = document.getElementById("copyBtn");
const screenBtn = document.getElementById("screenBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const roomText = document.getElementById("roomText");

// STATE
let pc;
let localStream;
let screenStream;

let joined = false;
let started = false;
let isCaller = false;

let pendingIce = [];

// IMPORTANT FIX
let makingOffer = false;
let ignoreOffer = false;

// ROOM
let roomId = new URLSearchParams(location.search).get("room");

if (!roomId) {
  roomId = Math.random().toString(36).slice(2, 8);
  location.search = `?room=${roomId}`;
}

roomText.innerText = roomId;

// ICE
const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "364220d702b99621ed50afaf",
      credential: "1+Wf1HFsEI3FFw4w"
    }
  ]
};

// CREATE PEER
function createPC() {
  if (pc) return;

  pc = new RTCPeerConnection(config);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", { roomId, candidate: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  pc.onconnectionstatechange = () => {
    log("STATE:", pc.connectionState);
  };

  pc.onnegotiationneeded = async () => {
    // SAFE negotiation control
    try {
      if (makingOffer) return;
      if (pc.signalingState !== "stable") return;

      makingOffer = true;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("offer", { roomId, offer });

      log("OFFER SENT");
    } catch (e) {
      log("NEGOTIATION ERROR:", e);
    } finally {
      makingOffer = false;
    }
  };
}

// MEDIA
async function getMedia() {
  if (localStream) return;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;

  localStream.getTracks().forEach(t => {
    pc.addTrack(t, localStream);
  });

  log("MEDIA READY");
}

// START
async function start() {
  if (started) return;
  started = true;

  if (!pc) createPC();
  await getMedia();

  if (!joined) {
    socket.emit("join-room", roomId);
    joined = true;
    log("JOINED", roomId);
  }
}

// SOCKET CONNECT
socket.on("connect", () => {
  log("CONNECTED");
  start();
});

// SERVER READY
socket.on("ready-to-call", () => {
  isCaller = true;
  log("YOU ARE CALLER");
});

// OFFER
socket.on("offer", async (offer) => {
  await start();

  const offerCollision = makingOffer || pc.signalingState !== "stable";
  ignoreOffer = offerCollision;

  if (ignoreOffer) {
    log("IGNORE OFFER:", pc.signalingState);
    return;
  }

  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", { roomId, answer });

  log("ANSWER SENT");

  flushIce();
});

// ANSWER
socket.on("answer", async (answer) => {
  if (pc.signalingState !== "have-local-offer") {
    log("IGNORE ANSWER STATE:", pc.signalingState);
    return;
  }

  await pc.setRemoteDescription(answer);
  flushIce();
});

// ICE
socket.on("ice-candidate", async (c) => {
  try {
    const ice = new RTCIceCandidate(c);

    if (pc.remoteDescription) {
      await pc.addIceCandidate(ice);
    } else {
      pendingIce.push(ice);
    }
  } catch (e) {
    log("ICE ERROR:", e);
  }
});

function flushIce() {
  for (const c of pendingIce) {
    pc.addIceCandidate(c).catch(log);
  }
  pendingIce = [];
}

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
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    const track = screenStream.getVideoTracks()[0];

    const sender = pc.getSenders().find(s => s.track?.kind === "video");
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

  const sender = pc.getSenders().find(s => s.track?.kind === "video");
  sender?.replaceTrack(track);

  screenStream?.getTracks().forEach(t => t.stop());
  screenStream = null;

  localStream = cam;
  localVideo.srcObject = cam;
}

// BOOT FIX
document.addEventListener("click", start, { once: true });