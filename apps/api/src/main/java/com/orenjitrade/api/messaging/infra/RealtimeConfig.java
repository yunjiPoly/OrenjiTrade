package com.orenjitrade.api.messaging.infra;

import com.orenjitrade.api.config.OrenjiSecurityProperties;
import com.orenjitrade.api.messaging.domain.RealtimeDestinations;
import java.security.Principal;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;
import tools.jackson.databind.json.JsonMapper;

/**
 * Realtime channel (Phase 5 contract "Realtime"): STOMP over native WebSocket at {@code /ws} (no
 * SockJS), an in-memory simple broker for {@code /queue} per instance, user destinations under
 * {@code /user}, application destinations under {@code /app}, server heartbeats every 20 s, and the
 * Redis subscription {@code rt:user:*} that forwards cross-instance publications to the local
 * sessions. Allowed origins are the CORS origins of {@code orenji.security.cors}.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSocketMessageBroker
public class RealtimeConfig implements WebSocketMessageBrokerConfigurer, DisposableBean {

    public static final String ENDPOINT = "/ws";
    static final long HEARTBEAT_MILLIS = 20_000;
    static final int MESSAGE_SIZE_LIMIT = 64 * 1024;

    private final OrenjiSecurityProperties security;
    private final TokenHandshakeInterceptor handshakeInterceptor;
    private final StompSecurityInterceptor stompInterceptor;
    private final ThreadPoolTaskScheduler heartbeatScheduler;

    public RealtimeConfig(
            OrenjiSecurityProperties security,
            TokenHandshakeInterceptor handshakeInterceptor,
            StompSecurityInterceptor stompInterceptor) {
        this.security = security;
        this.handshakeInterceptor = handshakeInterceptor;
        this.stompInterceptor = stompInterceptor;
        // Private scheduler (not a bean) so it never becomes the @Scheduled task scheduler.
        this.heartbeatScheduler = new ThreadPoolTaskScheduler();
        this.heartbeatScheduler.setPoolSize(1);
        this.heartbeatScheduler.setThreadNamePrefix("ws-heartbeat-");
        this.heartbeatScheduler.setDaemon(true);
        this.heartbeatScheduler.initialize();
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint(ENDPOINT)
                .setAllowedOriginPatterns(security.cors().allowedOrigins().toArray(String[]::new))
                .setHandshakeHandler(new PrincipalHandshakeHandler())
                .addInterceptors(handshakeInterceptor);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue", "/topic")
                .setHeartbeatValue(new long[] {HEARTBEAT_MILLIS, HEARTBEAT_MILLIS})
                .setTaskScheduler(heartbeatScheduler);
        registry.setApplicationDestinationPrefixes(RealtimeDestinations.APP_PREFIX);
        registry.setUserDestinationPrefix(RealtimeDestinations.USER_PREFIX);
        registry.setPreservePublishOrder(true);
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(stompInterceptor);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.setMessageSizeLimit(MESSAGE_SIZE_LIMIT);
    }

    /** Subscribes this instance to every account channel of the realtime fan-out. */
    @Bean
    RedisMessageListenerContainer realtimeListenerContainer(
            RedisConnectionFactory connectionFactory,
            SimpMessagingTemplate brokerMessagingTemplate,
            JsonMapper jsonMapper) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(
                new RealtimeRedisListener(brokerMessagingTemplate, jsonMapper),
                new PatternTopic(RedisRealtimePublisher.CHANNEL_PREFIX + "*"));
        return container;
    }

    @Override
    public void destroy() {
        heartbeatScheduler.shutdown();
    }

    /** The session principal is the account authenticated by the handshake interceptor. */
    static final class PrincipalHandshakeHandler extends DefaultHandshakeHandler {

        @Override
        protected @Nullable Principal determineUser(
                ServerHttpRequest request,
                WebSocketHandler wsHandler,
                Map<String, Object> attributes) {
            Object user = attributes.get(TokenHandshakeInterceptor.USER_ATTRIBUTE);
            return user instanceof Principal principal ? principal : null;
        }
    }
}
