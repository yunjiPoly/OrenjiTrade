# ADR 0007 — Java 21 + Spring Boot 4.1 backend

**Status:** Accepted · **Date:** 2026-09-29

## Context
Spec mandates Java LTS + Spring Boot. Spring Boot 3.5 left OSS support in mid-2026; 4.x is the
supported line and brings Spring Framework 7, Security 7, Hibernate 7, Jackson 3, modular test
starters, and native Testcontainers 2 integration.

## Decision
Java 21 (toolchain auto-provisioned by Gradle's foojay resolver; since 2026-10-04 Gradle itself
must also run on JDK 21+, because Spotless uses google-java-format 1.30), Spring Boot 4.1.x, Gradle 9 Kotlin DSL. Starters: `webmvc`, `data-jpa`,
`security`, `validation`, `actuator`, `data-redis`, `websocket`, `flyway`; `springdoc-openapi`
3.x for the spec (enabled outside production only); Spring Modulith for events; Firebase Admin
SDK; Google Cloud client libraries (ADR 0013); `hibernate-spatial` + JTS for PostGIS types.
Testing: JUnit 6, AssertJ, Mockito, Testcontainers 2 with `postgis/postgis:17-3.5`.

## Consequences
- Contributors must know Boot 4 differences (Jackson `tools.jackson.*`, per-module test
  starters, `PathPatternRequestMatcher`). Documented in `CLAUDE.md`.
- Java 25 upgrade is a toolchain version bump.
