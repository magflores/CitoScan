package org.example.citoscan.service.impl;

import org.example.citoscan.dto.request.CreateUserRequest;
import org.example.citoscan.dto.response.CreateUserResponse;
import org.example.citoscan.model.User;
import org.example.citoscan.repository.UserRepository;
import org.example.citoscan.service.UserService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserServiceImpl implements UserService {
    private final UserRepository userRepository;

    public UserServiceImpl(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional
    public CreateUserResponse createUser(CreateUserRequest request) {
        User user = new User();
        user.setEmail(request.getEmail());
        user.setPassword(request.getPassword());
        user.setFirstName(request.getFirstName());
        user.setLastName(request.getLastName());
        user.setInstitution(request.getInstitution());
        User createdUser = userRepository.save(user);
        return new CreateUserResponse("Usuario creado exitosamente", createdUser.getEmail(), createdUser.getUserId());
    }
}
