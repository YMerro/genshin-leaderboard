package dev.genshinboard.admin;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AdminConfig implements WebMvcConfigurer {

    private final AdminGuard guard;

    public AdminConfig(AdminGuard guard) {
        this.guard = guard;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(guard).addPathPatterns("/api/**");
    }

    /** Lets the page check a password before saving it. Only reached when the guard accepted it. */
    @RestController
    static class AdminCheckController {
        @GetMapping("/api/admin/check")
        ResponseEntity<Void> check() {
            return ResponseEntity.noContent().build();
        }
    }
}
