package com.orenjitrade.api.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import tools.jackson.databind.json.JsonMapper;

/** Standalone MockMvc test of the advice; no Spring Boot context, no security filter chain. */
class ProblemDetailsExceptionHandlerTest {

    private static final Instant FROZEN = Instant.parse("2026-09-29T10:15:30Z");
    private static final String REQUEST_ID = "unit-test-request-id";

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ProblemDetailFactory factory =
                new ProblemDetailFactory(TimeProvider.fixed(FROZEN), JsonMapper.builder().build());
        mockMvc =
                MockMvcBuilders.standaloneSetup(new ProbeController())
                        .setControllerAdvice(new ProblemDetailsExceptionHandler(factory))
                        .build();
        MDC.put(RequestIdFilter.MDC_KEY, REQUEST_ID);
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
        SecurityContextHolder.clearContext();
    }

    @Test
    void apiExceptionBecomesProblemWithExtensions() throws Exception {
        mockMvc.perform(get("/probe/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("https://api.orenjitrade.com/problems/not-found"))
                .andExpect(jsonPath("$.title").value("Not found"))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("Card not found"))
                .andExpect(jsonPath("$.instance").value("/probe/not-found"))
                .andExpect(jsonPath("$.errorCode").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Card not found"))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                .andExpect(jsonPath("$.timestamp").value(FROZEN.toString()))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    @Test
    void apiValidationExceptionCarriesFieldErrors() throws Exception {
        mockMvc.perform(get("/probe/validation-exception"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].field").value("name"))
                .andExpect(jsonPath("$.errors[0].message").value("must not be blank"));
    }

    @Test
    void methodArgumentNotValidListsEveryField() throws Exception {
        mockMvc.perform(
                        post("/probe/validate")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"name\":\"\",\"quantity\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                .andExpect(jsonPath("$.timestamp").value(FROZEN.toString()))
                .andExpect(jsonPath("$.errors.length()").value(2))
                .andExpect(jsonPath("$.errors[0].field").value("name"))
                .andExpect(jsonPath("$.errors[1].field").value("quantity"));
    }

    @Test
    void malformedJsonIsValidationFailedWithoutParserDetails() throws Exception {
        String body =
                mockMvc.perform(
                                post("/probe/validate")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"name\": "))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
                        .andExpect(jsonPath("$.message").value("Request body is missing or malformed"))
                        .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        assertThat(body).doesNotContain("Exception").doesNotContain("jackson");
    }

    @Test
    void unsupportedMediaTypeIsMapped() throws Exception {
        mockMvc.perform(post("/probe/validate").contentType(MediaType.TEXT_PLAIN).content("hello"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(header().exists(HttpHeaders.ACCEPT))
                .andExpect(jsonPath("$.errorCode").value("UNSUPPORTED_MEDIA_TYPE"))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID));
    }

    @Test
    void constraintViolationIsValidationFailed() throws Exception {
        mockMvc.perform(get("/probe/constraint"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("Validation failed"));
    }

    @Test
    void dataIntegrityViolationIsConflictWithoutSql() throws Exception {
        String body =
                mockMvc.perform(get("/probe/conflict"))
                        .andExpect(status().isConflict())
                        .andExpect(jsonPath("$.errorCode").value("CONFLICT"))
                        .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        assertThat(body).doesNotContain("duplicate key").doesNotContain("uk_card_name");
    }

    @Test
    void unexpectedExceptionIsInternalErrorWithoutLeakingDetails() throws Exception {
        String body =
                mockMvc.perform(get("/probe/boom"))
                        .andExpect(status().isInternalServerError())
                        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                        .andExpect(jsonPath("$.errorCode").value("INTERNAL_ERROR"))
                        .andExpect(jsonPath("$.message").value("An unexpected error occurred"))
                        .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                        .andExpect(jsonPath("$.timestamp").value(FROZEN.toString()))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        assertThat(body)
                .doesNotContain("secret internal detail")
                .doesNotContain("IllegalStateException")
                .doesNotContain("ProbeController");
    }

    @Test
    void accessDeniedForAnonymousIsUnauthenticated() throws Exception {
        mockMvc.perform(get("/probe/denied"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer realm=\"OrenjiTrade\""))
                .andExpect(jsonPath("$.errorCode").value("UNAUTHENTICATED"));
    }

    @Test
    void accessDeniedForAuthenticatedUserIsForbidden() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("alice", "n/a", "ROLE_USER"));

        mockMvc.perform(get("/probe/denied"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("FORBIDDEN"))
                .andExpect(jsonPath("$.message").value("You do not have permission to perform this action"));
    }

    @Test
    void authenticationExceptionIsUnauthenticated() throws Exception {
        mockMvc.perform(get("/probe/bad-credentials"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("UNAUTHENTICATED"));
    }

    @Test
    void maxUploadSizeIsPayloadTooLarge() throws Exception {
        mockMvc.perform(get("/probe/too-large"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.errorCode").value("PAYLOAD_TOO_LARGE"))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID));
    }

    @Test
    void unknownRouteIsNotFound() throws Exception {
        mockMvc.perform(get("/probe/nope"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("NOT_FOUND"))
                .andExpect(jsonPath("$.instance").value("/probe/nope"))
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID));
    }

    @Test
    void frameworkHandledExceptionsAreEnrichedToo() throws Exception {
        mockMvc.perform(delete("/probe/not-found"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.status").value(405))
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.requestId").value(REQUEST_ID))
                .andExpect(jsonPath("$.timestamp").value(FROZEN.toString()));
    }

    record ProbeRequest(@NotBlank String name, @Min(1) int quantity) {}

    @RestController
    @RequestMapping("/probe")
    static class ProbeController {

        @GetMapping("/not-found")
        void notFound() {
            throw ApiException.notFound("Card not found");
        }

        @GetMapping("/validation-exception")
        void validationException() {
            throw ApiException.validation(
                    "Validation failed", List.of(new ProblemFieldError("name", "must not be blank")));
        }

        @PostMapping(value = "/validate", consumes = MediaType.APPLICATION_JSON_VALUE)
        Map<String, String> validate(@Valid @RequestBody ProbeRequest request) {
            return Map.of("name", request.name());
        }

        @GetMapping("/constraint")
        void constraint() {
            throw new ConstraintViolationException("invalid", Set.of());
        }

        @GetMapping("/conflict")
        void conflict() {
            throw new DataIntegrityViolationException(
                    "duplicate key value violates unique constraint \"uk_card_name\"");
        }

        @GetMapping("/boom")
        void boom() {
            throw new IllegalStateException("secret internal detail");
        }

        @GetMapping("/denied")
        void denied() {
            throw new AccessDeniedException("not yours");
        }

        @GetMapping("/bad-credentials")
        void badCredentials() {
            throw new BadCredentialsException("token expired");
        }

        @GetMapping("/too-large")
        void tooLarge() {
            throw new MaxUploadSizeExceededException(1024);
        }
    }
}
