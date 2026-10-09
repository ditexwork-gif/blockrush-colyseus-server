import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from "colyseus";
import { metricsSnapshot } from "./metrics.js";
import {WebSocketTransport} from "@colyseus/ws-transport";
import {requestAdmission,upgradeAdmission,corsPreflight} from "./environment-admission.js";
import {ENV_CONFIG} from "./shared/environment-config.js";
import { ArenaRoom, DevArenaRoom } from "./rooms/ArenaRoom.js";

const server = defineServer({
  transport: new WebSocketTransport({beforeUpgrade:upgradeAdmission}),
  rooms: {
    [ENV_CONFIG.environments.live.roomName]: defineRoom(ArenaRoom).filterBy(["public", "map", "mode"]),
    [ENV_CONFIG.environments.dev.roomName]: defineRoom(DevArenaRoom).filterBy(["public", "map", "mode"])
  },
  routes: createRouter({
    health: createEndpoint("/health", { method: "GET" }, async () => ({
      ok: true,
      service: "blockrush-server"
    })),
    metrics: createEndpoint("/metrics", { method: "GET" }, async () => metricsSnapshot()),
    devRooms: createEndpoint("/dev/rooms", {method:"GET"}, async () => ({region:"FRA",rooms:(await matchMaker.query({name:ENV_CONFIG.environments.dev.roomName,private:false,unlisted:false})).filter(room=>room.metadata?.public===true).map(room=>({roomId:room.roomId,clients:room.clients,maxClients:room.maxClients,locked:room.locked,map:room.metadata?.map,mode:room.metadata?.mode,phase:room.metadata?.phase}))})),
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
  }, {onRequest:async (request:Request) => {try {const preflight=corsPreflight(request);if(preflight)return preflight;requestAdmission(request);} catch {return Response.json({error:"Environment authorization failed."},{status:403});}}})
});

export default server;
