# Firebase Authentication emulator for local development.
# The Auth emulator is implemented in Node (no Java required, unlike Firestore/RTDB emulators).
FROM node:22-alpine

# Exact version: every developer (and every `npm run infra:reset`) gets the same emulator.
ARG FIREBASE_TOOLS_VERSION=14.27.0
RUN npm install -g "firebase-tools@${FIREBASE_TOOLS_VERSION}" && npm cache clean --force

WORKDIR /app
COPY firebase.json .firebaserc ./
COPY entrypoint.sh /entrypoint.sh
# /data backs the `firebase-data` named volume; chown it in the image so the volume is
# initialised with the same owner and --export-on-exit can write to it as `node`.
RUN chmod +x /entrypoint.sh \
    && mkdir -p /data \
    && chown -R node:node /app /data

# Unprivileged user shipped with the base image; firebase-tools keeps its cache/config in
# /home/node, which is writable.
USER node

# Bake the Emulator UI into the image (otherwise it is downloaded on every fresh container start,
# which fails offline and slows down `npm run infra:reset`).
RUN firebase setup:emulators:ui

VOLUME ["/data"]
EXPOSE 9099 4000

ENTRYPOINT ["/entrypoint.sh"]
