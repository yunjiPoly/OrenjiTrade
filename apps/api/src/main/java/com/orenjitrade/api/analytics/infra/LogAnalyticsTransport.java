package com.orenjitrade.api.analytics.infra;

import com.orenjitrade.api.analytics.domain.AnalyticsEvent;
import com.orenjitrade.api.analytics.domain.AnalyticsTransport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

/**
 * Default transport ({@code EVENTS_TRANSPORT=local}): one INFO line per event on the logger {@value
 * #LOGGER}, {@code analytics <json>} with the BigQuery column names, so local development needs no
 * Google Cloud resource. The events are already free of PII and coordinates.
 */
public class LogAnalyticsTransport implements AnalyticsTransport {

    /** Logger name of the analytics lines (filterable in any log backend). */
    public static final String LOGGER = "orenji.analytics";

    /** Prefix of every analytics line. */
    public static final String PREFIX = "analytics ";

    private static final Logger log = LoggerFactory.getLogger(LOGGER);

    private final JsonMapper jsonMapper;

    public LogAnalyticsTransport(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    @Override
    public String name() {
        return "log";
    }

    @Override
    public void send(AnalyticsEvent event) {
        log.info("{}{}", PREFIX, jsonMapper.writeValueAsString(event));
    }
}
