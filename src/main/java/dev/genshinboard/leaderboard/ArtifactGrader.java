package dev.genshinboard.leaderboard;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;

import dev.genshinboard.enka.GameData;
import dev.genshinboard.leaderboard.PlayerSummary.Artifact;
import dev.genshinboard.leaderboard.PlayerSummary.Substat;

/**
 * Grades a character's artifacts by how many substat rolls went into stats that character uses.
 *
 * <p>Each roll is listed in {@code reliquary.appendPropIdList} as an ID like {@code 501224}:
 * rarity (5), depot (01), stat code (22 = Crit DMG) and tier (4 = 100% of the max roll; tiers
 * 1-3 are 70/80/90%). That gives exact roll counts per substat.
 *
 * <p>Score = sum over useful substats of value / max single roll, so one max-tier crit roll is
 * 1.0. Useful stats are Crit Rate, Crit DMG, the character's scaling stat (inferred from their
 * sands/goblet/circlet main stats) and Energy Recharge when they clearly build it.
 */
final class ArtifactGrader {

    /** Characters at or above this ER are treated as needing it. */
    static final double ER_FOCUS_THRESHOLD = 140;

    enum Sub {
        HP("FIGHT_PROP_HP", 2, "HP", false, 298.75, 239.0),
        HP_PERCENT("FIGHT_PROP_HP_PERCENT", 3, "HP%", true, 5.83, 4.66),
        ATK("FIGHT_PROP_ATTACK", 5, "ATK", false, 19.45, 15.56),
        ATK_PERCENT("FIGHT_PROP_ATTACK_PERCENT", 6, "ATK%", true, 5.83, 4.66),
        DEF("FIGHT_PROP_DEFENSE", 8, "DEF", false, 23.15, 18.52),
        DEF_PERCENT("FIGHT_PROP_DEFENSE_PERCENT", 9, "DEF%", true, 7.29, 5.83),
        CRIT_RATE("FIGHT_PROP_CRITICAL", 20, "Crit Rate", true, 3.89, 3.11),
        CRIT_DMG("FIGHT_PROP_CRITICAL_HURT", 22, "Crit DMG", true, 7.77, 6.22),
        ENERGY_RECHARGE("FIGHT_PROP_CHARGE_EFFICIENCY", 23, "ER", true, 6.48, 5.18),
        ELEMENTAL_MASTERY("FIGHT_PROP_ELEMENT_MASTERY", 24, "EM", false, 23.31, 18.65);

        final String propId;
        final int code;
        final String label;
        final boolean percent;
        final double max5;
        final double max4;

        Sub(String propId, int code, String label, boolean percent, double max5, double max4) {
            this.propId = propId;
            this.code = code;
            this.label = label;
            this.percent = percent;
            this.max5 = max5;
            this.max4 = max4;
        }

        boolean isFlat() {
            return this == HP || this == ATK || this == DEF;
        }

        double maxRoll(int rarity) {
            return rarity >= 5 ? max5 : max4;
        }

        static Sub byPropId(String propId) {
            for (Sub s : values()) {
                if (s.propId.equals(propId)) return s;
            }
            return null;
        }

        static Sub byCode(int code) {
            for (Sub s : values()) {
                if (s.code == code) return s;
            }
            return null;
        }
    }

    private static final Map<String, String> SLOTS = Map.of(
            "EQUIP_BRACER", "Flower", "EQUIP_NECKLACE", "Plume", "EQUIP_SHOES", "Sands",
            "EQUIP_RING", "Goblet", "EQUIP_DRESS", "Circlet");
    private static final List<String> SLOT_ORDER = List.of("Flower", "Plume", "Sands", "Goblet", "Circlet");

    private static final Map<String, String> MAIN_STAT_NAMES = Map.ofEntries(
            Map.entry("FIGHT_PROP_HP", "HP"),
            Map.entry("FIGHT_PROP_HP_PERCENT", "HP%"),
            Map.entry("FIGHT_PROP_ATTACK", "ATK"),
            Map.entry("FIGHT_PROP_ATTACK_PERCENT", "ATK%"),
            Map.entry("FIGHT_PROP_DEFENSE_PERCENT", "DEF%"),
            Map.entry("FIGHT_PROP_CHARGE_EFFICIENCY", "Energy Recharge"),
            Map.entry("FIGHT_PROP_ELEMENT_MASTERY", "Elemental Mastery"),
            Map.entry("FIGHT_PROP_CRITICAL", "Crit Rate"),
            Map.entry("FIGHT_PROP_CRITICAL_HURT", "Crit DMG"),
            Map.entry("FIGHT_PROP_HEAL_ADD", "Healing Bonus"),
            Map.entry("FIGHT_PROP_PHYSICAL_ADD_HURT", "Physical DMG"),
            Map.entry("FIGHT_PROP_FIRE_ADD_HURT", "Pyro DMG"),
            Map.entry("FIGHT_PROP_ELEC_ADD_HURT", "Electro DMG"),
            Map.entry("FIGHT_PROP_WATER_ADD_HURT", "Hydro DMG"),
            Map.entry("FIGHT_PROP_GRASS_ADD_HURT", "Dendro DMG"),
            Map.entry("FIGHT_PROP_WIND_ADD_HURT", "Anemo DMG"),
            Map.entry("FIGHT_PROP_ROCK_ADD_HURT", "Geo DMG"),
            Map.entry("FIGHT_PROP_ICE_ADD_HURT", "Cryo DMG"));

    /** Main stats that reveal what a character scales with, in the order we trust them. */
    private static final Set<Sub> SCALING_STATS = Set.of(Sub.ATK_PERCENT, Sub.HP_PERCENT, Sub.DEF_PERCENT, Sub.ELEMENTAL_MASTERY);

    record Result(List<Artifact> artifacts, List<String> gradedFor, double score, String grade) {}

    private ArtifactGrader() {}

    static Result grade(JsonNode equipList, double characterEr, GameData game) {
        Map<String, JsonNode> bySlot = new LinkedHashMap<>();
        for (JsonNode item : equipList) {
            JsonNode flat = item.path("flat");
            String slot = SLOTS.get(flat.path("equipType").asText());
            if ("ITEM_RELIQUARY".equals(flat.path("itemType").asText()) && slot != null) {
                bySlot.put(slot, item);
            }
        }

        Set<Sub> useful = usefulStats(bySlot, characterEr);
        List<Artifact> artifacts = new ArrayList<>();
        double total = 0;
        for (String slot : SLOT_ORDER) {
            JsonNode item = bySlot.get(slot);
            if (item != null) {
                Artifact artifact = gradeOne(slot, item, useful, game);
                artifacts.add(artifact);
                total += artifact.usefulRolls();
            }
        }

        List<String> gradedFor = useful.stream().map(s -> s.label).toList();
        // Empty slots count as zero, so a 4-piece build can't out-grade a full one
        return new Result(artifacts, gradedFor, round1(total), artifacts.isEmpty() ? null : letter(total / 5));
    }

    static Set<Sub> usefulStats(Map<String, JsonNode> bySlot, double characterEr) {
        Map<Sub, Integer> votes = new LinkedHashMap<>();
        boolean erSands = false;
        for (String slot : List.of("Sands", "Goblet", "Circlet")) {
            JsonNode item = bySlot.get(slot);
            if (item == null) continue;
            Sub main = Sub.byPropId(item.path("flat").path("reliquaryMainstat").path("mainPropId").asText());
            if (main != null && SCALING_STATS.contains(main)) {
                votes.merge(main, 1, Integer::sum);
            }
            if ("Sands".equals(slot) && main == Sub.ENERGY_RECHARGE) {
                erSands = true;
            }
        }
        Sub scaling = votes.entrySet().stream()
                .reduce((a, b) -> b.getValue() > a.getValue() ? b : a)   // ties keep the earlier slot
                .map(Map.Entry::getKey)
                .orElse(Sub.ATK_PERCENT);

        Set<Sub> useful = new LinkedHashSet<>(List.of(Sub.CRIT_RATE, Sub.CRIT_DMG, scaling));
        if (erSands || characterEr >= ER_FOCUS_THRESHOLD) {
            useful.add(Sub.ENERGY_RECHARGE);
        }
        return useful;
    }

    private static Artifact gradeOne(String slot, JsonNode item, Set<Sub> useful, GameData game) {
        JsonNode flat = item.path("flat");
        int rarity = flat.path("rankLevel").asInt(5);

        Map<Sub, Integer> rollCounts = new LinkedHashMap<>();
        for (JsonNode id : item.path("reliquary").path("appendPropIdList")) {
            Sub sub = Sub.byCode((id.asInt() / 10) % 100);
            if (sub != null) rollCounts.merge(sub, 1, Integer::sum);
        }

        List<Substat> substats = new ArrayList<>();
        double usefulRolls = 0;
        int wastedRolls = 0;
        for (JsonNode s : flat.path("reliquarySubstats")) {
            Sub sub = Sub.byPropId(s.path("appendPropId").asText());
            if (sub == null) continue;
            double value = s.path("statValue").asDouble();
            double maxRoll = sub.maxRoll(rarity);
            int rolls = rollCounts.getOrDefault(sub, Math.max(1, (int) Math.round(value / (maxRoll * 0.85))));
            boolean isUseful = useful.contains(sub);
            if (isUseful) usefulRolls += value / maxRoll;
            if (sub.isFlat()) wastedRolls += rolls;
            substats.add(new Substat(sub.label, format(value, sub.percent), rolls, isUseful));
        }

        JsonNode main = flat.path("reliquaryMainstat");
        String mainPropId = main.path("mainPropId").asText();
        Sub mainSub = Sub.byPropId(mainPropId);
        boolean mainIsPercent = mainSub != null ? mainSub.percent : !mainPropId.equals("FIGHT_PROP_HP") && !mainPropId.equals("FIGHT_PROP_ATTACK");

        return new Artifact(
                slot,
                game.artifactSetName(flat.path("setId").asInt(), flat.path("setNameTextMapHash").asText()),
                GameData.asset(flat.path("icon").asText(null)),
                rarity,
                Math.max(0, item.path("reliquary").path("level").asInt(1) - 1),
                MAIN_STAT_NAMES.getOrDefault(mainPropId, mainPropId),
                format(main.path("statValue").asDouble(), mainIsPercent),
                substats,
                round1(usefulRolls),
                wastedRolls,
                letter(usefulRolls));
    }

    /** Grade for a single piece's useful-roll score (also used for a build's per-piece average). */
    static String letter(double usefulRolls) {
        if (usefulRolls >= 7) return "SS";
        if (usefulRolls >= 6) return "S";
        if (usefulRolls >= 4.5) return "A";
        if (usefulRolls >= 3) return "B";
        if (usefulRolls >= 1.5) return "C";
        return "D";
    }

    private static String format(double value, boolean percent) {
        return percent ? String.format(Locale.US, "%.1f%%", value) : String.format(Locale.US, "%,d", Math.round(value));
    }

    private static double round1(double value) {
        return Math.round(value * 10) / 10.0;
    }
}
