plugins {
    // Auto-provisions the JDK required by the Java toolchain (JDK 21) when it is not installed locally.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "api"
