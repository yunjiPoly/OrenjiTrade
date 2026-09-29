# Firebase Authentication emulator for local development.
# The Auth emulator is implemented in Node (no Java required, unlike Firestore/RTDB emulators).
FROM node:22-alpine

RUN npm install -g firebase-tools@14 && npm cache clean --force

WORKDIR /app
COPY firebase.json .firebaserc ./
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/data"]
EXPOSE 9099 4000

ENTRYPOINT ["/entrypoint.sh"]
