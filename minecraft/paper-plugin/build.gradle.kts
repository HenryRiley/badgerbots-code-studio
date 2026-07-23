plugins {
    java
}

group = "org.badgerbots"
version = "0.1.0-checkpoint3"

repositories {
    maven {
        name = "papermc"
        url = uri("https://repo.papermc.io/repository/maven-public/")
        mavenContent { snapshotsOnly() }
    }
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.11-R0.1-SNAPSHOT")
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

sourceSets {
    main {
        java.srcDirs("src/core/java", "src/paper/java")
        resources.srcDir("src/main/resources")
    }
    test {
        java.srcDir("src/test/java")
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(21)
}
