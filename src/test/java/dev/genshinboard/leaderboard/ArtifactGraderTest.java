package dev.genshinboard.leaderboard;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.enka.GameData;
import dev.genshinboard.leaderboard.ArtifactGrader.Sub;
import dev.genshinboard.leaderboard.PlayerSummary.Artifact;
import dev.genshinboard.leaderboard.PlayerSummary.Substat;

class ArtifactGraderTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final GameData game = new GameData(null, null, null, null, null);

    @Test
    void countsExactRollsFromRollIds() throws IOException {
        JsonNode amber;
        try (InputStream in = getClass().getResourceAsStream("/sample-profile.json")) {
            amber = mapper.readTree(in).path("avatarInfoList").get(0);
        }
        ArtifactGrader.Result result = ArtifactGrader.grade(amber.path("equipList"), 100, game);

        assertThat(result.artifacts()).extracting(Artifact::slot)
                .containsExactly("Flower", "Plume", "Sands", "Goblet", "Circlet");

        // Flower roll IDs: DEF x2, ATK% x2, Crit DMG x3, EM x1
        Artifact flower = result.artifacts().get(0);
        assertThat(flower.mainStat()).isEqualTo("HP");
        assertThat(flower.mainValue()).isEqualTo("4,780");
        assertThat(flower.level()).isEqualTo(20);
        assertThat(flower.substats()).extracting(Substat::name, Substat::rolls).containsExactly(
                org.assertj.core.groups.Tuple.tuple("DEF", 2),
                org.assertj.core.groups.Tuple.tuple("ATK%", 2),
                org.assertj.core.groups.Tuple.tuple("Crit DMG", 3),
                org.assertj.core.groups.Tuple.tuple("EM", 1));
        assertThat(flower.wastedRolls()).isEqualTo(2);
        assertThat(flower.substats().get(0).useful()).isFalse();
        assertThat(flower.substats().get(2).useful()).isTrue();

        double sum = result.artifacts().stream().mapToDouble(Artifact::usefulRolls).sum();
        assertThat(result.score()).isCloseTo(sum, org.assertj.core.data.Offset.offset(0.1));
        assertThat(result.grade()).isNotNull();
    }

    @Test
    void infersScalingStatFromMainStats() throws IOException {
        Map<String, JsonNode> hpBuild = Map.of(
                "Sands", main("FIGHT_PROP_HP_PERCENT"),
                "Goblet", main("FIGHT_PROP_WATER_ADD_HURT"),
                "Circlet", main("FIGHT_PROP_CRITICAL"));
        assertThat(ArtifactGrader.usefulStats(hpBuild, 120))
                .containsExactly(Sub.CRIT_RATE, Sub.CRIT_DMG, Sub.HP_PERCENT);

        Map<String, JsonNode> erBurstBuild = Map.of(
                "Sands", main("FIGHT_PROP_CHARGE_EFFICIENCY"),
                "Goblet", main("FIGHT_PROP_ATTACK_PERCENT"),
                "Circlet", main("FIGHT_PROP_CRITICAL_HURT"));
        assertThat(ArtifactGrader.usefulStats(erBurstBuild, 120))
                .containsExactly(Sub.CRIT_RATE, Sub.CRIT_DMG, Sub.ATK_PERCENT, Sub.ENERGY_RECHARGE);

        Map<String, JsonNode> emBuild = Map.of(
                "Sands", main("FIGHT_PROP_ELEMENT_MASTERY"),
                "Goblet", main("FIGHT_PROP_ELEMENT_MASTERY"),
                "Circlet", main("FIGHT_PROP_ELEMENT_MASTERY"));
        assertThat(ArtifactGrader.usefulStats(emBuild, 180)).contains(Sub.ELEMENTAL_MASTERY, Sub.ENERGY_RECHARGE);
    }

    @Test
    void gradeThresholds() {
        assertThat(ArtifactGrader.letter(7.2)).isEqualTo("SS");
        assertThat(ArtifactGrader.letter(6.0)).isEqualTo("S");
        assertThat(ArtifactGrader.letter(4.9)).isEqualTo("A");
        assertThat(ArtifactGrader.letter(3.0)).isEqualTo("B");
        assertThat(ArtifactGrader.letter(1.5)).isEqualTo("C");
        assertThat(ArtifactGrader.letter(0.4)).isEqualTo("D");
    }

    private JsonNode main(String propId) throws IOException {
        return mapper.readTree("{\"flat\": {\"reliquaryMainstat\": {\"mainPropId\": \"" + propId + "\"}}}");
    }
}
