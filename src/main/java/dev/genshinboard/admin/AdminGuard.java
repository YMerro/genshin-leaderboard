package dev.genshinboard.admin;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Requires the admin password (header {@value #HEADER}) for actions that change or delete shared data:
 * adding/removing players and deleting saved wish history. Viewing and wish imports stay open.
 *
 * <p>Too many wrong passwords lock admin actions for everyone for a while, which stops guessing.
 * The lock is global rather than per IP because behind a tunnel every visitor looks like localhost.
 */
@Component
public class AdminGuard implements HandlerInterceptor {

    public static final String HEADER = "X-Admin-Password";
    static final int MAX_FAILURES = 20;
    static final Duration WINDOW = Duration.ofMinutes(10);

    private final byte[] expectedHash;
    private final Clock clock;
    private final Deque<Instant> failures = new ArrayDeque<>();
    private Instant lockedUntil = Instant.EPOCH;

    @Autowired
    public AdminGuard(AdminProperties props) {
        this(props, Clock.systemUTC());
    }

    AdminGuard(AdminProperties props, Clock clock) {
        String password = props.password();
        this.expectedHash = password == null || password.isBlank() ? null : sha256(password);
        this.clock = clock;
    }

    /** Whether this request needs the admin password. */
    static boolean isProtected(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if (path.equals("/api/admin/check")) return true;
        if (path.equals("/api/friends") && HttpMethod.POST.matches(method)) return true;
        if (path.startsWith("/api/friends/") && HttpMethod.DELETE.matches(method)) return true;
        return path.startsWith("/api/wishes/") && !path.equals("/api/wishes/import") && HttpMethod.DELETE.matches(method);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        if (!isProtected(request)) return true;

        if (expectedHash == null) {
            return reject(response, 503, "Admin actions are turned off because no admin password is set (app.admin.password).");
        }
        synchronized (this) {
            Instant now = clock.instant();
            if (now.isBefore(lockedUntil)) {
                return reject(response, 429, "Too many wrong passwords. Admin actions are locked for a few minutes.");
            }
            String given = request.getHeader(HEADER);
            if (given != null && MessageDigest.isEqual(expectedHash, sha256(given))) {
                return true;
            }
            while (!failures.isEmpty() && failures.peekFirst().isBefore(now.minus(WINDOW))) failures.pollFirst();
            failures.addLast(now);
            if (failures.size() >= MAX_FAILURES) {
                lockedUntil = now.plus(WINDOW);
                failures.clear();
            }
        }
        return reject(response, 401, given(request) ? "Wrong admin password." : "This needs the admin password.");
    }

    private static boolean given(HttpServletRequest request) {
        String h = request.getHeader(HEADER);
        return h != null && !h.isEmpty();
    }

    private static boolean reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"error\":\"" + message.replace("\"", "\\\"") + "\"}");
        return false;
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
