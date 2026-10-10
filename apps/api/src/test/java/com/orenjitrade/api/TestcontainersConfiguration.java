package com.orenjitrade.api;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * PostGIS and Redis containers for integration tests, wired into Spring Boot through {@link
 * ServiceConnection} (datasource URL/credentials and {@code spring.data.redis.*} are derived from
 * the running containers, overriding {@code application.yml}).
 *
 * <p>The containers are static singletons started once per JVM and shared by every test class, so a
 * full run costs one container start-up; Testcontainers' Ryuk reaper removes them when the JVM
 * exits. Import this class ({@code @Import(TestcontainersConfiguration.class)}) rather than nesting
 * it inside a test class, which Spring Framework 7.1 would treat as the sole context configuration.
 *
 * <p>{@code postgis/postgis} is published for linux/amd64 only, and no platform is requested here
 * on purpose. On an arm64 Docker engine (Apple Silicon) the engine refuses the first pull ("no
 * matching manifest for linux/arm64/v8", logged once as an error), Testcontainers then pulls
 * linux/amd64 by itself and the container runs emulated; amd64 hosts and CI never take that path.
 * docker-compose.yml has to name the platform because Compose has no such fallback.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    public static final String POSTGIS_IMAGE = "postgis/postgis:17-3.5";
    public static final String REDIS_IMAGE = "redis:7-alpine";
    public static final int REDIS_PORT = 6379;

    static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(
                            DockerImageName.parse(POSTGIS_IMAGE)
                                    .asCompatibleSubstituteFor("postgres"))
                    .withDatabaseName("orenjitrade_test");

    static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse(REDIS_IMAGE)).withExposedPorts(REDIS_PORT);

    static {
        POSTGRES.start();
        REDIS.start();
    }

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return POSTGRES;
    }

    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> redisContainer() {
        return REDIS;
    }
}
