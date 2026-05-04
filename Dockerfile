FROM nginx:alpine

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Copy static assets
COPY index.html  /usr/share/nginx/html/
COPY style.css   /usr/share/nginx/html/
COPY src/        /usr/share/nginx/html/src/

# Custom nginx config
COPY nginx.conf  /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1
