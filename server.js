
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
  pingInterval: 10000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;
const players = new Map();

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const clamp = (value, min, max, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, number))
    : fallback;
};

function cleanName(value) {
  return String(value || "Driver")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 16) || "Driver";
}

function cleanChat(value) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function cleanGender(value) {
  return value === "female" ? "female" : "male";
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    gender: player.gender,
    skin: player.skin,
    color: player.color,
    x: player.x,
    y: player.y,
    z: player.z,
    rotation: player.rotation,
    driving: player.driving,
    jumping: player.jumping,
    speed: player.speed
  };
}

io.on("connection", socket => {
  console.log("Connected:", socket.id);

  socket.on("player:join", data => {
    if (players.has(socket.id)) return;

    const player = {
      id: socket.id,
      name: cleanName(data?.name),
      gender: cleanGender(data?.gender),
      skin: "street-blue",
      color: 0x315d9b,
      x: 0,
      y: 0,
      z: 30,
      rotation: 0,
      driving: false,
      jumping: false,
      speed: 0,
      lastUpdate: 0,
      lastChat: 0
    };

    players.set(socket.id, player);

    socket.emit(
      "players:init",
      [...players.values()]
        .filter(p => p.id !== socket.id)
        .map(publicPlayer)
    );

    socket.emit("player:assigned", publicPlayer(player));
    socket.broadcast.emit("player:joined", publicPlayer(player));

    console.log(player.name, "joined. Players:", players.size);
  });

  socket.on("player:update", data => {
    const player = players.get(socket.id);
    if (!player || !data) return;

    const now = Date.now();

    if (now - player.lastUpdate < 35) return;
    player.lastUpdate = now;

    player.x = clamp(data.x, -900, 900, player.x);
    player.y = clamp(data.y, 0, 12, player.y);
    player.z = clamp(data.z, -900, 900, player.z);
    player.rotation = clamp(
      data.rotation,
      -100000,
      100000,
      player.rotation
    );

    player.driving = data.driving === true;
    player.jumping = data.jumping === true;
    player.speed = clamp(data.speed, -30, 80, 0);

    io.emit("player:update", publicPlayer(player));
  });

  socket.on("chat:message", rawMessage => {
    const player = players.get(socket.id);
    if (!player) return;

    const now = Date.now();

    if (now - player.lastChat < 650) return;
    player.lastChat = now;

    const message = cleanChat(rawMessage);
    if (!message) return;

    io.emit("chat:message", {
      id: socket.id,
      name: player.name,
      message,
      time: now
    });
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);

    if (player) {
      console.log(
        player.name,
        "left. Players:",
        players.size - 1
      );
    }

    players.delete(socket.id);
    io.emit("player:left", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`VICE CITY running on port ${PORT}`);
});
