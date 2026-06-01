import { io } from "./node_modules/socket.io-client/dist/socket.io.esm.min.js";

const socket = io();

// UI
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const copyBtn = document.getElementById("copyBtn");
const screenBtn = document.getElementById("screenBtn");

const usernameInput = document.getElementById("usernameInput");
const localName = document.getElementById("localName");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const roomText = document.getElementById("roomText");

// STATE
let peerConnection;
let localStream;
let screenStream;

let isInitiator = false;
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
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
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
const params = new URLSearchParams(window.location.search);

let roomId = params.get("room");

if (!roomId) {
  roomId = Math.random().toString(36).substring(2, 8);
  window.location.search = `?room=${roomId}`;
}

roomText.innerText = `Room: ${roomId}`;

// USERNAME
const savedName = localStorage.getItem("shtorm_username");

if (savedName) {
  usernameInput.value = savedName;
  localName.innerText = savedName;
}

usernameInput.addEventListener("input", () => {
  const name = usernameInput.value.trim() || "You";
  localStorage.setItem("shtorm_username", name);
  localName.innerText = name;
});

// INIT
async function init() {
  await startMedia();
  socket.emit("join-room", roomId);
}

// MEDIA
async function startMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(config);

  // DEBUG
  peerConnection.oniceconnectionstatechange = () =>
    console.log("ICE:", peerConnection.iceConnectionState);

  peerConnection.onconnectionstatechange = () =>
    console.log("CONNECTION:", peerConnection.connectionState);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        roomId,
        candidate: event.candidate
      });
    }
  };
}

// SOCKET
socket.on("user-joined", async () => {
  // ONLY ONE INITIATOR
  isInitiator = true;

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("offer", { roomId, offer });
});

socket.on("offer", async (offer) => {
  if (!peerConnection) await startMedia();

  await peerConnection.setRemoteDescription(offer);

  // apply queued ICE
  for (const c of pendingCandidates) {
    await peerConnection.addIceCandidate(c);
  }
  pendingCandidates = [];

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId, answer });
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(answer);

  for (const c of pendingCandidates) {
    await peerConnection.addIceCandidate(c);
  }
  pendingCandidates = [];
});

socket.on("ice-candidate", async (candidate) => {
  try {
    const ice = new RTCIceCandidate(candidate);

    if (peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(ice);
    } else {
      pendingCandidates.push(ice);
    }
  } catch (e) {
    console.error("ICE error:", e);
  }
});

// CONTROLS
muteBtn.onclick = () => {
  const t = localStream.getAudioTracks()[0];
  t.enabled = !t.enabled;
};

cameraBtn.onclick = () => {
  const t = localStream.getVideoTracks()[0];
  t.enabled = !t.enabled;
};

copyBtn.onclick = async () => {
  await navigator.clipboard.writeText(window.location.href);
};

screenBtn.onclick = async () => {
  if (!screenStream) {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    const track = screenStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track?.kind === "video");

    sender?.replaceTrack(track);

    localVideo.srcObject = screenStream;

    track.onended = stopScreenShare;
  } else {
    stopScreenShare();
  }
};

async function stopScreenShare() {
  const cam = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  const track = cam.getVideoTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track?.kind === "video");

  sender?.replaceTrack(track);

  screenStream?.getTracks().forEach(t => t.stop());
  screenStream = null;

  localStream = cam;
  localVideo.srcObject = cam;
}

// START
init();