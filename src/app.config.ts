import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from "colyseus";
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
    metrics: createEndpoint("/metrics", { method: "GET" }, async () => metricsSnapshot()),
    rooms: createEndpoint("/rooms", { method: "GET" }, async () => {
      const listings = await matchMaker.query({ name: "blockrush", private: false, unlisted: false });
      return {
        region: "FRA",
        rooms: listings
          .filter(room => room.metadata?.public === true)
          .map(room => ({
            roomId: room.roomId,
            clients: room.clients,
            maxClients: room.maxClients,
            locked: room.locked,
            map: room.metadata?.map === "depot" ? "depot" : "foundry",
            mode: ["ffa", "tdm", "gun"].includes(room.metadata?.mode) ? room.metadata.mode : "ffa",
            phase: ["waiting", "playing", "finished"].includes(room.metadata?.phase) ? room.metadata.phase : "waiting"
          }))
      };
    })
  })
});

export default server;
