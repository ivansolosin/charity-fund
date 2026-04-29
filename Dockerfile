# =============================================================
# nginx-based static site for Railway / Docker
# - listens on $PORT (Railway sets it dynamically)
# - serves index.html, styles.css, script.js
# - sane cache headers, gzip, basic security headers
# =============================================================

FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="charity-fund"
LABEL org.opencontainers.image.description="Charity fund landing — slot-based transparent support"
LABEL org.opencontainers.image.source="https://github.com/ivansolosin/charity-fund"

# Static assets
COPY index.html styles.css script.js /usr/share/nginx/html/

# nginx template (envsubst processes ${PORT} at container start)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Railway injects $PORT; default to 80 for plain `docker run`
ENV PORT=80
EXPOSE 80

# nginx:alpine entrypoint already handles template rendering + nginx -g
