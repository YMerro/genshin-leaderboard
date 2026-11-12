package dev.genshinboard.friends;

import java.time.Instant;

/** A player on the leaderboard. {@code label} is an optional name you chose, e.g. "Sam". */
public record Friend(String uid, String label, Instant addedAt) {}
