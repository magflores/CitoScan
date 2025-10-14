package org.example.citoscan.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.example.citoscan.dto.request.LoginRequest;
import org.example.citoscan.dto.response.LoginResponse;
import org.example.citoscan.model.User;
import org.example.citoscan.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        User u = userRepository.findUserByEmail(req.getEmail());
        if (u == null || !u.getPassword().equals(req.getPassword())) {
            return ResponseEntity.status(401).body(new LoginResponse("Credenciales inválidas", null, null, null));
        }
        return ResponseEntity.ok(new LoginResponse("Login OK", u.getUserId(), u.getEmail(), null));
    }
}
