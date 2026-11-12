package dev.genshinboard.lore;

import java.time.Instant;
import java.util.List;

/** Trimmed lore data for the quiz, built from genshin-db (https://github.com/theBowja/genshin-db). */
public record Lore(Instant fetchedAt, List<CharacterLore> characters, List<WeaponLore> weapons) {

    public static Lore empty() {
        return new Lore(null, List.of(), List.of());
    }

    /**
     * Any field may be null when the source doesn't have it.
     *
     * @param constellation the star constellation's name, e.g. "Papilio Charontis"
     * @param constellations names of C1 to C6
     * @param utilityPassive the third passive talent (usually a fun out-of-combat perk)
     */
    public record CharacterLore(
            String name,
            String title,
            String description,
            String birthday,
            String affiliation,
            String region,
            String constellation,
            String voiceEnglish,
            String voiceJapanese,
            String skill,
            String burst,
            String utilityPassive,
            List<String> constellations,
            String specialtyDish) {}

    public record WeaponLore(String name, int rarity, String type, String description) {}
}
