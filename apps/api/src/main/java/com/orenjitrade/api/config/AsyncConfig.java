package com.orenjitrade.api.config;

import com.orenjitrade.api.common.MdcTaskDecorator;
import com.orenjitrade.api.common.RequestIdFilter;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Bounded application executor for {@code @Async} methods, Spring Modulith's {@code
 * @ApplicationModuleListener}s and Spring MVC async requests. Tasks inherit the caller's MDC
 * (request id) through {@link MdcTaskDecorator}. Declared as {@code applicationTaskExecutor} so
 * Spring Boot's auto-configured executor backs off.
 */
@Configuration(proxyBeanMethods = false)
@EnableAsync
@EnableConfigurationProperties(AsyncProperties.class)
public class AsyncConfig {

    public static final String APPLICATION_TASK_EXECUTOR = "applicationTaskExecutor";

    private static final Logger log = LoggerFactory.getLogger(AsyncConfig.class);

    @Bean(name = {APPLICATION_TASK_EXECUTOR, "taskExecutor"})
    ThreadPoolTaskExecutor applicationTaskExecutor(AsyncProperties properties) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(properties.coreSize());
        executor.setMaxPoolSize(properties.maxSize());
        executor.setQueueCapacity(properties.queueCapacity());
        executor.setThreadNamePrefix(properties.threadNamePrefix());
        executor.setTaskDecorator(new MdcTaskDecorator());
        // Back-pressure instead of dropping work when the pool and queue are saturated.
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds((int) properties.awaitTermination().toSeconds());
        return executor;
    }

    @Bean
    AsyncConfigurer asyncConfigurer(@Qualifier(APPLICATION_TASK_EXECUTOR) Executor executor) {
        return new AsyncConfigurer() {
            @Override
            public Executor getAsyncExecutor() {
                return executor;
            }

            @Override
            public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
                return (ex, method, params) ->
                        log.error(
                                "Uncaught exception in async method {} requestId={}",
                                method.getName(),
                                MDC.get(RequestIdFilter.MDC_KEY),
                                ex);
            }
        };
    }
}
