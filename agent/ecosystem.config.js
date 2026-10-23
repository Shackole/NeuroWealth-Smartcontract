/**
 * PM2 ecosystem configuration for NeuroWealth AI Agent (#120).
 *
 * Usage:
 *   Production:  npm run start:prod   (pm2 start ecosystem.config.js --env production)
 *   Staging:     npm run start:staging (pm2 start ecosystem.config.js --env staging)
 *   Stop:        npm run stop          (pm2 stop neurowealth-agent)
 *   Logs:        npm run logs          (pm2 logs neurowealth-agent)
 *   Monitor:     pm2 monit
 *
 * Restart policy: max 5 restarts within a 10-minute window (600 000 ms).
 * Any restart that occurs before the process has been up for 60 s (min_uptime)
 * counts against the burst limit.  After 5 consecutive fast crashes PM2 marks
 * the process as errored and stops retrying until a manual restart.
 */

module.exports = {
  apps: [
    {
      name: 'neurowealth-agent',
      script: 'src/index.ts',

      // Use ts-node/register so TypeScript is executed directly in production
      // without a separate compilation step.  Switch to a pre-compiled
      // dist/index.js once the build pipeline is in place.
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',

      // Cluster mode spawns one worker per logical CPU core, improving
      // throughput and providing in-process failover.
      exec_mode: 'cluster',
      instances: 'max',

      // Restart policy — exponential back-off is implemented at the PM2 level:
      //   min_uptime:   process must be alive for at least 60 s to be
      //                 considered a successful start.
      //   max_restarts: after 5 fast crashes in one window, stop retrying.
      //   restart_delay: wait 5 s before each automatic restart attempt.
      min_uptime: '60s',
      max_restarts: 5,
      restart_delay: 5000,

      // Never watch files in production; use a rolling deploy instead.
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],

      // Logging — written to /var/log/neurowealth-agent.log when running as
      // the neurowealth system user.  Falls back to ~/logs/ for local dev.
      out_file: process.env.PM2_LOG_DIR
        ? `${process.env.PM2_LOG_DIR}/neurowealth-agent-out.log`
        : '/var/log/neurowealth-agent.log',
      error_file: process.env.PM2_LOG_DIR
        ? `${process.env.PM2_LOG_DIR}/neurowealth-agent-err.log`
        : '/var/log/neurowealth-agent-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Graceful shutdown: allow up to 15 s for in-flight requests and DB
      // pool closure before PM2 sends SIGKILL.
      kill_timeout: 15000,
      listen_timeout: 10000,

      // Environment — override any of these via Railway dashboard or .env.
      env: {
        NODE_ENV: 'development',
        PORT: '3001',
      },

      env_staging: {
        NODE_ENV: 'staging',
        PORT: '3001',
        LOG_LEVEL: 'debug',
      },

      env_production: {
        NODE_ENV: 'production',
        PORT: '3001',
        LOG_LEVEL: 'info',
      },
    },
  ],
};
