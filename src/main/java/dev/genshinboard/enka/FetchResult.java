package dev.genshinboard.enka;

import java.time.Instant;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * A raw Enka profile response.
 *
 * @param warning set when Enka failed and this is an older cached copy
 */
public record FetchResult(JsonNode body, Instant fetchedAt, String warning) {}
