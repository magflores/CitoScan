package org.example.citoscan.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.example.citoscan.dto.request.LoginRequest;
import org.example.citoscan.dto.response.LoginResponse;
import org.example.citoscan.model.User;
import org.example.citoscan.repository.UserRepository;
import org.example.citoscan.security.JwtService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@CrossOrigin(origins = "${app.cors.allowed-origins}", allowCredentials = "true")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        User u = userRepository.findUserByEmail(req.getEmail());
        if (u == null || !passwordEncoder.matches(req.getPassword(), u.getPassword())) {
            return ResponseEntity.status(401).body(new LoginResponse("Credenciales inválidas", null, null, null));
        }
        String token = jwtService.generateToken(u.getUserId(), u.getEmail());
        return ResponseEntity.ok(new LoginResponse("Login OK", u.getUserId(), u.getEmail(), token));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().build();
    }
}
