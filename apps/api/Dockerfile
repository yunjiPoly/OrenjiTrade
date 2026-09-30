# syntax=docker/dockerfile:1.7
# OrenjiTrade API container image.
#
#   docker build -t orenjitrade-api apps/api
#   docker run --rm -p 8080:8080 --env-file .env -e SPRING_PROFILES_ACTIVE=local orenjitrade-api
#
# Stage 1 builds the executable jar with the Gradle wrapper (JDK 21 is already present in the
# builder image, so the toolchain does not download anything) and explodes it into Boot's layers;
# stage 2 is a small, non-root JRE image. Layers change from least to most frequently so rebuilds
# only re-upload the application layer.

FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace

# --- dependency cache layer -----------------------------------------------------------------
COPY gradlew build.gradle.kts settings.gradle.kts gradle.properties ./
COPY gradle ./gradle
RUN chmod +x gradlew && ./gradlew --no-daemon --version >/dev/null
RUN ./gradlew --no-daemon --quiet resolveDependencies

# --- build -----------------------------------------------------------------------------------
COPY src ./src
RUN ./gradlew --no-daemon --quiet bootJar -x test
RUN java -Djarmode=tools -jar build/libs/app.jar extract --layers --destination extracted

# --- runtime ---------------------------------------------------------------------------------
FROM eclipse-temurin:25-jre-alpine AS runtime

RUN addgroup -S orenji && adduser -S -G orenji -h /app orenji
WORKDIR /app

COPY --from=build --chown=orenji:orenji /workspace/extracted/dependencies/ ./
COPY --from=build --chown=orenji:orenji /workspace/extracted/spring-boot-loader/ ./
COPY --from=build --chown=orenji:orenji /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=orenji:orenji /workspace/extracted/application/ ./

USER orenji

# SERVER_PORT is honoured by application.yml (Cloud Run injects PORT, which is also honoured).
ENV SERVER_PORT=8080 \
    JAVA_OPTS=""

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=45s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${SERVER_PORT}/actuator/health/liveness" >/dev/null || exit 1

ENTRYPOINT ["sh", "-c", "exec java -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError ${JAVA_OPTS} -jar app.jar"]
