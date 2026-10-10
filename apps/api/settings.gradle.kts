plugins {
    // Auto-provisions JDK 21 when it is not installed locally: for the Java toolchain (compilation,
    // tests, bootRun) and for the Gradle daemon itself, whose JVM is pinned in
    // gradle/gradle-daemon-jvm.properties (written by `./gradlew updateDaemonJvm --jvm-version=21`).
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "api"
