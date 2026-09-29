package com.orenjitrade.api.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gives every request a correlation id.
 *
 * <p>An incoming {@code X-Request-Id} is honoured when it is at most {@value #MAX_LENGTH}
 * characters of a safe charset (letters, digits, {@code . _ ~ -}); anything else is replaced by a
 * random UUID so untrusted input never reaches logs or headers unchanged. The id is exposed as the
 * {@code X-Request-Id} response header (set before the chain runs, so error responses written by
 * Spring Security carry it too), stored as a request attribute and put in the MDC under {@value
 * #MDC_KEY} for the whole dispatch, including async and error dispatches.
 *
 * <p>Registered with the highest precedence so it runs before the security filter chain.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";
    public static final String REQUEST_ATTRIBUTE = RequestIdFilter.class.getName() + ".requestId";
    public static final int MAX_LENGTH = 64;

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9._~-]{1," + MAX_LENGTH + "}$");

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String requestId = resolveRequestId(request);
        request.setAttribute(REQUEST_ATTRIBUTE, requestId);
        response.setHeader(HEADER, requestId);
        @Nullable String previous = MDC.get(MDC_KEY);
        MDC.put(MDC_KEY, requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            if (previous == null) {
                MDC.remove(MDC_KEY);
            } else {
                MDC.put(MDC_KEY, previous);
            }
        }
    }

    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        // Re-populate the MDC on the thread that completes an async request.
        return false;
    }

    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        // Re-populate the MDC when the container forwards to /error.
        return false;
    }

    private static String resolveRequestId(HttpServletRequest request) {
        if (request.getAttribute(REQUEST_ATTRIBUTE) instanceof String existing) {
            return existing; // async or error dispatch of a request we already tagged
        }
        return resolveRequestId(request.getHeader(HEADER));
    }

    /** Returns the header value when it is safe to reuse, otherwise a fresh UUID. */
    static String resolveRequestId(@Nullable String header) {
        if (header != null && SAFE_ID.matcher(header).matches()) {
            return header;
        }
        return UUID.randomUUID().toString();
    }
}
