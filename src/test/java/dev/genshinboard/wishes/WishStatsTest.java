package dev.genshinboard.wishes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import dev.genshinboard.wishes.WishStats.Banner;
import dev.genshinboard.wishes.WishStats.FiveStar;

class WishStatsTest {

    private long nextId = 1000;

    private void add(List<Pull> pulls, String type, int count3, String fiveStar) {
        for (int i = 0; i < count3; i++) {
            pulls.add(new Pull(String.valueOf(nextId++), "700000001", type, "Debate Club", "Weapon", 3, "2026-01-01 00:00:00"));
        }
        if (fiveStar != null) {
            pulls.add(new Pull(String.valueOf(nextId++), "700000001", type, fiveStar, "Character", 5, "2026-01-02 00:00:00"));
        }
    }

    @Test
    void tracksPityAndFiftyFifty() {
        List<Pull> pulls = new ArrayList<>();
        add(pulls, "301", 75, "Furina");   // pity 76, won
        add(pulls, "400", 79, "Qiqi");     // pity 80, lost (400 shares pity with 301)
        add(pulls, "301", 9, "Neuvillette"); // pity 10, guaranteed
        add(pulls, "301", 12, null);       // current pity 12, not guaranteed
        add(pulls, "302", 5, null);

        WishStats.Account account = WishStats.compute("700000001", pulls);
        Banner character = account.banners().get(0);

        assertThat(character.key()).isEqualTo("character");
        assertThat(character.total()).isEqualTo(178);
        assertThat(character.pity5()).isEqualTo(12);
        assertThat(character.guaranteed()).isFalse();
        assertThat(character.wins()).isEqualTo(1);
        assertThat(character.losses()).isEqualTo(1);
        // newest first
        assertThat(character.fiveStars()).extracting(FiveStar::name, FiveStar::pity, FiveStar::result).containsExactly(
                org.assertj.core.groups.Tuple.tuple("Neuvillette", 10, "guaranteed"),
                org.assertj.core.groups.Tuple.tuple("Qiqi", 80, "lost"),
                org.assertj.core.groups.Tuple.tuple("Furina", 76, "won"));
        assertThat(character.avgPity5()).isEqualTo(55.3);

        Banner weapon = account.banners().get(1);
        assertThat(weapon.key()).isEqualTo("weapon");
        assertThat(weapon.guaranteed()).isNull();
        assertThat(account.totalPulls()).isEqualTo(183);
        assertThat(account.primogems()).isEqualTo(183 * 160);
    }

    @Test
    void guaranteedAfterLoss() {
        List<Pull> pulls = new ArrayList<>();
        add(pulls, "301", 3, "Diluc");
        add(pulls, "301", 2, null);
        Banner b = WishStats.compute("700000001", pulls).banners().get(0);
        assertThat(b.guaranteed()).isTrue();
        assertThat(b.pity5()).isEqualTo(2);
    }

    @Test
    void parsesGameLinkAndAlwaysUsesOfficialHost() {
        var p = WishClient.parse("https://gs.hoyoverse.com/genshin/event/e20190909gacha-v3/index.html?win_mode=fullscreen"
                + "&authkey_ver=1&sign_type=2&lang=fr&authkey=abc%2Bdef%3D&game_biz=hk4e_global&gacha_type=301&page=4#/log");
        assertThat(p.api()).isEqualTo(WishClient.GLOBAL_API);
        assertThat(p.query()).containsEntry("authkey", "abc%2Bdef%3D").containsEntry("authkey_ver", "1")
                .doesNotContainKeys("lang", "gacha_type", "page");

        assertThat(WishClient.parse("https://webstatic.mihoyo.com/x?authkey=zz").api()).isEqualTo(WishClient.CHINA_API);
    }

    @Test
    void rejectsLinksThatAreNotFromHoyoverse() {
        assertThatThrownBy(() -> WishClient.parse("https://evil.example.com/?authkey=x"))
                .isInstanceOf(WishImportException.class);
        assertThatThrownBy(() -> WishClient.parse("https://gs.hoyoverse.com.evil.com/?authkey=x"))
                .isInstanceOf(WishImportException.class);
        assertThatThrownBy(() -> WishClient.parse("hello"))
                .isInstanceOf(WishImportException.class);
        assertThatThrownBy(() -> WishClient.parse("https://gs.hoyoverse.com/?authkey="))
                .isInstanceOf(WishImportException.class);
    }
}
