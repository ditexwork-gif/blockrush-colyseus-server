const os = require("os");

module.exports = {
  apps: [{
    name: "blockrush-server",
    script: "build/index.js",
    time: true,
    watch: false,
    instances: os.cpus().length,
    exec_mode: "fork",
    wait_ready: true,
    max_memory_restart: "512M"
  }]
};
