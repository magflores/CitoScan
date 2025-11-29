package org.example.citoscan.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.example.citoscan.dto.request.CreateUserRequest;
import org.example.citoscan.dto.request.UpdateProfileRequest;
import org.example.citoscan.dto.response.CreateUserResponse;
import org.example.citoscan.dto.response.UserProfileResponse;
import org.example.citoscan.security.AppUserDetails;
import org.example.citoscan.service.UserService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@CrossOrigin(origins = "${app.cors.allowed-origins}", allowCredentials = "true")
public class UserController {
    private final UserService userService;

    @PostMapping
    public ResponseEntity<CreateUserResponse> addUser(@Valid @RequestBody CreateUserRequest request) {
        try {
            CreateUserResponse response = userService.createUser(request);
            return ResponseEntity.status(201).body(response);
        } catch (DataIntegrityViolationException ex) {
            CreateUserResponse conflict = new CreateUserResponse("Ya existe otro usuario con ese correo electrónico", request.getEmail(), null);
            return ResponseEntity.status(409).body(conflict);
        }
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser() {
        Long userId = getCurrentUserId();
        UserProfileResponse profile = userService.getCurrentUserProfile(userId);
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me")
    public ResponseEntity<UserProfileResponse> updateCurrentUser(@Valid @RequestBody UpdateProfileRequest request) {
        Long userId = getCurrentUserId();
        UserProfileResponse updatedProfile = userService.updateUserProfile(userId, request);
        return ResponseEntity.ok(updatedProfile);
    }

    private Long getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) {
            throw new RuntimeException("Usuario no autenticado");
        }
        return ((AppUserDetails) auth.getPrincipal()).getId();
    }
}
