// ============================================================
// PM2 Ecosystem Configuration
//
// PM2 manages the Next.js process:
//   - Auto-restarts on crash
//   - Auto-starts on server reboot
//   - Memory limit watchdog
//   - Log management
//
// Commands:
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 status
//   pm2 logs
//   pm2 restart status-dashboard
//   pm2 stop status-dashboard
// ============================================================

module.exports = {
  apps: [
    {
      name: "status-dashboard",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",

      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // Auto-restart settings
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,

      // Memory watchdog — restart if exceeds 512MB
      max_memory_restart: "512M",

      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
      log_type: "json",

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 10000,
    },
  ],
};
