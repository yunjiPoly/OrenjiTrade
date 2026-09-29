package com.orenjitrade.api.common;

import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

/**
 * Copies the submitting thread's MDC (notably {@code requestId}) onto the thread that executes an
 * async task and restores the previous MDC afterwards, so background log lines stay correlated with
 * the HTTP request that triggered them.
 */
public final class MdcTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable runnable) {
        @Nullable Map<String, String> captured = MDC.getCopyOfContextMap();
        return () -> {
            @Nullable Map<String, String> previous = MDC.getCopyOfContextMap();
            replace(captured);
            try {
                runnable.run();
            } finally {
                replace(previous);
            }
        };
    }

    private static void replace(@Nullable Map<String, String> context) {
        if (context == null) {
            MDC.clear();
        } else {
            MDC.setContextMap(context);
        }
    }
}
