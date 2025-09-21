package org.example.citoscan.controller;

import jakarta.validation.Valid;
import org.example.citoscan.dto.request.CreateUserRequest;
import org.example.citoscan.dto.response.CreateUserResponse;
import org.example.citoscan.service.UserService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

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

}
