package org.example.citoscan.service;

import org.example.citoscan.dto.request.CreateUserRequest;
import org.example.citoscan.dto.request.ForgotPasswordRequest;
import org.example.citoscan.dto.request.ResetPasswordRequest;
import org.example.citoscan.dto.request.UpdateProfileRequest;
import org.example.citoscan.dto.response.CreateUserResponse;
import org.example.citoscan.dto.response.ForgotPasswordResponse;
import org.example.citoscan.dto.response.ResetPasswordResponse;
import org.example.citoscan.dto.response.UserProfileResponse;

import org.example.citoscan.dto.response.VerifyEmailResponse;

public interface UserService {
    CreateUserResponse createUser(CreateUserRequest request);
    UserProfileResponse getCurrentUserProfile(Long userId);
    UserProfileResponse updateUserProfile(Long userId, UpdateProfileRequest request);
    VerifyEmailResponse verifyEmail(String token);
    ForgotPasswordResponse forgotPassword(ForgotPasswordRequest request);
    ResetPasswordResponse resetPassword(ResetPasswordRequest request);
}
