package org.example.citoscan.service.impl;

import lombok.RequiredArgsConstructor;
import org.example.citoscan.service.EmailService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class EmailServiceImpl implements EmailService {

    private final JavaMailSender mailSender;

    @Value("${app.frontend.url:http://localhost:5173}")
    private String frontendUrl;

    @Value("${spring.mail.username:}")
    private String fromEmail;

    @Override
    public void sendVerificationEmail(String to, String firstName, String verificationToken) {
        // Verificar que el email esté configurado
        if (fromEmail == null || fromEmail.isEmpty()) {
            System.err.println("ADVERTENCIA: spring.mail.username no está configurado. No se puede enviar email de verificación.");
            System.err.println("Token de verificación para " + to + ": " + verificationToken);
            System.err.println("URL de verificación: " + frontendUrl + "/verify-email?token=" + verificationToken);
            return;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(to);
            message.setSubject("Verifica tu cuenta de CitoScan");
            
            String verificationUrl = frontendUrl + "/verify-email?token=" + verificationToken;
            
            String emailBody = String.format(
                "Hola %s,\n\n" +
                "Gracias por registrarte en CitoScan. Por favor, verifica tu cuenta haciendo clic en el siguiente enlace:\n\n" +
                "%s\n\n" +
                "Este enlace expirará en 24 horas.\n\n" +
                "Si no creaste esta cuenta, puedes ignorar este correo.\n\n" +
                "Saludos,\n" +
                "El equipo de CitoScan",
                firstName,
                verificationUrl
            );
            
            message.setText(emailBody);
            mailSender.send(message);
            System.out.println("Email de verificación enviado exitosamente a: " + to);
        } catch (Exception e) {
            System.err.println("Error al enviar email de verificación a " + to + ": " + e.getMessage());
            e.printStackTrace();
            // No relanzar la excepción para que el registro no falle
        }
    }

    @Override
    public void sendPasswordResetEmail(String to, String firstName, String resetToken) {
        System.out.println("=== INICIANDO ENVÍO DE EMAIL DE RECUPERACIÓN ===");
        System.out.println("Destinatario: " + to);
        System.out.println("Nombre: " + firstName);
        System.out.println("Token: " + resetToken);
        System.out.println("From Email configurado: " + (fromEmail != null && !fromEmail.isEmpty() ? fromEmail : "NO CONFIGURADO"));
        System.out.println("Frontend URL: " + frontendUrl);
        
        // Verificar que el email esté configurado
        if (fromEmail == null || fromEmail.isEmpty()) {
            System.err.println("ADVERTENCIA: spring.mail.username no está configurado. No se puede enviar email de recuperación de contraseña.");
            System.err.println("Token de recuperación para " + to + ": " + resetToken);
            System.err.println("URL de recuperación: " + frontendUrl + "/reset-password?token=" + resetToken);
            return;
        }

        try {
            System.out.println("Creando mensaje de email...");
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(to);
            message.setSubject("Recupera tu contraseña de CitoScan");
            
            String resetUrl = frontendUrl + "/reset-password?token=" + resetToken;
            System.out.println("URL de recuperación generada: " + resetUrl);
            
            String emailBody = String.format(
                "Hola %s,\n\n" +
                "Recibimos una solicitud para restablecer tu contraseña de CitoScan. Por favor, haz clic en el siguiente enlace para crear una nueva contraseña:\n\n" +
                "%s\n\n" +
                "Este enlace expirará en 24 horas.\n\n" +
                "Si no solicitaste restablecer tu contraseña, puedes ignorar este correo.\n\n" +
                "Saludos,\n" +
                "El equipo de CitoScan",
                firstName,
                resetUrl
            );
            
            message.setText(emailBody);
            System.out.println("Enviando email a través de JavaMailSender...");
            mailSender.send(message);
            System.out.println("✓ Email de recuperación de contraseña enviado exitosamente a: " + to);
            System.out.println("=== FIN ENVÍO DE EMAIL ===");
        } catch (Exception e) {
            System.err.println("✗ ERROR al enviar email de recuperación de contraseña a " + to);
            System.err.println("Mensaje de error: " + e.getMessage());
            System.err.println("Tipo de excepción: " + e.getClass().getName());
            e.printStackTrace();
            // No relanzar la excepción
        }
    }
}

