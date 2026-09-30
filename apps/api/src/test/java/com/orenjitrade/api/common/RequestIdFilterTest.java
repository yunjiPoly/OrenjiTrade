package com.orenjitrade.api.common;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void echoesSafeIncomingHeaderAndPutsItInMdc() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/meta");
        request.addHeader(RequestIdFilter.HEADER, "trace-abc.123_x~y");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> mdcDuringChain = new AtomicReference<>();
        AtomicReference<String> headerDuringChain = new AtomicReference<>();
        FilterChain chain =
                (req, res) -> {
                    mdcDuringChain.set(MDC.get(RequestIdFilter.MDC_KEY));
                    headerDuringChain.set(
                            ((MockHttpServletResponse) res).getHeader(RequestIdFilter.HEADER));
                };

        filter.doFilter(request, response, chain);

        assertThat(mdcDuringChain.get()).isEqualTo("trace-abc.123_x~y");
        assertThat(headerDuringChain.get())
                .as("header must be set before the chain so early error responses carry it")
                .isEqualTo("trace-abc.123_x~y");
        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo("trace-abc.123_x~y");
        assertThat(request.getAttribute(RequestIdFilter.REQUEST_ATTRIBUTE))
                .isEqualTo("trace-abc.123_x~y");
        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).as("MDC cleared after the request").isNull();
    }

    @Test
    void generatesUuidWhenHeaderIsAbsent() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/meta");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        String requestId = response.getHeader(RequestIdFilter.HEADER);
        assertThat(requestId).isNotNull();
        assertThat(UUID.fromString(requestId)).isNotNull();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "has space",
                "semi;colon",
                "<script>alert(1)</script>",
                "line\nbreak",
                "0123456789012345678901234567890123456789012345678901234567890123x" // 65 chars
            })
    void replacesUnsafeHeaderWithUuid(String unsafe) throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/meta");
        request.addHeader(RequestIdFilter.HEADER, unsafe);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        String requestId = response.getHeader(RequestIdFilter.HEADER);
        assertThat(requestId).isNotNull().isNotEqualTo(unsafe);
        assertThat(UUID.fromString(requestId)).isNotNull();
    }

    @Test
    void acceptsHeaderOfExactlyMaxLength() throws ServletException, IOException {
        String id = "a".repeat(RequestIdFilter.MAX_LENGTH);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/meta");
        request.addHeader(RequestIdFilter.HEADER, id);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo(id);
    }

    @Test
    void reusesIdOnErrorDispatchOfSameRequest() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/meta");
        request.setAttribute(RequestIdFilter.REQUEST_ATTRIBUTE, "already-assigned");
        request.addHeader(RequestIdFilter.HEADER, "other-header-value");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> mdcDuringChain = new AtomicReference<>();

        filter.doFilter(
                request,
                response,
                (req, res) -> mdcDuringChain.set(MDC.get(RequestIdFilter.MDC_KEY)));

        assertThat(mdcDuringChain.get()).isEqualTo("already-assigned");
        assertThat(response.getHeader(RequestIdFilter.HEADER)).isEqualTo("already-assigned");
    }

    @Test
    void restoresPreviousMdcValue() throws ServletException, IOException {
        MDC.put(RequestIdFilter.MDC_KEY, "outer");
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/meta");
        request.addHeader(RequestIdFilter.HEADER, "inner");

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {});

        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isEqualTo("outer");
    }

    @Test
    void filtersAsyncAndErrorDispatches() {
        assertThat(filter.shouldNotFilterAsyncDispatch()).isFalse();
        assertThat(filter.shouldNotFilterErrorDispatch()).isFalse();
    }
}
