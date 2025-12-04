package org.example.citoscan.service;

public interface EmailService {
    void sendVerificationEmail(String to, String firstName, String verificationToken);
    void sendPasswordResetEmail(String to, String firstName, String resetToken);
}

