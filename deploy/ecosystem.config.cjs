// PM2 process manager — apunta al backend compilado.
// Logs van a /var/log/icemm con rotación diaria (instalar pm2-logrotate).
module.exports = {
  apps: [
    {
      name: 'icemm-api',
      cwd: '/var/www/icemm/backend',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      restart_delay: 5000,
      time: true,
      out_file: '/var/log/icemm/api-out.log',
      error_file: '/var/log/icemm/api-err.log',
      merge_logs: true,
    },
  ],
}
