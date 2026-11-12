package dev.genshinboard.config;

import java.nio.file.Path;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Path dataDir, Enka enka, Store store) {

    public record Enka(String baseUrl, String userAgent, Duration minCacheTtl, Duration timeout) {}

    public record Store(String baseUrl, Duration refreshAfter) {}
}
