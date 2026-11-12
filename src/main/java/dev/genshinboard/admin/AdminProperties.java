package dev.genshinboard.admin;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param password the admin password; set it outside the repo (e.g. config/application.properties
 *                 next to the jar, or the APP_ADMIN_PASSWORD environment variable). When blank,
 *                 admin actions are disabled.
 */
@ConfigurationProperties(prefix = "app.admin")
public record AdminProperties(String password) {}
