import WebSocket from "ws";
const ws = new WebSocket("ws://127.0.0.1:3000/ws/world");
ws.on("message", (data: any) => console.log("WS:", data.toString()));
ws.on("open", () => console.log("WS: connected"));
setTimeout(() => { ws.close(); process.exit(0); }, 8000);
