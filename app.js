const socket = io();

const $ = (id) => document.getElementById(id);
const home = $("home");
const room = $("room");
const modal = $("nameModal");
const nameInput = $("nameInput");
const modalError = $("modalError");

let pendingAction = null;
let currentName = "";
let currentRoom = "";
let currentUsers = [];
let localStream = null;
let screenPeers = new Map();

const savedName = localStorage.getItem("watchparty_name");
if (savedName) nameInput.value = savedName;

function showNameModal(action) {
  pendingAction = action;
  modalError.textContent = "";
  modal.classList.add("show");
  setTimeout(() => nameInput.focus(), 50);
}

function enterApp(code) {
  home.classList.add("hidden");
  room.classList.remove("hidden");
  $("roomCodeLabel").textContent = code;
  window.scrollTo(0, 0);
}

function leaveRoom() {
  window.location.href = "/";
}

$("createBtn").onclick = () => showNameModal({ type: "create" });
$("navEnter").onclick = () => showNameModal({ type: "join", code: $("roomCode").value });
$("joinBtn").onclick = () => {
  const code = $("roomCode").value.trim();
  if (!code) return $("roomCode").focus();
  showNameModal({ type: "join", code });
};
$("closeModal").onclick = () => modal.classList.remove("show");

$("confirmName").onclick = () => {
  const name = nameInput.value.trim();
  if (!name) {
    modalError.textContent = "Digite um nome.";
    return;
  }
  currentName = name;
  localStorage.setItem("watchparty_name", name);
  modal.classList.remove("show");

  if (pendingAction.type === "create") {
    socket.emit("create-room", { name }, handleRoomResponse);
  } else {
    socket.emit("join-room", { code: pendingAction.code, name }, handleRoomResponse);
  }
};

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("confirmName").click();
});
$("roomCode").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

function handleRoomResponse(result) {
  if (!result?.ok) {
    showNameModal(pendingAction);
    modalError.textContent = result?.error || "Não foi possível entrar.";
    return;
  }
  currentRoom = result.code;
  enterApp(currentRoom);
  applyVideoState(result.video);
  addSystemMessage(`Você entrou na sala ${currentRoom}.`);
  if (result.broadcaster) socket.emit("get-screen-host");
}

$("copyBtn").onclick = async () => {
  const link = `${location.origin}/?room=${currentRoom}`;
  try {
    await navigator.clipboard.writeText(link);
    $("copyBtn").textContent = "Link copiado!";
    setTimeout(() => $("copyBtn").textContent = "Copiar convite", 1600);
  } catch {
    prompt("Copie o convite:", link);
  }
};

$("leaveBtn").onclick = leaveRoom;

const video = $("video");
const videoEmpty = $("videoEmpty");

function sendVideoState() {
  if (!currentRoom) return;
  socket.emit("video-state", {
    url: video.currentSrc || video.src || $("videoUrl").value.trim(),
    playing: !video.paused,
    time: video.currentTime
  });
}

$("loadVideoBtn").onclick = () => {
  const url = $("videoUrl").value.trim();
  if (!url) return;
  video.src = url;
  video.load();
  videoEmpty.classList.add("hidden");
  sendVideoState();
};

video.addEventListener("play", sendVideoState);
video.addEventListener("pause", sendVideoState);
video.addEventListener("seeked", sendVideoState);

function applyVideoState(state) {
  if (!state) return;
  if (state.url && state.url !== video.currentSrc) {
    $("videoUrl").value = state.url;
    video.src = state.url;
    videoEmpty.classList.add("hidden");
  }
  if (state.time != null) {
    try { video.currentTime = state.time; } catch {}
  }
  if (state.playing) video.play().catch(() => {});
}

socket.on("video-state", (state) => {
  const wasPlaying = state.playing;
  applyVideoState(state);
  if (!wasPlaying) video.pause();
});

function addMessage(name, text, time) {
  const el = document.createElement("div");
  el.className = "message";
  const strong = document.createElement("strong");
  strong.textContent = name;
  const tm = document.createElement("time");
  tm.textContent = time || "";
  const p = document.createElement("p");
  p.textContent = text;
  el.append(strong, tm, p);
  $("chatMessages").appendChild(el);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

function addSystemMessage(text) {
  addMessage("Sistema", text, "");
}

$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chat-message", { text });
  input.value = "";
};

socket.on("chat-message", (message) => addMessage(message.name, message.text, message.time));

socket.on("room-users", (users) => {
  currentUsers = users;
  $("userCount").textContent = users.length;
  $("people").innerHTML = "";
  users.forEach((u) => {
    const el = document.createElement("div");
    el.className = "person";
    el.textContent = u.name + (u.id === socket.id ? " (você)" : "");
    $("people").appendChild(el);
  });
});

socket.on("user-joined", ({ name }) => addSystemMessage(`${name} entrou na sala.`));

document.querySelectorAll(".tab").forEach((tab, index) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    if (index === 0) {
      $("chatMessages").classList.remove("hidden");
      $("chatForm").classList.remove("hidden");
      $("people").classList.add("hidden");
    } else {
      $("chatMessages").classList.add("hidden");
      $("chatForm").classList.add("hidden");
      $("people").classList.remove("hidden");
    }
  };
});

// ---------------- WebRTC screen sharing ----------------
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

async function startScreenShare() {
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true
    });

    $("screenArea").classList.remove("hidden");
    $("screenVideo").srcObject = localStream;
    socket.emit("screen-started");

    localStream.getVideoTracks()[0].addEventListener("ended", stopScreenShare);

    // Ask current participants to connect to the new host.
    currentUsers.filter(u => u.id !== socket.id).forEach(u => createOfferFor(u.id));
  } catch (err) {
    addSystemMessage("Compartilhamento de tela cancelado.");
  }
}

async function createOfferFor(peerId) {
  if (!localStream) return;
  const pc = new RTCPeerConnection(rtcConfig);
  screenPeers.set(peerId, pc);

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.onicecandidate = e => {
    if (e.candidate) socket.emit("screen-ice", { to: peerId, candidate: e.candidate });
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("screen-offer", { to: peerId, offer });
}

socket.on("screen-started", ({ from }) => {
  createViewerConnection(from);
});

async function createViewerConnection(hostId) {
  const pc = new RTCPeerConnection(rtcConfig);
  screenPeers.set(hostId, pc);

  pc.ontrack = e => {
    $("screenArea").classList.remove("hidden");
    $("screenVideo").srcObject = e.streams[0];
  };
  pc.onicecandidate = e => {
    if (e.candidate) socket.emit("screen-ice", { to: hostId, candidate: e.candidate });
  };

  // Tell host to create the offer for this viewer.
  socket.emit("get-screen-host");
}

socket.on("screen-host", ({ id }) => {
  if (id !== socket.id && !localStream) {
    createViewerConnection(id);
  }
});

socket.on("screen-offer", async ({ from, offer }) => {
  if (!localStream) {
    let pc = screenPeers.get(from);
    if (!pc) pc = await makeViewerPeer(from);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("screen-answer", { to: from, answer });
  }
});

async function makeViewerPeer(hostId) {
  const pc = new RTCPeerConnection(rtcConfig);
  screenPeers.set(hostId, pc);
  pc.ontrack = e => {
    $("screenArea").classList.remove("hidden");
    $("screenVideo").srcObject = e.streams[0];
  };
  pc.onicecandidate = e => {
    if (e.candidate) socket.emit("screen-ice", { to: hostId, candidate: e.candidate });
  };
  return pc;
}

socket.on("screen-answer", async ({ from, answer }) => {
  const pc = screenPeers.get(from);
  if (pc) await pc.setRemoteDescription(answer);
});

socket.on("screen-ice", async ({ from, candidate }) => {
  const pc = screenPeers.get(from);
  if (pc && candidate) {
    try { await pc.addIceCandidate(candidate); } catch {}
  }
});

function stopScreenShare() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  screenPeers.forEach(pc => pc.close());
  screenPeers.clear();
  $("screenVideo").srcObject = null;
  $("screenArea").classList.add("hidden");
  socket.emit("screen-stopped");
}

$("screenBtn").onclick = () => localStream ? stopScreenShare() : startScreenShare();
$("stopScreenBtn").onclick = stopScreenShare;

socket.on("screen-stopped", () => {
  if (!localStream) {
    $("screenVideo").srcObject = null;
    $("screenArea").classList.add("hidden");
  }
});

// Auto-enter from a ?room=XXXX link.
const params = new URLSearchParams(location.search);
const inviteRoom = params.get("room");
if (inviteRoom) {
  $("roomCode").value = inviteRoom.toUpperCase();
  showNameModal({ type: "join", code: inviteRoom.toUpperCase() });
}