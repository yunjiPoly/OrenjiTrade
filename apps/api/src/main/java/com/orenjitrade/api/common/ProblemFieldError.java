package com.orenjitrade.api.common;

/**
 * One entry of the {@code errors} extension of a validation problem: which field failed and a
 * client-safe message explaining why.
 */
public record ProblemFieldError(String field, String message) {}
