plugins {
    java
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.diffplug.spotless") version "8.10.3"
}

group = "com.orenjitrade"
version = "0.1.0"
description = "OrenjiTrade API - modular monolith backend"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

extra["springModulithVersion"] = "2.1.1"
extra["firebaseAdminVersion"] = "9.11.0"
extra["springdocVersion"] = "3.1.0"
extra["googleLibrariesBomVersion"] = "26.89.0"
extra["twelveMonkeysVersion"] = "3.15.2"

dependencies {
    // --- Spring Boot starters (Boot 4 naming) ---
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-websocket")

    // --- Persistence ---
    implementation("org.flywaydb:flyway-database-postgresql")
    implementation("org.hibernate.orm:hibernate-spatial")
    implementation("org.locationtech.jts:jts-core")
    runtimeOnly("org.postgresql:postgresql")

    // --- Domain events: Spring Modulith JDBC event publication registry (transactional outbox, ADR 0009) ---
    implementation("org.springframework.modulith:spring-modulith-starter-core")
    implementation("org.springframework.modulith:spring-modulith-starter-jdbc")

    // --- Identity: Firebase Admin SDK verifies ID tokens (ADR 0008 / ADR 0013) ---
    implementation("com.google.firebase:firebase-admin:${property("firebaseAdminVersion")}")

    // --- Media storage: Google Cloud Storage adapter (STORAGE_PROVIDER=gcs), versions from the
    //     Google Cloud libraries BOM (ADR 0013: client libraries, no Spring Cloud GCP) ---
    implementation(platform("com.google.cloud:libraries-bom:${property("googleLibrariesBomVersion")}"))
    implementation("com.google.cloud:google-cloud-storage")

    // --- Avatar processing: ImageIO WebP reader (the JDK only ships JPEG/PNG/GIF/BMP readers) ---
    implementation("com.twelvemonkeys.imageio:imageio-webp:${property("twelveMonkeysVersion")}")

    // --- OpenAPI (enabled per profile through orenji.openapi.enabled) ---
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:${property("springdocVersion")}")

    annotationProcessor("org.springframework.boot:spring-boot-configuration-processor")

    // --- Tests ---
    testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
    testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
    testImplementation("org.springframework.boot:spring-boot-starter-data-redis-test")
    testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-test")
    testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-websocket-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.springframework.modulith:spring-modulith-starter-test")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.modulith:spring-modulith-bom:${property("springModulithVersion")}")
    }
}

springBoot {
    // META-INF/build-info.properties -> BuildProperties bean -> /api/v1/meta version and /actuator/info.
    buildInfo {
        // Exclude the build timestamp so the jar stays reproducible and build-cacheable.
        excludes.set(setOf("time"))
    }
}

tasks.bootJar {
    archiveFileName.set("app.jar")
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.compilerArgs.addAll(listOf("-parameters", "-Xlint:deprecation"))
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    // One card image cache directory for every application context of a test JVM (they share the
    // Testcontainers database and therefore the cache accounting, ADR 0015). Stale files of an
    // earlier run are removed by the start-up reconciliation against the fresh database.
    systemProperty(
        "CARD_IMAGE_CACHE_DIR",
        layout.buildDirectory.dir("test-card-image-cache").get().asFile.absolutePath,
    )
    testLogging {
        events("failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

// Regular test run: everything except the OpenAPI export (which writes into docs/).
tasks.test {
    useJUnitPlatform {
        excludeTags("openapi")
    }
}

// ./gradlew exportOpenApi -> boots the app against Testcontainers and writes docs/api/openapi.json.
tasks.register<Test>("exportOpenApi") {
    description = "Exports the OpenAPI contract to docs/api/openapi.json (requires Docker)."
    group = "documentation"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform {
        includeTags("openapi")
    }
    systemProperty(
        "orenji.openapi.export.file",
        layout.projectDirectory.file("../../docs/api/openapi.json").asFile.absolutePath,
    )
    outputs.upToDateWhen { false }
    shouldRunAfter(tasks.test)
}

// Used by the Dockerfile to warm the dependency cache layer before the sources are copied.
tasks.register("resolveDependencies") {
    description = "Downloads every compile/runtime/test dependency (Docker layer caching)."
    group = "build setup"
    doLast {
        listOf("compileClasspath", "runtimeClasspath", "testCompileClasspath", "testRuntimeClasspath", "annotationProcessor")
            .mapNotNull { configurations.findByName(it) }
            .forEach { it.resolve() }
    }
}

spotless {
    java {
        target("src/**/*.java")
        // 1.28.0 is the newest release that runs on the JDK 17 that contributors may use for Gradle itself.
        googleJavaFormat("1.28.0").aosp().reflowLongStrings()
        removeUnusedImports()
        trimTrailingWhitespace()
        endWithNewline()
    }
}

tasks.check {
    dependsOn(tasks.spotlessCheck)
}
