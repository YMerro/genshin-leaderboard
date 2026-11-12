package dev.genshinboard.wishes;

/**
 * One wish. {@code id} is HoYoverse's ID, which increases with time, so it doubles as the sort key.
 *
 * @param gachaType 100 beginner, 200 standard, 301/400 character event, 302 weapon, 500 chronicled
 */
public record Pull(String id, String uid, String gachaType, String name, String itemType, int rank, String time) {}
