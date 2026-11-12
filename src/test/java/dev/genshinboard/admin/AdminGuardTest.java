package dev.genshinboard.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AdminGuardTest {

    private final Clock clock = Clock.fixed(Instant.parse("2026-11-12T12:00:00Z"), ZoneOffset.UTC);

    private static MockHttpServletRequest req(String method, String path, String password) {
        MockHttpServletRequest r = new MockHttpServletRequest(method, path);
        if (password != null) r.addHeader(AdminGuard.HEADER, password);
        return r;
    }

    private static int status(AdminGuard guard, MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        return guard.preHandle(request, response, new Object()) ? 200 : response.getStatus();
    }

    @Test
    void protectsOnlyChangingActions() {
        assertThat(AdminGuard.isProtected(req("POST", "/api/friends", null))).isTrue();
        assertThat(AdminGuard.isProtected(req("DELETE", "/api/friends/712345678", null))).isTrue();
        assertThat(AdminGuard.isProtected(req("DELETE", "/api/wishes/712345678", null))).isTrue();
        assertThat(AdminGuard.isProtected(req("GET", "/api/admin/check", null))).isTrue();

        assertThat(AdminGuard.isProtected(req("GET", "/api/leaderboard", null))).isFalse();
        assertThat(AdminGuard.isProtected(req("GET", "/api/friends", null))).isFalse();
        assertThat(AdminGuard.isProtected(req("GET", "/api/wishes", null))).isFalse();
        assertThat(AdminGuard.isProtected(req("POST", "/api/wishes/import", null))).isFalse();
    }

    @Test
    void checksPassword() throws Exception {
        AdminGuard guard = new AdminGuard(new AdminProperties("s3cret"), clock);
        assertThat(status(guard, req("POST", "/api/friends", "s3cret"))).isEqualTo(200);
        assertThat(status(guard, req("POST", "/api/friends", "wrong"))).isEqualTo(401);
        assertThat(status(guard, req("POST", "/api/friends", null))).isEqualTo(401);
        assertThat(status(guard, req("GET", "/api/leaderboard", null))).isEqualTo(200);
    }

    @Test
    void disabledWithoutPassword() throws Exception {
        AdminGuard guard = new AdminGuard(new AdminProperties(""), clock);
        assertThat(status(guard, req("POST", "/api/friends", ""))).isEqualTo(503);
        assertThat(status(guard, req("GET", "/api/leaderboard", null))).isEqualTo(200);
    }

    @Test
    void locksAfterTooManyWrongPasswords() throws Exception {
        AdminGuard guard = new AdminGuard(new AdminProperties("s3cret"), clock);
        for (int i = 0; i < AdminGuard.MAX_FAILURES; i++) {
            status(guard, req("POST", "/api/friends", "guess" + i));
        }
        // Even the right password is refused while locked
        assertThat(status(guard, req("POST", "/api/friends", "s3cret"))).isEqualTo(429);
    }
}
