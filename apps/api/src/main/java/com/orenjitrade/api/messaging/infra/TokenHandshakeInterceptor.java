package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.messaging.infra.RealtimeAuthenticator.RealtimeAuthenticationException;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Authenticates the WebSocket handshake of {@code /ws} when it carries an ID token ({@code
 * Authorization: Bearer} header or {@code ?access_token=}, which browsers need because they cannot
 * set headers on WebSocket requests). An invalid token ends the handshake with 401 (403 for
 * suspended or deleted accounts). Without a token the handshake proceeds and the STOMP CONNECT
 * frame must authenticate ({@link StompSecurityInterceptor}). The token is never logged.
 */
@Component
public class TokenHandshakeInterceptor implements HandshakeInterceptor {

    /** Handshake attribute holding the {@link AuthenticatedUser}. */
    public static final String USER_ATTRIBUTE = "orenji.realtime.user";

    static final String ACCESS_TOKEN_PARAM = "access_token";

    private static final Logger log = LoggerFactory.getLogger(TokenHandshakeInterceptor.class);

    private final RealtimeAuthenticator authenticator;

    public TokenHandshakeInterceptor(RealtimeAuthenticator authenticator) {
        this.authenticator = authenticator;
    }

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes) {
        @Nullable String token = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (token == null) {
            token =
                    UriComponentsBuilder.fromUri(request.getURI())
                            .build(true)
                            .getQueryParams()
                            .getFirst(ACCESS_TOKEN_PARAM);
            if (token != null) {
                token = java.net.URLDecoder.decode(token, java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        if (token == null) {
            return true;
        }
        try {
            attributes.put(USER_ATTRIBUTE, authenticator.authenticate(token));
            return true;
        } catch (RealtimeAuthenticationException e) {
            log.debug("Realtime handshake refused: {}", e.getMessage());
            response.setStatusCode(e.status());
            return false;
        }
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            @Nullable Exception exception) {
        // nothing to do
    }
}
