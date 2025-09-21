package org.example.citoscan.dto.response;

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

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }
}

