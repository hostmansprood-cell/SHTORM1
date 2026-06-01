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
let isMakingOffer = false;
let polite = false;

let pendingCandidates = [];

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

// ROOM
let roomId = new URLSearchParams(location.search).get("room");

if (!roomId) {
  roomId = Math.random().toString(36).slice(2, 8);
  location.search = `?room=${roomId}`;
}

roomText.innerText = roomId;

// ================= PEER =================
function createPC() {
  if (pc) return;

  pc = new RTCPeerConnection(config);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", {
        roomId,
        candidate: e.candidate
      });
    }
  };

  pc.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  pc.onconnectionstatechange = () => {
    log("STATE:", pc.connectionState);
  };
}

// ================= MEDIA =================
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

// ================= START =================
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

// ================= SOCKET =================
socket.on("connect", () => {
  log("CONNECTED");
  start();
});

// only 2 peers logic
socket.on("ready-to-call", async () => {
  await start();

  if (isMakingOffer) return;
  isMakingOffer = true;

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("offer", { roomId, offer });
    log("OFFER SENT");
  } catch (e) {
    log("OFFER ERROR:", e);
  } finally {
    isMakingOffer = false;
  }
});

// OFFER HANDLER (FIXED PERFECTLY)
socket.on("offer", async (offer) => {
  await start();

  const offerCollision = pc.signalingState !== "stable";

  polite = true;

  if (offerCollision && !polite) {
    log("OFFER COLLISION IGNORED");
    return;
  }

  try {
    await pc.setRemoteDescription(offer);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", { roomId, answer });
    log("ANSWER SENT");

    flush();
  } catch (e) {
    log("OFFER ERROR:", e);
  }
});

// ANSWER HANDLER (FIXED)
socket.on("answer", async (answer) => {
  try {
    if (pc.signalingState !== "have-local-offer") {
      log("IGNORE ANSWER STATE:", pc.signalingState);
      return;
    }

    await pc.setRemoteDescription(answer);
    flush();
  } catch (e) {
    log("ANSWER ERROR:", e);
  }
});

// ICE
socket.on("ice-candidate", async (c) => {
  try {
    const ice = new RTCIceCandidate(c);

    if (pc.remoteDescription) {
      await pc.addIceCandidate(ice);
    } else {
      pendingCandidates.push(ice);
    }
  } catch (e) {
    log("ICE ERROR:", e);
  }
});

function flush() {
  for (const c of pendingCandidates) {
    pc.addIceCandidate(c).catch(log);
  }
  pendingCandidates = [];
}

// ================= CONTROLS =================
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

// SCREEN SHARE (FIXED NO DOUBLE CAMERA REQUEST)
screenBtn.onclick = async () => {
  if (!screenStream) {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true
    });

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