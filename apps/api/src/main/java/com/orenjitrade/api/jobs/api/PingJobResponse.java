package com.orenjitrade.api.jobs.api;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** Response of {@code POST /internal/jobs/ping}. */
@Schema(name = "PingJobResponse")
public record PingJobResponse(@Schema(requiredMode = RequiredMode.REQUIRED) boolean ok) {}
