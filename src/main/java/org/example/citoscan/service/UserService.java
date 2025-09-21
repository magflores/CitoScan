package org.example.citoscan.service;

import org.example.citoscan.dto.request.CreateUserRequest;
import org.example.citoscan.dto.response.CreateUserResponse;

public interface UserService {
    CreateUserResponse createUser(CreateUserRequest request);
}
