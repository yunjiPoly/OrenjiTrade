package com.orenjitrade.api;

import org.junit.jupiter.api.Test;

/** Health probes used by Cloud Run / Docker and the public info endpoint. */
class ActuatorIT extends AbstractIntegrationTest {

    @Test
    void livenessIsUp() {
        http.get()
                .uri("/actuator/health/liveness")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.status")
                .isEqualTo("UP");
    }

    @Test
    void readinessIsUpWithDatabaseAndRedis() {
        http.get()
                .uri("/actuator/health/readiness")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.status")
                .isEqualTo("UP")
                .jsonPath("$.components.db.status")
                .isEqualTo("UP")
                .jsonPath("$.components.redis.status")
                .isEqualTo("UP");
    }

    @Test
    void overallHealthIsUp() {
        http.get()
                .uri("/actuator/health")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.status")
                .isEqualTo("UP");
    }

    @Test
    void infoExposesBuildVersion() {
        http.get()
                .uri("/actuator/info")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.build.version")
                .isEqualTo("0.1.0")
                .jsonPath("$.build.artifact")
                .isEqualTo("api");
    }
}
