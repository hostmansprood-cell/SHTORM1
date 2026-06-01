const socket = window.io();

const log = (...args) => console.log("[SHTORM]", ...args);

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

let isCaller = false;
let joined = false;
let started = false;
let pending = [];

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

// INIT PC
function createPC() {
  if (pc) return;

  pc = new RTCPeerConnection({
    ...config,
    iceCandidatePoolSize: 10
  });

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

// GET MEDIA
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

// START (FIXED)
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

// SOCKET
socket.on("connect", () => {
  log("CONNECTED");
});

socket.on("ready-to-call", async () => {
  await start();

  if (isCaller) return;
  isCaller = true;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("offer", { roomId, offer });
});

socket.on("offer", async (offer) => {
  await start();

  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", { roomId, answer });

  flush();
});

socket.on("answer", async (answer) => {
  await pc.setRemoteDescription(answer);
  flush();
});

socket.on("ice-candidate", async (c) => {
  const ice = new RTCIceCandidate(c);

  if (pc.remoteDescription) {
    await pc.addIceCandidate(ice);
  } else {
    pending.push(ice);
  }
});

function flush() {
  for (const c of pending) {
    pc.addIceCandidate(c).catch(log);
  }
  pending = [];
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

screenBtn.onclick = async () => {
  screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

  const track = screenStream.getVideoTracks()[0];

  const sender = pc.getSenders().find(s => s.track?.kind === "video");
  sender?.replaceTrack(track);

  localVideo.srcObject = screenStream;

  track.onended = async () => {
    const cam = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const t = cam.getVideoTracks()[0];
    sender?.replaceTrack(t);

    screenStream = null;
    localStream = cam;
    localVideo.srcObject = cam;
  };
};

// BOOT
document.addEventListener("click", start, { once: true });