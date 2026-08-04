# EC2 Nginx deployment

The production frontend uses the browser's HTTPS origin for API and image
requests. Nginx serves the SPA and proxies `/api/`, `/uploads/`, and `/images/`
to the backend bound to `127.0.0.1:8080`.

1. Run `npm ci` and `npm run build:react`.
2. Copy `index.html` and `dist/` to `/var/www/pulse`.
3. Copy `deploy/nginx/pulse.conf.example` to the Nginx sites directory.
4. Replace `community.example.com` with the real domain and configure a valid
   TLS certificate.
5. Validate with `sudo nginx -t`, then reload Nginx.

Do not proxy `/h2-console`. Keep backend port 8080 private and expose only HTTPS
443 publicly. Port 80 should be used only for redirecting to HTTPS or certificate
validation.
