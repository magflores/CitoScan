package org.example.citoscan.service.impl;

import lombok.RequiredArgsConstructor;
import org.example.citoscan.dto.request.CreateUserRequest;
import org.example.citoscan.dto.response.CreateUserResponse;
import org.example.citoscan.model.User;
import org.example.citoscan.repository.UserRepository;
import org.example.citoscan.service.UserService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public CreateUserResponse createUser(CreateUserRequest request) {
        String email = request.getEmail().trim().toLowerCase();

        User user = new User();
        user.setEmail(email);
        user.setFirstName(request.getFirstName().trim());
        user.setLastName(request.getLastName().trim());
        user.setInstitution(request.getInstitution().trim());

        String hashedPassword = passwordEncoder.encode(request.getPassword());
        user.setPassword(hashedPassword);

        User createdUser = userRepository.save(user);

        return new CreateUserResponse(
                "Usuario creado exitosamente",
                createdUser.getEmail(),
                createdUser.getUserId()
        );
    }
}
