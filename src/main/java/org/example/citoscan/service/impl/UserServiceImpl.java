package org.example.citoscan.service.impl;

import lombok.RequiredArgsConstructor;
import org.example.citoscan.dto.request.CreateUserRequest;
import org.example.citoscan.dto.request.ForgotPasswordRequest;
import org.example.citoscan.dto.request.ResetPasswordRequest;
import org.example.citoscan.dto.request.UpdateProfileRequest;
import org.example.citoscan.dto.response.CreateUserResponse;
import org.example.citoscan.dto.response.ForgotPasswordResponse;
import org.example.citoscan.dto.response.ResetPasswordResponse;
import org.example.citoscan.dto.response.UserProfileResponse;
import org.example.citoscan.dto.response.VerifyEmailResponse;
import org.example.citoscan.security.JwtService;
import org.example.citoscan.model.User;
import org.example.citoscan.repository.UserRepository;
import org.example.citoscan.service.EmailService;
import org.example.citoscan.service.UserService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final JwtService jwtService;
    private static final SecureRandom random = new SecureRandom();

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
        
        // Generar token de verificación
        String verificationToken = generateVerificationToken();
        user.setVerificationToken(verificationToken);
        user.setTokenExpiry(LocalDateTime.now().plusHours(24));
        user.setEmailVerified(false);

        User createdUser = userRepository.save(user);

        // Enviar email de verificación
        try {
            emailService.sendVerificationEmail(
                createdUser.getEmail(),
                createdUser.getFirstName(),
                verificationToken
            );
        } catch (Exception e) {
            // Log error pero no fallar el registro
            System.err.println("Error enviando email de verificación: " + e.getMessage());
        }

        return new CreateUserResponse(
                "Usuario creado exitosamente. Por favor verifica tu email.",
                createdUser.getEmail(),
                createdUser.getUserId()
        );
    }

    private String generateVerificationToken() {
        byte[] tokenBytes = new byte[32];
        random.nextBytes(tokenBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    }

    @Override
    @Transactional(readOnly = true)
    public UserProfileResponse getCurrentUserProfile(Long userId) {
        User user = userRepository.findByUserId(userId);
        if (user == null) {
            throw new RuntimeException("Usuario no encontrado");
        }
        return new UserProfileResponse(
                user.getUserId(),
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getInstitution()
        );
    }

    @Override
    @Transactional
    public UserProfileResponse updateUserProfile(Long userId, UpdateProfileRequest request) {
        User user = userRepository.findByUserId(userId);
        if (user == null) {
            throw new RuntimeException("Usuario no encontrado");
        }

        if (request.getFirstName() != null && !request.getFirstName().trim().isEmpty()) {
            user.setFirstName(request.getFirstName().trim());
        }
        if (request.getLastName() != null && !request.getLastName().trim().isEmpty()) {
            user.setLastName(request.getLastName().trim());
        }
        if (request.getInstitution() != null && !request.getInstitution().trim().isEmpty()) {
            user.setInstitution(request.getInstitution().trim());
        }
        if (request.getPassword() != null && !request.getPassword().isEmpty()) {
            String hashedPassword = passwordEncoder.encode(request.getPassword());
            user.setPassword(hashedPassword);
        }

        User updatedUser = userRepository.save(user);

        return new UserProfileResponse(
                updatedUser.getUserId(),
                updatedUser.getEmail(),
                updatedUser.getFirstName(),
                updatedUser.getLastName(),
                updatedUser.getInstitution()
        );
    }

    @Override
    @Transactional
    public VerifyEmailResponse verifyEmail(String token) {
        User user = userRepository.findUserByVerificationToken(token);
        
        if (user == null) {
            throw new RuntimeException("Token de verificación inválido");
        }
        
        if (user.getEmailVerified()) {
            // Usuario ya verificado, generar token de login
            String jwtToken = jwtService.generateToken(user.getUserId(), user.getEmail());
            return new VerifyEmailResponse(
                "Tu email ya estaba verificado",
                user.getUserId(),
                user.getEmail(),
                jwtToken,
                true
            );
        }
        
        if (user.getTokenExpiry() == null || user.getTokenExpiry().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("El token de verificación ha expirado");
        }
        
        // Verificar el email
        user.setEmailVerified(true);
        user.setVerificationToken(null);
        user.setTokenExpiry(null);
        userRepository.save(user);
        
        // Generar token JWT para login automático
        String jwtToken = jwtService.generateToken(user.getUserId(), user.getEmail());
        
        return new VerifyEmailResponse(
            "Email verificado exitosamente",
            user.getUserId(),
            user.getEmail(),
            jwtToken,
            true
        );
    }

    @Override
    @Transactional
    public ForgotPasswordResponse forgotPassword(ForgotPasswordRequest request) {
        String email = request.getEmail().trim().toLowerCase();
        System.out.println("Solicitud de recuperación de contraseña para: " + email);
        
        User user = userRepository.findUserByEmail(email);
        
        // Por seguridad, siempre devolvemos éxito aunque el usuario no exista
        // para evitar que se pueda descubrir qué emails están registrados
        if (user == null) {
            System.out.println("Usuario no encontrado para email: " + email);
            return new ForgotPasswordResponse(
                "Si el correo electrónico existe en nuestro sistema, recibirás un email con instrucciones para restablecer tu contraseña.",
                true
            );
        }
        
        System.out.println("Usuario encontrado: " + user.getEmail() + " (ID: " + user.getUserId() + ")");
        
        // Generar token de recuperación
        String resetToken = generateVerificationToken();
        System.out.println("Token de recuperación generado: " + resetToken);
        
        user.setPasswordResetToken(resetToken);
        user.setPasswordResetExpiry(LocalDateTime.now().plusHours(24));
        userRepository.save(user);
        System.out.println("Token guardado en base de datos para usuario: " + user.getEmail());
        
        // Enviar email de recuperación
        try {
            System.out.println("Intentando enviar email de recuperación a: " + user.getEmail());
            emailService.sendPasswordResetEmail(
                user.getEmail(),
                user.getFirstName(),
                resetToken
            );
            System.out.println("Email de recuperación enviado exitosamente a: " + user.getEmail());
        } catch (Exception e) {
            System.err.println("Error enviando email de recuperación de contraseña: " + e.getMessage());
            e.printStackTrace();
        }
        
        return new ForgotPasswordResponse(
            "Si el correo electrónico existe en nuestro sistema, recibirás un email con instrucciones para restablecer tu contraseña.",
            true
        );
    }

    @Override
    @Transactional
    public ResetPasswordResponse resetPassword(ResetPasswordRequest request) {
        User user = userRepository.findUserByPasswordResetToken(request.getToken());
        
        if (user == null) {
            throw new RuntimeException("Token de recuperación inválido");
        }
        
        if (user.getPasswordResetExpiry() == null || user.getPasswordResetExpiry().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("El token de recuperación ha expirado");
        }
        
        // Actualizar la contraseña
        String hashedPassword = passwordEncoder.encode(request.getPassword());
        user.setPassword(hashedPassword);
        user.setPasswordResetToken(null);
        user.setPasswordResetExpiry(null);
        userRepository.save(user);
        
        // Generar token JWT para login automático
        String jwtToken = jwtService.generateToken(user.getUserId(), user.getEmail());
        
        return new ResetPasswordResponse(
            "Contraseña restablecida exitosamente",
            user.getUserId(),
            user.getEmail(),
            jwtToken,
            true
        );
    }
}
