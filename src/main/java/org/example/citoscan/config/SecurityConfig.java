package org.example.citoscan.config;

import lombok.RequiredArgsConstructor;
import org.example.citoscan.security.JwtAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration cfg) throws Exception {
        return cfg.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(sess -> sess.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();
                    auth.requestMatchers("/api/auth/**").permitAll();
                    auth.requestMatchers(HttpMethod.POST, "/api/users").permitAll();
                    auth.requestMatchers("/api/users/verify-email/**").permitAll();
                    auth.requestMatchers(HttpMethod.POST, "/api/users/forgot-password").permitAll();
                    auth.requestMatchers(HttpMethod.POST, "/api/users/reset-password").permitAll();

                    auth.requestMatchers(HttpMethod.GET, "/api/pipeline/sessions/*/preview").authenticated();
                    auth.requestMatchers(HttpMethod.GET, "/api/pipeline/sessions/*/results").authenticated();
                    auth.requestMatchers(HttpMethod.GET, "/api/pipeline/sessions/*/files/**").authenticated();
                    auth.requestMatchers(HttpMethod.GET, "/api/pipeline/sessions/*/download-patch").authenticated();
                    auth.requestMatchers(HttpMethod.GET, "/api/pipeline/sessions/*/download-cells").authenticated();

                    auth.anyRequest().authenticated();
                })
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();

        String allowed = System.getenv("APP_CORS_ALLOWED_ORIGINS");
        if (allowed != null && !allowed.isBlank()) {
            cfg.setAllowedOrigins(List.of(allowed.split(",")));
        } else {
            cfg.setAllowedOrigins(List.of("http://localhost:5173"));
        }

        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setAllowCredentials(true);
        cfg.addExposedHeader("Content-Type");

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }

}
