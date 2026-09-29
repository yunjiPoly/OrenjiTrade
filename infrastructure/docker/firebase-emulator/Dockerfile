# Firebase Authentication emulator for local development.
# The Auth emulator is implemented in Node (no Java required, unlike Firestore/RTDB emulators).
FROM node:22-alpine

RUN npm install -g firebase-tools@14 && npm cache clean --force

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

VOLUME ["/data"]
EXPOSE 9099 4000

ENTRYPOINT ["/entrypoint.sh"]
