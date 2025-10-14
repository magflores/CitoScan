package org.example.citoscan.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
public class LoginResponse {
    private String message;
    private Long userId;
    private String email;
    private String token;
}
