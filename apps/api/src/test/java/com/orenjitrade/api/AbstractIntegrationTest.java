package com.orenjitrade.api;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.client.RestTestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Base class for integration tests: boots the whole application on a random port with the {@code
 * test} profile against PostGIS and Redis containers.
 *
 * <p>The containers are static singletons started once per JVM and shared by every test class
 * (Spring caches the application context as well), which keeps a full run at one container
 * start-up. Testcontainers' Ryuk reaper removes them when the JVM exits. Docker is required.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@AutoConfigureRestTestClient
@Import(AbstractIntegrationTest.ContainersConfiguration.class)
public abstract class AbstractIntegrationTest {

    public static final String POSTGIS_IMAGE = "postgis/postgis:17-3.5";
    public static final String REDIS_IMAGE = "redis:7-alpine";
    public static final int REDIS_PORT = 6379;

    protected static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(
                            DockerImageName.parse(POSTGIS_IMAGE).asCompatibleSubstituteFor("postgres"))
                    .withDatabaseName("orenjitrade_test");

    protected static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse(REDIS_IMAGE)).withExposedPorts(REDIS_PORT);

    static {
        POSTGRES.start();
        REDIS.start();
    }

    /** Client bound to the running server (random port). */
    @Autowired protected RestTestClient http;

    /** Wires the singleton containers into Spring Boot's service connections. */
    @TestConfiguration(proxyBeanMethods = false)
    static class ContainersConfiguration {

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
}
