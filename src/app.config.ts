import { createEndpoint, createRouter, defineRoom, defineServer } from "colyseus";
import { metricsSnapshot } from "./metrics.js";
import { ArenaRoom } from "./rooms/ArenaRoom.js";

const server = defineServer({
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
