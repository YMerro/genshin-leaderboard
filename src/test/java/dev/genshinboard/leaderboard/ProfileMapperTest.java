package dev.genshinboard.leaderboard;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import dev.genshinboard.enka.FetchResult;
import dev.genshinboard.enka.GameData;
import dev.genshinboard.leaderboard.PlayerSummary.CharacterBuild;

/** Uses a real Enka response (src/test/resources/sample-profile.json) with a tiny slice of game data. */
class ProfileMapperTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private JsonNode profile;
    private GameData game;

    @BeforeEach
    void setUp() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/sample-profile.json")) {
            profile = mapper.readTree(in);
        }
        game = new GameData(
                mapper.readTree("""
                        {"10000021": {
                          "Element": "Fire", "NameTextMapHash": 1966438658, "QualityType": "QUALITY_PURPLE",
                          "SideIconName": "/ui/UI_AvatarIcon_Side_Ambor.png",
                          "SkillOrder": [10041, 10032, 10017],
                          "ProudMap": {"10041": 2131, "10032": 2132, "10017": 2139}
                        }}"""),
                mapper.readTree("""
                        {"1966438658": "Amber", "3933622347": "Skyward Harp", "4211407267": "Bloodstained Chivalry"}"""),
                mapper.readTree("{}"),
                mapper.readTree("""
                        {"210001": {"Icon": "/ui/UI_NameCardPic_0_P.jpg"}}"""),
                mapper.readTree("""
                        {"15008": {"Name": "4211407267"}}"""));
    }

    @Test
    void mapsPlayerInfo() {
        PlayerSummary p = ProfileMapper.toSummary("618285856", "Algo", new FetchResult(profile, Instant.EPOCH, null), game);

        assertThat(p.nickname()).isEqualTo("Algoinde");
        assertThat(p.label()).isEqualTo("Algo");
        assertThat(p.adventureRank()).isEqualTo(57);
        assertThat(p.abyssFloor()).isEqualTo(8);
        assertThat(p.abyssChamber()).isEqualTo(3);
        assertThat(p.theaterAct()).isNull();
        assertThat(p.namecardUrl()).isEqualTo("https://enka.network/ui/UI_NameCardPic_0_P.jpg");
        assertThat(p.avatarUrl()).isEqualTo("https://enka.network/ui/UI_AvatarIcon_Side_Ambor.png");
        assertThat(p.showcaseHidden()).isFalse();
        assertThat(p.characters()).hasSize(4);
        assertThat(p.error()).isNull();
    }

    @Test
    void mapsCharacterBuild() {
        CharacterBuild amber = ProfileMapper.toSummary("618285856", null, new FetchResult(profile, Instant.EPOCH, null), game)
                .characters().get(0);

        assertThat(amber.name()).isEqualTo("Amber");
        assertThat(amber.element()).isEqualTo("Pyro");
        assertThat(amber.rarity()).isEqualTo(4);
        assertThat(amber.level()).isEqualTo(90);
        assertThat(amber.constellation()).isEqualTo(6);
        assertThat(amber.talents()).containsExactly(10, 13, 13);
        assertThat(amber.critValue()).isEqualTo(106.5);
        assertThat(amber.stats().critRate()).isEqualTo(51.9);
        assertThat(amber.stats().critDmg()).isEqualTo(193.9);
        assertThat(amber.stats().dmgBonusType()).isEqualTo("Physical");
        assertThat(amber.weapon().name()).isEqualTo("Skyward Harp");
        assertThat(amber.weapon().refinement()).isEqualTo(2);
        // Two 2-piece bonuses; the set missing from game data falls back to its ID instead of merging
        assertThat(amber.artifactSets()).hasSize(2).contains("2pc Bloodstained Chivalry");
        assertThat(amber.artifactCount()).isEqualTo(5);
        assertThat(amber.artifacts()).hasSize(5);
        assertThat(amber.gradedFor()).contains("Crit Rate", "Crit DMG");
        assertThat(amber.artifactGrade()).isNotNull();
        assertThat(amber.artifacts().get(0).setName()).isEqualTo("Bloodstained Chivalry");
    }

    @Test
    void unknownCharacterFallsBackToId() {
        GameData empty = new GameData(null, null, null, null, null);
        CharacterBuild build = ProfileMapper.toSummary("1", null, new FetchResult(profile, Instant.EPOCH, null), empty)
                .characters().get(0);

        assertThat(build.name()).isEqualTo("Character 10000021");
        assertThat(build.element()).isEqualTo("Unknown");
        assertThat(build.talents()).isEmpty();
    }

    @Test
    void hiddenShowcase() throws IOException {
        JsonNode hidden = mapper.readTree("""
                {"playerInfo": {"nickname": "Shy", "level": 60, "showAvatarInfoList": [{"avatarId": 10000046}]}, "ttl": 60}""");
        PlayerSummary p = ProfileMapper.toSummary("700000000", null, new FetchResult(hidden, Instant.EPOCH, null), game);

        assertThat(p.showcaseHidden()).isTrue();
        assertThat(p.characters()).isEmpty();
        assertThat(p.abyssFloor()).isNull();
    }
}
