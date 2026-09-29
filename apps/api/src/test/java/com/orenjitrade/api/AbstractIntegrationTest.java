package com.orenjitrade.api;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * Base class for integration tests: boots the whole application on a random port with the {@code
 * test} profile against the PostGIS and Redis containers of {@link TestcontainersConfiguration}.
 * Spring caches the application context across subclasses, so the whole suite starts one
 * application and one pair of containers. Docker is required.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@AutoConfigureRestTestClient
@Import(TestcontainersConfiguration.class)
public abstract class AbstractIntegrationTest {

    /** Client bound to the running server (random port). */
    @Autowired protected RestTestClient http;
}
