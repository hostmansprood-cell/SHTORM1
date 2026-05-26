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

const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
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
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(config);

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

  } catch (err) {
    console.error(err);
  }
}

// SOCKET EVENTS
socket.on("user-joined", async () => {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("offer", { roomId, offer });
});

socket.on("offer", async (offer) => {
  await peerConnection.setRemoteDescription(offer);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId, answer });
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(answer);
});

socket.on("ice-candidate", async (candidate) => {
  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (err) {
    console.error(err);
  }
});

// MUTE
muteBtn.addEventListener("click", () => {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;

  muteBtn.innerText = audioTrack.enabled ? "Mute" : "Unmute";
});

// CAMERA
cameraBtn.addEventListener("click", () => {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;

  cameraBtn.innerText = videoTrack.enabled ? "Camera Off" : "Camera On";
});

// COPY
copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(window.location.href);

  copyBtn.innerText = "Copied!";

  setTimeout(() => {
    copyBtn.innerText = "Copy Link";
  }, 2000);
});

// SCREEN SHARE (FIXED TOGGLE VERSION)
screenBtn.addEventListener("click", async () => {
  try {

    // 👉 включаем экран
    if (!screenStream) {

      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      });

      const screenTrack = screenStream.getVideoTracks()[0];

      const sender = peerConnection
        .getSenders()
        .find(s => s.track && s.track.kind === "video");

      if (sender) {
        sender.replaceTrack(screenTrack);
      }

      localVideo.srcObject = screenStream;

      screenTrack.onended = () => {
        stopScreenShare();
      };

      screenBtn.innerText = "Stop Screen";

    } else {

      // 👉 выключаем экран
      stopScreenShare();

    }

  } catch (err) {
    console.error(err);
  }
});

// STOP SCREEN SHARE (FIXED RESTORE)
async function stopScreenShare() {
  try {

    if (!peerConnection) return;

    const cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const cameraTrack = cameraStream.getVideoTracks()[0];

    const sender = peerConnection
      .getSenders()
      .find(s => s.track && s.track.kind === "video");

    if (sender) {
      sender.replaceTrack(cameraTrack);
    }

    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }

    screenStream = null;

    localStream = cameraStream;
    localVideo.srcObject = cameraStream;

    screenBtn.innerText = "Screen";

  } catch (err) {
    console.error(err);
  }
}

// START
init();