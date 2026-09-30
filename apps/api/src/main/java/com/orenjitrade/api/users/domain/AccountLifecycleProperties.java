package com.orenjitrade.api.users.domain;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code orenji.account.*}.
 *
 * @param reauthWindow maximum age of the ID token's {@code auth_time} for a deletion request
 * @param deletionGraceDays days between a deletion request and the anonymising job
 * @param deletionBatchSize due requests processed per job run
 */
@ConfigurationProperties(prefix = "orenji.account")
public record AccountLifecycleProperties(
        @DefaultValue("5m") Duration reauthWindow,
        @DefaultValue("7") int deletionGraceDays,
        @DefaultValue("100") int deletionBatchSize) {}
