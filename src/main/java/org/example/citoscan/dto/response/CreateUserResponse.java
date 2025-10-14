package org.example.citoscan.dto.response;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateUserResponse {

    private String message;
    private String email;
    private Long userId;

    public CreateUserResponse() {
    }

    public CreateUserResponse(String message, String email, Long userId) {
        this.message = message;
        this.email = email;
        this.userId = userId;
    }
}

