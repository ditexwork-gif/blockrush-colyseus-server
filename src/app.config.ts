import { createEndpoint, createRouter, defineRoom, defineServer } from "colyseus";
import { ArenaRoom } from "./rooms/ArenaRoom.js";

const server = defineServer({
  rooms: {
    blockrush: defineRoom(ArenaRoom)
  },
  routes: createRouter({
    health: createEndpoint("/health", { method: "GET" }, async () => ({
      ok: true,
      service: "blockrush-server"
    }))
  })
});

export default server;
