FROM node:18 as deps

# Create app directory
WORKDIR /usr/src/app

# Run a custom ssl_setup script if available
COPY package.json ./docker_ssl_setup.sh* ./
RUN chmod +x ./docker_ssl_setup.sh; exit 0
RUN ./docker_ssl_setup.sh; exit 0
ENV NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt"

# We're using this because root user can't run any post-install scripts
USER node
WORKDIR /home/node/app
# Copy just the package.json and package-lock.json
COPY --chown=node:node package*.json .

# Install only runtime dependencies
RUN npm install --omit=dev

FROM node:18-slim as runner

USER node
WORKDIR /home/node/app

RUN mkdir node_modules
RUN chown node:node node_modules

COPY --from=deps --chown=node:node /home/node/app/node_modules ./node_modules
COPY --chown=node:node package*.json .
COPY --chown=node:node src* ./src

# Start app
EXPOSE 3000
ENV PORT 3000
ENV REDIS_PORT 6379
ENV DB_PORT 27017
ENV HOST "0.0.0.0"
CMD [ "npm", "start" ]