package dev.genshinboard.lore;

import java.time.Instant;
import java.util.List;

/**
 * Trimmed lore data for the quiz, built from genshin-db (https://github.com/theBowja/genshin-db).
 *
 * @param version format version; caches older than {@link #CURRENT_VERSION} are re-downloaded
 */
public record Lore(int version, Instant fetchedAt, List<CharacterLore> characters, List<WeaponLore> weapons,
                   List<ArtifactSetLore> artifactSets) {

    public static final int CURRENT_VERSION = 2;

    public static Lore empty() {
        return new Lore(CURRENT_VERSION, null, List.of(), List.of(), List.of());
    }

    /**
     * Any field may be null when the source doesn't have it.
     *
     * @param constellation  the star constellation's name, e.g. "Papilio Charontis"
     * @param constellations names of C1 to C6
     * @param utilityPassive the third passive talent (usually a fun out-of-combat perk)
     * @param icons          talent and constellation icons unique to this character
     * @param namecard       file name of the character's name card art
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
            String specialtyDish,
            List<IconLore> icons,
            String namecard) {}

    /**
     * @param kind "skill", "burst", "passive" or "constellation"
     * @param file icon file name, served from https://enka.network/ui/{file}.png
     */
    public record IconLore(String kind, String name, String file) {}

    public record WeaponLore(String name, int rarity, String type, String description, String icon) {}

    public record ArtifactSetLore(String name, List<ArtifactPieceLore> pieces) {}

    public record ArtifactPieceLore(String slot, String name, String icon) {}
}
