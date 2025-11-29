package org.example.citoscan.service;

import org.example.citoscan.dto.request.CreateUserRequest;
import org.example.citoscan.dto.request.UpdateProfileRequest;
import org.example.citoscan.dto.response.CreateUserResponse;
import org.example.citoscan.dto.response.UserProfileResponse;

public interface UserService {
    CreateUserResponse createUser(CreateUserRequest request);
    UserProfileResponse getCurrentUserProfile(Long userId);
    UserProfileResponse updateUserProfile(Long userId, UpdateProfileRequest request);
}
