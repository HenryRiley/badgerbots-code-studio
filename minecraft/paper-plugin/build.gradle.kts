plugins {
    java
}

group = "org.badgerbots"
version = "0.6.0-prototype"

repositories {
    mavenCentral()
    maven {
        name = "papermc"
        url = uri("https://repo.papermc.io/repository/maven-public/")
    }
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.11-R0.1-SNAPSHOT")
    testImplementation("io.papermc.paper:paper-api:1.21.11-R0.1-SNAPSHOT")
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

sourceSets {
    main {
        java.srcDirs("src/core/java", "src/paper/java")
    }
    test {
        java.srcDir("src/test/java")
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(21)
}

tasks.jar {
    archiveFileName.set("badgerbots-paper-plugin.jar")
    isPreserveFileTimestamps = false
    isReproducibleFileOrder = true
}

tasks.test {
    failOnNoDiscoveredTests = false
}

val paperSelfTest = tasks.register<JavaExec>("paperSelfTest") {
    dependsOn(tasks.testClasses)
    classpath = sourceSets.test.get().runtimeClasspath
    mainClass.set("org.badgerbots.studio.paper.InstructionGraphJsonSelfTest")
}

tasks.check {
    dependsOn(paperSelfTest)
}
