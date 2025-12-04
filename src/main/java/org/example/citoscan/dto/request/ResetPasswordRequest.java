package org.example.citoscan.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ResetPasswordRequest {
    @NotBlank(message = "El token no puede estar vacío")
    private String token;

    @NotBlank(message = "El campo de la contraseña no puede estar vacío")
    private String password;

    public ResetPasswordRequest() {
    }

    public ResetPasswordRequest(String token, String password) {
        this.token = token;
        this.password = password;
    }
}

