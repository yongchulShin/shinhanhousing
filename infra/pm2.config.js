// PM2 프로세스 설정
// 실행: cd /opt/shinhan-api && pm2 start ../infra/pm2.config.js --env production
// 자동 재시작: pm2 save && pm2 startup systemd

module.exports = {
  apps: [{
    name: 'shinhan-api',
    script: 'server.js',
    cwd: '/opt/shinhan-api',
    exec_mode: 'cluster',
    instances: 2,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: '/var/log/pm2/shinhan-api-error.log',
    out_file:   '/var/log/pm2/shinhan-api-out.log',
    time: true,
    merge_logs: true,
    kill_timeout: 5000,
    listen_timeout: 8000,
  }],
};
