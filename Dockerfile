FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=5173
COPY --chown=root:root . .
# Run as non-root; the code stays root-owned so the app cannot modify itself
USER node
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5173/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","online-server.mjs"]
