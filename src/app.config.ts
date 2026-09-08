import { createEndpoint, createRouter, defineRoom, defineServer } from "colyseus";
import { uWebSocketsTransport } from "@colyseus/uwebsockets-transport";
import { metricsSnapshot } from "./metrics.js";
import { ArenaRoom } from "./rooms/ArenaRoom.js";

const server = defineServer({
  transport: new uWebSocketsTransport(),
  rooms: {
    blockrush: defineRoom(ArenaRoom).filterBy(["public", "map", "mode"])
  },
  routes: createRouter({
    health: createEndpoint("/health", { method: "GET" }, async () => ({
      ok: true,
      service: "blockrush-server"
    })),
    metrics: createEndpoint("/metrics", { method: "GET" }, async () => metricsSnapshot())
  })
});

export default server;
